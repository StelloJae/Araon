import { describe, expect, it, vi } from 'vitest';
import type { PriceCandle } from '@shared/types.js';
import { createHistoricalMinuteBackfillService } from '../historical-minute-backfill-service';

function candle(bucketAt: string, close = 70_000): PriceCandle {
  return {
    ticker: '005930',
    interval: '1m',
    bucketAt,
    session: 'regular',
    open: close,
    high: close,
    low: close,
    close,
    volume: 10,
    sampleCount: 1,
    source: 'kis-time-daily',
    isPartial: false,
    createdAt: bucketAt,
    updatedAt: bucketAt,
  };
}

describe('historical minute backfill service', () => {
  it('fetches selected ticker daily-minute pages for the requested KST window', async () => {
    const fetchMinuteCandles = vi
      .fn()
      .mockResolvedValueOnce([
        candle('2026-05-04T10:58:00.000Z', 70_100),
        candle('2026-05-04T10:59:00.000Z', 70_200),
      ])
      .mockResolvedValueOnce([
        candle('2026-05-04T09:58:00.000Z', 70_000),
        candle('2026-05-04T10:58:00.000Z', 70_100),
      ]);
    const bulkUpsertCandles = vi.fn(async () => undefined);
    const countExistingCandles = vi.fn(() => 1);
    const service = createHistoricalMinuteBackfillService({
      repo: { bulkUpsertCandles, countExistingCandles },
      fetchMinuteCandles,
      requestGapMs: 0,
    });

    const result = await service.backfillHistoricalMinuteCandles({
      ticker: '005930',
      from: '2026-05-04T09:55:00.000Z',
      to: '2026-05-04T11:00:00.000Z',
      now: new Date('2026-05-06T12:10:00.000Z'),
      maxPagesPerDay: 2,
    });

    expect(fetchMinuteCandles).toHaveBeenNthCalledWith(1, {
      ticker: '005930',
      dateYmd: '20260504',
      toHms: '200000',
      now: new Date('2026-05-06T12:10:00.000Z'),
    });
    expect(fetchMinuteCandles).toHaveBeenNthCalledWith(2, {
      ticker: '005930',
      dateYmd: '20260504',
      toHms: '195700',
      now: new Date('2026-05-06T12:10:00.000Z'),
    });
    expect(bulkUpsertCandles).toHaveBeenCalledWith([
      expect.objectContaining({ bucketAt: '2026-05-04T09:58:00.000Z' }),
      expect.objectContaining({ bucketAt: '2026-05-04T10:58:00.000Z' }),
      expect.objectContaining({ bucketAt: '2026-05-04T10:59:00.000Z' }),
    ]);
    expect(result).toMatchObject({
      ticker: '005930',
      requested: 3,
      inserted: 2,
      updated: 1,
      source: 'kis-time-daily',
      pages: 2,
      tradingDays: 1,
      coverage: { backfilled: true, localOnly: false },
    });
  });

  it('skips weekends and refuses non-selected ticker input', async () => {
    const fetchMinuteCandles = vi.fn();
    const service = createHistoricalMinuteBackfillService({
      repo: {
        bulkUpsertCandles: vi.fn(async () => undefined),
        countExistingCandles: vi.fn(() => 0),
      },
      fetchMinuteCandles,
      requestGapMs: 0,
    });

    await expect(
      service.backfillHistoricalMinuteCandles({
        ticker: '005930,000660',
        from: '2026-05-02T00:00:00.000Z',
        to: '2026-05-03T11:00:00.000Z',
        now: new Date('2026-05-06T12:10:00.000Z'),
      }),
    ).rejects.toThrow('selected ticker');
    expect(fetchMinuteCandles).not.toHaveBeenCalled();
  });
});
