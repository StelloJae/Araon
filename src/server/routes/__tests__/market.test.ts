import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { marketRoutes } from '../market.js';

describe('market routes', () => {
  it('returns top movers through the market route envelope', async () => {
    const app = Fastify({ logger: false });
    await app.register(marketRoutes, {
      service: {
        getSummary: vi.fn(),
      },
      topMoversService: {
        getTopMovers: vi.fn(async () => ({
          generatedAt: '2026-05-08T08:00:00.000Z',
          fetchedAt: '2026-05-08T08:00:00.000Z',
          cacheTtlMs: 5_000,
          refreshIntervalMs: 5_000,
          staleAfterMs: 20_000,
          source: 'kis-ranking-auto',
          status: 'ready',
          message: '5초마다 갱신',
          cooldownUntil: null,
          coverage: {
            requestedLimit: 100,
            gainersCount: 0,
            losersCount: 0,
            gainersComplete: false,
            losersComplete: false,
            marketUniverse: 'kis-full-market-ranking',
            guaranteedTop100: false,
            includesLocalFallback: false,
          },
          gainers: [],
          losers: [],
        })),
        snapshot: vi.fn(),
      },
    });

    const res = await app.inject({ method: 'GET', url: '/market/top-movers?limit=100' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        source: 'kis-ranking-auto',
        status: 'ready',
      },
    });
  });

  it('returns 503 when the top movers service is unavailable', async () => {
    const app = Fastify({ logger: false });
    await app.register(marketRoutes, {
      service: {
        getSummary: vi.fn(),
      },
    });

    const res = await app.inject({ method: 'GET', url: '/market/top-movers' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'MARKET_TOP_MOVERS_UNAVAILABLE' },
    });
  });

  it('returns Toss realtime ranking through a separate read-only market route', async () => {
    const app = Fastify({ logger: false });
    const getRealtimeRanking = vi.fn(async () => ({
      generatedAt: '2026-05-11T06:05:00.000Z',
      fetchedAt: '2026-05-11T06:05:00.000Z',
      rankingDateTime: '2025-03-10T16:44:43',
      rankingTimestampStatus: 'stale',
      source: 'toss-public-realtime-ranking',
      sourceLabel: '토스 실시간 인기',
      status: 'partial',
      message: '토스 공개 인기 랭킹입니다. 랭킹 시각이 오래되어 가격만 별도 갱신했습니다.',
      refreshIntervalMs: 15_000,
      coverage: {
        requestedLimit: 100,
        returnedCount: 1,
        pricedCount: 1,
        market: 'kr',
      },
      items: [
        {
          rank: 1,
          ticker: '005930',
          productCode: 'A005930',
          name: '삼성전자',
          market: '코스피',
          currency: 'KRW',
          price: 284_000,
          changeAbs: 15_500,
          changePct: 5.77,
          volume: 56_326_493,
        },
      ],
    }));

    await app.register(marketRoutes, {
      service: {
        getSummary: vi.fn(),
      },
      tossRealtimeRankingService: {
        getRealtimeRanking,
      },
    });

    const res = await app.inject({ method: 'GET', url: '/market/toss/realtime-ranking?limit=100&market=kr' });

    expect(res.statusCode).toBe(200);
    expect(getRealtimeRanking).toHaveBeenCalledWith({ limit: 100, market: 'kr' });
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        source: 'toss-public-realtime-ranking',
        rankingTimestampStatus: 'stale',
        items: [{ ticker: '005930', price: 284_000 }],
      },
    });
  });

  it('returns Toss quote batches through a sanitized read-only route', async () => {
    const app = Fastify({ logger: false });
    const getQuoteBatch = vi.fn(async () => ({
      providerId: 'toss-public' as const,
      fetchedAt: '2026-05-11T06:10:00.000Z',
      requestedCount: 2,
      returnedCount: 1,
      prices: [
        {
          ticker: '005930',
          price: 58_000,
          changeRate: 1.23,
          changeAbs: 700,
          volume: 123_456,
          updatedAt: '2026-05-11T06:10:00.000Z',
          isSnapshot: false,
          source: 'rest' as const,
        },
      ],
      missingTickers: ['000660'],
    }));

    await app.register(marketRoutes, {
      service: {
        getSummary: vi.fn(),
      },
      tossQuoteService: {
        getQuoteBatch,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/market/toss/quotes?tickers=005930,000660,005930,bad',
    });

    expect(res.statusCode).toBe(200);
    expect(getQuoteBatch).toHaveBeenCalledWith({ tickers: ['005930', '000660'] });
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        providerId: 'toss-public',
        requestedCount: 2,
        returnedCount: 1,
        prices: [{ ticker: '005930', price: 58_000, source: 'rest' }],
        missingTickers: ['000660'],
      },
    });
  });

  it('rejects Toss quote requests without valid 6-digit tickers', async () => {
    const app = Fastify({ logger: false });
    await app.register(marketRoutes, {
      service: {
        getSummary: vi.fn(),
      },
      tossQuoteService: {
        getQuoteBatch: vi.fn(),
      },
    });

    const res = await app.inject({ method: 'GET', url: '/market/toss/quotes?tickers=bad,A005930' });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'INVALID_TICKERS' },
    });
  });

  it('updates the bounded Toss fast quote current ticker set', async () => {
    const app = Fastify({ logger: false });
    const setCurrentTickers = vi.fn();
    await app.register(marketRoutes, {
      service: {
        getSummary: vi.fn(),
      },
      tossFastQuoteSelectionService: {
        setCurrentTickers,
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/market/toss/fast-quote/current',
      payload: { tickers: ['A005930', '0011T0', '000660'] },
    });

    expect(res.statusCode).toBe(200);
    expect(setCurrentTickers).toHaveBeenCalledWith(['005930', '000660']);
    expect(res.json()).toEqual({
      success: true,
      data: { tickers: ['005930', '000660'] },
    });
  });

  it('returns Toss public stock search results through a read-only route', async () => {
    const app = Fastify({ logger: false });
    const searchStocks = vi.fn(async () => ({
      providerId: 'toss-public' as const,
      fetchedAt: '2026-05-11T07:10:00.000Z',
      query: '삼성',
      requestedLimit: 8,
      returnedCount: 1,
      items: [
        {
          ticker: '005930',
          productCode: 'A005930',
          name: '삼성전자',
          market: 'KOSPI' as const,
          matchType: 'EXACT',
          source: 'toss-public-search' as const,
        },
      ],
    }));

    await app.register(marketRoutes, {
      service: {
        getSummary: vi.fn(),
      },
      tossSearchService: {
        searchStocks,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/market/toss/search?q=%EC%82%BC%EC%84%B1&limit=8',
    });

    expect(res.statusCode).toBe(200);
    expect(searchStocks).toHaveBeenCalledWith({ query: '삼성', limit: 8 });
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        providerId: 'toss-public',
        returnedCount: 1,
        items: [{ ticker: '005930', name: '삼성전자', market: 'KOSPI' }],
      },
    });
  });
});
