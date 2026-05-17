/**
 * useWatchlistStore — local UI state for the normalized watchlist surface.
 *
 *   - favorites     : Set<ticker> used by stock-row UI. Seeded from `/watchlist`,
 *                     where Toss watchlist is primary and local favorites are
 *                     fallback/cache.
 *   - view          : 'sector' | 'top100' (active SectionStack mode; TOP100 is
 *                     the default terminal market rail)
 *   - collapsed     : Record<sectionId, boolean>
 *   - sortKeys      : Record<sectionId, SortKey>
 *
 * Mutations always replace top-level references so Zustand's `Object.is`
 * equality picks them up.
 */

import { create } from 'zustand';
import type { AraonWatchlistItem } from '../lib/api-client';
import type { SortKey } from '../lib/view-models';

export type ViewKind = 'sector' | 'top100';

interface WatchlistState {
  favorites: Set<string>;
  itemsByCode: Record<string, AraonWatchlistItem>;
  view: ViewKind;
  collapsed: Record<string, boolean>;
  sortKeys: Record<string, SortKey>;

  setFavorites: (tickers: ReadonlyArray<string>) => void;
  setWatchlistItems: (items: ReadonlyArray<AraonWatchlistItem>) => void;
  toggleFavorite: (ticker: string) => void;
  removeFavorite: (ticker: string) => void;
  setView: (view: ViewKind) => void;
  toggleCollapsed: (sectionId: string) => void;
  setSortKey: (sectionId: string, key: SortKey) => void;
}

export const useWatchlistStore = create<WatchlistState>((set) => ({
  favorites: new Set(),
  itemsByCode: {},
  view: 'top100',
  collapsed: {},
  sortKeys: {},

  setFavorites: (tickers) => set({ favorites: new Set(tickers), itemsByCode: {} }),

  setWatchlistItems: (items) =>
    set({
      favorites: new Set(items.map(watchlistItemToUiCode)),
      itemsByCode: Object.fromEntries(
        items.map((item) => [watchlistItemToUiCode(item), item]),
      ),
    }),

  toggleFavorite: (ticker) =>
    set((state) => {
      const next = new Set(state.favorites);
      const itemsByCode = { ...state.itemsByCode };
      if (next.has(ticker)) {
        next.delete(ticker);
        delete itemsByCode[ticker];
      } else {
        next.add(ticker);
      }
      return { favorites: next, itemsByCode };
    }),

  removeFavorite: (ticker) =>
    set((state) => {
      if (!state.favorites.has(ticker)) return {};
      const next = new Set(state.favorites);
      const itemsByCode = { ...state.itemsByCode };
      next.delete(ticker);
      delete itemsByCode[ticker];
      return { favorites: next, itemsByCode };
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

function watchlistItemToUiCode(item: AraonWatchlistItem): string {
  return item.krTicker ?? item.symbol;
}
