import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { AraonWatchlistItem } from '../../lib/api-client';
import { FavoritesBlock } from '../FavoritesBlock';

describe('FavoritesBlock', () => {
  it('renders Toss-only watchlist items honestly even when they are absent from the local stock catalog', () => {
    const tossOnlyItem: AraonWatchlistItem = {
      productCode: 'A0011T0',
      krTicker: null,
      symbol: '0011T0',
      name: '채비',
      market: 'TOSS_ONLY',
      currency: 'KRW',
      source: 'toss',
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
    };

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

    expect(html).toContain('채비');
    expect(html).toContain('0011T0');
    expect(html).toContain('Toss 전용');
    expect(html).toContain('지원 대기');
    expect(html).not.toContain('즐겨찾기한 종목 없음');
    expect(html).not.toContain('KIS WS');
  });

  it('counts realtime tracking inside favorites, not global slot usage', () => {
    const samsung: AraonWatchlistItem = {
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
      groupName: '관심',
      base: null,
      last: null,
    };
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
            productCode: 'A0011T0',
            krTicker: null,
            symbol: '0011T0',
            name: '채비',
            market: 'TOSS_ONLY',
            currency: 'KRW',
            source: 'toss',
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
});
