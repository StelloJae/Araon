/**
 * Phase 4a polling scheduler tests.
 *
 * Uses vitest fake timers to drive both the rate limiter's setTimeout waits
 * and the scheduler's inter-cycle delay. The priceStore, restClient, and
 * stockRepo are hand-rolled fakes — no real HTTP, no real DB.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';

import {
  REST_RATE_LIMIT_PER_SEC_LIVE,
  REST_RATE_LIMIT_SAFETY_FACTOR,
} from '@shared/kis-constraints.js';
import type { Price, Stock } from '@shared/types.js';

import { createRateLimiter } from '../rate-limiter.js';
import {
  createPollingScheduler,
  type PollingRestClient,
  type PriceStoreLike,
  type StockRepoLike,
} from '../polling-scheduler.js';
import {
  createSettingsStore,
  DEFAULT_SETTINGS,
  type SettingsStore,
} from '../../settings-store.js';

// === Helpers ==================================================================

function makeStocks(count: number): Stock[] {
  return Array.from({ length: count }, (_, i) => ({
    ticker: String(i + 1).padStart(6, '0'),
    name: `종목${i + 1}`,
    market: 'KOSPI' as const,
  }));
}

function makeStockRepo(stocks: Stock[]): StockRepoLike {
  return {
    findAll: () => stocks,
  };
}

function makePriceStore(): { store: PriceStoreLike; writes: Price[] } {
  const writes: Price[] = [];
  return {
    store: {
      setPrice: (p: Price) => {
        writes.push(p);
      },
    },
    writes,
  };
}

function makeRestClient(
  opts: { failingTickers?: Set<string> } = {},
): { client: PollingRestClient; calls: string[] } {
  const calls: string[] = [];
  const failing = opts.failingTickers ?? new Set<string>();
  const client: PollingRestClient = {
    async fetchPrice(ticker: string): Promise<Price> {
      calls.push(ticker);
      if (failing.has(ticker)) {
        throw new Error(`synthetic failure for ${ticker}`);
      }
      return {
        ticker,
        price: 10000,
        changeRate: 0.01,
        volume: 100,
        updatedAt: new Date().toISOString(),
        isSnapshot: false,
      };
    },
  };
  return { client, calls };
}

async function uniqueTempPath(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), `kis-${prefix}-`));
  return join(dir, 'settings.json');
}

async function makeSettingsStore(
  path: string,
  overrides: Partial<typeof DEFAULT_SETTINGS> = {},
): Promise<SettingsStore> {
  const store = createSettingsStore({ path });
  await store.load();
  // Tests disable pacer by default — they validate rate-limiter and scheduler
  // timing assumptions that predate the pacer. Tests that want pacer coverage
  // can override pollingMinStartGapMs/pollingStartJitterMs explicitly.
  await store.save({
    ...DEFAULT_SETTINGS,
    pollingMinStartGapMs: 0,
    pollingStartJitterMs: 0,
    ...overrides,
  });
  return store;
}

// === Tests ====================================================================

describe('polling-scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. respects REST_RATE_LIMIT_PER_SEC_LIVE * SAFETY_FACTOR for 100 tickers', async () => {
    const tickerCount = 100;
    const ratePerSec =
      REST_RATE_LIMIT_PER_SEC_LIVE * REST_RATE_LIMIT_SAFETY_FACTOR;
    // Effective rate tracks the constant (lowered from 15 to 10 after live KIS
    // testing showed the sliding-window rejects bursts beyond this). Assert
    // follows the constant rather than pinning a specific number.
    expect(ratePerSec).toBe(REST_RATE_LIMIT_PER_SEC_LIVE * REST_RATE_LIMIT_SAFETY_FACTOR);
    expect(ratePerSec).toBeLessThanOrEqual(15);
    expect(ratePerSec).toBeGreaterThan(0);

    const stocks = makeStocks(tickerCount);
    const { client } = makeRestClient();
    const { store: priceStore, writes } = makePriceStore();
    const rateLimiter = createRateLimiter({ ratePerSec, burst: 1 });

    const settingsPath = await uniqueTempPath('ratelimit');
    const settings = await makeSettingsStore(settingsPath, {
      pollingCycleDelayMs: 1_000_000,
      // Keep maxInFlight=1 for this test so rate-limiter throughput is the
      // sole gating factor — the test's timing math assumes serial acquire().
      pollingMaxInFlight: 1,
    });

    const start = Date.now();
    const scheduler = createPollingScheduler({
      restClient: client,
      stockRepo: makeStockRepo(stocks),
      priceStore,
      rateLimiter,
      settings,
      now: () => Date.now(),
    });

    scheduler.start();
    // 99 acquire() waits of ~100ms ≈ 9.9s virtual (ratePerSec=10, burst=1).
    // Advance past that for the post-cycle yield. The large pollingCycleDelayMs
    // keeps us in cycle 1 only.
    await vi.advanceTimersByTimeAsync(11_000);
    const cycle1Status = scheduler.getStatus();
    await scheduler.stop();
    await vi.advanceTimersByTimeAsync(2_000_000);

    const expectedMinMs = Math.floor(((tickerCount - 1) / ratePerSec) * 1000);

    expect(writes).toHaveLength(tickerCount);
    expect(rateLimiter.getBreachCount()).toBe(0);
    expect(cycle1Status.cycleCount).toBe(1);
    expect(cycle1Status.lastCycleMs).toBeGreaterThanOrEqual(expectedMinMs);
    expect(Date.now() - start).toBeGreaterThanOrEqual(expectedMinMs);
  }, 15_000);

  it('2. picks up settings changes between cycles', async () => {
    const stocks = makeStocks(2);
    const { client } = makeRestClient();
    const { store: priceStore } = makePriceStore();
    // Use a generous rate so inter-ticker waits are negligible.
    const rateLimiter = createRateLimiter({ ratePerSec: 1000, burst: 10 });

    const settingsPath = await uniqueTempPath('settings-change');
    const settings = await makeSettingsStore(settingsPath, {
      pollingCycleDelayMs: 1000,
    });

    const scheduler = createPollingScheduler({
      restClient: client,
      stockRepo: makeStockRepo(stocks),
      priceStore,
      rateLimiter,
      settings,
    });

    scheduler.start();
    // Let the first cycle finish and enter the 1000ms wait.
    await vi.advanceTimersByTimeAsync(50);
    expect(scheduler.getStatus().cycleCount).toBe(1);

    // Shortening the delay takes effect on the NEXT wait — the current
    // 1000ms timer was captured before the update. Keep pacer disabled
    // so cycle timing stays deterministic under fake timers.
    await settings.save({
      ...DEFAULT_SETTINGS,
      pollingCycleDelayMs: 200,
      pollingMinStartGapMs: 0,
      pollingStartJitterMs: 0,
    });

    // Drain the initial 1000ms wait; cycle 2 runs and enters a 200ms wait.
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(50);
    expect(scheduler.getStatus().cycleCount).toBe(2);

    // Now the NEW 200ms delay governs — four more cycles in ~900ms.
    await vi.advanceTimersByTimeAsync(900);
    expect(scheduler.getStatus().cycleCount).toBeGreaterThanOrEqual(5);

    await scheduler.stop();
  });

  it('3. stop() cleanly ends the current cycle and does not start a new one', async () => {
    const stocks = makeStocks(5);
    const { client } = makeRestClient();
    const { store: priceStore, writes } = makePriceStore();
    const rateLimiter = createRateLimiter({ ratePerSec: 1000, burst: 10 });

    const settingsPath = await uniqueTempPath('start-stop');
    const settings = await makeSettingsStore(settingsPath, {
      pollingCycleDelayMs: 500,
    });

    const scheduler = createPollingScheduler({
      restClient: client,
      stockRepo: makeStockRepo(stocks),
      priceStore,
      rateLimiter,
      settings,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(50);
    expect(scheduler.getStatus().cycleCount).toBe(1);

    const stopPromise = scheduler.stop();
    // Flush the inter-cycle delay + any pending immediates.
    await vi.advanceTimersByTimeAsync(2000);
    await stopPromise;

    expect(scheduler.getStatus().running).toBe(false);
    const cyclesAfterStop = scheduler.getStatus().cycleCount;

    await vi.advanceTimersByTimeAsync(5000);
    expect(scheduler.getStatus().cycleCount).toBe(cyclesAfterStop);
    expect(writes.length).toBeGreaterThanOrEqual(stocks.length);
  });

  it('4. tier fallback — polls ALL stocks regardless of favorites.tier', async () => {
    const stocks = makeStocks(10);
    const { client, calls } = makeRestClient();
    const { store: priceStore } = makePriceStore();
    const rateLimiter = createRateLimiter({ ratePerSec: 1000, burst: 10 });

    const settingsPath = await uniqueTempPath('tier-fallback');
    const settings = await makeSettingsStore(settingsPath, {
      pollingCycleDelayMs: 100,
    });

    // The scheduler accepts a StockRepoLike.findAll() — the repo itself would
    // return all 10 rows regardless of which ones are marked tier='realtime'
    // in the favorites table. This test enforces that the scheduler makes no
    // attempt to filter them.
    const repo = makeStockRepo(stocks);

    const scheduler = createPollingScheduler({
      restClient: client,
      stockRepo: repo,
      priceStore,
      rateLimiter,
      settings,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(200);
    await scheduler.stop();

    // All 10 tickers must be polled, including the 5 we would have marked
    // tier='realtime' in a Phase 5a setup.
    const unique = new Set(calls);
    expect(unique.size).toBe(stocks.length);
    for (const stock of stocks) {
      expect(unique.has(stock.ticker)).toBe(true);
    }
  });

  it('5. isolates ticker errors — one failure does not abort the cycle', async () => {
    const stocks = makeStocks(10);
    const failingTicker = stocks[3]!.ticker;
    const { client, calls } = makeRestClient({
      failingTickers: new Set([failingTicker]),
    });
    const { store: priceStore, writes } = makePriceStore();
    const rateLimiter = createRateLimiter({ ratePerSec: 1000, burst: 10 });

    const settingsPath = await uniqueTempPath('error-isolation');
    const settings = await makeSettingsStore(settingsPath, {
      pollingCycleDelayMs: 1000,
    });

    const scheduler = createPollingScheduler({
      restClient: client,
      stockRepo: makeStockRepo(stocks),
      priceStore,
      rateLimiter,
      settings,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(100);
    await scheduler.stop();

    expect(calls).toHaveLength(stocks.length);
    expect(writes).toHaveLength(stocks.length - 1);
    expect(writes.find((p) => p.ticker === failingTicker)).toBeUndefined();
    expect(scheduler.getStatus().errorCount).toBe(1);
  });
});
