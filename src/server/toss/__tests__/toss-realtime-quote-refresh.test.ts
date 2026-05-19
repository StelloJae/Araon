import type { Price, Stock } from '@shared/types';
import { describe, expect, it, vi } from 'vitest';

import {
  createTossRealtimeQuoteRefreshHandler,
  normalizeTossRealtimeStockCode,
} from '../toss-realtime-quote-refresh.js';

function stock(ticker: string): Stock {
  return { ticker, name: ticker, market: 'KOSPI' };
}

function price(ticker: string): Price {
  return {
    ticker,
    price: 70_000,
    changeRate: 1.2,
    changeAbs: 800,
    volume: 1000,
    updatedAt: '2026-05-11T06:00:01.000Z',
    isSnapshot: false,
    source: 'rest',
  };
}

describe('normalizeTossRealtimeStockCode', () => {
  it('accepts Toss A-prefixed Korean stock codes only', () => {
    expect(normalizeTossRealtimeStockCode('A005930')).toBe('005930');
    expect(normalizeTossRealtimeStockCode('005930')).toBe('005930');
    expect(normalizeTossRealtimeStockCode('US0378331005')).toBeNull();
    expect(normalizeTossRealtimeStockCode(null)).toBeNull();
  });
});

describe('Toss realtime quote refresh handler', () => {
  it('refreshes a tracked ticker once and throttles immediate duplicates', async () => {
    let now = 1_000;
    const writes: Price[] = [];
    const getQuoteBatch = vi.fn(async () => ({
      providerId: 'toss-public' as const,
      fetchedAt: '2026-05-11T06:00:01.000Z',
      requestedCount: 1,
      returnedCount: 1,
      prices: [price('005930')],
      missingTickers: [],
    }));
    const handler = createTossRealtimeQuoteRefreshHandler({
      provider: { getQuoteBatch },
      stockRepo: { findByTicker: (ticker) => ticker === '005930' ? stock(ticker) : null },
      priceStore: { setPrice: (item) => writes.push(item) },
      now: () => now,
      minRefreshGapMs: 1_000,
    });

    await expect(handler.handle({ stockCode: 'A005930' })).resolves.toBe('refreshed');
    await expect(handler.handle({ stockCode: 'A005930' })).resolves.toBe('throttled');
    now += 1_001;
    await expect(handler.handle({ stockCode: 'A005930' })).resolves.toBe('refreshed');

    expect(getQuoteBatch).toHaveBeenCalledTimes(2);
    expect(getQuoteBatch).toHaveBeenNthCalledWith(1, { tickers: ['005930'] });
    expect(writes).toHaveLength(2);
  });

  it('ignores unsupported, untracked, and empty Toss quote rows', async () => {
    const getQuoteBatch = vi.fn(async () => ({
      providerId: 'toss-public' as const,
      fetchedAt: '2026-05-11T06:00:01.000Z',
      requestedCount: 1,
      returnedCount: 0,
      prices: [],
      missingTickers: ['000660'],
    }));
    const setPrice = vi.fn();
    const handler = createTossRealtimeQuoteRefreshHandler({
      provider: { getQuoteBatch },
      stockRepo: { findByTicker: (ticker) => ticker === '000660' ? stock(ticker) : null },
      priceStore: { setPrice },
      now: () => 1_000,
    });

    await expect(handler.handle({ stockCode: null })).resolves.toBe('ignored');
    await expect(handler.handle({ stockCode: 'US0378331005' })).resolves.toBe('ignored');
    await expect(handler.handle({ stockCode: 'A005930' })).resolves.toBe('untracked');
    await expect(handler.handle({ stockCode: 'A000660' })).resolves.toBe('missing');

    expect(getQuoteBatch).toHaveBeenCalledTimes(1);
    expect(setPrice).not.toHaveBeenCalled();
  });
});
