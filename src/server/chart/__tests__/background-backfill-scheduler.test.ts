import { describe, expect, it, vi } from 'vitest';
import type { Favorite, Stock } from '@shared/types.js';
import { DEFAULT_SETTINGS, type Settings } from '../../settings-store.js';
import { createBackgroundDailyBackfillScheduler } from '../background-backfill-scheduler.js';

function settings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    backgroundDailyBackfillEnabled: false,
    backgroundDailyBackfillRange: '3m',
    ...overrides,
  };
}

function stock(ticker: string): Stock {
  return { ticker, name: ticker, market: 'KOSPI' };
}

function favorite(ticker: string, addedAt = '2026-05-01T00:00:00.000Z'): Favorite {
  return { ticker, tier: 'realtime', addedAt };
}

describe('createBackgroundDailyBackfillScheduler', () => {
  it('does not call KIS backfill when the server setting is disabled', async () => {
    const backfillDailyCandles = vi.fn();
    const scheduler = createBackgroundDailyBackfillScheduler({
      settingsStore: { snapshot: () => settings() },
      stockRepo: { findAll: () => [stock('005930')] },
      favoriteRepo: { findAll: () => [favorite('005930')] },
      dailyBackfillService: { backfillDailyCandles },
      marketPhase: () => 'closed',
      now: () => new Date('2026-05-05T11:05:00.000Z'),
    });

    await expect(scheduler.runOnce()).resolves.toMatchObject({
      attempted: 0,
      skippedReason: 'disabled',
    });
    expect(backfillDailyCandles).not.toHaveBeenCalled();
  });

  it('does not call KIS backfill during market hours even when enabled', async () => {
    const backfillDailyCandles = vi.fn();
    const scheduler = createBackgroundDailyBackfillScheduler({
      settingsStore: {
        snapshot: () => settings({ backgroundDailyBackfillEnabled: true }),
      },
      stockRepo: { findAll: () => [stock('005930')] },
      favoriteRepo: { findAll: () => [favorite('005930')] },
      dailyBackfillService: { backfillDailyCandles },
      marketPhase: () => 'open',
      now: () => new Date('2026-05-05T06:00:00.000Z'),
    });

    await expect(scheduler.runOnce()).resolves.toMatchObject({
      attempted: 0,
      skippedReason: 'market_not_allowed',
    });
    expect(backfillDailyCandles).not.toHaveBeenCalled();
  });

  it('runs low-priority daily backfill for favorites first after close', async () => {
    const backfillDailyCandles = vi.fn(async (input: { ticker: string }) => ({
      ticker: input.ticker,
      requested: 1,
      inserted: 1,
      updated: 0,
      from: '2026-05-01T15:00:00.000Z',
      to: '2026-05-01T15:00:00.000Z',
      source: 'kis-daily' as const,
      coverage: { backfilled: true, localOnly: false },
    }));
    const scheduler = createBackgroundDailyBackfillScheduler({
      settingsStore: {
        snapshot: () =>
          settings({
            backgroundDailyBackfillEnabled: true,
            backgroundDailyBackfillRange: '6m',
          }),
      },
      stockRepo: {
        findAll: () => [stock('005930'), stock('000660'), stock('042700')],
      },
      favoriteRepo: {
        findAll: () => [
          favorite('000660', '2026-05-01T00:00:00.000Z'),
          favorite('005930', '2026-05-02T00:00:00.000Z'),
        ],
      },
      dailyBackfillService: { backfillDailyCandles },
      marketPhase: () => 'closed',
      now: () => new Date('2026-05-05T11:05:00.000Z'),
      maxTickersPerRun: 2,
    });

    await expect(scheduler.runOnce()).resolves.toMatchObject({
      attempted: 2,
      succeeded: 2,
      failed: 0,
      skippedReason: null,
    });
    expect(backfillDailyCandles).toHaveBeenNthCalledWith(1, {
      ticker: '000660',
      range: '6m',
      now: new Date('2026-05-05T11:05:00.000Z'),
    });
    expect(backfillDailyCandles).toHaveBeenNthCalledWith(2, {
      ticker: '005930',
      range: '6m',
      now: new Date('2026-05-05T11:05:00.000Z'),
    });
  });
});
