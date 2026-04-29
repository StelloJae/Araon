/**
 * useSurgeStore — real-time "급상승 ≥3%" feed.
 *
 * Lifecycle:
 *   - SSE `price-update` arrives with `changeRate >= 3` → `spawn` if no
 *     active entry for the same ticker within `SURGE_ACTIVE_MS`.
 *   - Older entries fade out: 1.0 → 0.7 over `SURGE_ACTIVE_MS`, then to 0
 *     over `SURGE_FADE_MS`. Past total window → dropped.
 *   - `tick` triggers a re-render every second so age-based opacity stays
 *     fresh without coupling to actual price events.
 */

import { create } from 'zustand';

export const SURGE_ACTIVE_MS = 60_000;
export const SURGE_FADE_MS = 30_000;
export const SURGE_TOTAL_MS = SURGE_ACTIVE_MS + SURGE_FADE_MS;
export const SURGE_MAX_ROWS = 15;
const FEED_HARD_CAP = 30;

export interface SurgeEntry {
  code: string;
  name: string;
  price: number;
  surgePct: number;
  /** Spawn timestamp (ms epoch). */
  ts: number;
}

interface SpawnInput {
  code: string;
  name: string;
  price: number;
  surgePct: number;
}

interface SurgeState {
  feed: SurgeEntry[];
  /** Wall-clock used for age-based opacity. Updated by `tick` once per sec. */
  now: number;

  spawn: (entry: SpawnInput) => void;
  tick: () => void;
  clear: () => void;
}

export const useSurgeStore = create<SurgeState>((set, get) => ({
  feed: [],
  now: Date.now(),

  spawn: (entry) => {
    const t = Date.now();
    const { feed } = get();

    // De-dupe: skip if same ticker already present within the active window.
    const dup = feed.some(
      (it) => it.code === entry.code && t - it.ts < SURGE_ACTIVE_MS,
    );
    if (dup) return;

    const next: SurgeEntry = { ...entry, ts: t };
    const merged = [next, ...feed]
      .filter((it) => t - it.ts < SURGE_TOTAL_MS)
      .slice(0, FEED_HARD_CAP);

    set({ feed: merged, now: t });
  },

  tick: () => {
    const t = Date.now();
    const next = get().feed.filter((it) => t - it.ts < SURGE_TOTAL_MS);
    set({ feed: next, now: t });
  },

  clear: () => set({ feed: [] }),
}));
