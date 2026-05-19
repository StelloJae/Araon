import { describe, expect, it, vi } from 'vitest';

import {
  createAraonWatchlistService,
  type AraonWatchlistServiceOptions,
} from '../araon-watchlist-service.js';
import type { Favorite, Stock } from '@shared/types.js';
import type { TossWatchlistClient } from '../../toss/toss-watchlist-client.js';
import type { TossPortfolioPosition, TossPortfolioPositionsPayload } from '../../toss/toss-portfolio-client.js';

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

function makeProvenanceRepo(records: Array<{ productCode: string; krTicker: string | null }> = []):
  NonNullable<AraonWatchlistServiceOptions['watchlistProvenanceRepo']> {
  return {
    findActiveHoldingAuto: vi.fn(() => records),
    markHoldingAutoActive: vi.fn((input) => {
      const index = records.findIndex((record) => record.productCode === input.productCode);
      const next = { productCode: input.productCode, krTicker: input.krTicker };
      if (index >= 0) {
        records[index] = next;
      } else {
        records.push(next);
      }
    }),
    markRemoved: vi.fn((productCode) => {
      const index = records.findIndex((record) => record.productCode === productCode);
      if (index >= 0) records.splice(index, 1);
    }),
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
    expect(payload.counts).toEqual({ toss: 1, positions: 0, local: 1, merged: 1, returned: 1 });
    expect(payload.items[0]).toEqual(expect.objectContaining({
      productCode: 'A005930',
      krTicker: '005930',
      source: 'merged',
      syncState: 'toss_synced',
      kisEligible: true,
      realtimeTrackingState: 'waiting',
    }));
  });

  it('hydrates Toss watchlist-only KR rows from the price store', async () => {
    const watchlistClient: TossWatchlistClient = {
      listWatchlist: vi.fn(async () => ({
        provider: 'toss',
        fetchedAt: '2026-05-14T00:00:00.000Z',
        groups: [],
        items: [{
          ref: 'watchlist-item-1',
          groupRef: 'watchlist-group-1',
          groupName: '관심',
          productCode: 'A129920',
          symbol: '129920',
          name: '대성하이텍',
          currency: 'KRW',
          base: 0,
          last: 0,
        }],
      })),
    };
    const service = createAraonWatchlistService({
      watchlistClient,
      favoriteRepo: makeFavoriteRepo([]),
      stockRepo: makeStockRepo([{ ticker: '129920', name: '대성하이텍', market: 'KOSDAQ' }]),
      priceStore: {
        getPrice: vi.fn(() => ({
          ticker: '129920',
          price: 9300,
          changeRate: -13.57,
          changeAbs: -1450,
          volume: 100,
          updatedAt: '2026-05-14T00:00:01.000Z',
          isSnapshot: false,
          source: 'toss-fast-quote',
        })),
      },
      now: () => new Date('2026-05-14T00:01:00.000Z'),
    });

    const payload = await service.getWatchlist();

    expect(payload.items[0]).toEqual(expect.objectContaining({
      productCode: 'A129920',
      krTicker: '129920',
      membershipSource: 'toss_watchlist',
      last: 9300,
      changePct: -13.57,
    }));
    expect(payload.items[0]?.base).toBeCloseTo(9300 / (1 - 0.1357), 6);
  });

  it('hydrates Toss-only watchlist rows from the productCode price store key', async () => {
    const getPrice = vi.fn((key: string) =>
      key === 'US19970515001'
        ? {
            ticker: 'US19970515001',
            price: 188.1,
            changeRate: 1.2,
            changeAbs: 2.2,
            volume: 100,
            updatedAt: '2026-05-14T00:00:01.000Z',
            isSnapshot: false,
            source: 'toss-fast-quote' as const,
          }
        : undefined,
    );
    const watchlistClient: TossWatchlistClient = {
      listWatchlist: vi.fn(async () => ({
        provider: 'toss',
        fetchedAt: '2026-05-14T00:00:00.000Z',
        groups: [],
        items: [{
          ref: 'watchlist-item-us-1',
          groupRef: 'watchlist-group-1',
          groupName: '관심',
          productCode: 'US19970515001',
          symbol: 'AMZN',
          name: '아마존',
          currency: 'USD',
          base: 0,
          last: 0,
        }],
      })),
    };
    const service = createAraonWatchlistService({
      watchlistClient,
      favoriteRepo: makeFavoriteRepo([]),
      stockRepo: makeStockRepo([]),
      priceStore: { getPrice },
      now: () => new Date('2026-05-14T00:01:00.000Z'),
    });

    const payload = await service.getWatchlist();

    expect(getPrice).toHaveBeenCalledWith('US19970515001');
    expect(payload.items[0]).toEqual(expect.objectContaining({
      productCode: 'US19970515001',
      krTicker: null,
      symbol: 'AMZN',
      market: 'US',
      kisEligible: false,
      quoteEligible: true,
      realtimeTrackingState: 'not_eligible',
      last: 188.1,
      changePct: 1.2,
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

  it('includes Toss portfolio holdings in the normalized watch surface', async () => {
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
          symbol: '005930',
          name: '삼성전자',
          currency: 'KRW',
          base: 70000,
          last: 71000,
        }],
      })),
    };
    const portfolioSnapshot: TossPortfolioPositionsPayload = {
      provider: 'toss',
      fetchedAt: '2026-05-14T00:00:00.000Z',
      positions: [
        portfolioPosition({
          productCode: 'A005930',
          symbol: '005930',
          name: '삼성전자',
          currentPrice: 71_500,
        }),
        portfolioPosition({
          productCode: 'A000660',
          symbol: '000660',
          name: 'SK하이닉스',
          currentPrice: 182_000,
        }),
      ],
    };
    const service = createAraonWatchlistService({
      watchlistClient,
      favoriteRepo: makeFavoriteRepo([]),
      stockRepo: makeStockRepo([
        { ticker: '005930', name: '삼성전자', market: 'KOSPI' },
        { ticker: '000660', name: 'SK하이닉스', market: 'KOSPI' },
      ]),
      portfolioPositions: { snapshot: () => portfolioSnapshot },
      now: () => new Date('2026-05-14T00:01:00.000Z'),
    });

    const payload = await service.getWatchlist();

    expect(payload.counts).toEqual({ toss: 1, positions: 2, local: 0, merged: 1, returned: 2 });
    expect(payload.items).toEqual([
      expect.objectContaining({
        productCode: 'A005930',
        source: 'merged',
        watchlistMember: true,
        membershipSource: 'toss_watchlist',
        autoSyncedFromHolding: false,
        holding: true,
        last: 71500,
      }),
      expect.objectContaining({
        productCode: 'A000660',
        krTicker: '000660',
        source: 'toss_position',
        syncState: 'sync_pending',
        watchlistMember: false,
        membershipSource: 'holding_auto',
        manualWatchlist: false,
        autoSyncedFromHolding: true,
        holding: true,
        last: 182000,
      }),
    ]);
    expect(JSON.stringify(payload)).not.toContain('account');
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

  it('previews held products missing from Toss watchlist as reconcile add candidates', async () => {
    const portfolioSnapshot: TossPortfolioPositionsPayload = {
      provider: 'toss',
      fetchedAt: '2026-05-18T00:00:00.000Z',
      positions: [
        portfolioPosition({
          productCode: 'A005930',
          symbol: '005930',
          name: '삼성전자',
        }),
      ],
    };
    const addProductToWatchlist = vi.fn();
    const service = createAraonWatchlistService({
      watchlistClient: {
        listWatchlist: vi.fn(async () => ({
          provider: 'toss',
          fetchedAt: '2026-05-18T00:00:00.000Z',
          groups: [],
          items: [],
        })),
        addProductToWatchlist,
      },
      favoriteRepo: makeFavoriteRepo([]),
      stockRepo: makeStockRepo([{ ticker: '005930', name: '삼성전자', market: 'KOSPI' }]),
      portfolioPositions: { snapshot: () => portfolioSnapshot },
      now: () => new Date('2026-05-18T00:01:00.000Z'),
    });

    const result = await service.reconcileHoldingsWithTossWatchlist({ dryRun: true });

    expect(addProductToWatchlist).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      dryRun: true,
      status: 'preview',
      counts: expect.objectContaining({ addCandidates: 1, attempted: 0 }),
      addCandidates: [expect.objectContaining({
        productCode: 'A005930',
        krTicker: '005930',
        name: '삼성전자',
        reason: 'holding_missing_in_toss_watchlist',
      })],
    }));
  });

  it('previews local favorites missing from Toss watchlist as reconcile add candidates', async () => {
    const service = createAraonWatchlistService({
      watchlistClient: {
        listWatchlist: vi.fn(async () => ({
          provider: 'toss',
          fetchedAt: '2026-05-18T00:00:00.000Z',
          groups: [],
          items: [],
        })),
      },
      favoriteRepo: makeFavoriteRepo([
        { ticker: '129920', tier: 'realtime', addedAt: '2026-05-18T00:00:00.000Z' },
      ]),
      stockRepo: makeStockRepo([{ ticker: '129920', name: '대성하이텍', market: 'KOSDAQ' }]),
      now: () => new Date('2026-05-18T00:01:00.000Z'),
    });

    const result = await service.reconcileHoldingsWithTossWatchlist({ dryRun: true });

    expect(result).toEqual(expect.objectContaining({
      dryRun: true,
      status: 'preview',
      counts: expect.objectContaining({ addCandidates: 1, attempted: 0 }),
      addCandidates: [expect.objectContaining({
        productCode: 'A129920',
        krTicker: '129920',
        name: '대성하이텍',
        reason: 'local_favorite_missing_in_toss_watchlist',
      })],
    }));
  });

  it('applies bounded holding auto-add and records provenance when mutation is enabled', async () => {
    const addProductToWatchlist = vi.fn(async () => ({
      provider: 'toss' as const,
      productCode: 'A005930',
      mutatedAt: '2026-05-18T00:01:00.000Z',
      action: 'added' as const,
    }));
    const listWatchlist = vi.fn(async () => ({
      provider: 'toss' as const,
      fetchedAt: '2026-05-18T00:00:00.000Z',
      groups: [],
      items: [],
    }));
    const provenanceRepo = makeProvenanceRepo();
    const service = createAraonWatchlistService({
      watchlistClient: {
        listWatchlist,
        addProductToWatchlist,
        removeProductFromWatchlist: vi.fn(),
      },
      enableTossWatchlistMutation: true,
      favoriteRepo: makeFavoriteRepo([]),
      stockRepo: makeStockRepo([{ ticker: '005930', name: '삼성전자', market: 'KOSPI' }]),
      portfolioPositions: {
        snapshot: () => ({
          provider: 'toss',
          fetchedAt: '2026-05-18T00:00:00.000Z',
          positions: [portfolioPosition({ productCode: 'A005930', symbol: '005930' })],
        }),
      },
      watchlistProvenanceRepo: provenanceRepo,
      now: () => new Date('2026-05-18T00:01:00.000Z'),
    });

    const result = await service.reconcileHoldingsWithTossWatchlist({
      dryRun: false,
      maxMutations: 1,
    });

    expect(addProductToWatchlist).toHaveBeenCalledWith({ productCode: 'A005930' });
    expect(provenanceRepo.markHoldingAutoActive).toHaveBeenCalledWith({
      productCode: 'A005930',
      krTicker: '005930',
      now: '2026-05-18T00:01:00.000Z',
    });
    expect(listWatchlist).toHaveBeenCalledTimes(2);
    expect(result).toEqual(expect.objectContaining({
      status: 'applied',
      counts: expect.objectContaining({ addCandidates: 1, attempted: 1, added: 1 }),
    }));
  });

  it('removes only previously auto-added holdings that are no longer held', async () => {
    const removeProductFromWatchlist = vi.fn(async () => ({
      provider: 'toss' as const,
      productCode: 'A000660',
      mutatedAt: '2026-05-18T00:01:00.000Z',
      action: 'removed' as const,
    }));
    const provenanceRepo = makeProvenanceRepo([
      { productCode: 'A000660', krTicker: '000660' },
      { productCode: 'A005930', krTicker: '005930' },
    ]);
    const service = createAraonWatchlistService({
      watchlistClient: {
        listWatchlist: vi.fn(async () => ({
          provider: 'toss',
          fetchedAt: '2026-05-18T00:00:00.000Z',
          groups: [],
          items: [
            watchlistItem('A000660', '000660', 'SK하이닉스'),
            watchlistItem('A005930', '005930', '삼성전자'),
            watchlistItem('A035720', '035720', '카카오'),
          ],
        })),
        addProductToWatchlist: vi.fn(),
        removeProductFromWatchlist,
      },
      enableTossWatchlistMutation: true,
      favoriteRepo: makeFavoriteRepo([
        { ticker: '005930', tier: 'polling', addedAt: '2026-05-18T00:00:00.000Z' },
      ]),
      stockRepo: makeStockRepo([
        { ticker: '000660', name: 'SK하이닉스', market: 'KOSPI' },
        { ticker: '005930', name: '삼성전자', market: 'KOSPI' },
        { ticker: '035720', name: '카카오', market: 'KOSPI' },
      ]),
      portfolioPositions: {
        snapshot: () => ({
          provider: 'toss',
          fetchedAt: '2026-05-18T00:00:00.000Z',
          positions: [],
        }),
      },
      watchlistProvenanceRepo: provenanceRepo,
      now: () => new Date('2026-05-18T00:01:00.000Z'),
    });

    const result = await service.reconcileHoldingsWithTossWatchlist({
      dryRun: false,
      maxMutations: 5,
    });

    expect(removeProductFromWatchlist).toHaveBeenCalledTimes(1);
    expect(removeProductFromWatchlist).toHaveBeenCalledWith({ productCode: 'A000660' });
    expect(provenanceRepo.markRemoved).toHaveBeenCalledWith(
      'A000660',
      '2026-05-18T00:01:00.000Z',
    );
    expect(result.removeCandidates).toEqual([
      expect.objectContaining({ productCode: 'A000660', reason: 'auto_holding_no_longer_held' }),
    ]);
    expect(JSON.stringify(result)).not.toContain('watchlist-item');
  });
});

function watchlistItem(
  productCode: string,
  symbol: string,
  name: string,
) {
  return {
    ref: `watchlist-item-${productCode}`,
    groupRef: 'watchlist-group-1',
    groupName: '관심',
    productCode,
    symbol,
    name,
    currency: 'KRW',
    base: 70_000,
    last: 71_000,
  };
}

function portfolioPosition(
  overrides: Partial<TossPortfolioPosition> = {},
): TossPortfolioPosition {
  return {
    productCode: 'A005930',
    symbol: '005930',
    name: '삼성전자',
    marketType: 'KR',
    marketCode: 'KRX',
    quantity: 1,
    averagePrice: 70_000,
    currentPrice: 71_000,
    marketValue: 71_000,
    unrealizedPnl: 1_000,
    profitRate: 1.4,
    dailyProfitLoss: 500,
    dailyProfitRate: 0.7,
    averagePriceUsd: 0,
    currentPriceUsd: 0,
    marketValueUsd: 0,
    unrealizedPnlUsd: 0,
    profitRateUsd: 0,
    dailyProfitLossUsd: 0,
    dailyProfitRateUsd: 0,
    ...overrides,
  };
}
