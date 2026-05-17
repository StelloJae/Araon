import { WS_MAX_SUBSCRIPTIONS } from '@shared/kis-constraints.js';

export type KisWsSlotSource =
  | 'holding'
  | 'user_pin'
  | 'current_view'
  | 'recent_news'
  | 'recent_disclosure'
  | 'toss_signal'
  | 'agent_candidate'
  | 'manual_watchlist'
  | 'top100_rotation';

export interface KisWsSlotCandidate {
  readonly ticker: string;
  readonly source: KisWsSlotSource;
  readonly reason: string;
  readonly score: number;
  readonly ttlMs: number | null;
  readonly lastSeenAt: string;
  readonly pinned: boolean;
}

export interface KisWsSlotAssignment {
  readonly ticker: string;
  readonly state: 'subscribed' | 'fallback';
  readonly source: KisWsSlotSource;
  readonly reason: string;
  readonly score: number;
  readonly priority: number;
  readonly ttlMs: number | null;
  readonly lastSeenAt: string;
  readonly pinned: boolean;
}

export interface KisWsSlotDiff {
  readonly subscribe: readonly string[];
  readonly unsubscribe: readonly string[];
}

export interface KisWsSlotPlan {
  readonly cap: number;
  readonly used: number;
  readonly candidateCount: number;
  readonly subscribed: readonly KisWsSlotAssignment[];
  readonly fallback: readonly KisWsSlotAssignment[];
  readonly diff: KisWsSlotDiff;
  readonly generatedAt: string;
}

export interface KisWsPreviousSlot {
  readonly ticker: string;
  readonly subscribedAt: string;
  readonly stickyUntilAt?: string;
}

export interface AllocateKisWsSlotsInput {
  readonly candidates: readonly KisWsSlotCandidate[];
  readonly previousSubscribed?: readonly string[];
  readonly previousSlots?: readonly KisWsPreviousSlot[];
  readonly churnCooldownMs?: number;
  readonly cap?: number;
  readonly now?: string;
}

const SOURCE_PRIORITY: Record<KisWsSlotSource, number> = {
  holding: 700,
  user_pin: 600,
  current_view: 500,
  recent_news: 400,
  recent_disclosure: 400,
  toss_signal: 400,
  agent_candidate: 300,
  manual_watchlist: 200,
  top100_rotation: 100,
};

export function allocateKisWsSlots(input: AllocateKisWsSlotsInput): KisWsSlotPlan {
  const cap = normalizeCap(input.cap ?? WS_MAX_SUBSCRIPTIONS);
  const generatedAt = normalizeTimestamp(input.now ?? new Date().toISOString(), 'now');
  const ranked = rankCandidates(input.candidates);
  const selected = selectSubscribedWithStickyRetention(ranked, cap, input, generatedAt);
  const selectedTickers = new Set(selected.map((item) => item.ticker));
  const subscribed = selected.map((item) => ({
    ...item,
    state: 'subscribed' as const,
  }));
  const fallback = ranked.filter((item) => !selectedTickers.has(item.ticker)).map((item) => ({
    ...item,
    state: 'fallback' as const,
  }));
  return {
    cap,
    used: subscribed.length,
    candidateCount: ranked.length,
    subscribed,
    fallback,
    diff: diffSubscriptions(input.previousSubscribed ?? [], subscribed.map((item) => item.ticker)),
    generatedAt,
  };
}

function selectSubscribedWithStickyRetention(
  ranked: readonly KisWsSlotAssignment[],
  cap: number,
  input: AllocateKisWsSlotsInput,
  generatedAt: string,
): KisWsSlotAssignment[] {
  if (cap === 0) return [];
  const selected = ranked.slice(0, cap);
  const byTicker = new Map(ranked.map((item) => [item.ticker, item]));
  const selectedTickers = new Set(selected.map((item) => item.ticker));
  const nowMs = Date.parse(generatedAt);

  for (const previous of input.previousSlots ?? []) {
    const ticker = normalizeTicker(previous.ticker);
    if (selectedTickers.has(ticker)) continue;
    const candidate = byTicker.get(ticker);
    if (candidate === undefined) continue;
    if (!isPreviousSlotSticky(previous, input.churnCooldownMs ?? 0, nowMs)) continue;

    if (selected.length < cap) {
      selected.push(candidate);
      selectedTickers.add(ticker);
      continue;
    }

    const replaceIndex = findStickyReplacementIndex(selected);
    if (replaceIndex === -1) continue;
    selectedTickers.delete(selected[replaceIndex]?.ticker ?? '');
    selected[replaceIndex] = candidate;
    selectedTickers.add(ticker);
  }

  return selected.sort(compareCandidate);
}

