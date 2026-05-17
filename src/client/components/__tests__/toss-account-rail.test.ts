import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { TossPortfolioPosition } from '../../lib/api-client';
import { TossAccountRail } from '../TossAccountRail';

describe('TossAccountRail', () => {
  it('renders a session-gated read-only state without inventing account data', () => {
    const html = renderToStaticMarkup(
      createElement(TossAccountRail, {
        sessionReady: false,
        loading: false,
        summary: null,
        positions: null,
        pendingOrders: null,
        completedOrders: null,
        transactionsOverview: null,
        transactions: null,
        watchlist: null,
        onRefresh: vi.fn(),
        onLoginStart: vi.fn(),
      }),
    );

    expect(html).toContain('기본계좌');
    expect(html).toContain('읽기 전용');
    expect(html).toContain('토스 로그인 필요');
    expect(html).toContain('계좌 데이터 없음');
    expect(html).toContain('토스 QR 로그인');
    expect(html).not.toContain('1,200,000원');
  });

  it('renders account, portfolio, and pending order summary without raw refs', () => {
    const html = renderToStaticMarkup(
      createElement(TossAccountRail, {
        sessionReady: true,
        loading: false,
        summary: {
          provider: 'toss',
          fetchedAt: '2026-05-11T07:00:00.000Z',
          totalAssetAmount: 1_200_000,
          evaluatedProfitAmount: 125_000,
          profitRate: 11.6,
          orderableAmountKrw: 500_000,
          orderableAmountUsd: 12.5,
          withdrawable: {
            kr: [],
            us: [],
          },
          markets: {},
        },
        positions: {
          provider: 'toss',
          fetchedAt: '2026-05-11T07:00:00.000Z',
          positions: [
            positionFixture({
              productCode: 'US0378331005',
              symbol: 'AAPL',
              name: '애플',
              marketType: 'US_STOCK',
              marketCode: 'NSQ',
              quantity: 0.001,
              marketValue: 0.39,
              unrealizedPnl: 0.2,
              profitRate: 1.13,
              marketValueUsd: 0.39,
              unrealizedPnlUsd: 0.2,
              profitRateUsd: 1.13,
            }),
            positionFixture({
              productCode: '005930',
              symbol: '005930',
              name: '삼성전자',
              marketType: 'KR_STOCK',
              marketCode: 'KSP',
              quantity: 3,
              averagePrice: 65000,
              currentPrice: 70000,
              marketValue: 210000,
              unrealizedPnl: 15000,
              profitRate: 7.6923,
            }),
            positionFixture({
              productCode: '035420',
              symbol: '035420',
              name: '네이버',
              marketType: 'KR_STOCK',
              marketCode: 'KSQ',
              quantity: 2,
              marketValue: 380000,
              unrealizedPnl: -9000,
              profitRate: -2.31,
            }),
          ],
        },
        pendingOrders: {
          provider: 'toss',
          fetchedAt: '2026-05-11T07:00:00.000Z',
          orders: [
            {
              ref: 'pending-order-1',
              symbol: '005930',
              name: '삼성전자',
              market: 'kr',
              side: 'BUY',
              status: 'PENDING',
              quantity: 4,
              originalQuantity: 10,
              price: 70000,
              orderedDate: '2026-05-11',
              submittedAt: '2026-05-11T09:03:04.000000000',
            },
          ],
        },
        completedOrders: {
          provider: 'toss',
          fetchedAt: '2026-05-11T07:00:00.000Z',
          range: {
            market: 'all',
            from: '2026-05-01',
            to: '2026-05-11',
            size: 5,
            number: 1,
          },
          orders: [
            {
              ref: 'completed-order-1',
              symbol: '000660',
              name: 'SK하이닉스',
              market: 'kr',
              side: 'BUY',
              status: 'FILLED',
              quantity: 2,
              filledQuantity: 2,
              price: 190000,
              averageExecutionPrice: 190500,
              orderedDate: '2026-05-10',
              submittedAt: '2026-05-10T09:03:04.000000000',
            },
          ],
        },
        transactionsOverview: {
          provider: 'toss',
          fetchedAt: '2026-05-11T07:00:00.000Z',
          market: 'kr',
          orderableAmountKrw: 500_000,
          orderableAmountUsd: 12.5,
          withdrawable: [],
          displayWithdrawable: [],
          deposit: [],
          estimateSettlement: [],
          withdrawableBottomSheet: [],
        },
        transactions: {
          provider: 'toss',
          fetchedAt: '2026-05-11T07:00:00.000Z',
          market: 'kr',
          range: {
            market: 'kr',
            from: '2026-05-01',
            to: '2026-05-11',
            filter: 'all',
            size: 5,
            number: 1,
          },
          lastPage: true,
          next: null,
          items: [
            {
              ref: 'transaction-1',
              market: 'kr',
              category: 'trade',
              type: 'BUY',
              code: '005930',
              displayName: '삼성전자',
              displayType: '매수',
              summary: null,
              symbol: '005930',
              name: '삼성전자',
              currency: 'KRW',
              quantity: 1,
              amount: -71000,
              adjustedAmount: -71000,
              commissionAmount: 0,
              taxAmount: 0,
              balanceAmount: 429000,
              date: '2026-05-11',
              dateTime: '2026-05-11T09:10:00.000000000',
              orderDate: '2026-05-11',
              settlementDate: '2026-05-13',
              tradeType: 'BUY',
              referenceType: null,
            },
          ],
        },
        watchlist: {
          provider: 'toss',
          fetchedAt: '2026-05-11T07:00:00.000Z',
          groups: [
            {
              ref: 'watchlist-group-1',
              name: '관심',
              items: [],
            },
          ],
          items: [
            {
              ref: 'watchlist-item-1',
              groupRef: 'watchlist-group-1',
              groupName: '관심',
              productCode: '005930',
              symbol: '005930',
              name: '삼성전자',
              currency: 'KRW',
              base: 70000,
              last: 71000,
            },
            {
              ref: 'watchlist-item-2',
              groupRef: 'watchlist-group-1',
              groupName: '관심',
              productCode: '000660',
              symbol: '000660',
              name: 'SK하이닉스',
              currency: 'KRW',
              base: 190000,
              last: 193000,
            },
          ],
        },
        onRefresh: vi.fn(),
      }),
    );

    expect(html).toContain('1,200,000원');
    expect(html).toContain('+125,000원');
    expect(html).toContain('+11.60%');
    expect(html).toContain('원화');
    expect(html).toContain('500,000원');
    expect(html).toContain('달러');
    expect(html).toContain('$12.50');
    expect(html).toContain('보유 3종목');
    expect(html).toContain('대기 1건');
    expect(html).toContain('체결 1건');
    expect(html).toContain('거래 1건');
    expect(html).toContain('관심 2종목');
    expect(html).toContain('해외주식');
    expect(html).toContain('국내주식');
    expect(html).toContain('애플');
    expect(html).toContain('삼성전자');
    expect(html).toContain('네이버');
    expect(html).toContain('$0.39');
    expect(html).not.toContain('pending-order-1');
    expect(html).not.toContain('completed-order-1');
    expect(html).not.toContain('transaction-1');
    expect(html).not.toContain('watchlist-item-1');
    expect(html).not.toContain('watchlist-group-1');
    expect(html).not.toContain('SESSION');
  });

  it('masks transport errors behind a user-facing session message', () => {
    const html = renderToStaticMarkup(
      createElement(TossAccountRail, {
        sessionReady: false,
        loading: false,
        summary: null,
        positions: null,
        pendingOrders: null,
        completedOrders: null,
        transactionsOverview: null,
        transactions: null,
        watchlist: null,
        error: '502 502 Bad Gateway',
        onRefresh: vi.fn(),
        onLoginStart: vi.fn(),
      }),
    );

    expect(html).toContain('토스 세션 확인 실패');
    expect(html).not.toContain('502 Bad Gateway');
  });
});

function positionFixture(overrides: Partial<TossPortfolioPosition>): TossPortfolioPosition {
  return {
    productCode: '005930',
    symbol: '005930',
    name: '삼성전자',
    marketType: 'KR',
    marketCode: 'KRX',
    quantity: 1,
    averagePrice: 0,
    currentPrice: 0,
    marketValue: 0,
    unrealizedPnl: 0,
    profitRate: 0,
    dailyProfitLoss: 0,
    dailyProfitRate: 0,
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
