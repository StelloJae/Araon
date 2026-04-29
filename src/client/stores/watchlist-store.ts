/**
 * useWatchlistStore — local UI state for the watchlist surface.
 *
 *   - favorites     : Set<ticker> of stocks the user has starred. Mirrors the
 *                     server-side favorites list; sync via `setFavorites` on
 *                     initial load and on every successful POST/DELETE
 *                     /favorites round-trip.
 *   - view          : 'sector' | 'tag' | 'mixed' (active SectionStack mode)
 *   - collapsed     : Record<sectionId, boolean>
 *   - sortKeys      : Record<sectionId, SortKey>
 *
 * Mutations always replace top-level references so Zustand's `Object.is`
 * equality picks them up.
 */

import { create } from 'zustand';
import type { ViewKind } from '../components/ViewToggle';
import type { SortKey } from '../lib/view-models';

interface WatchlistState {
  favorites: Set<string>;
  view: ViewKind;
  collapsed: Record<string, boolean>;
  sortKeys: Record<string, SortKey>;

  setFavorites: (tickers: ReadonlyArray<string>) => void;
  toggleFavorite: (ticker: string) => void;
  removeFavorite: (ticker: string) => void;
  setView: (view: ViewKind) => void;
  toggleCollapsed: (sectionId: string) => void;
  setSortKey: (sectionId: string, key: SortKey) => void;
}

export const useWatchlistStore = create<WatchlistState>((set) => ({
  favorites: new Set(),
  view: 'sector',
  collapsed: {},
  sortKeys: {},

  setFavorites: (tickers) => set({ favorites: new Set(tickers) }),

  toggleFavorite: (ticker) =>
    set((state) => {
      const next = new Set(state.favorites);
      if (next.has(ticker)) {
        next.delete(ticker);
      } else {
        next.add(ticker);
      }
      return { favorites: next };
    }),

  removeFavorite: (ticker) =>
    set((state) => {
      if (!state.favorites.has(ticker)) return {};
      const next = new Set(state.favorites);
      next.delete(ticker);
      return { favorites: next };
    }),

  setView: (view) => set({ view }),

  toggleCollapsed: (sectionId) =>
    set((state) => ({
      collapsed: {
        ...state.collapsed,
        [sectionId]: !(state.collapsed[sectionId] ?? false),
      },
    })),

  setSortKey: (sectionId, key) =>
    set((state) => ({
      sortKeys: { ...state.sortKeys, [sectionId]: key },
    })),
}));
