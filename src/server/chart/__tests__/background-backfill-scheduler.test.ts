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

  it('does not wait inside low-priority backfill while the shared KIS limiter is cooling down', async () => {
    const backfillDailyCandles = vi.fn();
    const scheduler = createBackgroundDailyBackfillScheduler({
      settingsStore: {
        snapshot: () => settings({ backgroundDailyBackfillEnabled: true }),
      },
      stockRepo: { findAll: () => [stock('005930')] },
      favoriteRepo: { findAll: () => [favorite('005930')] },
      dailyBackfillService: { backfillDailyCandles },
      marketPhase: () => 'closed',
      now: () => new Date('2026-05-05T11:05:00.000Z'),
      isUpstreamCooldownActive: () => true,
    });

    await expect(scheduler.runOnce()).resolves.toMatchObject({
      attempted: 0,
      skippedReason: 'cooldown',
    });
    expect(backfillDailyCandles).not.toHaveBeenCalled();
    expect(scheduler.snapshot()).toMatchObject({
      running: false,
      lastSkippedReason: 'cooldown',
    });
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

  it('honors the per-run ticker cap while keeping a daily call counter', async () => {
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
      maxTickersPerRun: 2,
      requestGapMs: 0,
    });

    await expect(scheduler.runOnce()).resolves.toMatchObject({
      attempted: 2,
      succeeded: 2,
      failed: 0,
      skippedReason: null,
    });
    expect(backfillDailyCandles).toHaveBeenCalledTimes(2);
  });

  it('updates the snapshot while a daily backfill run is still in flight', async () => {
    let resolveBackfill: (() => void) | null = null;
    const inFlight = new Promise<void>((resolve) => {
      resolveBackfill = resolve;
    });
    const backfillDailyCandles = vi.fn(async (input: { ticker: string }) => {
      await inFlight;
      return {
        ticker: input.ticker,
        requested: 1,
        inserted: 1,
        updated: 0,
        from: '2026-05-01T15:00:00.000Z',
        to: '2026-05-01T15:00:00.000Z',
        source: 'kis-daily' as const,
        coverage: { backfilled: true, localOnly: false },
      };
    });
    const scheduler = createBackgroundDailyBackfillScheduler({
      settingsStore: { snapshot: () => settings() },
      stockRepo: { findAll: () => [stock('005930')] },
      favoriteRepo: { findAll: () => [] },
      dailyBackfillService: { backfillDailyCandles },
      marketPhase: () => 'closed',
      now: () => new Date('2026-05-05T11:05:00.000Z'),
      requestGapMs: 0,
    });

    const run = scheduler.runOnce();
    await vi.waitFor(() => {
      expect(scheduler.snapshot()).toMatchObject({
        running: true,
        lastAttempted: 1,
        lastSucceeded: 0,
        lastFailed: 0,
      });
    });

    resolveBackfill?.();
    await expect(run).resolves.toMatchObject({ attempted: 1, succeeded: 1 });
    expect(scheduler.snapshot()).toMatchObject({
      running: false,
      lastAttempted: 1,
      lastSucceeded: 1,
      lastFailed: 0,
    });
  });

  it('keeps a compact recent ticker history in the snapshot', async () => {
    const backfillDailyCandles = vi.fn(async (input: { ticker: string }) => ({
      ticker: input.ticker,
      requested: 20,
      inserted: input.ticker === '005930' ? 20 : 0,
      updated: input.ticker === '000660' ? 20 : 0,
      from: '2026-05-01T15:00:00.000Z',
      to: '2026-05-01T15:00:00.000Z',
      source: 'kis-daily' as const,
      coverage: { backfilled: true, localOnly: false },
    }));
    const scheduler = createBackgroundDailyBackfillScheduler({
      settingsStore: { snapshot: () => settings() },
      stockRepo: {
        findAll: () => [stock('005930'), stock('000660')],
      },
      favoriteRepo: { findAll: () => [] },
      dailyBackfillService: { backfillDailyCandles },
      marketPhase: () => 'closed',
      now: () => new Date('2026-05-05T11:05:00.000Z'),
      maxTickersPerRun: 2,
      requestGapMs: 0,
    });

    await scheduler.runOnce();

    expect(scheduler.snapshot().recent).toEqual([
      {
        ticker: '005930',
        status: 'success',
        requested: 20,
        inserted: 20,
        updated: 0,
        source: 'kis-daily',
        finishedAt: '2026-05-05T11:05:00.000Z',
        errorCode: null,
      },
      {
        ticker: '000660',
        status: 'success',
        requested: 20,
        inserted: 0,
        updated: 20,
        source: 'kis-daily',
        finishedAt: '2026-05-05T11:05:00.000Z',
        errorCode: null,
      },
    ]);
  });

  it('skips up-to-date tickers before counting calls', async () => {
    const shouldBackfillTicker = vi.fn(({ ticker }: { ticker: string }) => ticker === '042700');
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
      favoriteRepo: { findAll: () => [favorite('005930')] },
      dailyBackfillService: { backfillDailyCandles },
      marketPhase: () => 'closed',
      now: () => new Date('2026-05-05T11:05:00.000Z'),
      maxTickersPerRun: 2,
      requestGapMs: 0,
      shouldBackfillTicker,
    });

    await expect(scheduler.runOnce()).resolves.toMatchObject({
      attempted: 1,
      succeeded: 1,
      skippedReason: null,
    });
    expect(backfillDailyCandles).toHaveBeenCalledOnce();
    expect(backfillDailyCandles).toHaveBeenCalledWith({
      ticker: '042700',
      range: '3m',
      now: new Date('2026-05-05T11:05:00.000Z'),
    });
  });

  it('reports no_stale_tickers when every tracked ticker is already covered', async () => {
    const backfillDailyCandles = vi.fn();
    const scheduler = createBackgroundDailyBackfillScheduler({
      settingsStore: { snapshot: () => settings() },
      stockRepo: {
        findAll: () => [stock('005930'), stock('000660')],
      },
      favoriteRepo: { findAll: () => [] },
      dailyBackfillService: { backfillDailyCandles },
      marketPhase: () => 'closed',
      now: () => new Date('2026-05-05T11:05:00.000Z'),
      requestGapMs: 0,
      shouldBackfillTicker: () => false,
    });

    await expect(scheduler.runOnce()).resolves.toMatchObject({
      attempted: 0,
      skippedReason: 'no_stale_tickers',
    });
    expect(scheduler.snapshot()).toMatchObject({
      running: false,
      lastAttempted: 0,
      lastSkippedReason: 'no_stale_tickers',
    });
    expect(backfillDailyCandles).not.toHaveBeenCalled();
  });

  it('backs off a ticker that returns no daily candle work instead of retrying it every minute', async () => {
    let nowMs = new Date('2026-05-05T11:05:00.000Z').getTime();
    const backfillDailyCandles = vi.fn(async (input: { ticker: string }) => ({
      ticker: input.ticker,
      requested: input.ticker === '010620' ? 0 : 10,
      inserted: input.ticker === '010620' ? 0 : 10,
      updated: 0,
      from: null,
      to: null,
      source: 'kis-daily' as const,
      coverage: {
        backfilled: input.ticker !== '010620',
        localOnly: input.ticker === '010620',
      },
    }));
    const scheduler = createBackgroundDailyBackfillScheduler({
      settingsStore: { snapshot: () => settings() },
      stockRepo: { findAll: () => [stock('010620'), stock('005930')] },
      favoriteRepo: { findAll: () => [favorite('010620')] },
      dailyBackfillService: { backfillDailyCandles },
      marketPhase: () => 'closed',
      now: () => new Date(nowMs),
      maxTickersPerRun: 1,
      requestGapMs: 0,
      noWorkTickerCooldownMs: 6 * 60 * 60 * 1000,
    });

    await expect(scheduler.runOnce()).resolves.toMatchObject({
      attempted: 1,
      succeeded: 0,
      failed: 0,
      skippedReason: null,
    });
    expect(scheduler.snapshot()).toMatchObject({
      noWorkCooldownCount: 1,
      recent: [
        expect.objectContaining({
          ticker: '010620',
          status: 'no_change',
          requested: 0,
        }),
      ],
    });

    nowMs += 60 * 1000;
    await expect(scheduler.runOnce()).resolves.toMatchObject({
      attempted: 1,
      succeeded: 1,
      failed: 0,
      skippedReason: null,
    });
    expect(backfillDailyCandles).toHaveBeenNthCalledWith(1, {
      ticker: '010620',
      range: '3m',
      now: new Date('2026-05-05T11:05:00.000Z'),
    });
    expect(backfillDailyCandles).toHaveBeenNthCalledWith(2, {
      ticker: '005930',
      range: '3m',
      now: new Date('2026-05-05T11:06:00.000Z'),
    });
  });

  it('persists the daily call counter across scheduler restarts without blocking later work', async () => {
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
      requestGapMs: 0,
      stateStore,
    });

    await expect(firstScheduler.runOnce()).resolves.toMatchObject({
      attempted: 2,
      skippedReason: null,
    });

    const secondBackfill = vi.fn(async (input: { ticker: string }) => ({
      ticker: input.ticker,
      requested: 1,
      inserted: 1,
      updated: 0,
      from: '2026-05-01T15:00:00.000Z',
      to: '2026-05-01T15:00:00.000Z',
      source: 'kis-daily' as const,
      coverage: { backfilled: true, localOnly: false },
    }));
    const secondScheduler = createBackgroundDailyBackfillScheduler({
      settingsStore: { snapshot: () => settings() },
      stockRepo: { findAll: () => [stock('005930')] },
      favoriteRepo: { findAll: () => [] },
      dailyBackfillService: { backfillDailyCandles: secondBackfill },
      marketPhase: () => 'closed',
      now: () => new Date('2026-05-05T11:10:00.000Z'),
      requestGapMs: 0,
      stateStore,
    });

    await expect(secondScheduler.runOnce()).resolves.toMatchObject({
      attempted: 1,
      skippedReason: null,
    });
    expect(secondBackfill).toHaveBeenCalledOnce();
    expect(stateStore.snapshot().dailyCallCount).toBe(3);
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
