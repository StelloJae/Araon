import { describe, expect, it, vi } from 'vitest';
import type { Favorite, Stock } from '@shared/types.js';
import { DEFAULT_SETTINGS, type Settings } from '../../settings-store.js';
import { createBackgroundDailyBackfillScheduler } from '../background-backfill-scheduler.js';

function settings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
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
  it('enables managed daily backfill for fresh settings', () => {
    expect(DEFAULT_SETTINGS.backgroundDailyBackfillEnabled).toBe(true);
  });

  it('does not call KIS backfill when the server setting is disabled', async () => {
    const backfillDailyCandles = vi.fn();
    const scheduler = createBackgroundDailyBackfillScheduler({
      settingsStore: {
        snapshot: () => settings({ backgroundDailyBackfillEnabled: false }),
      },
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

  it('does not call KIS backfill before the KIS runtime is configured', async () => {
    const backfillDailyCandles = vi.fn();
    const scheduler = createBackgroundDailyBackfillScheduler({
      settingsStore: {
        snapshot: () => settings({ backgroundDailyBackfillEnabled: true }),
      },
      stockRepo: { findAll: () => [stock('005930')] },
      favoriteRepo: { findAll: () => [favorite('005930')] },
      dailyBackfillService: { backfillDailyCandles },
      marketPhase: () => 'unknown',
      now: () => new Date('2026-05-05T11:05:00.000Z'),
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
      requestGapMs: 0,
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

  it('honors the per-run ticker cap and daily budget', async () => {
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
      settingsStore: { snapshot: () => settings() },
      stockRepo: {
        findAll: () => [stock('005930'), stock('000660'), stock('042700')],
      },
      favoriteRepo: { findAll: () => [] },
      dailyBackfillService: { backfillDailyCandles },
      marketPhase: () => 'closed',
      now: () => new Date('2026-05-05T11:05:00.000Z'),
      maxTickersPerRun: 3,
      dailyCallBudget: 2,
      requestGapMs: 0,
    });

    await expect(scheduler.runOnce()).resolves.toMatchObject({
      attempted: 2,
      succeeded: 2,
      failed: 0,
      skippedReason: 'budget_exhausted',
    });
    expect(backfillDailyCandles).toHaveBeenCalledTimes(2);
  });

  it('persists the daily budget across scheduler restarts', async () => {
    const stateStore = createMemoryBackfillStateStore();
    const firstBackfill = vi.fn(async (input: { ticker: string }) => ({
      ticker: input.ticker,
      requested: 1,
      inserted: 1,
      updated: 0,
      from: '2026-05-01T15:00:00.000Z',
      to: '2026-05-01T15:00:00.000Z',
      source: 'kis-daily' as const,
      coverage: { backfilled: true, localOnly: false },
    }));
    const firstScheduler = createBackgroundDailyBackfillScheduler({
      settingsStore: { snapshot: () => settings() },
      stockRepo: { findAll: () => [stock('005930'), stock('000660')] },
      favoriteRepo: { findAll: () => [] },
      dailyBackfillService: { backfillDailyCandles: firstBackfill },
      marketPhase: () => 'closed',
      now: () => new Date('2026-05-05T11:05:00.000Z'),
      maxTickersPerRun: 2,
      dailyCallBudget: 1,
      requestGapMs: 0,
      stateStore,
    });

    await expect(firstScheduler.runOnce()).resolves.toMatchObject({
      attempted: 1,
      skippedReason: 'budget_exhausted',
    });

    const secondBackfill = vi.fn();
    const secondScheduler = createBackgroundDailyBackfillScheduler({
      settingsStore: { snapshot: () => settings() },
      stockRepo: { findAll: () => [stock('005930')] },
      favoriteRepo: { findAll: () => [] },
      dailyBackfillService: { backfillDailyCandles: secondBackfill },
      marketPhase: () => 'closed',
      now: () => new Date('2026-05-05T11:10:00.000Z'),
      dailyCallBudget: 1,
      requestGapMs: 0,
      stateStore,
    });

    await expect(secondScheduler.runOnce()).resolves.toMatchObject({
      attempted: 0,
      skippedReason: 'budget_exhausted',
    });
    expect(secondBackfill).not.toHaveBeenCalled();
  });

  it('enters cooldown after a backfill failure', async () => {
    const backfillDailyCandles = vi
      .fn()
      .mockRejectedValueOnce(new Error('429 rate limit'));
    const scheduler = createBackgroundDailyBackfillScheduler({
      settingsStore: { snapshot: () => settings() },
      stockRepo: { findAll: () => [stock('005930')] },
      favoriteRepo: { findAll: () => [] },
      dailyBackfillService: { backfillDailyCandles },
      marketPhase: () => 'closed',
      now: () => new Date('2026-05-05T11:05:00.000Z'),
      requestGapMs: 0,
    });

    await expect(scheduler.runOnce()).resolves.toMatchObject({
      attempted: 1,
      failed: 1,
      skippedReason: null,
    });
    await expect(
      scheduler.runOnce(new Date('2026-05-05T11:06:00.000Z')),
    ).resolves.toMatchObject({
      attempted: 0,
      skippedReason: 'cooldown',
    });
  });

  it('stops the current batch after a backfill failure', async () => {
    const backfillDailyCandles = vi
      .fn()
      .mockRejectedValueOnce(new Error('upstream 5xx'))
      .mockResolvedValue({
        ticker: '000660',
        requested: 1,
        inserted: 1,
        updated: 0,
        from: null,
        to: null,
        source: 'kis-daily',
        coverage: { backfilled: true, localOnly: false },
      });
    const scheduler = createBackgroundDailyBackfillScheduler({
      settingsStore: { snapshot: () => settings() },
      stockRepo: {
        findAll: () => [stock('005930'), stock('000660'), stock('042700')],
      },
      favoriteRepo: { findAll: () => [] },
      dailyBackfillService: { backfillDailyCandles },
      marketPhase: () => 'closed',
      now: () => new Date('2026-05-05T11:05:00.000Z'),
      requestGapMs: 0,
    });

    await expect(scheduler.runOnce()).resolves.toMatchObject({
      attempted: 1,
      succeeded: 0,
      failed: 1,
    });
    expect(backfillDailyCandles).toHaveBeenCalledTimes(1);
  });

  it('persists cooldown across scheduler restarts', async () => {
    const stateStore = createMemoryBackfillStateStore();
    const firstBackfill = vi
      .fn()
      .mockRejectedValueOnce(new Error('429 rate limit'));
    const firstScheduler = createBackgroundDailyBackfillScheduler({
      settingsStore: { snapshot: () => settings() },
      stockRepo: { findAll: () => [stock('005930')] },
      favoriteRepo: { findAll: () => [] },
      dailyBackfillService: { backfillDailyCandles: firstBackfill },
      marketPhase: () => 'closed',
      now: () => new Date('2026-05-05T11:05:00.000Z'),
      requestGapMs: 0,
      stateStore,
    });

    await expect(firstScheduler.runOnce()).resolves.toMatchObject({
      attempted: 1,
      failed: 1,
    });

    const secondBackfill = vi.fn();
    const secondScheduler = createBackgroundDailyBackfillScheduler({
      settingsStore: { snapshot: () => settings() },
      stockRepo: { findAll: () => [stock('005930')] },
      favoriteRepo: { findAll: () => [] },
      dailyBackfillService: { backfillDailyCandles: secondBackfill },
      marketPhase: () => 'closed',
      now: () => new Date('2026-05-05T11:06:00.000Z'),
      requestGapMs: 0,
      stateStore,
    });

    await expect(secondScheduler.runOnce()).resolves.toMatchObject({
      attempted: 0,
      skippedReason: 'cooldown',
    });
    expect(secondBackfill).not.toHaveBeenCalled();
  });
});

function createMemoryBackfillStateStore() {
  let state = {
    budgetDateKey: null as string | null,
    dailyCallCount: 0,
    cooldownUntilMs: 0,
  };
  return {
    async load() {
      return { ...state };
    },
    async save(next: typeof state) {
      state = { ...next };
    },
    snapshot() {
      return { ...state };
    },
  };
}
