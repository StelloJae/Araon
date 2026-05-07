/**
 * usePriceHistoryStore — short-window per-ticker price history.
 *
 * Memory-only (NOT persisted to localStorage). The store accumulates points
 * from SSE `price-update` events so the dashboard can render an honest
 * sparkline / day chart without ever fabricating values. Snapshots are not
 * appended — they're a single bulk frame and don't represent intraday motion.
 *
 * Hard caps to prevent unbounded growth:
 *   - `MAX_POINTS_PER_TICKER` — enough 5s points for today's live session
 *   - `HISTORY_TTL_MS`        — 24 hours; older points are pruned on append
 *   - `MAX_TRACKED_TICKERS`   — 200; least-recently-touched ticker is dropped
 *                                when exceeded
 *
 * Read API: `selectHistory(ticker)` returns the (immutable) array; consumers
 * gate sparkline rendering on `length >= MIN_POINTS_FOR_SPARKLINE`.
 */

import { create } from 'zustand';
import {
  isRealtimePriceSource,
  PRICE_HISTORY_FALLBACK_SUPPRESS_MS,
} from '@shared/price-source.js';
import type { PriceCandleSource } from '@shared/types.js';

export interface PriceHistoryPoint {
  /** Price in 원. */
  price: number;
  /** Signed % change vs previous close. */
  changePct: number;
  /** Wall-clock ms epoch when the point was received. */
  ts: number;
  /** Source of the point. REST is used only when no nearby live source exists. */
  source?: PriceCandleSource | null;
}

export const HISTORY_TTL_MS = 24 * 60 * 60_000;
export const PRICE_HISTORY_BUCKET_MS = 5_000;
export const MAX_POINTS_PER_TICKER =
  Math.ceil(HISTORY_TTL_MS / PRICE_HISTORY_BUCKET_MS) + 1;
export const MAX_TRACKED_TICKERS = 200;
export const MIN_POINTS_FOR_SPARKLINE = 2;

interface PriceHistoryState {
  byTicker: Record<string, PriceHistoryPoint[]>;
  /** Last touch (write) time per ticker — used to evict the oldest one. */
  lastTouch: Record<string, number>;

  appendPoint: (ticker: string, point: PriceHistoryPoint) => void;
  seedTicker: (ticker: string, points: readonly PriceHistoryPoint[]) => void;
  clearTicker: (ticker: string) => void;
  clear: () => void;
}

export const usePriceHistoryStore = create<PriceHistoryState>((set, get) => ({
  byTicker: {},
  lastTouch: {},

  appendPoint: (ticker, point) => {
    const state = get();
    const capped = appendTickerHistory(state.byTicker[ticker] ?? [], point);
    if (capped === undefined) return;

    let nextByTicker: Record<string, PriceHistoryPoint[]> = {
      ...state.byTicker,
      [ticker]: capped,
    };
    let nextLastTouch: Record<string, number> = {
      ...state.lastTouch,
      [ticker]: point.ts,
    };

    // Cap the number of tracked tickers — drop the least-recently-touched.
    const tickerCount = Object.keys(nextByTicker).length;
    if (tickerCount > MAX_TRACKED_TICKERS) {
      let oldestTicker: string | null = null;
      let oldestTs = Number.POSITIVE_INFINITY;
      for (const t of Object.keys(nextByTicker)) {
        if (t === ticker) continue;
        const touch = nextLastTouch[t] ?? 0;
        if (touch < oldestTs) {
          oldestTs = touch;
          oldestTicker = t;
        }
      }
      if (oldestTicker !== null) {
        const { [oldestTicker]: _drop, ...restByTicker } = nextByTicker;
        const { [oldestTicker]: _drop2, ...restLastTouch } = nextLastTouch;
        void _drop;
        void _drop2;
        nextByTicker = restByTicker;
        nextLastTouch = restLastTouch;
      }
    }

    set({ byTicker: nextByTicker, lastTouch: nextLastTouch });
  },

  seedTicker: (ticker, points) =>
    set((state) => {
      if (points.length === 0) return {};
      const referenceTs = Math.max(...points.map((p) => p.ts));
      const capped = normalizeTickerHistory(
        [...(state.byTicker[ticker] ?? []), ...points],
        referenceTs,
      );
      return {
        byTicker: {
          ...state.byTicker,
          [ticker]: capped,
        },
        lastTouch: {
          ...state.lastTouch,
          [ticker]: referenceTs,
        },
      };
    }),

  clearTicker: (ticker) =>
    set((state) => {
      if (
        state.byTicker[ticker] === undefined &&
        state.lastTouch[ticker] === undefined
      ) {
        return {};
      }
      const { [ticker]: _h, ...byTicker } = state.byTicker;
      const { [ticker]: _t, ...lastTouch } = state.lastTouch;
      void _h;
      void _t;
      return { byTicker, lastTouch };
    }),

  clear: () => set({ byTicker: {}, lastTouch: {} }),
}));

/**
 * Stable empty-array sentinel returned for unknown tickers. Using a fresh
 * `[]` here would change identity on every render and trip zustand's
 * "result of getSnapshot should be cached" guard, causing an infinite
 * re-render loop in any component that subscribes via this selector.
 */
