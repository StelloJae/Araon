/**
 * useStocksStore — ticker catalog + live quotes + tick-flash seeds.
 *
 * Three Records keyed by 6-digit ticker:
 *   - `catalog`     — { name, market } loaded from `GET /stocks`
 *   - `quotes`      — `Price` from SSE (snapshot or live tick)
 *   - `flashSeeds`  — counter incremented on every price update for a ticker;
 *                     the StockCard watches this for the 280ms border flash
 *
 * Why Records (plain objects) and not Maps?
 * Zustand uses `Object.is` for selector equality. Mutating a Map in place
 * keeps the same reference and selectors stop firing. Records are easy to
 * shallow-copy via `{...prev, [ticker]: next}`, which gives every subscriber
 * a fresh top-level reference but preserves inner object identity for
 * unaffected tickers — `Object.is` on `quotes[otherTicker]` returns true,
 * so unrelated cards do not re-render.
 */

import { create } from 'zustand';
import type { AutoSectorName, Price } from '@shared/types';
import type { Stock } from '@shared/types';
import type { StockViewModel } from '../lib/view-models';
import type { ThemeDetail } from '../lib/api-client';
import { getEffectiveSector } from '../lib/effective-sector';

export interface CatalogEntry {
  name: string;
  market: 'KOSPI' | 'KOSDAQ';
  /** Theme id this ticker belongs to. `null` = no manual theme membership. */
  sectorId: string | null;
  /**
   * Manual theme name resolved from the theme catalog at `setThemes` time.
   * Cached here so `buildStockVM` can compute `effectiveSector` without a
   * separate `sectors` argument. Null when `sectorId` is null.
   */
  manualSectorName: string | null;
  /**
   * KIS official index industry classification from master_stocks.
   * Filled by `setCatalog` from `Stock.autoSector`. Null when no official
   * industry exists or the mapping resolved to '기타'/unknown.
   */
  autoSector: AutoSectorName | null;
}

export interface SectorMeta {
  id: string;
  name: string;
  /** Short subtitle shown under the section title (uses theme `description`). */
  tagline: string;
}

/** Synthetic sector for tickers that aren't in any theme. */
export const OTHERS_SECTOR_ID = 'others';

interface StocksState {
  catalog: Record<string, CatalogEntry>;
  sectors: SectorMeta[];
  quotes: Record<string, Price>;
  flashSeeds: Record<string, number>;

  setCatalog: (stocks: Stock[]) => void;
  setThemes: (themes: ThemeDetail[]) => void;
  applySnapshot: (prices: Price[]) => void;
  applyPriceUpdate: (price: Price) => void;
  applyPriceUpdates: (prices: Price[]) => void;
  removeStock: (ticker: string) => void;
}

