import type { PriceCandle } from '@shared/types.js';
import type { PriceCandleRepository } from '../db/repositories.js';

export interface TodayMinuteBackfillResult {
  ticker: string;
  requested: number;
  inserted: number;
  updated: number;
  from: string | null;
  to: string | null;
  source: 'kis-time-today';
  pages: number;
  coverage: {
    backfilled: boolean;
    localOnly: boolean;
  };
}

export interface TodayMinuteBackfillService {
  backfillTodayMinuteCandles(input: {
    ticker: string;
    now: Date;
    maxPages?: number;
  }): Promise<TodayMinuteBackfillResult>;
}

export interface CreateTodayMinuteBackfillServiceOptions {
  repo: Pick<PriceCandleRepository, 'bulkUpsertCandles' | 'countExistingCandles'>;
  fetchMinuteCandles: (input: {
    ticker: string;
    toHms: string;
    now: Date;
  }) => Promise<PriceCandle[]>;
}

const DEFAULT_MAX_PAGES = 4;
const MAX_PAGES = 4;
const MINUTE_MS = 60_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function createTodayMinuteBackfillService(
  options: CreateTodayMinuteBackfillServiceOptions,
): TodayMinuteBackfillService {
  async function backfillTodayMinuteCandles(input: {
    ticker: string;
    now: Date;
    maxPages?: number;
  }): Promise<TodayMinuteBackfillResult> {
    const maxPages = Math.max(1, Math.min(input.maxPages ?? DEFAULT_MAX_PAGES, MAX_PAGES));
    const fetched: PriceCandle[] = [];
    let cursor = kstHms(input.now);
    let pages = 0;

    for (let page = 0; page < maxPages; page += 1) {
      const candles = await options.fetchMinuteCandles({
        ticker: input.ticker,
        toHms: cursor,
        now: input.now,
      });
      pages += 1;
      if (candles.length === 0) break;
      fetched.push(...candles);
      const earliest = candles[0]!;
      const nextCursor = previousKstMinuteHms(earliest.bucketAt);
      if (nextCursor === null || nextCursor === cursor) break;
      cursor = nextCursor;
    }

    const candles = dedupeCandles(fetched);
    const existing = options.repo.countExistingCandles(candles);
    await options.repo.bulkUpsertCandles(candles);

    const first = candles[0];
    const last = candles[candles.length - 1];
    return {
      ticker: input.ticker,
      requested: candles.length,
      inserted: Math.max(0, candles.length - existing),
      updated: existing,
      from: first?.bucketAt ?? null,
      to: last?.bucketAt ?? null,
      source: 'kis-time-today',
      pages,
      coverage: {
        backfilled: candles.length > 0,
        localOnly: candles.length === 0,
      },
    };
  }

  return { backfillTodayMinuteCandles };
}

function dedupeCandles(candles: readonly PriceCandle[]): PriceCandle[] {
  const byKey = new Map<string, PriceCandle>();
  for (const candle of candles) {
    byKey.set(`${candle.ticker}:${candle.interval}:${candle.bucketAt}`, candle);
  }
  return Array.from(byKey.values()).sort((a, b) => a.bucketAt.localeCompare(b.bucketAt));
}

function kstHms(date: Date): string {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return [
    String(shifted.getUTCHours()).padStart(2, '0'),
    String(shifted.getUTCMinutes()).padStart(2, '0'),
    String(shifted.getUTCSeconds()).padStart(2, '0'),
  ].join('');
}

function previousKstMinuteHms(bucketAt: string): string | null {
  const date = new Date(bucketAt);
  if (Number.isNaN(date.getTime())) return null;
  return kstHms(new Date(date.getTime() - MINUTE_MS));
}
