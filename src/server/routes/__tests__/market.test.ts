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
          },
          gainers: [],
          losers: [],
        })),
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
});
