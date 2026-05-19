import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { tossWatchlistRoutes } from '../toss-watchlist.js';
import type { TossWatchlistClient } from '../../toss/toss-watchlist-client.js';

describe('toss watchlist routes', () => {
  it('returns sanitized Toss watchlist groups through a read-only route', async () => {
    const watchlistClient: TossWatchlistClient = {
      listWatchlist: vi.fn(async () => ({
        provider: 'toss',
        fetchedAt: '2026-05-11T06:45:00.000Z',
        groups: [{
          ref: 'watchlist-group-1',
          name: '관심 그룹',
          items: [{
            ref: 'watchlist-item-1',
            groupRef: 'watchlist-group-1',
            groupName: '관심 그룹',
            productCode: 'A005930',
            symbol: 'A005930',
            name: '삼성전자',
            currency: 'KRW',
            base: 70000,
            last: 71000,
          }],
        }],
        items: [{
          ref: 'watchlist-item-1',
          groupRef: 'watchlist-group-1',
          groupName: '관심 그룹',
          productCode: 'A005930',
          symbol: 'A005930',
          name: '삼성전자',
          currency: 'KRW',
          base: 70000,
          last: 71000,
        }],
      })),
    };
    const app = Fastify({ logger: false });
    await app.register(tossWatchlistRoutes, { watchlistClient });

    const res = await app.inject({ method: 'GET', url: '/toss/watchlist' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        provider: 'toss',
        items: [expect.objectContaining({ ref: 'watchlist-item-1' })],
      }),
    });
    expect(res.body).not.toContain('parentListId');
    expect(res.body).not.toContain('46533678');
  });

  it('maps missing Toss session to 503 without leaking internals', async () => {
    const watchlistClient: TossWatchlistClient = {
      listWatchlist: vi.fn(async () => {
        throw new Error('Toss session is required');
      }),
    };
    const app = Fastify({ logger: false });
    await app.register(tossWatchlistRoutes, { watchlistClient });

    const res = await app.inject({ method: 'GET', url: '/toss/watchlist' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      success: false,
      error: { code: 'TOSS_SESSION_REQUIRED' },
    });
  });

  it('sanitizes unexpected Toss watchlist failures', async () => {
    const watchlistClient: TossWatchlistClient = {
      listWatchlist: vi.fn(async () => {
        throw new Error('raw Toss watchlist response SESSION=[test-session] parentListId=46533678');
      }),
    };
    const app = Fastify({ logger: false });
    await app.register(tossWatchlistRoutes, { watchlistClient });

    const res = await app.inject({ method: 'GET', url: '/toss/watchlist' });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({
      success: false,
      error: {
        code: 'TOSS_READ_REQUEST_FAILED',
        message: 'Toss read request failed',
      },
    });
    expect(res.body).not.toContain(['SESSION', ''].join('='));
    expect(res.body).not.toContain('[test-session]');
    expect(res.body).not.toContain('parentListId');
  });
});
