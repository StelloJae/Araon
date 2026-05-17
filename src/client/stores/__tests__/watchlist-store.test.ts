import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  // No global side effects to clean up.
});

describe('useWatchlistStore.removeFavorite', () => {
  it('removes ticker when present', async () => {
    const { useWatchlistStore } = await import('../watchlist-store');
    const s = useWatchlistStore.getState();
    s.setFavorites(['005930', '000660']);

    useWatchlistStore.getState().removeFavorite('005930');

    const next = useWatchlistStore.getState().favorites;
    expect(next.has('005930')).toBe(false);
    expect(next.has('000660')).toBe(true);
  });

  it('is a no-op when ticker is not a favorite (state reference stable)', async () => {
    const { useWatchlistStore } = await import('../watchlist-store');
    const s = useWatchlistStore.getState();
    s.setFavorites(['000660']);
    const before = useWatchlistStore.getState().favorites;

    useWatchlistStore.getState().removeFavorite('005930');

    expect(useWatchlistStore.getState().favorites).toBe(before);
  });
});

describe('useWatchlistStore.setWatchlistItems', () => {
  it('preserves normalized sync metadata by UI code', async () => {
    const { useWatchlistStore } = await import('../watchlist-store');

    useWatchlistStore.getState().setWatchlistItems([
      {
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
        realtimeTrackingState: 'tracked',
        addedAt: null,
        groupName: '기본',
        base: null,
        last: null,
      },
      {
        productCode: 'A0011T0',
        krTicker: null,
        symbol: '0011T0',
        name: '채비',
        market: 'TOSS_ONLY',
        currency: 'KRW',
        source: 'toss',
        syncState: 'sync_unavailable',
        kisEligible: false,
        tossEligible: true,
        chartEligible: false,
        quoteEligible: false,
        realtimeTrackingState: 'not_eligible',
        addedAt: null,
        groupName: '기본',
        base: null,
        last: null,
      },
    ]);

    const state = useWatchlistStore.getState();
    expect(state.favorites.has('005930')).toBe(true);
    expect(state.favorites.has('0011T0')).toBe(true);
    expect(state.itemsByCode['005930']?.syncState).toBe('toss_synced');
    expect(state.itemsByCode['0011T0']?.kisEligible).toBe(false);
  });

  it('clears normalized metadata when legacy favorites are seeded', async () => {
    const { useWatchlistStore } = await import('../watchlist-store');
    useWatchlistStore.getState().setWatchlistItems([
      {
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
        realtimeTrackingState: 'tracked',
        addedAt: null,
        groupName: null,
        base: null,
        last: null,
      },
    ]);

    useWatchlistStore.getState().setFavorites(['000660']);

    const state = useWatchlistStore.getState();
    expect(state.favorites.has('000660')).toBe(true);
    expect(state.itemsByCode).toEqual({});
  });
});
