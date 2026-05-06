import { describe, expect, it } from 'vitest';
import type { PriceCandle } from '@shared/types.js';
import {
  earliestExpectedKisDailyBucketAt,
  latestExpectedKisDailyBucketAt,
  shouldBackfillDailyTicker,
} from '../daily-backfill-coverage.js';

function repo(bounds: { newest: string | null; oldest?: string | null }) {
  return {
    findNewestCandle: (): PriceCandle | null =>
      bounds.newest === null
        ? null
        : candle(bounds.newest),
    findOldestCandle: (): PriceCandle | null => {
      const oldest = bounds.oldest ?? bounds.newest;
      return oldest === null ? null : candle(oldest);
    },
  };
}

function candle(bucketAt: string): PriceCandle {
  return {
    ticker: '005930',
    interval: '1d',
    bucketAt,
    session: 'regular',
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: 1,
    sampleCount: 1,
    source: 'kis-daily',
    isPartial: false,
    createdAt: bucketAt,
    updatedAt: bucketAt,
  };
}

describe('daily backfill coverage helper', () => {
  it('targets the current KST trading date after the 20:05 backfill window opens', () => {
    expect(latestExpectedKisDailyBucketAt(new Date('2026-05-06T11:05:00.000Z'))).toBe(
      '2026-05-05T15:00:00.000Z',
    );
  });

  it('targets the previous KST trading date before the 20:05 window', () => {
    expect(latestExpectedKisDailyBucketAt(new Date('2026-05-06T21:30:00.000Z'))).toBe(
      '2026-05-05T15:00:00.000Z',
    );
  });

  it('walks weekend dates back to Friday', () => {
    expect(latestExpectedKisDailyBucketAt(new Date('2026-05-10T03:00:00.000Z'))).toBe(
      '2026-05-07T15:00:00.000Z',
    );
  });

  it('computes the earliest bucket needed for the requested range', () => {
    expect(
      earliestExpectedKisDailyBucketAt(new Date('2026-05-06T11:05:00.000Z'), '3m'),
    ).toBe('2026-02-01T15:00:00.000Z');
  });

  it('skips tickers already covered through the expected daily bucket and requested range', () => {
    expect(
      shouldBackfillDailyTicker({
        ticker: '005930',
        range: '3m',
        now: new Date('2026-05-06T11:05:00.000Z'),
        repo: repo({
          newest: '2026-05-05T15:00:00.000Z',
          oldest: '2026-02-01T15:00:00.000Z',
        }),
      }),
    ).toBe(false);
  });

  it('requests tickers that only have the latest daily candle but lack older range coverage', () => {
    expect(
      shouldBackfillDailyTicker({
        ticker: '005930',
        range: '3m',
        now: new Date('2026-05-06T11:05:00.000Z'),
        repo: repo({
          newest: '2026-05-05T15:00:00.000Z',
          oldest: '2026-05-05T15:00:00.000Z',
        }),
      }),
    ).toBe(true);
  });

  it('requests tickers with missing or stale daily coverage', () => {
    expect(
      shouldBackfillDailyTicker({
        ticker: '005930',
        range: '3m',
        now: new Date('2026-05-06T11:05:00.000Z'),
        repo: repo({ newest: null }),
      }),
    ).toBe(true);
    expect(
      shouldBackfillDailyTicker({
        ticker: '005930',
        range: '3m',
        now: new Date('2026-05-06T11:05:00.000Z'),
        repo: repo({
          newest: '2026-05-04T15:00:00.000Z',
          oldest: '2026-02-01T15:00:00.000Z',
        }),
      }),
    ).toBe(true);
  });
});