function isPreviousSlotSticky(
  previous: KisWsPreviousSlot,
  churnCooldownMs: number,
  nowMs: number,
): boolean {
  if (previous.stickyUntilAt !== undefined) {
    return Date.parse(normalizeTimestamp(previous.stickyUntilAt, 'stickyUntilAt')) > nowMs;
  }
  if (churnCooldownMs <= 0) return false;
  const subscribedAtMs = Date.parse(normalizeTimestamp(previous.subscribedAt, 'subscribedAt'));
  return nowMs - subscribedAtMs < churnCooldownMs;
}

function findStickyReplacementIndex(selected: readonly KisWsSlotAssignment[]): number {
  for (let index = selected.length - 1; index >= 0; index -= 1) {
    const item = selected[index];
    if (item === undefined) continue;
    if (item.source === 'holding' || item.source === 'user_pin') continue;
    return index;
  }
  return -1;
}

function rankCandidates(
  candidates: readonly KisWsSlotCandidate[],
): KisWsSlotAssignment[] {
  const byTicker = new Map<string, KisWsSlotAssignment>();
  for (const candidate of candidates) {
    const item = normalizeCandidate(candidate);
    const previous = byTicker.get(item.ticker);
    if (previous === undefined || compareCandidate(item, previous) < 0) {
      byTicker.set(item.ticker, item);
    }
  }
  return [...byTicker.values()].sort(compareCandidate);
}

function normalizeCandidate(candidate: KisWsSlotCandidate): KisWsSlotAssignment {
  const priority = SOURCE_PRIORITY[candidate.source];
  return {
    ticker: normalizeTicker(candidate.ticker),
    state: 'fallback',
    source: candidate.source,
    reason: normalizeRequiredText(candidate.reason, 'reason', 200),
    score: clampScore(candidate.score),
    priority,
    ttlMs: candidate.ttlMs === null ? null : Math.max(0, Math.trunc(candidate.ttlMs)),
    lastSeenAt: normalizeTimestamp(candidate.lastSeenAt, 'lastSeenAt'),
    pinned: candidate.pinned,
  };
}

function compareCandidate(left: KisWsSlotAssignment, right: KisWsSlotAssignment): number {
  if (right.priority !== left.priority) return right.priority - left.priority;
  if (Number(right.pinned) !== Number(left.pinned)) {
    return Number(right.pinned) - Number(left.pinned);
  }
  if (right.score !== left.score) return right.score - left.score;
  const leftSeen = Date.parse(left.lastSeenAt);
  const rightSeen = Date.parse(right.lastSeenAt);
  if (rightSeen !== leftSeen) return rightSeen - leftSeen;
  return left.ticker.localeCompare(right.ticker);
}

function diffSubscriptions(
  previousSubscribed: readonly string[],
  nextSubscribed: readonly string[],
): KisWsSlotDiff {
  const previous = new Set(previousSubscribed.map(normalizeTicker));
  const next = new Set(nextSubscribed.map(normalizeTicker));
  return {
    subscribe: nextSubscribed.filter((ticker) => !previous.has(ticker)),
    unsubscribe: previousSubscribed
      .map(normalizeTicker)
      .filter((ticker) => !next.has(ticker)),
  };
}

function normalizeCap(cap: number): number {
  if (!Number.isFinite(cap)) return WS_MAX_SUBSCRIPTIONS;
  return Math.min(Math.max(0, Math.trunc(cap)), WS_MAX_SUBSCRIPTIONS);
}

function normalizeTicker(value: string): string {
  const trimmed = value.trim().toUpperCase();
  const ticker = trimmed.startsWith('A') ? trimmed.slice(1) : trimmed;
  if (!/^\d{6}$/.test(ticker)) throw new Error('Invalid KIS WS slot ticker');
  return ticker;
}

function normalizeRequiredText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) throw new Error(`Invalid KIS WS slot ${field}`);
  return normalized.slice(0, maxLength);
}

function normalizeTimestamp(value: string, field: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`Invalid KIS WS slot ${field}`);
  return new Date(ms).toISOString();
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
