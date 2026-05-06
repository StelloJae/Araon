import type { PriceCandle } from '@shared/types.js';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DailyCandleCoverageReader {
  findNewestCandle(query: {
    ticker: string;
    interval: '1d';
    source: 'kis-daily';
  }): PriceCandle | null;
  findOldestCandle(query: {
    ticker: string;
    interval: '1d';
    source: 'kis-daily';
  }): PriceCandle | null;
}

export type DailyBackfillCoverageRange = '1m' | '3m' | '6m' | '1y';

export function shouldBackfillDailyTicker(input: {
  ticker: string;
  range: DailyBackfillCoverageRange;
  now: Date;
  repo: DailyCandleCoverageReader;
}): boolean {
  const newest = input.repo.findNewestCandle({
    ticker: input.ticker,
    interval: '1d',
    source: 'kis-daily',
  });
  if (newest === null) return true;
  if (newest.bucketAt < latestExpectedKisDailyBucketAt(input.now)) return true;

  const oldest = input.repo.findOldestCandle({
    ticker: input.ticker,
    interval: '1d',
    source: 'kis-daily',
  });
  if (oldest === null) return true;
  return oldest.bucketAt > earliestExpectedKisDailyBucketAt(input.now, input.range);
}

export function latestExpectedKisDailyBucketAt(now: Date): string {
  const target = latestExpectedKstTradingDate(now);
  const utcMs = Date.UTC(target.year, target.month - 1, target.day, 0, 0, 0, 0) - KST_OFFSET_MS;
  return new Date(utcMs).toISOString();
}

export function earliestExpectedKisDailyBucketAt(
  now: Date,
  range: DailyBackfillCoverageRange,
): string {
  const latest = new Date(latestExpectedKisDailyBucketAt(now));
  return new Date(latest.getTime() - rangeDays(range) * DAY_MS).toISOString();
}

function rangeDays(range: DailyBackfillCoverageRange): number {
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

function latestExpectedKstTradingDate(now: Date): { year: number; month: number; day: number } {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  let year = shifted.getUTCFullYear();
  let month = shifted.getUTCMonth() + 1;
  let day = shifted.getUTCDate();
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();

  if (hour < 20 || (hour === 20 && minute < 5)) {
    ({ year, month, day } = previousKstDate(year, month, day));
  }

  while (isWeekendKst(year, month, day)) {
    ({ year, month, day } = previousKstDate(year, month, day));
  }

  return { year, month, day };
}

function previousKstDate(
  year: number,
  month: number,
  day: number,
): { year: number; month: number; day: number } {
  const utcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - DAY_MS;
  const date = new Date(utcMs);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function isWeekendKst(year: number, month: number, day: number): boolean {
  const dow = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)).getUTCDay();
  return dow === 0 || dow === 6;
}
