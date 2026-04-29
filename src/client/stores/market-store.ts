/**
 * useMarketStore — global market + SSE state.
 *
 * Holds three slices:
 *   - `marketStatus` — MarketStatus from the latest SnapshotEvent (open / pre-open
 *     / closed / snapshot). Drives the header MarketBadge variant.
 *   - `sseStatus` — EventSource readyState mapped to a friendly enum used by
 *     SSEIndicator.
 *   - `lastUpdate` — wall-clock timestamp of the last incoming SSE message.
 *     The status bar's "마지막 업데이트 HH:MM:SS" reads from here.
 */

import { create } from 'zustand';
import type { MarketStatus } from '@shared/types';
import type { SseStatus } from '../components/SSEIndicator';

interface MarketState {
  marketStatus: MarketStatus;
  sseStatus: SseStatus;
  lastUpdate: Date | null;

  setMarketStatus: (status: MarketStatus) => void;
  setSseStatus: (status: SseStatus) => void;
  markUpdate: (nowMs?: number) => void;
}

const LAST_UPDATE_MIN_INTERVAL_MS = 1_000;

export const useMarketStore = create<MarketState>((set, get) => ({
  marketStatus: 'snapshot',
  sseStatus: 'connecting',
  lastUpdate: null,

  setMarketStatus: (status) => set({ marketStatus: status }),
  setSseStatus: (status) => set({ sseStatus: status }),
  markUpdate: (nowMs = Date.now()) => {
    const lastUpdate = get().lastUpdate;
    if (
      lastUpdate !== null &&
      nowMs - lastUpdate.getTime() < LAST_UPDATE_MIN_INTERVAL_MS
    ) {
      return;
    }
    set({ lastUpdate: new Date(nowMs) });
  },
}));
