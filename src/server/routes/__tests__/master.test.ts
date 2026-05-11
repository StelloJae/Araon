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
  it('promotes a Toss search stock into the local tracked catalog', async () => {
    const app = Fastify({ logger: false });
    const getStockByTicker = vi.fn(async () => ({
      ticker: '005930',
      productCode: 'A005930',
      name: '삼성전자',
      market: 'KOSPI' as const,
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
