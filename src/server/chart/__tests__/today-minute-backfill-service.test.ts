import { describe, expect, it, vi } from 'vitest';
import type { PriceCandle } from '@shared/types.js';
import { createTodayMinuteBackfillService } from '../today-minute-backfill-service';

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
    source: 'kis-time-today',
    isPartial: false,
    createdAt: bucketAt,
    updatedAt: bucketAt,
  };
}

describe('today minute backfill service', () => {
  it('fetches selected ticker minute pages, dedupes, and batch upserts', async () => {
    const fetchMinuteCandles = vi
      .fn()
      .mockResolvedValueOnce([
        candle('2026-05-06T06:29:00.000Z', 70_100),
        candle('2026-05-06T06:30:00.000Z', 70_200),
      ])
      .mockResolvedValueOnce([
        candle('2026-05-06T06:28:00.000Z', 70_000),
        candle('2026-05-06T06:29:00.000Z', 70_100),
      ]);
    const bulkUpsertCandles = vi.fn(async () => undefined);
    const countExistingCandles = vi.fn(() => 1);
    const service = createTodayMinuteBackfillService({
      repo: { bulkUpsertCandles, countExistingCandles },
      fetchMinuteCandles,
    });

    const result = await service.backfillTodayMinuteCandles({
      ticker: '005930',
      now: new Date('2026-05-06T11:10:00.000Z'),
      maxPages: 2,
    });

    expect(fetchMinuteCandles).toHaveBeenNthCalledWith(1, {
      ticker: '005930',
      toHms: '201000',
      now: new Date('2026-05-06T11:10:00.000Z'),
    });
    expect(fetchMinuteCandles).toHaveBeenNthCalledWith(2, {
      ticker: '005930',
      toHms: '152800',
      now: new Date('2026-05-06T11:10:00.000Z'),
    });
    expect(bulkUpsertCandles).toHaveBeenCalledWith([
      expect.objectContaining({ bucketAt: '2026-05-06T06:28:00.000Z' }),
      expect.objectContaining({ bucketAt: '2026-05-06T06:29:00.000Z' }),
      expect.objectContaining({ bucketAt: '2026-05-06T06:30:00.000Z' }),
    ]);
    expect(result).toMatchObject({
      requested: 3,
      inserted: 2,
      updated: 1,
      source: 'kis-time-today',
      pages: 2,
      coverage: { backfilled: true, localOnly: false },
    });
  });

  it('keeps today-minute backfill scoped to the current KST trading day', async () => {
    const fetchMinuteCandles = vi
      .fn()
      .mockResolvedValueOnce([
        candle('2026-05-06T06:04:00.000Z', 69_900),
        candle('2026-05-07T00:58:00.000Z', 70_100),
        candle('2026-05-07T00:59:00.000Z', 70_200),
      ])
      .mockResolvedValueOnce([]);
    const bulkUpsertCandles = vi.fn(async () => undefined);
    const countExistingCandles = vi.fn(() => 0);
    const service = createTodayMinuteBackfillService({
      repo: { bulkUpsertCandles, countExistingCandles },
      fetchMinuteCandles,
    });

    const result = await service.backfillTodayMinuteCandles({
      ticker: '005930',
      now: new Date('2026-05-07T01:03:00.000Z'),
      maxPages: 2,
    });

    expect(fetchMinuteCandles).toHaveBeenNthCalledWith(2, {
      ticker: '005930',
      toHms: '095700',
      now: new Date('2026-05-07T01:03:00.000Z'),
    });
    expect(bulkUpsertCandles).toHaveBeenCalledWith([
      expect.objectContaining({ bucketAt: '2026-05-07T00:58:00.000Z' }),
      expect.objectContaining({ bucketAt: '2026-05-07T00:59:00.000Z' }),
    ]);
    expect(result).toMatchObject({
      requested: 2,
      inserted: 2,
      updated: 0,
    });
  });
});
