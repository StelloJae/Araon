import { describe, expect, it, vi } from 'vitest';

import {
  createAraonWatchlistService,
  type AraonWatchlistServiceOptions,
} from '../araon-watchlist-service.js';
import type { Favorite, Stock } from '@shared/types.js';
import type { TossWatchlistClient } from '../../toss/toss-watchlist-client.js';

function makeFavoriteRepo(favorites: Favorite[]): AraonWatchlistServiceOptions['favoriteRepo'] {
  return {
    findAll: vi.fn(() => favorites),
    findByTicker: vi.fn((ticker) =>
      favorites.find((favorite) => favorite.ticker === ticker) ?? null,
    ),
    upsert: vi.fn((favorite) => {
      const index = favorites.findIndex((item) => item.ticker === favorite.ticker);
      if (index >= 0) {
        favorites[index] = favorite;
      } else {
        favorites.push(favorite);
      }
    }),
    delete: vi.fn((ticker) => {
      const index = favorites.findIndex((item) => item.ticker === ticker);
      if (index >= 0) favorites.splice(index, 1);
    }),
  };
}

function makeStockRepo(stocks: Stock[]): AraonWatchlistServiceOptions['stockRepo'] {
  return {
    findByTicker: vi.fn((ticker) => stocks.find((stock) => stock.ticker === ticker) ?? null),
  };
}

