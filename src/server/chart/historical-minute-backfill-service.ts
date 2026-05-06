import type { PriceCandle } from '@shared/types.js';
import type { PriceCandleRepository } from '../db/repositories.js';

export interface HistoricalMinuteBackfillResult {
  ticker: string;
  requested: number;
  inserted: number;
  updated: number;
  from: string | null;
  to: string | null;
  source: 'kis-time-daily';
  pages: number;
  tradingDays: number;
  coverage: {
    backfilled: boolean;
    localOnly: boolean;
  };
}

export interface HistoricalMinuteBackfillService {
  backfillHistoricalMinuteCandles(input: {
    ticker: string;
    from: string;
    to: string;
    now: Date;
    maxPagesPerDay?: number;
  }): Promise<HistoricalMinuteBackfillResult>;
}

export interface CreateHistoricalMinuteBackfillServiceOptions {
  repo: Pick<PriceCandleRepository, 'bulkUpsertCandles' | 'countExistingCandles'>;
  fetchMinuteCandles: (input: {
    ticker: string;
    dateYmd: string;
    toHms: string;
    now: Date;
  }) => Promise<PriceCandle[]>;
  requestGapMs?: number;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DEFAULT_MAX_PAGES_PER_DAY = 8;
const MAX_PAGES_PER_DAY = 12;

export function createHistoricalMinuteBackfillService(
  options: CreateHistoricalMinuteBackfillServiceOptions,
): HistoricalMinuteBackfillService {
  const requestGapMs = options.requestGapMs ?? 0;

  async function backfillHistoricalMinuteCandles(input: {
    ticker: string;
    from: string;
    to: string;
    now: Date;
    maxPagesPerDay?: number;
  }): Promise<HistoricalMinuteBackfillResult> {
    if (!/^\d{6}$/.test(input.ticker)) {
      throw new Error('historical minute backfill requires a selected ticker');
    }

    const fromDate = new Date(input.from);
    const toDate = new Date(input.to);
    if (
      Number.isNaN(fromDate.getTime()) ||
      Number.isNaN(toDate.getTime()) ||
      fromDate.getTime() > toDate.getTime()
    ) {
      throw new Error('invalid historical minute backfill window');
    }

    const maxPagesPerDay = Math.max(
      1,
      Math.min(input.maxPagesPerDay ?? DEFAULT_MAX_PAGES_PER_DAY, MAX_PAGES_PER_DAY),
    );
    const fetched: PriceCandle[] = [];
    let pages = 0;
    const dates = kstTradingDatesBetween(fromDate, toDate);

    for (const dateYmd of dates) {
      let cursor = endHmsForDate(dateYmd, toDate);
      for (let page = 0; page < maxPagesPerDay; page += 1) {
        const candles = await options.fetchMinuteCandles({
          ticker: input.ticker,
          dateYmd,
          toHms: cursor,
          now: input.now,
        });
        pages += 1;
        if (candles.length === 0) break;

        const inWindow = candles.filter(
          (candle) =>
            candle.bucketAt >= input.from &&
            candle.bucketAt <= input.to &&
            kstYmd(new Date(candle.bucketAt)) === dateYmd,
        );
        fetched.push(...inWindow);

        const sameDate = candles.filter((candle) => kstYmd(new Date(candle.bucketAt)) === dateYmd);
        const earliest = sameDate[0];
        if (earliest === undefined || earliest.bucketAt <= input.from) break;
        const nextCursor = previousKstMinuteHms(earliest.bucketAt);
        if (nextCursor === null || nextCursor === cursor) break;
        cursor = nextCursor;
        if (requestGapMs > 0) await sleep(requestGapMs);
      }
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
      source: 'kis-time-daily',
      pages,
      tradingDays: dates.length,
      coverage: {
        backfilled: candles.length > 0,
        localOnly: candles.length === 0,
      },
    };
  }

  return { backfillHistoricalMinuteCandles };
}

function dedupeCandles(candles: readonly PriceCandle[]): PriceCandle[] {
  const byKey = new Map<string, PriceCandle>();
  for (const candle of candles) {
    byKey.set(`${candle.ticker}:${candle.interval}:${candle.bucketAt}`, candle);
  }
  return Array.from(byKey.values()).sort((a, b) => a.bucketAt.localeCompare(b.bucketAt));
}

function kstTradingDatesBetween(from: Date, to: Date): string[] {
  const start = kstStartOfDay(from);
  const end = kstStartOfDay(to);
  const dates: string[] = [];
  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = new Date(cursor.getTime() + DAY_MS)) {
    const ymd = kstYmd(cursor);
    if (!isWeekendKst(cursor)) dates.push(ymd);
  }
  return dates.reverse();
}

function kstStartOfDay(date: Date): Date {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  const utcMs =
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
      0,
      0,
      0,
      0,
    ) - KST_OFFSET_MS;
  return new Date(utcMs);
}

function kstYmd(date: Date): string {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, '0'),
    String(shifted.getUTCDate()).padStart(2, '0'),
  ].join('');
}

function isWeekendKst(date: Date): boolean {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  const day = shifted.getUTCDay();
  return day === 0 || day === 6;
}

function endHmsForDate(dateYmd: string, to: Date): string {
  if (kstYmd(to) !== dateYmd) return '200000';
  const shifted = new Date(to.getTime() + KST_OFFSET_MS);
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  const capped = Math.min(minutes, 20 * 60);
  return [
    String(Math.floor(capped / 60)).padStart(2, '0'),
    String(capped % 60).padStart(2, '0'),
    '00',
  ].join('');
}

function previousKstMinuteHms(bucketAt: string): string | null {
  const date = new Date(bucketAt);
  if (Number.isNaN(date.getTime())) return null;
  const shifted = new Date(date.getTime() + KST_OFFSET_MS - MINUTE_MS);
  return [
    String(shifted.getUTCHours()).padStart(2, '0'),
    String(shifted.getUTCMinutes()).padStart(2, '0'),
    String(shifted.getUTCSeconds()).padStart(2, '0'),
  ].join('');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
