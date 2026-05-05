import { describe, expect, it, vi } from 'vitest';
import type { PriceCandle } from '@shared/types.js';
import { createDailyBackfillService } from '../daily-backfill-service.js';

function candle(ticker: string, ymd: string): PriceCandle {
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(4, 6)) - 1;
  const day = Number(ymd.slice(6, 8));
  const bucketAt = new Date(Date.UTC(year, month, day, 0, 0, 0, 0)).toISOString();
  return {
    ticker,
    interval: '1d',
    bucketAt,
    session: 'regular',
    open: 100,
    high: 110,
    low: 95,
    close: 105,
    volume: 1_000,
    sampleCount: 1,
    source: 'kis-daily',
    isPartial: false,
    createdAt: bucketAt,
    updatedAt: bucketAt,
  };
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const from = new Date(`${fromYmd.slice(0, 4)}-${fromYmd.slice(4, 6)}-${fromYmd.slice(6, 8)}T00:00:00.000Z`);
  const to = new Date(`${toYmd.slice(0, 4)}-${toYmd.slice(4, 6)}-${toYmd.slice(6, 8)}T00:00:00.000Z`);
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

describe('createDailyBackfillService', () => {
  it('splits 1y daily backfill into <=100-day windows and de-duplicates candles', async () => {
    const repo = {
      countExistingCandles: vi.fn(() => 1),
      bulkUpsertCandles: vi.fn(async () => undefined),
    };
    const fetchDailyCandles = vi.fn(async (input: {
      ticker: string;
      fromYmd: string;
      toYmd: string;
      now: Date;
    }) => [
      candle(input.ticker, input.fromYmd),
      candle(input.ticker, '20260101'),
      candle(input.ticker, input.toYmd),
    ]);
    const service = createDailyBackfillService({ repo, fetchDailyCandles });

    const result = await service.backfillDailyCandles({
      ticker: '005930',
      range: '1y',
      now: new Date('2026-05-05T12:00:00.000Z'),
    });

    expect(fetchDailyCandles.mock.calls.length).toBeGreaterThan(1);
    for (const [input] of fetchDailyCandles.mock.calls) {
      expect(daysBetween(input.fromYmd, input.toYmd)).toBeLessThanOrEqual(100);
    }

    const upserted = repo.bulkUpsertCandles.mock.calls[0]?.[0] ?? [];
    expect(new Set(upserted.map((c) => c.bucketAt)).size).toBe(upserted.length);
    expect(result.requested).toBe(upserted.length);
    expect(result.inserted).toBe(upserted.length - 1);
    expect(result.coverage).toEqual({ backfilled: true, localOnly: false });
  });
});
