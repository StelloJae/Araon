/**
 * Surge view aggregator — builds the row list for SurgeBlock.
 *
 * The block has three filter modes; the meaning of each is fixed:
 *
 *   - 'live'  — only `useSurgeStore.feed` entries spawned by real `price-update`
 *               events, AND only while `marketStatus === 'open'`. Closed /
 *               snapshot / pre-open sessions return an empty list under this
 *               filter so we never imply a real-time event in a quiet market.
 *
 *   - 'today' — every stock in the catalog whose `changePct >= threshold`.
 *               Works in any market status. This is what users want to see
 *               after the close: today's strong tickers as of the latest
 *               snapshot.
 *
 *   - 'all'   — live items first (within the active window), then today's
 *               cumulative items, deduped by ticker so the same stock never
 *               appears twice.
 *
 * Synthetic data: none. We only forward fields that exist on the real
 * `StockViewModel` and `SurgeEntry`. Volume multipliers are shown only when a
 * same-session/time-bucket baseline exists; otherwise the UI can say the
 * baseline is still being collected.
 */

import type { MarketStatus } from '@shared/types';
import type { SurgeEntry } from '../stores/surge-store';
import { SURGE_TOTAL_MS } from '../stores/surge-store';
import type { SurgeFilter } from '../stores/settings-store';
import { isMarketLive } from './market-status';
import type { StockViewModel } from './view-models';

export interface SurgeViewItem {
  code: string;
  name: string;
  price: number;
  /** Signed % change. Live entries use the spawn-time `surgePct` (≥ threshold). */
  changePct: number;
  /** Raw share volume from the latest quote. `null` when no quote exists yet. */
  volume: number | null;
  volumeSurgeRatio?: number | null;
  volumeBaselineStatus?: 'collecting' | 'ready' | 'unavailable';
  /** Spawn timestamp (ms epoch) for live items. `null` for today-only items. */
  ts: number | null;
  isLive: boolean;
}

export function aggregateSurgeView(
  feed: ReadonlyArray<SurgeEntry>,
  allStocks: ReadonlyArray<StockViewModel>,
  filter: SurgeFilter,
  marketStatus: MarketStatus,
  threshold: number,
  now: number,
  maxRows: number,
): SurgeViewItem[] {
  const liveItems: SurgeViewItem[] = [];
  if (isMarketLive(marketStatus)) {
    const stockByCode = new Map<string, StockViewModel>();
    for (const s of allStocks) stockByCode.set(s.code, s);
    for (const e of feed) {
      if (now - e.ts >= SURGE_TOTAL_MS) continue;
      const stock = stockByCode.get(e.code);
      liveItems.push({
        code: e.code,
        name: e.name,
        price: e.price,
        changePct: e.surgePct,
        volume: stock?.volume ?? null,
        volumeSurgeRatio: stock?.volumeSurgeRatio ?? null,
        volumeBaselineStatus: stock?.volumeBaselineStatus ?? 'unavailable',
        ts: e.ts,
        isLive: true,
      });
    }
  }

  const todayItems: SurgeViewItem[] = [];
  for (const s of allStocks) {
    if (s.changePct >= threshold) {
      todayItems.push({
        code: s.code,
        name: s.name,
        price: s.price,
        changePct: s.changePct,
        volume: s.volume,
        volumeSurgeRatio: s.volumeSurgeRatio ?? null,
        volumeBaselineStatus: s.volumeBaselineStatus ?? 'unavailable',
        ts: null,
        isLive: false,
      });
    }
  }
  todayItems.sort((a, b) => b.changePct - a.changePct);

  if (filter === 'live') {
    return liveItems.slice(0, maxRows);
  }
  if (filter === 'today') {
    return todayItems.slice(0, maxRows);
  }

  const liveCodes = new Set(liveItems.map((it) => it.code));
  const merged = [
    ...liveItems,
    ...todayItems.filter((it) => !liveCodes.has(it.code)),
  ];
  return merged.slice(0, maxRows);
}
