import { create } from 'zustand';
import type { MarketTopMoversResponse } from '@shared/types';
import {
  marketTopMoversDisplayNameEntries,
  normalizeDisplayName,
  normalizeDisplayTicker,
  type ProductDisplayNameEntry,
} from '../lib/product-display-name';

interface ProductDisplayNameState {
  names: Record<string, string>;
  upsert: (entries: readonly ProductDisplayNameEntry[]) => void;
  upsertMarketTopMovers: (response: MarketTopMoversResponse) => void;
  reset: () => void;
}

export const useProductDisplayNameStore = create<ProductDisplayNameState>((set) => ({
  names: {},

  upsert: (entries) =>
    set((state) => {
      let next: Record<string, string> | null = null;
      for (const entry of entries) {
        const ticker = normalizeDisplayTicker(entry.ticker);
        const name = normalizeDisplayName(entry.name, ticker);
        if (ticker === null || name === null) continue;
        if (state.names[ticker] === name) continue;
        next ??= { ...state.names };
        next[ticker] = name;
      }
      return next === null ? {} : { names: next };
    }),

  upsertMarketTopMovers: (response) => {
    useProductDisplayNameStore
      .getState()
      .upsert(marketTopMoversDisplayNameEntries(response));
  },

  reset: () => set({ names: {} }),
}));
