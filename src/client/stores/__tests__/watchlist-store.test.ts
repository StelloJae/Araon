import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AraonWatchlistItem } from '../../lib/api-client';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  // No global side effects to clean up.
});

function watchlistItem(overrides: Partial<AraonWatchlistItem> = {}): AraonWatchlistItem {
  return {
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
    watchSurfaceMember: true,
    watchlistMember: true,
    membershipSource: 'toss_watchlist',
    manualWatchlist: true,
    autoSyncedFromHolding: false,
    localFallback: false,
    holding: false,
    addedAt: null,
    groupName: null,
    base: null,
    last: null,
    ...overrides,
  };
}

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

  it('removes watchlist membership but keeps held rows on the watch surface', async () => {
    const { useWatchlistStore } = await import('../watchlist-store');
    useWatchlistStore.getState().setWatchlistItems([
      watchlistItem({
        productCode: 'A005930',
        krTicker: '005930',
        symbol: '005930',
        name: '삼성전자',
        source: 'merged',
        watchlistMember: true,
        membershipSource: 'merged',
        manualWatchlist: true,
        autoSyncedFromHolding: false,
        holding: true,
      }),
    ]);

    useWatchlistStore.getState().removeFavorite('005930');

    const state = useWatchlistStore.getState();
    expect(state.favorites.has('005930')).toBe(true);
    expect(state.watchlistMembers.has('005930')).toBe(false);
    expect(state.itemsByCode['005930']).toEqual(expect.objectContaining({
      holding: true,
      watchlistMember: false,
      membershipSource: 'holding_auto',
      manualWatchlist: false,
      autoSyncedFromHolding: true,
    }));
  });
});

describe('useWatchlistStore.setWatchlistItems', () => {
  it('preserves normalized sync metadata by UI code', async () => {
    const { useWatchlistStore } = await import('../watchlist-store');

    useWatchlistStore.getState().setWatchlistItems([
      watchlistItem({
        productCode: 'A005930',
        krTicker: '005930',
        symbol: '005930',
        name: '삼성전자',
        market: 'KOSPI',
        currency: 'KRW',
        source: 'toss',
        watchlistMember: true,
        holding: false,
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
      }),
      watchlistItem({
        productCode: 'A0011T0',
        krTicker: null,
        symbol: '0011T0',
        name: '채비',
        market: 'TOSS_ONLY',
        currency: 'KRW',
        source: 'toss',
        watchlistMember: true,
        holding: false,
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
      }),
    ]);

    const state = useWatchlistStore.getState();
    expect(state.favorites.has('005930')).toBe(true);
    expect(state.favorites.has('0011T0')).toBe(true);
    expect(state.watchlistMembers.has('005930')).toBe(true);
    expect(state.watchlistMembers.has('0011T0')).toBe(true);
    expect(state.itemsByCode['005930']?.syncState).toBe('toss_synced');
    expect(state.itemsByCode['0011T0']?.kisEligible).toBe(false);
  });

  it('keeps auto holdings visible without treating them as watchlist members', async () => {
    const { useWatchlistStore } = await import('../watchlist-store');

    useWatchlistStore.getState().setWatchlistItems([
      watchlistItem({
        productCode: 'A005930',
        krTicker: '005930',
        symbol: '005930',
        name: '삼성전자',
        market: 'KOSPI',
        currency: 'KRW',
        source: 'toss_position',
        watchlistMember: false,
        membershipSource: 'holding_auto',
        manualWatchlist: false,
        autoSyncedFromHolding: true,
        holding: true,
        syncState: 'sync_pending',
        kisEligible: true,
        tossEligible: true,
        chartEligible: true,
        quoteEligible: true,
        realtimeTrackingState: 'tracked',
        addedAt: null,
        groupName: null,
        base: null,
        last: 71000,
      }),
    ]);

    const state = useWatchlistStore.getState();
    expect(state.favorites.has('005930')).toBe(true);
    expect(state.watchlistMembers.has('005930')).toBe(false);

    useWatchlistStore.getState().toggleFavorite('005930');
    expect(useWatchlistStore.getState().favorites.has('005930')).toBe(true);
    expect(useWatchlistStore.getState().watchlistMembers.has('005930')).toBe(true);

    useWatchlistStore.getState().toggleFavorite('005930');
    expect(useWatchlistStore.getState().favorites.has('005930')).toBe(true);
    expect(useWatchlistStore.getState().watchlistMembers.has('005930')).toBe(false);
  });

  it('clears normalized metadata when legacy favorites are seeded', async () => {
    const { useWatchlistStore } = await import('../watchlist-store');
    useWatchlistStore.getState().setWatchlistItems([
      watchlistItem({
        productCode: 'A005930',
        krTicker: '005930',
        symbol: '005930',
        name: '삼성전자',
        market: 'KOSPI',
        currency: 'KRW',
        source: 'toss',
        watchlistMember: true,
        holding: false,
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
      }),
    ]);

    useWatchlistStore.getState().setFavorites(['000660']);

    const state = useWatchlistStore.getState();
    expect(state.favorites.has('000660')).toBe(true);
    expect(state.watchlistMembers.has('000660')).toBe(true);
    expect(state.itemsByCode).toEqual({});
  });
});
