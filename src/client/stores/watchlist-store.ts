/**
 * useWatchlistStore — local UI state for the normalized watchlist surface.
 *
 *   - favorites     : Set<ticker> shown in the Araon watch surface. This includes
 *                     Toss watchlist, local fallback, and Toss holdings.
 *   - watchlistMembers: Set<ticker> shown with a filled star in the product UI.
 *                     Holdings can stay visible without being watchlist members.
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
  watchlistMembers: Set<string>;
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
  watchlistMembers: new Set(),
  itemsByCode: {},
  view: 'top100',
  collapsed: {},
  sortKeys: {},

  setFavorites: (tickers) =>
    set({
      favorites: new Set(tickers),
      watchlistMembers: new Set(tickers),
      itemsByCode: {},
    }),

  setWatchlistItems: (items) =>
    set({
      favorites: new Set(items.map(watchlistItemToUiCode)),
      watchlistMembers: new Set(
        items
          .filter((item) => item.watchlistMember)
          .map(watchlistItemToUiCode),
      ),
      itemsByCode: Object.fromEntries(
        items.map((item) => [watchlistItemToUiCode(item), item]),
      ),
    }),

  toggleFavorite: (ticker) =>
    set((state) => {
      const next = new Set(state.favorites);
      const nextMembers = new Set(state.watchlistMembers);
      const itemsByCode = { ...state.itemsByCode };
      const item = itemsByCode[ticker];
      if (nextMembers.has(ticker)) {
        nextMembers.delete(ticker);
        if (item !== undefined && item.holding) {
          itemsByCode[ticker] = {
            ...item,
            watchlistMember: false,
            manualWatchlist: false,
            autoSyncedFromHolding: true,
            membershipSource: 'holding_auto',
          };
        } else {
          next.delete(ticker);
          delete itemsByCode[ticker];
        }
      } else {
        next.add(ticker);
        nextMembers.add(ticker);
        if (item !== undefined) {
          itemsByCode[ticker] = { ...item, watchlistMember: true };
        }
      }
      return { favorites: next, watchlistMembers: nextMembers, itemsByCode };
    }),

  removeFavorite: (ticker) =>
    set((state) => {
      if (!state.favorites.has(ticker)) return {};
      const next = new Set(state.favorites);
      const nextMembers = new Set(state.watchlistMembers);
      const itemsByCode = { ...state.itemsByCode };
      const item = itemsByCode[ticker];
      if (item?.holding) {
        nextMembers.delete(ticker);
        itemsByCode[ticker] = {
          ...item,
          watchlistMember: false,
          manualWatchlist: false,
          autoSyncedFromHolding: true,
          membershipSource: 'holding_auto',
        };
        return { favorites: next, watchlistMembers: nextMembers, itemsByCode };
      }
      next.delete(ticker);
      nextMembers.delete(ticker);
      delete itemsByCode[ticker];
      return { favorites: next, watchlistMembers: nextMembers, itemsByCode };
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
