/**
 * Unit tests for the /favorites routes.
 *
 * Happy-path tests wire a `runtimeRef` stub whose `get()` returns a `started`
 * state so the guard passes and the real handler logic runs.
 */

import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { favoritesRoutes } from '../favorites.js';
import type { KisRuntimeRef, KisRuntime } from '../../bootstrap-kis.js';
import type { FavoriteRepository } from '../../db/repositories.js';
import type { TierDiff, TierManager } from '../../realtime/tier-manager.js';
import { createTierManager } from '../../realtime/tier-manager.js';
import type { Favorite } from '@shared/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTierManager(overrides?: Partial<TierManager>): TierManager {
  return {
    addFavorite: vi.fn<(ticker: string) => TierDiff>().mockReturnValue({
      subscribe: [],
      unsubscribe: [],
    }),
    removeFavorite: vi.fn<(ticker: string) => TierDiff>().mockReturnValue({
      subscribe: [],
      unsubscribe: [],
    }),
    getAssignment: vi.fn().mockReturnValue({ realtimeTickers: [], pollingTickers: [] }),
    listFavorites: vi.fn().mockReturnValue([]),
    ...overrides,
  } as unknown as TierManager;
}

function makeBridge() {
  return { applyDiff: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) };
}

function makeFavoriteRepo(initial: Favorite[] = []): FavoriteRepository {
  const store = [...initial];
  return {
    findAll: vi.fn<() => Favorite[]>(() => [...store]),
    findByTicker: vi.fn<(t: string) => Favorite | null>(
      (t) => store.find((f) => f.ticker === t) ?? null,
    ),
    upsert: vi.fn<(f: Favorite) => void>((f) => {
      const idx = store.findIndex((x) => x.ticker === f.ticker);
      if (idx >= 0) store[idx] = f;
      else store.push(f);
    }),
    delete: vi.fn<(t: string) => void>((t) => {
      const idx = store.findIndex((f) => f.ticker === t);
      if (idx >= 0) store.splice(idx, 1);
    }),
  } as unknown as FavoriteRepository;
}

