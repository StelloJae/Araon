import { describe, expect, it, vi } from 'vitest';

import {
  createDataRetentionScheduler,
  NEWS_PRUNE_AFTER_DAYS,
  NEWS_STALE_AFTER_MS,
  SIGNAL_RETENTION_DAYS,
} from '../data-retention.js';

describe('data retention maintenance', () => {
  it('runs candle, signal, and news prune policies with fixed retention values', async () => {
    const now = new Date('2026-05-06T00:00:00.000Z');
    const scheduler = createDataRetentionScheduler({
      candleRepo: { pruneOldCandles: vi.fn(() => 2) },
      signalEventRepo: { pruneOldSignalEvents: vi.fn(() => 3) },
      newsRepo: { pruneOldNewsItems: vi.fn(() => 4) },
      now: () => now,
    });

    const result = await scheduler.runOnce();

    expect(result).toEqual({
      candlePruned: 2,
      signalPruned: 3,
      newsPruned: 4,
      error: null,
    });
    expect(scheduler.snapshot()).toEqual({
      lastRunAt: '2026-05-06T00:00:00.000Z',
      candlePruneLastRunAt: '2026-05-06T00:00:00.000Z',
      candlePruneLastError: null,
    });
    expect(SIGNAL_RETENTION_DAYS).toBe(90);
    expect(NEWS_STALE_AFTER_MS).toBe(24 * 60 * 60_000);
    expect(NEWS_PRUNE_AFTER_DAYS).toBe(7);
  });

  it('records sanitized prune errors without crashing callers', async () => {
    const scheduler = createDataRetentionScheduler({
      candleRepo: {
        pruneOldCandles: vi.fn(() => {
          throw new Error('database locked: raw-secret-like-material-should-not-be-preserved');
        }),
      },
      signalEventRepo: { pruneOldSignalEvents: vi.fn(() => 0) },
      newsRepo: { pruneOldNewsItems: vi.fn(() => 0) },
      now: () => new Date('2026-05-06T00:00:00.000Z'),
    });

    const result = await scheduler.runOnce();

    expect(result.error).toBe('database locked');
    expect(scheduler.snapshot().candlePruneLastError).toBe('database locked');
  });
});