const EMPTY_HISTORY: ReadonlyArray<PriceHistoryPoint> = Object.freeze([]);

/** Selector convenience — returns the same EMPTY_HISTORY for unknown tickers. */
export function selectHistory(
  state: PriceHistoryState,
  ticker: string,
): ReadonlyArray<PriceHistoryPoint> {
  return state.byTicker[ticker] ?? EMPTY_HISTORY;
}

function normalizeTickerHistory(
  points: readonly PriceHistoryPoint[],
  referenceTs: number,
): PriceHistoryPoint[] {
  const cutoff = referenceTs - HISTORY_TTL_MS;
  const byBucket = new Map<number, PriceHistoryPoint>();
  const validPoints = points
    .filter((point) => {
      if (!Number.isFinite(point.ts) || point.ts < cutoff) return false;
      return Number.isFinite(point.price) && point.price > 0;
    })
    .sort((a, b) => a.ts - b.ts);
  let lastRealtimePoint: PriceHistoryPoint | undefined;
  for (const point of validPoints) {
    if (isNearbyFallbackPointFromLast(lastRealtimePoint, point)) continue;
    if (isRealtimePriceSource(point.source ?? null)) {
      lastRealtimePoint = point;
    }
    const bucket = bucketKey(point.ts);
    const existing = byBucket.get(bucket);
    byBucket.set(
      bucket,
      existing === undefined ? point : choosePreferredPoint(existing, point),
    );
  }
  const sorted = Array.from(byBucket.values()).sort((a, b) => a.ts - b.ts);
  return sorted.length > MAX_POINTS_PER_TICKER
    ? sorted.slice(sorted.length - MAX_POINTS_PER_TICKER)
    : sorted;
}

function appendTickerHistory(
  existing: readonly PriceHistoryPoint[],
  point: PriceHistoryPoint,
): PriceHistoryPoint[] | undefined {
  if (!Number.isFinite(point.ts) || !Number.isFinite(point.price) || point.price <= 0) {
    return undefined;
  }

  const cutoff = point.ts - HISTORY_TTL_MS;
  let startIndex = 0;
  while (startIndex < existing.length && existing[startIndex]!.ts < cutoff) {
    startIndex += 1;
  }

  const next = existing.slice(startIndex);
  if (isNearbyFallbackPoint(next, point)) return undefined;

  const bucket = bucketKey(point.ts);
  const last = next.at(-1);
  if (last !== undefined) {
    if (bucketKey(last.ts) === bucket) {
      next[next.length - 1] = choosePreferredPoint(last, point);
      return capHistory(next);
    }
    if (point.ts >= last.ts) {
      next.push(point);
      return capHistory(next);
    }
  }

  const existingBucketIndex = next.findIndex((item) => bucketKey(item.ts) === bucket);
  if (existingBucketIndex >= 0) {
    next[existingBucketIndex] = choosePreferredPoint(next[existingBucketIndex]!, point);
    return capHistory(next);
  }

  const insertIndex = next.findIndex((item) => item.ts > point.ts);
  if (insertIndex === -1) {
    next.push(point);
  } else {
    next.splice(insertIndex, 0, point);
  }
  return capHistory(next);
}

function capHistory(points: PriceHistoryPoint[]): PriceHistoryPoint[] {
  return points.length > MAX_POINTS_PER_TICKER
    ? points.slice(points.length - MAX_POINTS_PER_TICKER)
    : points;
}

function bucketKey(ts: number): number {
  return Math.floor(ts / PRICE_HISTORY_BUCKET_MS);
}

function choosePreferredPoint(
  existing: PriceHistoryPoint,
  incoming: PriceHistoryPoint,
): PriceHistoryPoint {
  return shouldReplacePoint(existing.source ?? null, incoming.source ?? null)
    ? incoming
    : existing;
}

function shouldReplacePoint(
  previous: PriceCandleSource | null,
  next: PriceCandleSource | null,
): boolean {
  if (isRealtimePriceSource(previous) && !isRealtimePriceSource(next)) return false;
  if (!isRealtimePriceSource(previous) && isRealtimePriceSource(next)) return true;
  if (previous !== null && next === null) return false;
  return true;
}

function isNearbyFallbackPoint(
  existing: readonly PriceHistoryPoint[],
  incoming: PriceHistoryPoint,
): boolean {
  if (isRealtimePriceSource(incoming.source ?? null)) return false;
  const lastLive = findLastRealtimePoint(existing);
  return isNearbyFallbackPointFromLast(lastLive, incoming);
}

function isNearbyFallbackPointFromLast(
  lastLive: PriceHistoryPoint | undefined,
  incoming: PriceHistoryPoint,
): boolean {
  if (isRealtimePriceSource(incoming.source ?? null)) return false;
  return (
    lastLive !== undefined &&
    incoming.ts >= lastLive.ts &&
    incoming.ts - lastLive.ts <= PRICE_HISTORY_FALLBACK_SUPPRESS_MS
  );
}

function findLastRealtimePoint(
  points: readonly PriceHistoryPoint[],
): PriceHistoryPoint | undefined {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const point = points[i];
    if (point !== undefined && isRealtimePriceSource(point.source ?? null)) {
      return point;
    }
  }
  return undefined;
}
