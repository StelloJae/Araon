import type { PriceCandle } from '@shared/types.js';
import type { PriceCandleRepository } from '../db/repositories.js';

export type DailyBackfillRange = '1m' | '3m' | '6m' | '1y';

export interface DailyBackfillResult {
  ticker: string;
  requested: number;
  inserted: number;
  updated: number;
  from: string | null;
  to: string | null;
  source: 'kis-daily';
  coverage: {
    backfilled: boolean;
    localOnly: boolean;
  };
}

export interface DailyBackfillService {
  backfillDailyCandles(input: {
    ticker: string;
    range: DailyBackfillRange;
    now: Date;
  }): Promise<DailyBackfillResult>;
}

export interface CreateDailyBackfillServiceOptions {
  repo: Pick<PriceCandleRepository, 'bulkUpsertCandles' | 'countExistingCandles'>;
  fetchDailyCandles: (input: {
    ticker: string;
    fromYmd: string;
    toYmd: string;
    now: Date;
  }) => Promise<PriceCandle[]>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS_PER_DAILY_REQUEST = 100;

function rangeDays(range: DailyBackfillRange): number {
  switch (range) {
    case '1m':
      return 31;
    case '3m':
      return 93;
    case '6m':
      return 186;
    case '1y':
      return 366;
  }
}

function ymd(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function splitDailyWindows(from: Date, to: Date): Array<{ from: Date; to: Date }> {
  const windows: Array<{ from: Date; to: Date }> = [];
  let cursor = from;
  while (cursor.getTime() <= to.getTime()) {
    const end = new Date(Math.min(addDays(cursor, MAX_DAYS_PER_DAILY_REQUEST - 1).getTime(), to.getTime()));
    windows.push({ from: cursor, to: end });
    cursor = addDays(end, 1);
  }
  return windows;
}

function dedupeCandles(candles: readonly PriceCandle[]): PriceCandle[] {
  const byKey = new Map<string, PriceCandle>();
  for (const candle of candles) {
    byKey.set(`${candle.ticker}:${candle.interval}:${candle.bucketAt}`, candle);
  }
  return Array.from(byKey.values()).sort((a, b) => a.bucketAt.localeCompare(b.bucketAt));
}

export function createDailyBackfillService(
  options: CreateDailyBackfillServiceOptions,
): DailyBackfillService {
  async function backfillDailyCandles(input: {
    ticker: string;
    range: DailyBackfillRange;
    now: Date;
  }): Promise<DailyBackfillResult> {
    const to = input.now;
    const from = new Date(to.getTime() - rangeDays(input.range) * DAY_MS);
    const fetched = [];
    for (const window of splitDailyWindows(from, to)) {
      fetched.push(
        ...(await options.fetchDailyCandles({
          ticker: input.ticker,
          fromYmd: ymd(window.from),
          toYmd: ymd(window.to),
          now: input.now,
        })),
      );
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
      source: 'kis-daily',
      coverage: {
        backfilled: candles.length > 0,
        localOnly: candles.length === 0,
      },
    };
  }

  return { backfillDailyCandles };
}
