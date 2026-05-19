import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { masterRoutes } from '../master.js';

function makeMasterRouteDeps(overrides: Record<string, unknown> = {}) {
  return {
    service: {
      list: vi.fn(() => ({
        items: [],
        refreshedAt: null,
        rowCount: 0,
        fresh: false,
        stale: false,
      })),
      status: vi.fn(),
      refresh: vi.fn(),
      maybeRefreshOnBoot: vi.fn(),
    },
    masterRepo: {
      findOne: vi.fn(),
    },
    stockRepo: {
      findByTicker: vi.fn(() => null),
      bulkUpsert: vi.fn(async () => undefined),
    },
    credentialStore: {
      load: vi.fn(async () => null),
    },
    ...overrides,
  };
}

describe('master routes', () => {
  it('blocks KIS master refresh without credentials and does not call the upstream fetcher', async () => {
    const app = Fastify({ logger: false });
    const deps = makeMasterRouteDeps();

    await app.register(masterRoutes, deps as never);

    const res = await app.inject({ method: 'POST', url: '/master/refresh' });

    expect(res.statusCode).toBe(409);
    expect(deps.credentialStore.load).toHaveBeenCalledTimes(1);
    expect(deps.service.refresh).not.toHaveBeenCalled();
    expect(res.json()).toEqual({
      success: false,
      error: {
        code: 'MASTER_REFRESH_REQUIRES_CREDENTIALS',
        message: 'Legacy KIS master refresh is optional and requires KIS credentials',
      },
    });
  });

  it('promotes a Toss search stock into the local tracked catalog', async () => {
    const app = Fastify({ logger: false });
    const getStockByTicker = vi.fn(async () => ({
      ticker: '005930',
      productCode: 'A005930',
      krTicker: '005930',
      name: '삼성전자',
      market: 'KOSPI' as const,
      tossEligible: true,
      kisEligible: true,
      chartEligible: true,
      quoteEligible: true,
      matchType: null,
      source: 'toss-public-search' as const,
    }));
    const deps = makeMasterRouteDeps({
      tossStockLookup: { getStockByTicker },
    });

    await app.register(masterRoutes, deps as never);

    const res = await app.inject({
      method: 'POST',
      url: '/stocks/from-toss-search',
      payload: { ticker: '005930' },
    });

    expect(res.statusCode).toBe(201);
    expect(getStockByTicker).toHaveBeenCalledWith({ ticker: '005930' });
    expect(deps.stockRepo.bulkUpsert).toHaveBeenCalledWith([
      { ticker: '005930', name: '삼성전자', market: 'KOSPI' },
    ]);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        stock: { ticker: '005930', name: '삼성전자', market: 'KOSPI' },
        created: true,
        source: 'toss-public-search',
      },
    });
  });

  it('normalizes A-prefixed Toss product codes before adding a searched stock', async () => {
    const app = Fastify({ logger: false });
    const getStockByTicker = vi.fn(async () => ({
      ticker: '005930',
      productCode: 'A005930',
      krTicker: '005930',
      name: '삼성전자',
      market: 'KOSPI' as const,
      tossEligible: true,
      kisEligible: true,
      chartEligible: true,
      quoteEligible: true,
      matchType: null,
      source: 'toss-public-search' as const,
    }));
    const deps = makeMasterRouteDeps({
      tossStockLookup: { getStockByTicker },
    });

    await app.register(masterRoutes, deps as never);

    const res = await app.inject({
      method: 'POST',
      url: '/stocks/from-toss-search',
      payload: { ticker: 'A005930' },
    });

    expect(res.statusCode).toBe(201);
    expect(getStockByTicker).toHaveBeenCalledWith({ ticker: '005930' });
    expect(deps.stockRepo.bulkUpsert).toHaveBeenCalledWith([
      { ticker: '005930', name: '삼성전자', market: 'KOSPI' },
    ]);
  });

  it('rejects Toss-only product codes before they enter local KIS-backed catalog promotion', async () => {
    const app = Fastify({ logger: false });
    const getStockByTicker = vi.fn();
    const deps = makeMasterRouteDeps({
      tossStockLookup: { getStockByTicker },
    });

    await app.register(masterRoutes, deps as never);

    const res = await app.inject({
      method: 'POST',
      url: '/stocks/from-toss-search',
      payload: { ticker: '0011T0' },
    });

    expect(res.statusCode).toBe(409);
    expect(getStockByTicker).not.toHaveBeenCalled();
    expect(deps.stockRepo.bulkUpsert).not.toHaveBeenCalled();
    expect(res.json()).toMatchObject({
      success: false,
      error: {
        code: 'TOSS_ONLY_PRODUCT_NOT_TRACKABLE',
      },
    });
  });

  it('does not expose raw upstream details when Toss lookup fails', async () => {
    const app = Fastify({ logger: false });
    const deps = makeMasterRouteDeps({
      tossStockLookup: {
        getStockByTicker: vi.fn(async () => {
          throw new Error('raw upstream body with cookie placeholder');
        }),
      },
    });

    await app.register(masterRoutes, deps as never);

    const res = await app.inject({
      method: 'POST',
      url: '/stocks/from-toss-search',
      payload: { ticker: '005930' },
    });

    expect(res.statusCode).toBe(502);
    expect(JSON.stringify(res.json())).not.toContain('cookie placeholder');
    expect(res.json()).toMatchObject({
      success: false,
      error: {
        code: 'TOSS_STOCK_LOOKUP_FAILED',
      },
    });
  });
});
