/**
 * useMomentumHistoryStore — bucketed live price history for realtime surge.
 *
 * This store is memory-only. It receives live WebSocket prices and keeps one
 * last price per 1s bucket so the detector can compare 10s/20s/30s/1m/3m/5m
 * windows without retaining every raw tick.
 */

import { create } from 'zustand';
import {
  MOMENTUM_BUCKET_MS,
  MOMENTUM_RETENTION_MS,
  type MomentumBucket,
  type MomentumSession,
} from '../lib/realtime-momentum';

export const MOMENTUM_MAX_TRACKED_KEYS = 240;

export interface MomentumBucketPoint {
  price: number;
  volume: number | null;
  ts: number;
  session: MomentumSession;
}

interface MomentumHistoryState {
  byKey: Record<string, MomentumBucket[]>;
  lastTouch: Record<string, number>;

  appendBucketPoint: (ticker: string, point: MomentumBucketPoint) => void;
  clearTicker: (ticker: string) => void;
  clear: () => void;
}

export const useMomentumHistoryStore = create<MomentumHistoryState>((set, get) => ({
  byKey: {},
  lastTouch: {},

  appendBucketPoint: (ticker, point) => {
    const state = get();
    const key = momentumHistoryKey(ticker, point.session);
    const bucketStart = Math.floor(point.ts / MOMENTUM_BUCKET_MS) * MOMENTUM_BUCKET_MS;
    const cutoff = point.ts - MOMENTUM_RETENTION_MS;
    const prev = state.byKey[key] ?? [];
    const last = prev[prev.length - 1];
    const nextBucket: MomentumBucket = {
      ticker,
      session: point.session,
      bucketStart,
      ts: point.ts,
      price: point.price,
      volume: point.volume,
    };

    const merged =
      last !== undefined && last.bucketStart === bucketStart
        ? [...prev.slice(0, -1), nextBucket]
        : [...prev, nextBucket];
    const fresh = merged.filter((bucket) => bucket.ts >= cutoff);

    let nextByKey: Record<string, MomentumBucket[]> = {
      ...state.byKey,
      [key]: fresh,
    };
    let nextLastTouch: Record<string, number> = {
      ...state.lastTouch,
      [key]: point.ts,
    };

    const keys = Object.keys(nextByKey);
    if (keys.length > MOMENTUM_MAX_TRACKED_KEYS) {
      let oldestKey: string | null = null;
      let oldestTs = Number.POSITIVE_INFINITY;
      for (const existing of keys) {
        if (existing === key) continue;
        const touch = nextLastTouch[existing] ?? 0;
        if (touch < oldestTs) {
          oldestKey = existing;
          oldestTs = touch;
        }
      }
      if (oldestKey !== null) {
        const { [oldestKey]: _drop, ...restByKey } = nextByKey;
        const { [oldestKey]: _dropTouch, ...restLastTouch } = nextLastTouch;
        void _drop;
        void _dropTouch;
        nextByKey = restByKey;
        nextLastTouch = restLastTouch;
      }
    }

    set({ byKey: nextByKey, lastTouch: nextLastTouch });
  },

  clearTicker: (ticker) =>
    set((state) => {
      const prefix = `${ticker}:`;
      let changed = false;
      const nextByKey: Record<string, MomentumBucket[]> = {};
      const nextLastTouch: Record<string, number> = {};

      for (const [key, buckets] of Object.entries(state.byKey)) {
        if (key.startsWith(prefix)) {
          changed = true;
          continue;
        }
        nextByKey[key] = buckets;
      }
      for (const [key, touch] of Object.entries(state.lastTouch)) {
        if (key.startsWith(prefix)) {
          changed = true;
          continue;
        }
        nextLastTouch[key] = touch;
      }

      return changed ? { byKey: nextByKey, lastTouch: nextLastTouch } : {};
    }),

  clear: () => set({ byKey: {}, lastTouch: {} }),
}));

const EMPTY_BUCKETS: ReadonlyArray<MomentumBucket> = Object.freeze([]);

export function selectMomentumBuckets(
  state: MomentumHistoryState,
  ticker: string,
  session: MomentumSession,
): ReadonlyArray<MomentumBucket> {
  return state.byKey[momentumHistoryKey(ticker, session)] ?? EMPTY_BUCKETS;
}

export function momentumHistoryKey(
  ticker: string,
  session: MomentumSession,
): string {
  return `${ticker}:${session}`;
}
