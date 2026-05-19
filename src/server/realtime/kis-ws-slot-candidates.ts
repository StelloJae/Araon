import type { Favorite } from '@shared/types.js';

import type { AgentEvent, AgentEventType } from '../agent/agent-event-queue.js';
import type { MarketPhase } from '../lifecycle/market-hours-scheduler.js';
import type { OrderIntentPreview } from '../agent/order-intent-service.js';
import type { MarketTopMoverRotationCandidate } from '../market/market-top-movers-service.js';
import type { TossPortfolioPositionsPayload } from '../toss/toss-portfolio-client.js';
import type { TossWatchlistPayload } from '../toss/toss-watchlist-client.js';
import type { KisWsSlotCandidate } from './kis-ws-slot-allocator.js';

export const KIS_WS_SLOT_CHURN_COOLDOWN_MS = 30_000;
export const KIS_WS_AGENT_EVENT_TTL_MS = 10 * 60_000;

export interface BuildKisWsSlotCandidatesInput {
  readonly favorites?: readonly Favorite[];
  readonly portfolioSnapshot?: TossPortfolioPositionsPayload | null;
  readonly watchlistSnapshot?: TossWatchlistPayload | null;
  readonly currentTicker?: string | undefined;
  readonly agentEvents?: readonly AgentEvent[];
  readonly orderIntentPreviews?: readonly OrderIntentPreview[];
  readonly topMoverRotationCandidates?: readonly MarketTopMoverRotationCandidate[];
  readonly marketPhase?: MarketPhase | undefined;
  readonly now: string;
}

export function buildKisWsSlotCandidates(
  input: BuildKisWsSlotCandidatesInput,
): KisWsSlotCandidate[] {
  return [
    ...holdingCandidates(input.portfolioSnapshot ?? null, input.now),
    ...tossWatchlistCandidates(input.watchlistSnapshot ?? null, input.now),
    ...favoriteCandidates(input.favorites ?? [], input.now),
    ...orderIntentCandidates(input.orderIntentPreviews ?? [], input.now),
    ...currentViewCandidates(input.currentTicker, input.now),
    ...agentEventCandidates(input.agentEvents ?? [], input.now),
    ...topMoverRotationCandidates(
      input.topMoverRotationCandidates ?? [],
      input.marketPhase,
    ),
  ];
}

function holdingCandidates(
  snapshot: TossPortfolioPositionsPayload | null,
  now: string,
): KisWsSlotCandidate[] {
  if (snapshot === null) return [];
  const lastSeenAt = validIsoOrFallback(snapshot.fetchedAt, now);
  const byTicker = new Map<string, KisWsSlotCandidate>();
  for (const position of snapshot.positions) {
    const ticker =
      normalizeKrTicker(position.productCode) ?? normalizeKrTicker(position.symbol);
    if (ticker === null) continue;
    byTicker.set(ticker, {
      ticker,
      source: 'holding',
      reason: '토스 보유종목',
      score: 1,
      ttlMs: null,
      lastSeenAt,
      pinned: false,
    });
  }
  return [...byTicker.values()];
}

function tossWatchlistCandidates(
  snapshot: TossWatchlistPayload | null,
  now: string,
): KisWsSlotCandidate[] {
  if (snapshot === null) return [];
  const lastSeenAt = validIsoOrFallback(snapshot.fetchedAt, now);
  const byTicker = new Map<string, KisWsSlotCandidate>();
  for (const item of snapshot.items) {
    const ticker = normalizeKrTicker(item.productCode) ?? normalizeKrTicker(item.symbol);
    if (ticker === null) continue;
    byTicker.set(ticker, {
      ticker,
      source: 'manual_watchlist',
      reason: 'Toss 즐겨찾기',
      score: 0.92,
      ttlMs: null,
      lastSeenAt,
      pinned: false,
    });
  }
  return [...byTicker.values()];
}

function currentViewCandidates(
  currentTicker: string | undefined,
  now: string,
): KisWsSlotCandidate[] {
  const ticker = normalizeKrTicker(currentTicker);
  if (ticker === null) return [];
  return [
    {
      ticker,
      source: 'current_view',
      reason: '현재 화면',
      score: 0.9,
      ttlMs: 300_000,
      lastSeenAt: now,
      pinned: false,
    },
  ];
}

