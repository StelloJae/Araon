import { describe, expect, it, vi } from 'vitest';

import { runTossAuthenticatedReadSmoke } from '../toss-authenticated-read-smoke.js';

const configuredSession = {
  configured: true,
  state: 'persistent' as const,
  provider: 'toss' as const,
  persistent: true,
  cookieCount: 2,
  localStorageKeyCount: 1,
  sessionStorageKeyCount: 0,
  retrievedAt: '2026-05-12T00:00:00.000Z',
  expiresAt: null,
  serverExpiresAt: '2026-05-19T00:00:00.000Z',
  effectiveExpiresAt: '2026-05-19T00:00:00.000Z',
  expiresInMs: 604_800_000,
};

const loggedOutSession = {
  configured: false,
  state: 'logged_out' as const,
  provider: null,
  persistent: false,
  cookieCount: 0,
  localStorageKeyCount: 0,
  sessionStorageKeyCount: 0,
  retrievedAt: null,
  expiresAt: null,
  serverExpiresAt: null,
  effectiveExpiresAt: null,
  expiresInMs: null,
};

describe('toss authenticated read smoke', () => {
  it('skips all read surfaces without a Toss session', async () => {
    const listAccounts = vi.fn();
    const report = await runTossAuthenticatedReadSmoke({
      sessionStatus: async () => loggedOutSession,
      clients: {
        account: { listAccounts },
        accountSummary: { getSummary: vi.fn() },
        portfolio: { listPositions: vi.fn() },
        orders: {
          listPendingOrders: vi.fn(),
          listCompletedOrders: vi.fn(),
          getOrder: vi.fn(),
        },
        transactions: {
          listTransactions: vi.fn(),
          getOverview: vi.fn(),
        },
        watchlist: { listWatchlist: vi.fn() },
        news: { refresh: vi.fn() },
      },
      now: () => new Date('2026-05-12T01:00:00.000Z'),
    });

    expect(report.outcome).toBe('session_required');
    expect(report.session).toEqual({
      configured: false,
      state: 'logged_out',
      persistent: false,
      effectiveExpiresAt: null,
      expiresInMs: null,
    });
    expect(report.surfaces).toHaveLength(10);
    expect(report.surfaces.every((surface) => surface.status === 'skipped')).toBe(true);
    expect(listAccounts).not.toHaveBeenCalled();
  });

  it('reports only read-only counts for successful authenticated surfaces', async () => {
    const report = await runTossAuthenticatedReadSmoke({
      sessionStatus: async () => configuredSession,
      clients: {
        account: {
          listAccounts: vi.fn(async () => ({
            provider: 'toss',
            fetchedAt: '2026-05-12T01:00:00.000Z',
            accounts: [
              { ref: 'primary', displayName: '기본계좌', name: null, type: null, markets: ['kr'], primary: true },
            ],
          })),
        },
        accountSummary: {
          getSummary: vi.fn(async () => ({
            provider: 'toss',
            fetchedAt: '2026-05-12T01:00:00.000Z',
            totalAssetAmount: 10,
            evaluatedProfitAmount: 0,
            profitRate: 0,
            orderableAmountKrw: 1,
            orderableAmountUsd: 0,
            withdrawable: {
              kr: [{ date: '2026-05-12', krw: 1, usd: 0 }],
              us: [],
            },
            markets: {
              kr: {
                market: 'kr',
                pendingBuyOrderAmount: 0,
                evaluatedAmount: 10,
                principalAmount: 10,
                evaluatedProfitAmount: 0,
                profitRate: 0,
                totalAssetAmount: 10,
                orderableAmountKrw: 1,
                orderableAmountUsd: 0,
              },
            },
          })),
        },
        portfolio: {
          listPositions: vi.fn(async () => ({
            provider: 'toss',
            fetchedAt: '2026-05-12T01:00:00.000Z',
            positions: [{ symbol: '005930' }, { symbol: '000660' }],
          })),
        },
        orders: {
          listPendingOrders: vi.fn(async () => ({
            provider: 'toss',
            fetchedAt: '2026-05-12T01:00:00.000Z',
            orders: [{ ref: 'pending-order-1' }],
          })),
          listCompletedOrders: vi.fn(async () => ({
            provider: 'toss',
            fetchedAt: '2026-05-12T01:00:00.000Z',
            range: { market: 'all', from: '2026-05-01', to: '2026-05-12', size: 20, number: 0 },
            orders: [{ ref: 'completed-order-1' }, { ref: 'completed-order-2' }],
          })),
          getOrder: vi.fn(),
        },
        transactions: {
          listTransactions: vi.fn(async () => ({
            provider: 'toss',
            fetchedAt: '2026-05-12T01:00:00.000Z',
            market: 'kr',
            range: { market: 'kr', from: '2026-05-01', to: '2026-05-12', filter: 'all', size: 20, number: 0 },
            lastPage: true,
            next: null,
            items: [{ ref: 'transaction-1' }],
          })),
          getOverview: vi.fn(async () => ({
            provider: 'toss',
            fetchedAt: '2026-05-12T01:00:00.000Z',
            market: 'kr',
            orderableAmountKrw: 1,
            orderableAmountUsd: 0,
            withdrawable: [],
            displayWithdrawable: [],
            deposit: [],
            estimateSettlement: [],
            withdrawableBottomSheet: [],
          })),
        },
        watchlist: {
          listWatchlist: vi.fn(async () => ({
            provider: 'toss',
            fetchedAt: '2026-05-12T01:00:00.000Z',
            groups: [{ ref: 'watchlist-group-1', name: '관심', items: [{ ref: 'watchlist-item-1' }] }],
            items: [{ ref: 'watchlist-item-1' }],
          })),
        },
        news: {
          refresh: vi.fn(async () => [
            {
              id: 'toss-news:hashed',
              ticker: '005930',
              source: 'toss-asset-news',
              sectionType: 'NEWS',
              title: '삼성전자 뉴스',
              agencyName: null,
              newsType: null,
              publishedAt: null,
              firstSeenAt: '2026-05-12T01:00:00.000Z',
              relevance: 0.72,
              confidence: 0.7,
              isNew: true,
            },
          ]),
        },
      },
      newsProbe: { ticker: '005930', name: '삼성전자' },
      now: () => new Date('2026-05-12T01:00:00.000Z'),
    });

    expect(report.outcome).toBe('ok');
    expect(report.surfaces).toEqual([
      expect.objectContaining({ id: 'account-list', status: 'ok', counts: { accounts: 1 } }),
      expect.objectContaining({ id: 'account-summary', status: 'ok', counts: { markets: 1, withdrawableKr: 1, withdrawableUs: 0 } }),
      expect.objectContaining({ id: 'portfolio-positions', status: 'ok', counts: { positions: 2 } }),
      expect.objectContaining({ id: 'pending-orders', status: 'ok', counts: { orders: 1 } }),
      expect.objectContaining({ id: 'completed-orders', status: 'ok', counts: { orders: 2 } }),
      expect.objectContaining({ id: 'transactions-kr', status: 'ok', counts: { items: 1 } }),
      expect.objectContaining({ id: 'transactions-overview-kr', status: 'ok', counts: { withdrawable: 0, deposit: 0 } }),
      expect.objectContaining({ id: 'transactions-overview-us', status: 'ok', counts: { withdrawable: 0, deposit: 0 } }),
      expect.objectContaining({ id: 'watchlist', status: 'ok', counts: { groups: 1, items: 1 } }),
      expect.objectContaining({ id: 'toss-asset-news', status: 'ok', counts: { items: 1 } }),
    ]);
    expect(JSON.stringify(report)).not.toContain('기본계좌');
    expect(JSON.stringify(report)).not.toContain('pending-order-1');
    expect(JSON.stringify(report)).not.toContain('watchlist-item-1');
  });

  it('sanitizes failed surface errors from the smoke report', async () => {
    const report = await runTossAuthenticatedReadSmoke({
      sessionStatus: async () => configuredSession,
      clients: {
        account: {
          listAccounts: vi.fn(async () => {
            throw new Error(`upstream failed near ${['SESSION', 'raw'].join('=')} ${['accountNo', '1234'].join('=')}`);
          }),
        },
        accountSummary: { getSummary: vi.fn(async () => ({ provider: 'toss', fetchedAt: '', withdrawable: { kr: [], us: [] }, markets: {} })) },
        portfolio: { listPositions: vi.fn(async () => ({ provider: 'toss', fetchedAt: '', positions: [] })) },
        orders: {
          listPendingOrders: vi.fn(async () => ({ provider: 'toss', fetchedAt: '', orders: [] })),
          listCompletedOrders: vi.fn(async () => ({ provider: 'toss', fetchedAt: '', range: { market: 'all', from: '', to: '', size: 20, number: 0 }, orders: [] })),
          getOrder: vi.fn(),
        },
        transactions: {
          listTransactions: vi.fn(async () => ({ provider: 'toss', fetchedAt: '', market: 'kr', range: { market: 'kr', from: '', to: '', filter: 'all', size: 20, number: 0 }, lastPage: true, next: null, items: [] })),
          getOverview: vi.fn(async () => ({ provider: 'toss', fetchedAt: '', market: 'kr', orderableAmountKrw: 0, orderableAmountUsd: 0, withdrawable: [], displayWithdrawable: [], deposit: [], estimateSettlement: [], withdrawableBottomSheet: [] })),
        },
        watchlist: { listWatchlist: vi.fn(async () => ({ provider: 'toss', fetchedAt: '', groups: [], items: [] })) },
      },
      now: () => new Date('2026-05-12T01:00:00.000Z'),
    });

    expect(report.outcome).toBe('partial');
    expect(report.surfaces[0]).toEqual({
      id: 'account-list',
      label: 'Toss account list',
      status: 'failed',
      errorCode: 'TOSS_SMOKE_SURFACE_FAILED',
    });
    expect(JSON.stringify(report)).not.toContain('SESSION');
    expect(JSON.stringify(report)).not.toContain('accountNo');
    expect(JSON.stringify(report)).not.toContain('1234');
  });
});
