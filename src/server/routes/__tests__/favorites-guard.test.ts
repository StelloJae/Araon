import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { favoritesRoutes } from '../favorites.js';
import type { KisRuntimeRef } from '../../bootstrap-kis.js';

describe('/favorites — Toss-first fallback without KIS runtime', () => {
  it('returns local favorites on GET when runtime is not started', async () => {
    const app = Fastify({ logger: false });
    const runtimeRef: KisRuntimeRef = {
      get: vi.fn(() => ({ status: 'unconfigured' }) as never),
      start: vi.fn(),
      stop: vi.fn(),
      reset: vi.fn(),
    };
    const favorites = [
      { ticker: '005930', tier: 'polling' as const, addedAt: '2026-05-11T00:00:00.000Z' },
    ];
    await app.register(favoritesRoutes, {
      favoriteRepo: { findAll: () => favorites } as never,
      runtimeRef,
    });
    const res = await app.inject({ method: 'GET', url: '/favorites' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({ success: true, data: favorites });
  });

  it('adds a polling favorite when runtime is not started', async () => {
    const app = Fastify({ logger: false });
    const runtimeRef: KisRuntimeRef = {
      get: vi.fn(() => ({ status: 'unconfigured' }) as never),
      start: vi.fn(),
      stop: vi.fn(),
      reset: vi.fn(),
    };
    const upsert = vi.fn();
    await app.register(favoritesRoutes, {
      favoriteRepo: { findAll: () => [], upsert } as never,
      runtimeRef,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/favorites',
      payload: { ticker: '005930' },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).data).toEqual({ ticker: '005930', tier: 'polling' });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: '005930', tier: 'polling' }),
    );
  });

  it('removes a local favorite when runtime is not started', async () => {
    const app = Fastify({ logger: false });
    const runtimeRef: KisRuntimeRef = {
      get: vi.fn(() => ({ status: 'unconfigured' }) as never),
      start: vi.fn(),
      stop: vi.fn(),
      reset: vi.fn(),
    };
    const remove = vi.fn();
    await app.register(favoritesRoutes, {
      favoriteRepo: {
        findAll: () => [],
        findByTicker: () => ({ ticker: '005930', tier: 'polling', addedAt: '2026-05-11T00:00:00.000Z' }),
        delete: remove,
      } as never,
      runtimeRef,
    });
    const res = await app.inject({ method: 'DELETE', url: '/favorites/005930' });
    expect(res.statusCode).toBe(204);
    expect(remove).toHaveBeenCalledWith('005930');
  });
});
