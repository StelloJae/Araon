/**
 * useMasterStore — full KRX universe loaded for client-side search.
 *
 * The master catalog (~2600 tickers) is fetched once via `GET /master/list`
 * and kept in memory only — no localStorage. If the first load finds an
 * uninitialized empty catalog, the store triggers the guarded server refresh
 * once so first-run search is usable after credentials are configured.
 *
 * Loading is lazy:
 *   - `App.tsx` schedules a `requestIdleCallback` preload after Dashboard
 *     mount.
 *   - `GlobalSearch` calls `ensureLoaded()` on the first input focus as a
 *     safety net for browsers without `requestIdleCallback` support.
 *
 * Refresh status is also tracked here so SettingsModal's connection tab
 * can show "마지막 갱신: …" and a "지금 갱신" button.
 */

import { create } from 'zustand';
import {
  getCredentialsStatus,
  getMasterList,
  refreshMaster,
  type MasterStockEntry,
  type MasterRefreshStatus,
} from '../lib/api-client';

interface MasterState {
  items: ReadonlyArray<MasterStockEntry>;
  refreshedAt: string | null;
  rowCount: number;
  fresh: boolean;
  stale: boolean;
  loadStatus: 'idle' | 'loading' | 'loaded' | 'error';
  loadError: string | null;
  refreshStatus: 'idle' | 'running' | 'success' | 'failed';
  refreshError: string | null;

  /** Lazily fetch the master list. No-op if already loaded or in flight. */
  ensureLoaded: () => Promise<void>;
  /** User-triggered refresh. Returns the new status. */
  triggerRefresh: () => Promise<void>;
}

let inflightLoad: Promise<void> | null = null;
let inflightRefresh: Promise<void> | null = null;

export const useMasterStore = create<MasterState>((set, get) => ({
  items: [],
  refreshedAt: null,
  rowCount: 0,
  fresh: false,
  stale: false,
  loadStatus: 'idle',
  loadError: null,
  refreshStatus: 'idle',
  refreshError: null,

  ensureLoaded: async () => {
    const state = get();
    if (state.loadStatus === 'loaded' || state.loadStatus === 'loading') {
      if (inflightLoad !== null) await inflightLoad;
      return;
    }
    inflightLoad = (async () => {
      set({ loadStatus: 'loading', loadError: null });
      try {
        const payload = await getMasterList();
        set({
          items: payload.items,
          refreshedAt: payload.refreshedAt,
          rowCount: payload.rowCount,
          fresh: payload.fresh,
          stale: payload.stale,
          loadStatus: 'loaded',
          loadError: null,
        });
        if (
          payload.items.length === 0 &&
          payload.rowCount === 0 &&
          payload.refreshedAt === null &&
          await canRefreshMasterWithKisCredentials()
        ) {
          await get().triggerRefresh();
        }
      } catch (err) {
        set({
          loadStatus: 'error',
          loadError: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    try {
      await inflightLoad;
    } finally {
      inflightLoad = null;
    }
  },

  triggerRefresh: async () => {
    if (inflightRefresh !== null) {
      await inflightRefresh;
      return;
    }
    inflightRefresh = (async () => {
      set({ refreshStatus: 'running', refreshError: null });
      try {
        const status: MasterRefreshStatus = await refreshMaster();
        set({
          refreshStatus: status.lastError !== null ? 'failed' : 'success',
          refreshError: status.lastError,
          refreshedAt: status.refreshedAt,
          rowCount: status.rowCount,
          fresh: status.fresh,
          stale: status.stale,
        });
        // Re-fetch the list so newly-added tickers appear in search.
        const payload = await getMasterList();
        set({
          items: payload.items,
          refreshedAt: payload.refreshedAt,
          rowCount: payload.rowCount,
          fresh: payload.fresh,
          stale: payload.stale,
          loadStatus: 'loaded',
        });
      } catch (err) {
        set({
          refreshStatus: 'failed',
          refreshError: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    try {
      await inflightRefresh;
    } finally {
      inflightRefresh = null;
    }
  },
}));

async function canRefreshMasterWithKisCredentials(): Promise<boolean> {
  try {
    return (await getCredentialsStatus()).configured;
  } catch {
    return false;
  }
}