export const useStocksStore = create<StocksState>((set) => ({
  catalog: {},
  sectors: [],
  quotes: {},
  flashSeeds: {},

  setCatalog: (stocks) =>
    set((state) => {
      const next: Record<string, CatalogEntry> = {};
      for (const s of stocks) {
        const prev = state.catalog[s.ticker];
        next[s.ticker] = {
          name: s.name,
          market: s.market,
          // Preserve any sectorId / manualSectorName already assigned by setThemes.
          sectorId: prev?.sectorId ?? null,
          manualSectorName: prev?.manualSectorName ?? null,
          autoSector: s.autoSector ?? null,
        };
      }
      return { catalog: next };
    }),

  setThemes: (themes) =>
    set((state) => {
      const sectorMetas: SectorMeta[] = themes.map((t) => ({
        id: t.id,
        name: t.name,
        tagline: t.description ?? '',
      }));

      // Build ticker → sectorId index; first match wins on overlap.
      const tickerToSector: Record<string, string> = {};
      for (const t of themes) {
        for (const stock of t.stocks) {
          if (tickerToSector[stock.ticker] === undefined) {
            tickerToSector[stock.ticker] = t.id;
          }
        }
      }

      const themeNameById = new Map<string, string>();
      for (const t of themes) themeNameById.set(t.id, t.name);

      const nextCatalog: Record<string, CatalogEntry> = { ...state.catalog };
      for (const ticker of Object.keys(nextCatalog)) {
        const entry = nextCatalog[ticker];
        if (entry === undefined) continue;
        const sectorId = tickerToSector[ticker] ?? null;
        nextCatalog[ticker] = {
          name: entry.name,
          market: entry.market,
          sectorId,
          manualSectorName:
            sectorId !== null ? (themeNameById.get(sectorId) ?? null) : null,
          autoSector: entry.autoSector,
        };
      }

      return { sectors: sectorMetas, catalog: nextCatalog };
    }),

  applySnapshot: (prices) =>
    set(() => {
      const nextQuotes: Record<string, Price> = {};
      for (const p of prices) {
        nextQuotes[p.ticker] = p;
      }
      return { quotes: nextQuotes };
    }),

  applyPriceUpdate: (price) =>
    set((state) => {
      const shouldFlash = isPriceRelevantChange(
        state.quotes[price.ticker],
        price,
      );
      return {
        quotes: { ...state.quotes, [price.ticker]: price },
        ...(shouldFlash
          ? {
              flashSeeds: {
                ...state.flashSeeds,
                [price.ticker]: (state.flashSeeds[price.ticker] ?? 0) + 1,
              },
            }
          : {}),
      };
    }),

  applyPriceUpdates: (prices) =>
    set((state) => {
      if (prices.length === 0) return {};
      const quotes = { ...state.quotes };
      let flashSeeds: Record<string, number> | null = null;
      const updateCounts: Record<string, number> = {};
      for (const price of prices) {
        if (isPriceRelevantChange(quotes[price.ticker], price)) {
          updateCounts[price.ticker] = (updateCounts[price.ticker] ?? 0) + 1;
        }
        quotes[price.ticker] = price;
      }
      for (const [ticker, count] of Object.entries(updateCounts)) {
        flashSeeds ??= { ...state.flashSeeds };
        flashSeeds[ticker] = (flashSeeds[ticker] ?? 0) + count;
      }
      return flashSeeds !== null ? { quotes, flashSeeds } : { quotes };
    }),

  removeStock: (ticker) =>
    set((state) => {
      if (
        state.catalog[ticker] === undefined &&
        state.quotes[ticker] === undefined &&
        state.flashSeeds[ticker] === undefined
      ) {
        return {};
      }
      const { [ticker]: _c, ...catalog } = state.catalog;
      const { [ticker]: _q, ...quotes } = state.quotes;
      const { [ticker]: _f, ...flashSeeds } = state.flashSeeds;
      void _c;
      void _q;
      void _f;
      return { catalog, quotes, flashSeeds };
    }),
}));

// ---------- Adapter ----------

/**
 * Build a `StockViewModel` for the given ticker. Returns `null` if the ticker
 * is not in the catalog (e.g. the user removed it but a tick is still in flight).
 *
 * The price half is optional — when no quote has arrived yet the card renders
 * 0 / 0% / changeAbs=null, which the `StockCard` displays as a neutral '—'.
 */
export function buildStockVM(
  ticker: string,
  catalog: Record<string, CatalogEntry>,
  quotes: Record<string, Price>,
): StockViewModel | null {
  const meta = catalog[ticker];
  if (meta === undefined) return null;
  const q = quotes[ticker];
  return {
    code: ticker,
    name: meta.name,
    market: meta.market,
    price: q?.price ?? 0,
    changePct: q?.changeRate ?? 0,
    changeAbs: q?.changeAbs ?? null,
    volume: q?.volume ?? 0,
    volumeSurgeRatio: q?.volumeSurgeRatio ?? null,
    volumeBaselineStatus:
      q?.volumeBaselineStatus ?? (q !== undefined && q.volume > 0 ? 'collecting' : 'unavailable'),
    updatedAt: q?.updatedAt ?? '',
    isSnapshot: q?.isSnapshot ?? true,
    sectorId: meta.sectorId,
    effectiveSector: getEffectiveSector(meta.manualSectorName, meta.autoSector),
  };
}

function isPriceRelevantChange(previous: Price | undefined, next: Price): boolean {
  if (previous === undefined) return true;
  return (
    previous.price !== next.price ||
    previous.changeRate !== next.changeRate ||
    (previous.changeAbs ?? null) !== (next.changeAbs ?? null)
  );
}