describe('Araon watchlist service', () => {
  it('uses Toss watchlist as primary and marks local overlap as merged', async () => {
    const watchlistClient: TossWatchlistClient = {
      listWatchlist: vi.fn(async () => ({
        provider: 'toss',
        fetchedAt: '2026-05-14T00:00:00.000Z',
        groups: [],
        items: [{
          ref: 'watchlist-item-1',
          groupRef: 'watchlist-group-1',
          groupName: '관심',
          productCode: 'A005930',
          symbol: 'A005930',
          name: '삼성전자',
          currency: 'KRW',
          base: 70000,
          last: 71000,
        }],
      })),
    };
    const service = createAraonWatchlistService({
      watchlistClient,
      favoriteRepo: makeFavoriteRepo([
        { ticker: '005930', tier: 'realtime', addedAt: '2026-05-14T00:00:00.000Z' },
      ]),
      stockRepo: makeStockRepo([{ ticker: '005930', name: '삼성전자', market: 'KOSPI' }]),
      now: () => new Date('2026-05-14T00:01:00.000Z'),
    });

    const payload = await service.getWatchlist();

    expect(payload.primarySource).toBe('toss');
    expect(payload.status).toBe('ready');
    expect(payload.warning).toBeNull();
    expect(payload.counts).toEqual({ toss: 1, local: 1, merged: 1, returned: 1 });
    expect(payload.items[0]).toEqual(expect.objectContaining({
      productCode: 'A005930',
      krTicker: '005930',
      source: 'merged',
      syncState: 'toss_synced',
      kisEligible: true,
      realtimeTrackingState: 'waiting',
    }));
  });

  it('falls back to local favorites when Toss session is missing', async () => {
    const watchlistClient: TossWatchlistClient = {
      listWatchlist: vi.fn(async () => {
        throw new Error('Toss session is required');
      }),
    };
    const service = createAraonWatchlistService({
      watchlistClient,
      favoriteRepo: makeFavoriteRepo([
        { ticker: '000660', tier: 'polling', addedAt: '2026-05-14T00:00:00.000Z' },
      ]),
      stockRepo: makeStockRepo([{ ticker: '000660', name: 'SK하이닉스', market: 'KOSPI' }]),
      now: () => new Date('2026-05-14T00:01:00.000Z'),
    });

    const payload = await service.getWatchlist();

    expect(payload.primarySource).toBe('local');
    expect(payload.status).toBe('local_fallback');
    expect(payload.warning).toEqual({ code: 'TOSS_SESSION_REQUIRED' });
    expect(payload.items).toEqual([
      expect.objectContaining({
        productCode: 'A000660',
        krTicker: '000660',
        source: 'local',
        syncState: 'local_only',
      }),
    ]);
  });

  it('marks local-only rows as sync pending when Toss watchlist can be read', async () => {
    const watchlistClient: TossWatchlistClient = {
      listWatchlist: vi.fn(async () => ({
        provider: 'toss',
        fetchedAt: '2026-05-14T00:00:00.000Z',
        groups: [],
        items: [],
      })),
    };
    const service = createAraonWatchlistService({
      watchlistClient,
      favoriteRepo: makeFavoriteRepo([
        { ticker: '005930', tier: 'polling', addedAt: '2026-05-14T00:00:00.000Z' },
      ]),
      stockRepo: makeStockRepo([{ ticker: '005930', name: '삼성전자', market: 'KOSPI' }]),
      now: () => new Date('2026-05-14T00:01:00.000Z'),
    });

    const payload = await service.getWatchlist();

    expect(payload.primarySource).toBe('toss');
    expect(payload.items).toEqual([
      expect.objectContaining({
        productCode: 'A005930',
        source: 'local',
        syncState: 'sync_pending',
      }),
    ]);
  });

  it('does not leak raw Toss errors when Toss read fails', async () => {
    const watchlistClient: TossWatchlistClient = {
      listWatchlist: vi.fn(async () => {
        throw new Error('SESSION=raw parentListId=46533678');
      }),
    };
    const service = createAraonWatchlistService({
      watchlistClient,
      favoriteRepo: makeFavoriteRepo([]),
      stockRepo: makeStockRepo([]),
      now: () => new Date('2026-05-14T00:01:00.000Z'),
    });

    const payload = await service.getWatchlist();

    expect(payload.warning).toEqual({ code: 'TOSS_READ_FAILED' });
    expect(JSON.stringify(payload)).not.toContain('SESSION');
    expect(JSON.stringify(payload)).not.toContain('parentListId');
  });

  it('keeps Toss-only products out of KIS eligibility', async () => {
    const watchlistClient: TossWatchlistClient = {
      listWatchlist: vi.fn(async () => ({
        provider: 'toss',
        fetchedAt: '2026-05-14T00:00:00.000Z',
        groups: [],
        items: [{
          ref: 'watchlist-item-1',
          groupRef: 'watchlist-group-1',
          groupName: '관심',
          productCode: 'A0011T0',
          symbol: 'A0011T0',
          name: '채비',
          currency: 'KRW',
          base: 0,
          last: 0,
        }],
      })),
    };
    const service = createAraonWatchlistService({
      watchlistClient,
      favoriteRepo: makeFavoriteRepo([]),
      stockRepo: makeStockRepo([]),
      now: () => new Date('2026-05-14T00:01:00.000Z'),
    });

    const payload = await service.getWatchlist();

    expect(payload.items[0]).toEqual(expect.objectContaining({
      productCode: 'A0011T0',
      krTicker: null,
      market: 'TOSS_ONLY',
      syncState: 'toss_synced',
      kisEligible: false,
      realtimeTrackingState: 'not_eligible',
    }));
  });

  it('adds a KRX product as local fallback without live Toss mutation', async () => {
    const favorites: Favorite[] = [];
    const favoriteRepo = makeFavoriteRepo(favorites);
    const service = createAraonWatchlistService({
      watchlistClient: { listWatchlist: vi.fn(async () => {
        throw new Error('Toss session is required');
      }) },
      favoriteRepo,
      stockRepo: makeStockRepo([{ ticker: '005930', name: '삼성전자', market: 'KOSPI' }]),
      now: () => new Date('2026-05-14T00:01:00.000Z'),
    });

    const result = await service.addItem({
      productCode: 'A005930',
      krTicker: '005930',
      name: '삼성전자',
      market: 'KOSPI',
      currency: 'KRW',
    });

    expect(result).toEqual(expect.objectContaining({
      action: 'added',
      syncState: 'local_only',
      reason: 'local_fallback',
    }));
    expect(result.item).toEqual(expect.objectContaining({
      productCode: 'A005930',
      krTicker: '005930',
      kisEligible: true,
    }));
    expect(favoriteRepo.upsert).toHaveBeenCalledWith(expect.objectContaining({
      ticker: '005930',
      tier: 'polling',
    }));
  });

  it('adds a KRX product as sync pending when Toss read is available but mutation is disabled', async () => {
    const addProductToWatchlist = vi.fn();
    const favorites: Favorite[] = [];
    const favoriteRepo = makeFavoriteRepo(favorites);
    const service = createAraonWatchlistService({
      watchlistClient: { listWatchlist: vi.fn(async () => ({
        provider: 'toss',
        fetchedAt: '2026-05-14T00:00:00.000Z',
        groups: [],
        items: [],
      })), addProductToWatchlist },
      favoriteRepo,
      stockRepo: makeStockRepo([{ ticker: '005930', name: '삼성전자', market: 'KOSPI' }]),
      now: () => new Date('2026-05-14T00:01:00.000Z'),
    });

    const result = await service.addItem({
      productCode: 'A005930',
      krTicker: '005930',
      name: '삼성전자',
      market: 'KOSPI',
      currency: 'KRW',
    });

    expect(result).toEqual(expect.objectContaining({
      action: 'added',
      syncState: 'sync_pending',
      reason: 'toss_mutation_disabled',
    }));
    expect(result.item).toEqual(expect.objectContaining({
      productCode: 'A005930',
      syncState: 'sync_pending',
    }));
    expect(addProductToWatchlist).not.toHaveBeenCalled();
  });

  it('can sync a KRX product through mocked Toss mutation when explicitly enabled', async () => {
    const addProductToWatchlist = vi.fn(async () => ({
      provider: 'toss' as const,
      productCode: 'A005930',
      mutatedAt: '2026-05-14T00:01:00.000Z',
      action: 'added' as const,
    }));
    const favorites: Favorite[] = [];
    const favoriteRepo = makeFavoriteRepo(favorites);
    const service = createAraonWatchlistService({
      watchlistClient: {
        listWatchlist: vi.fn(),
        addProductToWatchlist,
      },
      enableTossWatchlistMutation: true,
      favoriteRepo,
      stockRepo: makeStockRepo([{ ticker: '005930', name: '삼성전자', market: 'KOSPI' }]),
      now: () => new Date('2026-05-14T00:01:00.000Z'),
    });

    const result = await service.addItem({
      productCode: 'A005930',
      krTicker: '005930',
      name: '삼성전자',
      market: 'KOSPI',
      currency: 'KRW',
    });

    expect(addProductToWatchlist).toHaveBeenCalledWith({ productCode: 'A005930' });
    expect(result).toEqual(expect.objectContaining({
      action: 'added',
      syncState: 'toss_synced',
      reason: 'toss_mutation_succeeded',
    }));
    expect(result.item).toEqual(expect.objectContaining({
      productCode: 'A005930',
      syncState: 'toss_synced',
    }));
  });

  it('can sync a Toss-only product through mocked Toss mutation without writing local favorites', async () => {
    const addProductToWatchlist = vi.fn(async () => ({
      provider: 'toss' as const,
      productCode: 'A0011T0',
      mutatedAt: '2026-05-14T00:01:00.000Z',
      action: 'added' as const,
    }));
    const favoriteRepo = makeFavoriteRepo([]);
    const service = createAraonWatchlistService({
      watchlistClient: {
        listWatchlist: vi.fn(),
        addProductToWatchlist,
      },
      enableTossWatchlistMutation: true,
      favoriteRepo,
      stockRepo: makeStockRepo([]),
    });

    const result = await service.addItem({
      productCode: 'A0011T0',
      symbol: '0011T0',
      name: '채비',
      market: 'TOSS_ONLY',
      currency: 'KRW',
    });

    expect(addProductToWatchlist).toHaveBeenCalledWith({ productCode: 'A0011T0' });
    expect(favoriteRepo.upsert).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      action: 'added',
      syncState: 'toss_synced',
      reason: 'toss_mutation_succeeded',
    }));
    expect(result.item).toEqual(expect.objectContaining({
      productCode: 'A0011T0',
      krTicker: null,
      kisEligible: false,
      realtimeTrackingState: 'not_eligible',
      syncState: 'toss_synced',
    }));
  });

  it('rejects Toss-only products without writing local favorites', async () => {
    const favoriteRepo = makeFavoriteRepo([]);
    const service = createAraonWatchlistService({
      watchlistClient: { listWatchlist: vi.fn() },
      favoriteRepo,
      stockRepo: makeStockRepo([]),
    });

    const result = await service.addItem({
      productCode: 'A0011T0',
      name: '채비',
      market: 'TOSS_ONLY',
      currency: 'KRW',
    });

    expect(result).toEqual(expect.objectContaining({
      action: 'unsupported',
      syncState: 'sync_unavailable',
      reason: 'unsupported_product',
    }));
    expect(result.item).toEqual(expect.objectContaining({
      productCode: 'A0011T0',
      krTicker: null,
      kisEligible: false,
    }));
    expect(favoriteRepo.upsert).not.toHaveBeenCalled();
  });

  it('removes only local fallback favorites while Toss mutation is disabled', async () => {
    const favorites: Favorite[] = [
      { ticker: '005930', tier: 'polling', addedAt: '2026-05-14T00:00:00.000Z' },
    ];
    const favoriteRepo = makeFavoriteRepo(favorites);
    const service = createAraonWatchlistService({
      watchlistClient: { listWatchlist: vi.fn() },
      favoriteRepo,
      stockRepo: makeStockRepo([{ ticker: '005930', name: '삼성전자', market: 'KOSPI' }]),
    });

    const result = await service.removeItem({ productCode: 'A005930' });

    expect(result).toEqual(expect.objectContaining({
      action: 'removed',
      syncState: 'local_only',
      reason: 'local_fallback',
    }));
    expect(favoriteRepo.delete).toHaveBeenCalledWith('005930');
  });

  it('can sync a KRX removal through mocked Toss mutation when explicitly enabled', async () => {
    const removeProductFromWatchlist = vi.fn(async () => ({
      provider: 'toss' as const,
      productCode: 'A005930',
      mutatedAt: '2026-05-14T00:01:00.000Z',
      action: 'removed' as const,
    }));
    const favorites: Favorite[] = [
      { ticker: '005930', tier: 'polling', addedAt: '2026-05-14T00:00:00.000Z' },
    ];
    const favoriteRepo = makeFavoriteRepo(favorites);
    const service = createAraonWatchlistService({
      watchlistClient: {
        listWatchlist: vi.fn(),
        removeProductFromWatchlist,
      },
      enableTossWatchlistMutation: true,
      favoriteRepo,
      stockRepo: makeStockRepo([{ ticker: '005930', name: '삼성전자', market: 'KOSPI' }]),
    });

    const result = await service.removeItem({ productCode: 'A005930' });

    expect(removeProductFromWatchlist).toHaveBeenCalledWith({ productCode: 'A005930' });
    expect(result).toEqual(expect.objectContaining({
      action: 'removed',
      syncState: 'toss_synced',
      reason: 'toss_mutation_succeeded',
    }));
    expect(favoriteRepo.delete).toHaveBeenCalledWith('005930');
  });

  it('can sync a Toss-only removal through mocked Toss mutation without touching local favorites', async () => {
    const removeProductFromWatchlist = vi.fn(async () => ({
      provider: 'toss' as const,
      productCode: 'A0011T0',
      mutatedAt: '2026-05-14T00:01:00.000Z',
      action: 'removed' as const,
    }));
    const favoriteRepo = makeFavoriteRepo([]);
    const service = createAraonWatchlistService({
      watchlistClient: {
        listWatchlist: vi.fn(),
        removeProductFromWatchlist,
      },
      enableTossWatchlistMutation: true,
      favoriteRepo,
      stockRepo: makeStockRepo([]),
    });

    const result = await service.removeItem({
      productCode: 'A0011T0',
      symbol: '0011T0',
      name: '채비',
      market: 'TOSS_ONLY',
      currency: 'KRW',
    });

    expect(removeProductFromWatchlist).toHaveBeenCalledWith({ productCode: 'A0011T0' });
    expect(favoriteRepo.delete).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      action: 'removed',
      syncState: 'toss_synced',
      reason: 'toss_mutation_succeeded',
      item: null,
    }));
  });
});
