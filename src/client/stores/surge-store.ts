/**
 * useSurgeStore — real-time recent momentum feed.
 *
 * Lifecycle:
 *   - SSE `price-update` crosses a rolling momentum threshold → `spawn`.
 *   - Active same-ticker entries are not duplicated; stronger signal levels
 *     update the existing row instead.
 *   - Older entries fade out: 1.0 → 0.7 over `SURGE_ACTIVE_MS`, then to 0
 *     over `SURGE_FADE_MS`. Past total window → dropped.
 *   - `tick` triggers a re-render every second so age-based opacity stays
 *     fresh without coupling to actual price events.
 */

import { create } from 'zustand';
import type {
  MomentumExitWarning,
  MomentumSignalType,
  MomentumWindow,
} from '../lib/realtime-momentum';

export const SURGE_ACTIVE_MS = 60_000;
export const SURGE_FADE_MS = 30_000;
export const SURGE_TOTAL_MS = SURGE_ACTIVE_MS + SURGE_FADE_MS;
export const SURGE_MAX_ROWS = 15;
const FEED_HARD_CAP = 30;

export interface SurgeEntry {
  code: string;
  name: string;
  price: number;
  /** Display % for this row. Momentum entries use recent momentum. */
  surgePct: number;
  /** Spawn timestamp (ms epoch). */
  ts: number;
  source?: 'legacy-change-rate' | 'realtime-momentum';
  signalType?: MomentumSignalType;
  momentumPct?: number;
  momentumWindow?: MomentumWindow;
  baselinePrice?: number;
  baselineAt?: number;
  currentAt?: number;
  dailyChangePct?: number;
  volume?: number | null;
  volumeSurgeRatio?: number | null;
  volumeBaselineStatus?: 'collecting' | 'ready' | 'unavailable';
  exitWarning?: MomentumExitWarning | null;
}

type SpawnInput = Omit<SurgeEntry, 'ts'>;

type UpdateInput = Partial<
  Pick<
    SurgeEntry,
    | 'price'
    | 'surgePct'
    | 'momentumPct'
    | 'dailyChangePct'
    | 'volume'
    | 'volumeSurgeRatio'
    | 'volumeBaselineStatus'
    | 'exitWarning'
    | 'currentAt'
  >
>;

interface LegacySpawnInput {
  code: string;
  name: string;
  price: number;
  surgePct: number;
}

interface SurgeState {
  feed: SurgeEntry[];
  /** Wall-clock used for age-based opacity. Updated by `tick` once per sec. */
  now: number;

  spawn: (entry: SpawnInput | LegacySpawnInput) => void;
  update: (code: string, patch: UpdateInput) => void;
  tick: () => void;
  clear: () => void;
}

export const useSurgeStore = create<SurgeState>((set, get) => ({
  feed: [],
  now: Date.now(),

  spawn: (entry) => {
    const t = Date.now();
    const { feed } = get();

    const activeIdx = feed.findIndex(
      (it) => it.code === entry.code && t - it.ts < SURGE_ACTIVE_MS,
    );
    if (activeIdx >= 0) {
      const existing = feed[activeIdx]!;
      if (
        signalPriority(readSignalType(entry)) >
        signalPriority(existing.signalType)
      ) {
        const updated: SurgeEntry = {
          ...existing,
          ...entry,
          ts: t,
        };
        const merged = [...feed];
        merged[activeIdx] = updated;
        set({ feed: merged, now: t });
      }
      return;
    }

    const next: SurgeEntry = { ...entry, ts: t };
    const merged = [next, ...feed]
      .filter((it) => t - it.ts < SURGE_TOTAL_MS)
      .slice(0, FEED_HARD_CAP);

    set({ feed: merged, now: t });
  },

  update: (code, patch) => {
    const { feed } = get();
    const idx = feed.findIndex((it) => it.code === code);
    if (idx < 0) return;
    const next = [...feed];
    next[idx] = { ...next[idx]!, ...patch };
    set({ feed: next, now: Date.now() });
  },

  tick: () => {
    const t = Date.now();
    const next = get().feed.filter((it) => t - it.ts < SURGE_TOTAL_MS);
    set({ feed: next, now: t });
  },

  clear: () => set({ feed: [] }),
}));

function signalPriority(type: MomentumSignalType | undefined): number {
  switch (type) {
    case 'overheat':
      return 4;
    case 'strong_scalp':
      return 3;
    case 'scalp':
      return 2;
    case 'trend':
      return 1;
    default:
      return 0;
  }
}

function readSignalType(
  entry: SpawnInput | LegacySpawnInput,
): MomentumSignalType | undefined {
  return 'signalType' in entry ? entry.signalType : undefined;
}
