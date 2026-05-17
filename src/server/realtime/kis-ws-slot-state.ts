import type {
  KisWsSlotDiff,
  KisWsPreviousSlot,
  KisWsSlotPlan,
} from './kis-ws-slot-allocator.js';
import { KIS_WS_SLOT_CHURN_COOLDOWN_MS } from './kis-ws-slot-candidates.js';

export type KisWsSlotRebalanceSnapshotOutcome =
  | 'rebalanced'
  | 'unchanged'
  | 'skipped'
  | 'no_candidates';

export interface KisWsSlotRebalanceSnapshot {
  readonly requestedAt: string;
  readonly reason: string;
  readonly outcome: KisWsSlotRebalanceSnapshotOutcome;
  readonly skipReason: string | null;
  readonly activeCount: number | null;
  readonly fallbackCount: number | null;
  readonly diff: KisWsSlotDiff | null;
}

export interface KisWsSlotRebalanceRecordInput {
  readonly requestedAt: string;
  readonly reason: string;
  readonly outcome: KisWsSlotRebalanceSnapshotOutcome;
  readonly skipReason?: string | null;
  readonly activeCount?: number | null;
  readonly fallbackCount?: number | null;
  readonly diff?: KisWsSlotDiff | null;
}

export interface KisWsSlotStateStore {
  snapshot(): KisWsPreviousSlot[];
  applyPlan(plan: Pick<KisWsSlotPlan, 'generatedAt' | 'subscribed'>): void;
  recordRebalance(input: KisWsSlotRebalanceRecordInput): void;
  rebalanceSnapshot(): KisWsSlotRebalanceSnapshot | null;
  clear(): void;
}

interface SlotState {
  readonly ticker: string;
  readonly subscribedAt: string;
  readonly stickyUntilAt: string;
}

export function createKisWsSlotStateStore(): KisWsSlotStateStore {
  const slots = new Map<string, SlotState>();
  let lastRebalance: KisWsSlotRebalanceSnapshot | null = null;

  function snapshot(): KisWsPreviousSlot[] {
    return [...slots.values()].map((slot) => ({
      ticker: slot.ticker,
      subscribedAt: slot.subscribedAt,
      stickyUntilAt: slot.stickyUntilAt,
    }));
  }

  function applyPlan(plan: Pick<KisWsSlotPlan, 'generatedAt' | 'subscribed'>): void {
    const generatedAt = normalizeTimestamp(plan.generatedAt, 'generatedAt');
    const next = new Map<string, SlotState>();
    for (const item of plan.subscribed) {
      const ticker = normalizeTicker(item.ticker);
      const previous = slots.get(ticker);
      next.set(ticker, {
        ticker,
        subscribedAt: previous?.subscribedAt ?? generatedAt,
        stickyUntilAt: previous?.stickyUntilAt ?? addMs(
          generatedAt,
          KIS_WS_SLOT_CHURN_COOLDOWN_MS,
        ),
      });
    }
    slots.clear();
    for (const [ticker, slot] of next) {
      slots.set(ticker, slot);
    }
  }

  function clear(): void {
    slots.clear();
    lastRebalance = null;
  }

  function recordRebalance(input: KisWsSlotRebalanceRecordInput): void {
    lastRebalance = {
      requestedAt: normalizeTimestamp(input.requestedAt, 'requestedAt'),
      reason: sanitizeReason(input.reason),
      outcome: input.outcome,
      skipReason: input.skipReason === undefined || input.skipReason === null
        ? null
        : sanitizeReason(input.skipReason),
      activeCount: normalizeCount(input.activeCount),
      fallbackCount: normalizeCount(input.fallbackCount),
      diff: input.diff === undefined || input.diff === null
        ? null
        : normalizeDiff(input.diff),
    };
  }

  function rebalanceSnapshot(): KisWsSlotRebalanceSnapshot | null {
    if (lastRebalance === null) return null;
    return {
      ...lastRebalance,
      diff: lastRebalance.diff === null
        ? null
        : {
          subscribe: [...lastRebalance.diff.subscribe],
          unsubscribe: [...lastRebalance.diff.unsubscribe],
        },
    };
  }

  return { snapshot, applyPlan, recordRebalance, rebalanceSnapshot, clear };
}

function normalizeTicker(value: string): string {
  const trimmed = value.trim().toUpperCase();
  const ticker = trimmed.startsWith('A') ? trimmed.slice(1) : trimmed;
  if (!/^\d{6}$/.test(ticker)) throw new Error('Invalid KIS WS slot state ticker');
  return ticker;
}

function normalizeTimestamp(value: string, field: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`Invalid KIS WS slot state ${field}`);
  return new Date(ms).toISOString();
}

function addMs(value: string, ms: number): string {
  return new Date(Date.parse(value) + ms).toISOString();
}

function normalizeCount(value: number | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Invalid KIS WS slot rebalance count');
  }
  return Math.floor(value);
}

function normalizeDiff(diff: KisWsSlotDiff): KisWsSlotDiff {
  return {
    subscribe: diff.subscribe.map(normalizeTicker),
    unsubscribe: diff.unsubscribe.map(normalizeTicker),
  };
}

function sanitizeReason(value: string): string {
  const head = value.trim().split(/\s+/)[0] ?? '';
  if (
    head.includes('=') ||
    /^(session|cookie|account|accountNo|approval|secret|appKey|appSecret|token|utk|ltk|ftk)$/i.test(head)
  ) {
    return 'rebalance';
  }
  const safe = head.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 80);
  if (safe.length === 0) return 'rebalance';
  return safe;
}
