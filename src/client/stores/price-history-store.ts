/**
 * usePriceHistoryStore — short-window per-ticker price history.
 *
 * Memory-only (NOT persisted to localStorage). The store accumulates points
 * from SSE `price-update` events so the dashboard can render an honest
 * sparkline / day chart without ever fabricating values. Snapshots are not
 * appended — they're a single bulk frame and don't represent intraday motion.
 *
 * Hard caps to prevent unbounded growth:
 *   - `MAX_POINTS_PER_TICKER` — 120 points (≈ a few minutes of dense ticks)
 *   - `HISTORY_TTL_MS`        — 30 minutes; older points are pruned on append
 *   - `MAX_TRACKED_TICKERS`   — 200; least-recently-touched ticker is dropped
 *                                when exceeded
 *
 * Read API: `selectHistory(ticker)` returns the (immutable) array; consumers
 * gate sparkline rendering on `length >= MIN_POINTS_FOR_SPARKLINE`.
 */

import { create } from 'zustand';

export interface PriceHistoryPoint {
  /** Price in 원. */
  price: number;
  /** Signed % change vs previous close. */
  changePct: number;
  /** Wall-clock ms epoch when the point was received. */
  ts: number;
}

export const MAX_POINTS_PER_TICKER = 120;
export const HISTORY_TTL_MS = 30 * 60_000;
export const MAX_TRACKED_TICKERS = 200;
export const MIN_POINTS_FOR_SPARKLINE = 2;

interface PriceHistoryState {
  byTicker: Record<string, PriceHistoryPoint[]>;
  /** Last touch (write) time per ticker — used to evict the oldest one. */
  lastTouch: Record<string, number>;

  appendPoint: (ticker: string, point: PriceHistoryPoint) => void;
  clearTicker: (ticker: string) => void;
  clear: () => void;
}

export const usePriceHistoryStore = create<PriceHistoryState>((set, get) => ({
  byTicker: {},
  lastTouch: {},

  appendPoint: (ticker, point) => {
    const state = get();
    const cutoff = point.ts - HISTORY_TTL_MS;

    const prev = state.byTicker[ticker] ?? [];
    // De-dup the very last point if it lands in the same millisecond at the
    // same price — KIS sometimes emits duplicate ticks back-to-back.
    const last = prev[prev.length - 1];
    const isDup =
      last !== undefined && last.ts === point.ts && last.price === point.price;
    const merged = isDup ? prev : [...prev, point];

    // Drop points outside the TTL window.
    const fresh = merged.filter((p) => p.ts >= cutoff);
    // Cap to MAX_POINTS_PER_TICKER (drop oldest).
    const capped =
      fresh.length > MAX_POINTS_PER_TICKER
        ? fresh.slice(fresh.length - MAX_POINTS_PER_TICKER)
        : fresh;

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