function favoriteCandidates(
  favorites: readonly Favorite[],
  now: string,
): KisWsSlotCandidate[] {
  const sorted = favorites
    .map((favorite) => ({ favorite, ticker: normalizeKrTicker(favorite.ticker) }))
    .filter((item): item is { favorite: Favorite; ticker: string } => item.ticker !== null)
    .sort((left, right) => left.favorite.addedAt.localeCompare(right.favorite.addedAt));
  const scoreStep = sorted.length > 0 ? 0.001 / sorted.length : 0;
  return sorted.map(({ favorite, ticker }, index) =>
    favoriteCandidate(favorite, ticker, now, index, scoreStep),
  );
}

function favoriteCandidate(
  favorite: Favorite,
  ticker: string,
  now: string,
  index: number,
  scoreStep: number,
): KisWsSlotCandidate {
  const pinned = favorite.tier === 'realtime';
  return {
    ticker,
    source: pinned ? 'user_pin' : 'manual_watchlist',
    reason: pinned ? '사용자 고정 realtime' : '사용자 관심종목',
    score: (pinned ? 1 : 0.5) - index * scoreStep,
    ttlMs: null,
    lastSeenAt: validIsoOrFallback(favorite.addedAt, now),
    pinned,
  };
}

function orderIntentCandidates(
  previews: readonly OrderIntentPreview[],
  now: string,
): KisWsSlotCandidate[] {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) return [];
  return previews.flatMap((preview): KisWsSlotCandidate[] => {
    const ticker = normalizeKrTicker(preview.ticker);
    if (ticker === null) return [];
    const expiresMs = Date.parse(preview.expiresAt);
    if (!Number.isFinite(expiresMs)) return [];
    const ttlMs = expiresMs - nowMs;
    if (ttlMs <= 0) return [];
    return [{
      ticker,
      source: 'agent_candidate',
      reason: 'agent order-intent 후보',
      score: 0.75,
      ttlMs,
      lastSeenAt: validIsoOrFallback(preview.createdAt, now),
      pinned: false,
    }];
  });
}

function agentEventCandidates(
  events: readonly AgentEvent[],
  now: string,
): KisWsSlotCandidate[] {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) return [];
  return events
    .map((event) => agentEventCandidate(event, nowMs))
    .filter((candidate): candidate is KisWsSlotCandidate => candidate !== null);
}

function agentEventCandidate(
  event: AgentEvent,
  nowMs: number,
): KisWsSlotCandidate | null {
  const source = agentEventSlotSource(event.type);
  const ticker = normalizeKrTicker(event.ticker);
  if (source === null || ticker === null) return null;
  const firstSeenMs = Date.parse(event.firstSeenAt);
  if (!Number.isFinite(firstSeenMs)) return null;
  const ttlMs = Math.max(0, KIS_WS_AGENT_EVENT_TTL_MS - (nowMs - firstSeenMs));
  if (ttlMs <= 0) return null;
  return {
    ticker,
    source,
    reason: agentEventSlotReason(event.type),
    score: event.relevance ?? event.confidence,
    ttlMs,
    lastSeenAt: event.firstSeenAt,
    pinned: false,
  };
}

function agentEventSlotSource(type: AgentEventType): KisWsSlotCandidate['source'] | null {
  switch (type) {
    case 'news_detected':
      return 'recent_news';
    case 'disclosure_detected':
      return 'recent_disclosure';
    case 'toss_signal_detected':
      return 'toss_signal';
    case 'market_movement_detected':
      return null;
    default:
      return null;
  }
}

function agentEventSlotReason(type: AgentEventType): string {
  switch (type) {
    case 'news_detected':
      return '최근 뉴스 이벤트';
    case 'disclosure_detected':
      return '최근 공시 이벤트';
    case 'toss_signal_detected':
      return '최근 토스 시그널';
    case 'market_movement_detected':
      return '최근 시장 움직임';
    default:
      return '최근 agent event';
  }
}

function topMoverRotationCandidates(
  candidates: readonly MarketTopMoverRotationCandidate[],
  marketPhase: MarketPhase | undefined,
): KisWsSlotCandidate[] {
  if (marketPhase !== undefined && marketPhase !== 'open') return [];
  return candidates.flatMap((candidate): KisWsSlotCandidate[] => {
    const ticker = normalizeKrTicker(candidate.ticker);
    if (ticker === null) return [];
    return [
      {
        ticker,
        source: 'top100_rotation',
        reason: candidate.reason,
        score: candidate.score,
        ttlMs: candidate.ttlMs,
        lastSeenAt: candidate.lastSeenAt,
        pinned: false,
      },
    ];
  });
}

function normalizeKrTicker(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim().toUpperCase();
  const ticker = trimmed.startsWith('A') ? trimmed.slice(1) : trimmed;
  return /^\d{6}$/.test(ticker) ? ticker : null;
}

function validIsoOrFallback(value: string, fallback: string): string {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : fallback;
}
