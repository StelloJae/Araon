import { describe, expect, it } from 'vitest';
import type { PriceCandle } from '@shared/types.js';
import {
  latestExpectedKisDailyBucketAt,
  shouldBackfillDailyTicker,
} from '../daily-backfill-coverage.js';

function repo(bucketAt: string | null) {
  return {
    findNewestCandle: (): PriceCandle | null =>
      bucketAt === null
        ? null
        : {
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
          },
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

  it('skips tickers already covered through the expected daily bucket', () => {
    expect(
      shouldBackfillDailyTicker({
        ticker: '005930',
        now: new Date('2026-05-06T11:05:00.000Z'),
        repo: repo('2026-05-05T15:00:00.000Z'),
      }),
    ).toBe(false);
  });

  it('requests tickers with missing or stale daily coverage', () => {
    expect(
      shouldBackfillDailyTicker({
        ticker: '005930',
        now: new Date('2026-05-06T11:05:00.000Z'),
        repo: repo(null),
      }),
    ).toBe(true);
    expect(
      shouldBackfillDailyTicker({
        ticker: '005930',
        now: new Date('2026-05-06T11:05:00.000Z'),
        repo: repo('2026-05-04T15:00:00.000Z'),
      }),
    ).toBe(true);
  });
});