function makeStartedRef(
  tierManager: TierManager,
  bridge: ReturnType<typeof makeBridge>,
): KisRuntimeRef {
  return {
    get: () => ({
      status: 'started',
      runtime: { tierManager, bridge } as unknown as KisRuntime,
    }),
    start: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('GET /favorites', () => {
  it('returns empty list when repo is empty', async () => {
    const app = Fastify({ logger: false });
    const favoriteRepo = makeFavoriteRepo();
    const runtimeRef = makeStartedRef(makeTierManager(), makeBridge());
    await app.register(favoritesRoutes, { favoriteRepo, runtimeRef });

    const res = await app.inject({ method: 'GET', url: '/favorites' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: Favorite[] };
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns existing favorites', async () => {
    const existing: Favorite[] = [
      { ticker: '005930', tier: 'realtime', addedAt: '2024-01-01T00:00:00.000Z' },
    ];
    const app = Fastify({ logger: false });
    const favoriteRepo = makeFavoriteRepo(existing);
    const runtimeRef = makeStartedRef(
      makeTierManager({ listFavorites: vi.fn().mockReturnValue(existing) }),
      makeBridge(),
    );
    await app.register(favoritesRoutes, { favoriteRepo, runtimeRef });

    const res = await app.inject({ method: 'GET', url: '/favorites' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: Favorite[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.ticker).toBe('005930');
  });

  it('returns current tier-manager tiers instead of stale repository tiers', async () => {
    const existing: Favorite[] = [
      { ticker: '000001', tier: 'realtime', addedAt: '2026-01-01T00:00:00.000Z' },
      { ticker: '000002', tier: 'realtime', addedAt: '2026-01-02T00:00:00.000Z' },
      { ticker: '000003', tier: 'realtime', addedAt: '2026-01-03T00:00:00.000Z' },
      { ticker: '000004', tier: 'realtime', addedAt: '2026-01-04T00:00:00.000Z' },
    ];
    const app = Fastify({ logger: false });
    const favoriteRepo = makeFavoriteRepo(existing);
    const runtimeRef = makeStartedRef(
      createTierManager({ cap: 3, initialFavorites: existing }),
      makeBridge(),
    );
    await app.register(favoritesRoutes, { favoriteRepo, runtimeRef });

    const res = await app.inject({ method: 'GET', url: '/favorites' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: Favorite[] };
    expect(body.data.map((favorite) => [favorite.ticker, favorite.tier])).toEqual([
      ['000001', 'realtime'],
      ['000002', 'realtime'],
      ['000003', 'realtime'],
      ['000004', 'polling'],
    ]);
    expect(favoriteRepo.findByTicker('000004')?.tier).toBe('polling');
  });
});

describe('POST /favorites', () => {
  it('returns 400 on invalid ticker', async () => {
    const app = Fastify({ logger: false });
    const favoriteRepo = makeFavoriteRepo();
    const runtimeRef = makeStartedRef(makeTierManager(), makeBridge());
    await app.register(favoritesRoutes, { favoriteRepo, runtimeRef });

    const res = await app.inject({
      method: 'POST',
      url: '/favorites',
      payload: { ticker: 'INVALID' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('adds a favorite and calls bridge.applyDiff', async () => {
    const app = Fastify({ logger: false });
    const favoriteRepo = makeFavoriteRepo();
    const bridge = makeBridge();
    const tierManager = makeTierManager();
    const runtimeRef = makeStartedRef(tierManager, bridge);
    await app.register(favoritesRoutes, { favoriteRepo, runtimeRef });

    const res = await app.inject({
      method: 'POST',
      url: '/favorites',
      payload: { ticker: '005930' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { success: boolean; data: { ticker: string; tier: string } };
    expect(body.success).toBe(true);
    expect(body.data.ticker).toBe('005930');
    expect(bridge.applyDiff).toHaveBeenCalledOnce();
  });

  it('accepts an overflow favorite as polling without a WS subscribe diff', async () => {
    const initial: Favorite[] = [
      { ticker: '000001', tier: 'realtime', addedAt: '2026-01-01T00:00:00.000Z' },
      { ticker: '000002', tier: 'realtime', addedAt: '2026-01-02T00:00:00.000Z' },
      { ticker: '000003', tier: 'realtime', addedAt: '2026-01-03T00:00:00.000Z' },
    ];
    const app = Fastify({ logger: false });
    const favoriteRepo = makeFavoriteRepo(initial);
    const bridge = makeBridge();
    const tierManager = createTierManager({
      cap: 3,
      initialFavorites: initial,
    });
    const runtimeRef = makeStartedRef(tierManager, bridge);
    await app.register(favoritesRoutes, { favoriteRepo, runtimeRef });

    const res = await app.inject({
      method: 'POST',
      url: '/favorites',
      payload: { ticker: '000004' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { success: boolean; data: { ticker: string; tier: string } };
    expect(body.data).toEqual({ ticker: '000004', tier: 'polling' });
    expect(bridge.applyDiff).toHaveBeenCalledWith({
      subscribe: [],
      unsubscribe: [],
    });
    expect(favoriteRepo.findByTicker('000004')?.tier).toBe('polling');
  });
});

describe('DELETE /favorites/:ticker', () => {
  it('returns 404 when ticker does not exist', async () => {
    const app = Fastify({ logger: false });
    const favoriteRepo = makeFavoriteRepo();
    const runtimeRef = makeStartedRef(makeTierManager(), makeBridge());
    await app.register(favoritesRoutes, { favoriteRepo, runtimeRef });

    const res = await app.inject({ method: 'DELETE', url: '/favorites/005930' });
    expect(res.statusCode).toBe(404);
  });

  it('removes the favorite and calls bridge.applyDiff', async () => {
    const existing: Favorite[] = [
      { ticker: '005930', tier: 'realtime', addedAt: '2024-01-01T00:00:00.000Z' },
    ];
    const app = Fastify({ logger: false });
    const favoriteRepo = makeFavoriteRepo(existing);
    const bridge = makeBridge();
    const runtimeRef = makeStartedRef(makeTierManager(), bridge);
    await app.register(favoritesRoutes, { favoriteRepo, runtimeRef });

    const res = await app.inject({ method: 'DELETE', url: '/favorites/005930' });
    expect(res.statusCode).toBe(204);
    expect(bridge.applyDiff).toHaveBeenCalledOnce();
  });

  it('promotes the next polling favorite and persists its realtime tier', async () => {
    const existing: Favorite[] = [
      { ticker: '000001', tier: 'realtime', addedAt: '2026-01-01T00:00:00.000Z' },
      { ticker: '000002', tier: 'realtime', addedAt: '2026-01-02T00:00:00.000Z' },
      { ticker: '000003', tier: 'realtime', addedAt: '2026-01-03T00:00:00.000Z' },
      { ticker: '000004', tier: 'polling', addedAt: '2026-01-04T00:00:00.000Z' },
    ];
    const app = Fastify({ logger: false });
    const favoriteRepo = makeFavoriteRepo(existing);
    const bridge = makeBridge();
    const tierManager = createTierManager({
      cap: 3,
      initialFavorites: existing,
    });
    const runtimeRef = makeStartedRef(tierManager, bridge);
    await app.register(favoritesRoutes, { favoriteRepo, runtimeRef });

    const res = await app.inject({ method: 'DELETE', url: '/favorites/000002' });

    expect(res.statusCode).toBe(204);
    expect(bridge.applyDiff).toHaveBeenCalledWith({
      subscribe: ['000004'],
      unsubscribe: ['000002'],
    });
    expect(favoriteRepo.findByTicker('000004')?.tier).toBe('realtime');
  });
});
