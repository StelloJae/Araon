import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { watchlistRoutes } from '../watchlist.js';
import type { AraonWatchlistService } from '../../watchlist/araon-watchlist-service.js';

describe('watchlist routes', () => {
  it('returns normalized Araon watchlist payload', async () => {
    const service: AraonWatchlistService = {
      getWatchlist: vi.fn(async () => ({
        provider: 'araon-watchlist',
        fetchedAt: '2026-05-14T00:01:00.000Z',
        primarySource: 'toss',
        status: 'ready',
        warning: null,
        counts: { toss: 1, local: 0, merged: 0, returned: 1 },
        items: [{
          productCode: 'A005930',
          krTicker: '005930',
          symbol: '005930',
          name: '삼성전자',
          market: 'KOSPI',
          currency: 'KRW',
          source: 'toss',
          syncState: 'toss_synced',
          kisEligible: true,
          tossEligible: true,
          chartEligible: true,
          quoteEligible: true,
          realtimeTrackingState: 'waiting',
          addedAt: null,
          groupName: '관심',
          base: 70000,
          last: 71000,
        }],
      })),
      addItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const app = Fastify({ logger: false });
    await app.register(watchlistRoutes, { service });

    const res = await app.inject({ method: 'GET', url: '/watchlist' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        provider: 'araon-watchlist',
        items: [expect.objectContaining({ productCode: 'A005930' })],
      }),
    });
  });

  it('sanitizes unexpected route failures', async () => {
    const service: AraonWatchlistService = {
      getWatchlist: vi.fn(async () => {
        throw new Error('SESSION=raw');
      }),
      addItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const app = Fastify({ logger: false });
    await app.register(watchlistRoutes, { service });

    const res = await app.inject({ method: 'GET', url: '/watchlist' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      success: false,
      error: {
        code: 'WATCHLIST_READ_FAILED',
        message: 'Watchlist read failed',
      },
    });
    expect(res.body).not.toContain('SESSION');
  });

  it('adds a product-aware watchlist item through the normalized route', async () => {
    const service: AraonWatchlistService = {
      getWatchlist: vi.fn(),
      addItem: vi.fn(async () => ({
        provider: 'araon-watchlist',
        action: 'added',
        syncState: 'local_only',
        reason: 'local_fallback',
        item: {
          productCode: 'A005930',
          krTicker: '005930',
          symbol: '005930',
          name: '삼성전자',
          market: 'KOSPI',
          currency: 'KRW',
          source: 'local',
          syncState: 'local_only',
          kisEligible: true,
          tossEligible: true,
          chartEligible: true,
          quoteEligible: true,
          realtimeTrackingState: 'waiting',
          addedAt: '2026-05-14T00:01:00.000Z',
          groupName: null,
          base: null,
          last: null,
        },
      })),
      removeItem: vi.fn(),
    };
    const app = Fastify({ logger: false });
    await app.register(watchlistRoutes, { service });

    const res = await app.inject({
      method: 'POST',
      url: '/watchlist/items',
      payload: {
        productCode: 'A005930',
        krTicker: '005930',
        symbol: '005930',
        name: '삼성전자',
        market: 'KOSPI',
        currency: 'KRW',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(service.addItem).toHaveBeenCalledWith(expect.objectContaining({
      productCode: 'A005930',
      krTicker: '005930',
    }));
    expect(res.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        action: 'added',
        syncState: 'local_only',
      }),
    });
  });

  it('returns safe success for unsupported products without raw 400 leakage', async () => {
    const service: AraonWatchlistService = {
      getWatchlist: vi.fn(),
      addItem: vi.fn(async () => ({
        provider: 'araon-watchlist',
        action: 'unsupported',
        syncState: 'sync_unavailable',
        reason: 'unsupported_product',
        item: {
          productCode: 'A0011T0',
          krTicker: null,
          symbol: 'A0011T0',
          name: '채비',
          market: 'TOSS_ONLY',
          currency: 'KRW',
          source: 'toss',
          syncState: 'sync_unavailable',
          kisEligible: false,
          tossEligible: true,
          chartEligible: false,
          quoteEligible: true,
          realtimeTrackingState: 'not_eligible',
          addedAt: null,
          groupName: null,
          base: null,
          last: null,
        },
      })),
      removeItem: vi.fn(),
    };
    const app = Fastify({ logger: false });
    await app.register(watchlistRoutes, { service });

    const res = await app.inject({
      method: 'POST',
      url: '/watchlist/items',
      payload: {
        productCode: 'A0011T0',
        name: '채비',
        market: 'TOSS_ONLY',
        currency: 'KRW',
      },
    });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        action: 'unsupported',
        syncState: 'sync_unavailable',
      }),
    });
    expect(res.body).not.toContain('400 Bad Request');
  });

  it('removes a product-aware local fallback item', async () => {
    const service: AraonWatchlistService = {
      getWatchlist: vi.fn(),
      addItem: vi.fn(),
      removeItem: vi.fn(async () => ({
        provider: 'araon-watchlist',
        action: 'removed',
        syncState: 'local_only',
        reason: 'local_fallback',
        item: null,
      })),
    };
    const app = Fastify({ logger: false });
    await app.register(watchlistRoutes, { service });

    const res = await app.inject({
      method: 'DELETE',
      url: '/watchlist/items/A005930',
    });

    expect(res.statusCode).toBe(200);
    expect(service.removeItem).toHaveBeenCalledWith({ productCode: 'A005930' });
  });
});
