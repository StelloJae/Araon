import { describe, expect, it, vi } from 'vitest';

import { createTossPublicMarketDataProvider } from '../toss-public-market-data-provider.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('toss public market data provider', () => {
  it('exposes provider-neutral health and capabilities', () => {
    const provider = createTossPublicMarketDataProvider();

    expect(provider.getHealth()).toMatchObject({
      providerId: 'toss-public',
      status: 'ready',
      requiresAuth: false,
      authenticated: true,
      capabilities: [
        'top-movers',
        'quote-batch',
        'realtime-ranking',
        'daily-candles',
        'stock-metadata',
        'search',
      ],
      lastErrorCode: null,
    });
  });

  it('serves quote batches through the provider boundary', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({
      result: [
        {
          productCode: 'A005930',
          currency: 'KRW',
          base: 268_500,
          close: 284_000,
          volume: 56_326_493,
        },
      ],
    }));
    const provider = createTossPublicMarketDataProvider({
      fetchFn,
      now: () => new Date('2026-05-11T06:05:00.000Z'),
    });

    const result = await provider.getQuoteBatch({ tickers: ['005930', '000660'] });

    expect(result).toMatchObject({
      providerId: 'toss-public',
      fetchedAt: '2026-05-11T06:05:00.000Z',
      requestedCount: 2,
      returnedCount: 1,
      missingTickers: ['000660'],
    });
    expect(result.prices[0]).toMatchObject({
      ticker: '005930',
      price: 284_000,
      source: 'rest',
    });
  });

  it('marks health degraded after an upstream failure without leaking raw body', async () => {
    const provider = createTossPublicMarketDataProvider({
      fetchFn: vi.fn(async () => new Response('raw upstream body with redacted session placeholder', { status: 500 })),
      now: () => new Date('2026-05-11T06:05:00.000Z'),
    });

    await expect(provider.getQuoteBatch({ tickers: ['005930'] })).rejects.toThrow(
      'Toss public request failed: 500',
    );

    const health = provider.getHealth();
    expect(health).toMatchObject({
      status: 'degraded',
      lastErrorCode: 'TOSS_QUOTE_BATCH_FAILED',
      lastErrorAt: '2026-05-11T06:05:00.000Z',
    });
    expect(JSON.stringify(health)).not.toContain('raw upstream body');
  });
});
