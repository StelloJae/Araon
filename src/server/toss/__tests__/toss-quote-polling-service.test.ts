import { describe, expect, it, vi } from 'vitest';
import type { Price, Stock } from '@shared/types.js';

import { DEFAULT_SETTINGS, type SettingsStore } from '../../settings-store.js';
import { createTossQuotePollingService } from '../toss-quote-polling-service.js';

function settingsStore(overrides: Partial<typeof DEFAULT_SETTINGS> = {}): SettingsStore {
  const snapshot = { ...DEFAULT_SETTINGS, ...overrides };
  return {
    load: vi.fn(async () => snapshot),
    save: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined),
    snapshot: vi.fn(() => snapshot),
  };
}

function stock(ticker: string): Stock {
  return { ticker, name: ticker, market: 'KOSPI' };
}

function price(ticker: string): Price {
  return {
    ticker,
    price: 10000,
    changeRate: 1.2,
    changeAbs: 120,
    volume: 100,
    updatedAt: '2026-05-11T01:00:00.000Z',
    isSnapshot: false,
    source: 'rest',
  };
}

describe('toss quote polling service', () => {
  it('refreshes tracked tickers through Toss quote batches and writes usable prices', async () => {
    const writes: Price[] = [];
    const provider = {
      getQuoteBatch: vi.fn(async ({ tickers }: { tickers: readonly string[] }) => ({
        providerId: 'toss-public' as const,
        fetchedAt: '2026-05-11T01:00:00.000Z',
        requestedCount: tickers.length,
        returnedCount: tickers.length,
        prices: tickers.map(price),
        missingTickers: [],
      })),
    };
    const service = createTossQuotePollingService({
      provider,
      stockRepo: { findAll: () => [stock('005930'), stock('000660'), stock('005930')] },
      priceStore: { setPrice: (item) => writes.push(item) },
      settings: settingsStore({ tossQuotePollingBatchSize: 2 }),
      now: () => Date.parse('2026-05-11T01:00:00.000Z'),
    });

    const snapshot = await service.refreshOnce();

    expect(provider.getQuoteBatch).toHaveBeenCalledTimes(1);
    expect(provider.getQuoteBatch).toHaveBeenCalledWith({ tickers: ['005930', '000660'] });
    expect(writes.map((item) => item.ticker)).toEqual(['005930', '000660']);
    expect(snapshot.returnedCount).toBe(2);
    expect(snapshot.lastMessage).toBe('ready');
    expect(snapshot.lastErrorCode).toBeNull();
  });

  it('marks partial quote batches without shrinking the local price store itself', async () => {
    const writes: Price[] = [];
    const service = createTossQuotePollingService({
      provider: {
        getQuoteBatch: vi.fn(async () => ({
          providerId: 'toss-public' as const,
          fetchedAt: '2026-05-11T01:00:00.000Z',
          requestedCount: 2,
          returnedCount: 1,
          prices: [price('005930')],
          missingTickers: ['000660'],
        })),
      },
      stockRepo: { findAll: () => [stock('005930'), stock('000660')] },
      priceStore: { setPrice: (item) => writes.push(item) },
      settings: settingsStore(),
      now: () => Date.parse('2026-05-11T01:00:00.000Z'),
    });

    const snapshot = await service.refreshOnce();

    expect(writes.map((item) => item.ticker)).toEqual(['005930']);
    expect(snapshot.missingCount).toBe(1);
    expect(snapshot.lastMessage).toBe('partial_quote_batch');
  });

  it('stops suppressing KIS polling after repeated Toss quote failures', async () => {
    const service = createTossQuotePollingService({
      provider: {
        getQuoteBatch: vi.fn(async () => {
          throw new Error('Toss public request failed: 503');
        }),
      },
      stockRepo: { findAll: () => [stock('005930')] },
      priceStore: { setPrice: vi.fn() },
      settings: settingsStore(),
      now: () => Date.parse('2026-05-11T01:00:00.000Z'),
    });

    service.start();
    expect(service.shouldSuppressKisPolling()).toBe(true);
    await service.refreshOnce();
    expect(service.shouldSuppressKisPolling()).toBe(true);
    await service.refreshOnce();
    expect(service.snapshot().lastErrorCode).toBe('TOSS_QUOTE_POLLING_FAILED');
    expect(service.shouldSuppressKisPolling()).toBe(false);
    await service.stop();
  });
});
