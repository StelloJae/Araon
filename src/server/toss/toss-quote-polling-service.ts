import { createChildLogger } from '@shared/logger.js';
import type { Price, Stock } from '@shared/types.js';

import type { SettingsStore } from '../settings-store.js';
import type { MarketQuoteBatchResult } from '../market/market-data-provider.js';

const log = createChildLogger('toss-quote-polling-service');

export interface TossQuotePollingProvider {
  getQuoteBatch(input: { tickers: readonly string[] }): Promise<MarketQuoteBatchResult>;
}

export interface TossQuotePollingStockRepo {
  findAll(): Stock[];
}

export interface TossQuotePollingPriceStore {
  setPrice(price: Price): void;
}

export interface TossQuotePollingSnapshot {
  running: boolean;
  enabled: boolean;
  source: 'toss-public';
  cycleCount: number;
  lastCycleMs: number;
  tickersInCycle: number;
  requestedCount: number;
  returnedCount: number;
  missingCount: number;
  errorCount: number;
  consecutiveFailureCount: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorCode: string | null;
  lastMessage: string | null;
  intervalMs: number;
  batchSize: number;
}

export interface TossQuotePollingService {
  start(): void;
  stop(): Promise<void>;
  refreshOnce(): Promise<TossQuotePollingSnapshot>;
  snapshot(): TossQuotePollingSnapshot;
  shouldSuppressKisPolling(): boolean;
}

export interface TossQuotePollingServiceOptions {
  provider: TossQuotePollingProvider;
  stockRepo: TossQuotePollingStockRepo;
  priceStore: TossQuotePollingPriceStore;
  settings: SettingsStore;
  now?: () => number;
  setTimeoutFn?: (cb: () => void, ms: number) => unknown;
}

export function createTossQuotePollingService(
  options: TossQuotePollingServiceOptions,
): TossQuotePollingService {
  const now = options.now ?? (() => Date.now());
  const scheduleTimeout =
    options.setTimeoutFn ??
    ((cb: () => void, ms: number): unknown => setTimeout(cb, ms));

  let running = false;
  let loopPromise: Promise<void> | null = null;
  let wakeWaiter: (() => void) | null = null;

  let cycleCount = 0;
  let lastCycleMs = 0;
  let tickersInCycle = 0;
  let requestedCount = 0;
  let returnedCount = 0;
  let missingCount = 0;
  let errorCount = 0;
  let consecutiveFailureCount = 0;
  let lastSuccessAt: string | null = null;
  let lastFailureAt: string | null = null;
  let lastErrorCode: string | null = null;
  let lastMessage: string | null = null;

  async function refreshOnce(): Promise<TossQuotePollingSnapshot> {
    const settings = options.settings.snapshot();
    const startedAt = now();
    lastCycleMs = 0;
    tickersInCycle = 0;
    requestedCount = 0;
    returnedCount = 0;
    missingCount = 0;

    if (!settings.tossQuotePollingEnabled) {
      return snapshot();
    }

    const tickers = uniqueTickers(options.stockRepo.findAll());
    tickersInCycle = tickers.length;
    if (tickers.length === 0) {
      cycleCount += 1;
      lastCycleMs = now() - startedAt;
      lastMessage = 'no_tracked_tickers';
      return snapshot();
    }

    try {
      for (const batch of chunk(tickers, settings.tossQuotePollingBatchSize)) {
        const result = await options.provider.getQuoteBatch({ tickers: batch });
        requestedCount += result.requestedCount;
        returnedCount += result.returnedCount;
        missingCount += result.missingTickers.length;
        for (const price of result.prices) {
          if (isUsablePrice(price)) {
            options.priceStore.setPrice(price);
          }
        }
      }
      cycleCount += 1;
      lastCycleMs = now() - startedAt;
      consecutiveFailureCount = 0;
      lastSuccessAt = new Date(now()).toISOString();
      lastErrorCode = null;
      lastMessage = returnedCount === tickersInCycle
        ? 'ready'
        : 'partial_quote_batch';
      return snapshot();
    } catch (err: unknown) {
      cycleCount += 1;
      lastCycleMs = now() - startedAt;
      errorCount += 1;
      consecutiveFailureCount += 1;
      lastFailureAt = new Date(now()).toISOString();
      lastErrorCode = 'TOSS_QUOTE_POLLING_FAILED';
      lastMessage = 'quote_batch_failed';
      log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Toss quote polling cycle failed',
      );
      return snapshot();
    }
  }

  async function loop(): Promise<void> {
    while (running) {
      const delayMs = options.settings.snapshot().tossQuotePollingIntervalMs;
      await wait(delayMs);
      if (!running) break;
      await refreshOnce();
    }
  }

  function wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;
      const settle = (): void => {
        if (settled) return;
        settled = true;
        wakeWaiter = null;
        resolve();
      };
      wakeWaiter = settle;
      scheduleTimeout(settle, ms);
    });
  }

  function start(): void {
    if (running) return;
    running = true;
    loopPromise = loop();
  }

  async function stop(): Promise<void> {
    if (!running) {
      if (loopPromise !== null) {
        await loopPromise;
        loopPromise = null;
      }
      return;
    }
    running = false;
    wakeWaiter?.();
    const pending = loopPromise;
    loopPromise = null;
    if (pending !== null) {
      await pending;
    }
  }

  function snapshot(): TossQuotePollingSnapshot {
    const settings = options.settings.snapshot();
    return {
      running,
      enabled: settings.tossQuotePollingEnabled,
      source: 'toss-public',
      cycleCount,
      lastCycleMs,
      tickersInCycle,
      requestedCount,
      returnedCount,
      missingCount,
      errorCount,
      consecutiveFailureCount,
      lastSuccessAt,
      lastFailureAt,
      lastErrorCode,
      lastMessage,
      intervalMs: settings.tossQuotePollingIntervalMs,
      batchSize: settings.tossQuotePollingBatchSize,
    };
  }

  function shouldSuppressKisPolling(): boolean {
    const current = snapshot();
    return current.enabled
      && current.consecutiveFailureCount < 2;
  }

  return { start, stop, refreshOnce, snapshot, shouldSuppressKisPolling };
}

function uniqueTickers(stocks: readonly Stock[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const stock of stocks) {
    const ticker = stock.ticker.trim().toUpperCase();
    if (ticker.length === 0 || seen.has(ticker)) continue;
    seen.add(ticker);
    out.push(ticker);
  }
  return out;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function isUsablePrice(price: Price): boolean {
  return Number.isFinite(price.price) && price.price > 0;
}
