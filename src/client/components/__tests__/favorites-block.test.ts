import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AraonWatchlistItem } from '../../lib/api-client';
import { usePriceHistoryStore } from '../../stores/price-history-store';
import {
  FavoritesBlock,
  shouldPreloadWatchlistOnlyPriceHistory,
} from '../FavoritesBlock';

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

describe('FavoritesBlock', () => {
  beforeEach(() => {
    usePriceHistoryStore.getState().clear();
  });

  it('preloads persisted quote history only for KR chart-eligible rows', () => {
    expect(shouldPreloadWatchlistOnlyPriceHistory(watchlistItem({
      productCode: 'A298380',
      krTicker: '298380',
      symbol: '298380',
      market: 'KOSDAQ',
      kisEligible: true,
      tossEligible: true,
      chartEligible: true,
      quoteEligible: true,
    }))).toBe(true);
    expect(shouldPreloadWatchlistOnlyPriceHistory(watchlistItem({
      productCode: 'US19970515001',
      krTicker: null,
      symbol: 'AMZN',
      market: 'US',
      kisEligible: false,
      tossEligible: true,
      chartEligible: false,
      quoteEligible: true,
    }))).toBe(false);
    expect(shouldPreloadWatchlistOnlyPriceHistory(watchlistItem({
      productCode: 'UNKNOWN',
      krTicker: null,
      symbol: 'UNKNOWN',
      market: 'TOSS_ONLY',
      kisEligible: false,
      tossEligible: false,
      chartEligible: false,
      quoteEligible: false,
    }))).toBe(false);
  });

  it('keeps unsupported watchlist-only items out of the primary favorite rows', () => {
    const tossOnlyItem: AraonWatchlistItem = watchlistItem({
      productCode: 'A0011T0',
      krTicker: null,
      symbol: '0011T0',
      name: '채비',
      market: 'TOSS_ONLY',
      currency: 'KRW',
      source: 'toss',
      watchlistMember: true,
      holding: false,
      syncState: 'toss_synced',
      kisEligible: false,
      tossEligible: true,
      chartEligible: false,
      quoteEligible: true,
      realtimeTrackingState: 'not_eligible',
      addedAt: null,
      groupName: '관심',
      base: null,
      last: null,
    });

    const html = renderToStaticMarkup(
      createElement(FavoritesBlock, {
        stocks: [],
        favorites: new Set(['0011T0']),
        watchlistItemsByCode: { '0011T0': tossOnlyItem },
        onToggleFav: vi.fn(),
        onOpenDetail: vi.fn(),
        flashSeeds: {},
      }),
    );

    expect(html).toContain('표시 가능한 가격을 수집 중');
    expect(html).not.toContain('채비');
    expect(html).not.toContain('0011T0');
    expect(html).not.toContain('Toss 전용');
    expect(html).not.toContain('즐겨찾기한 종목 없음');
    expect(html).not.toContain('KIS WS');
  });

  it('does not show zero as a real watchlist-only price row', () => {
    const html = renderToStaticMarkup(
      createElement(FavoritesBlock, {
        stocks: [],
        favorites: new Set(['0011T0']),
        watchlistItemsByCode: {
          '0011T0': {
            ...watchlistItem({
            productCode: 'A0011T0',
            krTicker: null,
            symbol: '0011T0',
            name: '채비',
            market: 'TOSS_ONLY',
            currency: 'KRW',
            source: 'toss',
            watchlistMember: true,
            holding: false,
            syncState: 'toss_synced',
            kisEligible: false,
            tossEligible: true,
            chartEligible: false,
            quoteEligible: true,
            realtimeTrackingState: 'not_eligible',
            addedAt: null,
            groupName: '관심',
            base: 0,
            last: 0,
            }),
          },
        },
        onToggleFav: vi.fn(),
        onOpenDetail: vi.fn(),
        flashSeeds: {},
      }),
    );

    expect(html).toContain('표시 가능한 가격을 수집 중');
    expect(html).not.toContain('>0<');
  });

  it('renders watchlist-only rows when a real price is already hydrated', () => {
    const html = renderToStaticMarkup(
      createElement(FavoritesBlock, {
        stocks: [],
        favorites: new Set(['005930']),
        watchlistItemsByCode: {
          '005930': watchlistItem({
            productCode: 'A005930',
            krTicker: '005930',
            symbol: '005930',
            name: '삼성전자',
            market: 'KOSPI',
            watchlistMember: true,
            syncState: 'toss_synced',
            base: 70000,
            last: 73500,
          }),
        },
        onToggleFav: vi.fn(),
        onOpenDetail: vi.fn(),
        flashSeeds: {},
      }),
    );

    expect(html).toContain('삼성전자');
    expect(html).toContain('73,500');
    expect(html).toContain('+5.00%');
    expect(html).not.toContain('수집 지연');
    expect(html).not.toContain('지원 대기');
  });

  it('renders priced Toss-only rows as real quote rows instead of support-wait rows', () => {
    const tossOnlyItem: AraonWatchlistItem = watchlistItem({
      productCode: 'US19970515001',
      krTicker: null,
      symbol: 'AMZN',
      name: '아마존',
      market: 'US',
      currency: 'USD',
      source: 'toss',
      watchlistMember: true,
      syncState: 'toss_synced',
      kisEligible: false,
      tossEligible: true,
      chartEligible: false,
      quoteEligible: true,
      realtimeTrackingState: 'not_eligible',
      base: 185.86561264822134,
      last: 188.1,
      changePct: 1.2,
    });
    const html = renderToStaticMarkup(
      createElement(FavoritesBlock, {
        stocks: [],
        favorites: new Set(['AMZN']),
        watchlistItemsByCode: { AMZN: tossOnlyItem },
        onToggleFav: vi.fn(),
        onOpenDetail: vi.fn(),
        flashSeeds: {},
      }),
    );

    expect(html).toContain('아마존');
    expect(html).toContain('188.1');
    expect(html).toContain('+1.20%');
    expect(html).not.toContain('지원 대기');
    expect(html).not.toContain('Toss 전용');
    expect(html).not.toContain('수집 지연');
  });

  it('does not leave hydrated watchlist-only rows with a blank percent slot', () => {
    const html = renderToStaticMarkup(
      createElement(FavoritesBlock, {
        stocks: [],
        favorites: new Set(['005930']),
        watchlistItemsByCode: {
          '005930': watchlistItem({
            productCode: 'A005930',
            krTicker: '005930',
            symbol: '005930',
            name: '삼성전자',
            market: 'KOSPI',
            watchlistMember: true,
            syncState: 'toss_synced',
            base: null,
            last: 73500,
          }),
        },
        onToggleFav: vi.fn(),
        onOpenDetail: vi.fn(),
        flashSeeds: {},
      }),
    );

    expect(html).toContain('삼성전자');
    expect(html).toContain('73,500');
    expect(html).toContain('등락률 수집 중');
  });

  it('derives watchlist-only direction from real history when quote percent is missing', () => {
    usePriceHistoryStore.getState().seedTicker('129920', [
      { price: 9000, changePct: 0, ts: Date.parse('2026-05-19T00:00:00.000Z'), source: 'toss-time-today' },
      { price: 9300, changePct: 0, ts: Date.parse('2026-05-19T00:01:00.000Z'), source: 'toss-time-today' },
    ]);

    const html = renderToStaticMarkup(
      createElement(FavoritesBlock, {
        stocks: [],
        favorites: new Set(['129920']),
        watchlistItemsByCode: {
          '129920': watchlistItem({
            productCode: 'A129920',
            krTicker: '129920',
            symbol: '129920',
            name: '대성하이텍',
            market: 'KOSDAQ',
            watchlistMember: true,
            syncState: 'toss_synced',
            base: null,
            last: 9300,
            changePct: null,
          }),
        },
        onToggleFav: vi.fn(),
        onOpenDetail: vi.fn(),
        flashSeeds: {},
      }),
    );

    expect(html).toContain('대성하이텍');
    expect(html).toContain('9,300');
    expect(html).toContain('+3.33%');
    expect(html).not.toContain('등락률 수집 중');
  });

  it('keeps real watchlist percent when neutral candle seed supplies sparkline shape', () => {
    usePriceHistoryStore.getState().seedTicker('298380', [
      { price: 111500, changePct: 0, ts: Date.parse('2026-05-18T00:00:00.000Z'), source: 'toss-time-today' },
      { price: 111800, changePct: 0, ts: Date.parse('2026-05-18T00:01:00.000Z'), source: 'toss-time-today' },
    ]);

    const html = renderToStaticMarkup(
      createElement(FavoritesBlock, {
        stocks: [],
        favorites: new Set(['298380']),
        watchlistItemsByCode: {
          '298380': watchlistItem({
            productCode: 'A298380',
            krTicker: '298380',
            symbol: '298380',
            name: '에이비엘바이오',
            market: 'KOSDAQ',
            watchlistMember: true,
            syncState: 'toss_synced',
            base: null,
            last: 111800,
            changePct: -6.29,
          }),
        },
        onToggleFav: vi.fn(),
        onOpenDetail: vi.fn(),
        flashSeeds: {},
      }),
    );

    expect(html).toContain('에이비엘바이오');
    expect(html).toContain('111,800');
    expect(html).toContain('-6.29%');
    expect(html).not.toContain('+0.00%');
  });

  it('counts realtime tracking inside favorites, not global slot usage', () => {
    const samsung: AraonWatchlistItem = watchlistItem({
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
      groupName: '관심',
      base: null,
      last: null,
    });
    const hynix: AraonWatchlistItem = {
      ...samsung,
      productCode: 'A000660',
      krTicker: '000660',
      symbol: '000660',
      name: 'SK하이닉스',
    };

    const html = renderToStaticMarkup(
      createElement(FavoritesBlock, {
        stocks: [],
        favorites: new Set(['005930', '000660', '0011T0']),
        watchlistItemsByCode: {
          '005930': samsung,
          '000660': hynix,
          '0011T0': {
            ...watchlistItem({
            productCode: 'A0011T0',
            krTicker: null,
            symbol: '0011T0',
            name: '채비',
            market: 'TOSS_ONLY',
            currency: 'KRW',
            source: 'toss',
            watchlistMember: true,
            holding: false,
            syncState: 'toss_synced',
            kisEligible: false,
            tossEligible: true,
            chartEligible: false,
            quoteEligible: true,
            realtimeTrackingState: 'not_eligible',
            addedAt: null,
            groupName: '관심',
            base: null,
            last: null,
            }),
          },
        },
        onToggleFav: vi.fn(),
        onOpenDetail: vi.fn(),
        flashSeeds: {},
        kisStatus: {
          enabled: true,
          provider: 'kis',
          perProfileCap: 40,
          activeCount: 20,
          fallbackCount: 4,
          churnCooldownMs: 0,
          diff: { subscribe: [], unsubscribe: [] },
          candidates: [
            {
              ticker: '005930',
              state: 'subscribed',
              source: 'manual_watchlist',
              reason: 'favorite',
              score: 1,
              ttlMs: null,
              lastSeenAt: '2026-05-14T00:00:00.000Z',
              pinned: false,
            },
            {
              ticker: '000660',
              state: 'fallback',
              source: 'manual_watchlist',
              reason: 'favorite',
              score: 0.5,
              ttlMs: null,
              lastSeenAt: '2026-05-14T00:00:00.000Z',
              pinned: false,
            },
            {
              ticker: '042660',
              state: 'subscribed',
              source: 'top100_rotation',
              reason: 'top100',
              score: 0.2,
              ttlMs: null,
              lastSeenAt: '2026-05-14T00:00:00.000Z',
              pinned: false,
            },
          ],
        },
      }),
    );

    expect(html).toContain('실시간 추적 1/2');
    expect(html).not.toContain('실시간 추적 20/40');
  });

  it('does not show scary tracking error copy during temporary realtime gaps', () => {
    const html = renderToStaticMarkup(
      createElement(FavoritesBlock, {
        stocks: [],
        favorites: new Set(['005930']),
        watchlistItemsByCode: {
          '005930': watchlistItem({
            last: 70000,
            changePct: 1.2,
          }),
        },
        onToggleFav: vi.fn(),
        onOpenDetail: vi.fn(),
        flashSeeds: {},
        kisError: 'temporary gap',
      }),
    );

    expect(html).not.toContain('추적 오류');
    expect(html).toContain('추적 대기');
  });

  it('allows held watchlist rows to remove Toss watchlist membership', () => {
    const html = renderToStaticMarkup(
      createElement(FavoritesBlock, {
        stocks: [],
        favorites: new Set(['005930']),
        watchlistItemsByCode: {
          '005930': watchlistItem({
            holding: true,
            autoSyncedFromHolding: true,
            manualWatchlist: false,
            membershipSource: 'holding_auto',
            last: 70000,
            changePct: 1.2,
          }),
        },
        onToggleFav: vi.fn(),
        onOpenDetail: vi.fn(),
        flashSeeds: {},
      }),
    );

    expect(html).toContain('Toss 즐겨찾기 해제');
    expect(html).not.toContain('보유 종목은 자동 유지됩니다');
    expect(html).not.toContain('disabled=""');
  });

  it('keeps held-only rows visible and non-removable from the watch surface', () => {
    const html = renderToStaticMarkup(
      createElement(FavoritesBlock, {
        stocks: [],
        favorites: new Set(['005930']),
        watchlistMembers: new Set(),
        watchlistItemsByCode: {
          '005930': watchlistItem({
            holding: true,
            watchlistMember: false,
            autoSyncedFromHolding: true,
            manualWatchlist: false,
            membershipSource: 'holding_auto',
            last: 70000,
            changePct: 1.2,
          }),
        },
        onToggleFav: vi.fn(),
        onOpenDetail: vi.fn(),
        flashSeeds: {},
      }),
    );

    expect(html).toContain('보유 종목은 자동 유지됩니다');
    expect(html).toContain('보유');
    expect(html).toContain('disabled=""');
    expect(html.match(/fill="currentColor"/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
