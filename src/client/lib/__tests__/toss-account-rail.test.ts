import { describe, expect, it, vi } from 'vitest';

import { loadTossAccountRailSnapshot } from '../toss-account-rail';
import type { TossSessionStatusPayload } from '../api-client';

function auth(state: TossSessionStatusPayload['state']): TossSessionStatusPayload {
  return {
    configured: state !== 'logged_out',
    state,
    provider: state === 'logged_out' ? null : 'toss',
    persistent: state === 'persistent',
    cookieCount: state === 'logged_out' ? 0 : 4,
    localStorageKeyCount: state === 'logged_out' ? 0 : 2,
    sessionStorageKeyCount: state === 'logged_out' ? 0 : 1,
    retrievedAt: '2026-05-11T07:00:00.000Z',
    expiresAt: null,
    serverExpiresAt: null,
    effectiveExpiresAt: null,
    expiresInMs: null,
  };
}

describe('loadTossAccountRailSnapshot', () => {
  it('does not fetch authenticated Toss account surfaces until a Toss session is ready', async () => {
    const deps = {
      getAuthStatus: vi.fn(async () => auth('logged_out')),
      getSummary: vi.fn(),
      getPositions: vi.fn(),
      getPendingOrders: vi.fn(),
      getCompletedOrders: vi.fn(),
      getTransactionsOverview: vi.fn(),
      getTransactions: vi.fn(),
      getWatchlist: vi.fn(),
    };

    const result = await loadTossAccountRailSnapshot(deps);

    expect(result).toEqual({
      sessionReady: false,
      summary: null,
      positions: null,
      pendingOrders: null,
      completedOrders: null,
      transactionsOverview: null,
      transactions: null,
      watchlist: null,
    });
    expect(deps.getSummary).not.toHaveBeenCalled();
    expect(deps.getPositions).not.toHaveBeenCalled();
    expect(deps.getPendingOrders).not.toHaveBeenCalled();
    expect(deps.getCompletedOrders).not.toHaveBeenCalled();
    expect(deps.getTransactionsOverview).not.toHaveBeenCalled();
    expect(deps.getTransactions).not.toHaveBeenCalled();
    expect(deps.getWatchlist).not.toHaveBeenCalled();
  });

  it('fetches sanitized account summary, positions, and pending orders when a session is ready', async () => {
    const deps = {
      getAuthStatus: vi.fn(async () => auth('persistent')),
      getSummary: vi.fn(async () => ({
        provider: 'toss' as const,
        fetchedAt: '2026-05-11T07:00:00.000Z',
        totalAssetAmount: 1_200_000,
        evaluatedProfitAmount: 125_000,
        profitRate: 11.6,
        orderableAmountKrw: 500_000,
        orderableAmountUsd: 12.5,
        withdrawable: { kr: [], us: [] },
        markets: {},
      })),
      getPositions: vi.fn(async () => ({
        provider: 'toss' as const,
        fetchedAt: '2026-05-11T07:00:00.000Z',
        positions: [],
      })),
      getPendingOrders: vi.fn(async () => ({
        provider: 'toss' as const,
        fetchedAt: '2026-05-11T07:00:00.000Z',
        orders: [],
      })),
      getCompletedOrders: vi.fn(async () => ({
        provider: 'toss' as const,
        fetchedAt: '2026-05-11T07:00:00.000Z',
        range: {
          market: 'all' as const,
          from: '2026-05-01',
          to: '2026-05-11',
          size: 5,
          number: 1,
        },
        orders: [],
      })),
      getTransactionsOverview: vi.fn(async () => ({
        provider: 'toss' as const,
        fetchedAt: '2026-05-11T07:00:00.000Z',
        market: 'kr' as const,
        orderableAmountKrw: 500_000,
        orderableAmountUsd: 12.5,
        withdrawable: [],
        displayWithdrawable: [],
        deposit: [],
        estimateSettlement: [],
        withdrawableBottomSheet: [],
      })),
      getTransactions: vi.fn(async () => ({
        provider: 'toss' as const,
        fetchedAt: '2026-05-11T07:00:00.000Z',
        market: 'kr' as const,
        range: {
          market: 'kr' as const,
          from: '2026-05-01',
          to: '2026-05-11',
          filter: 'all' as const,
          size: 5,
          number: 1,
        },
        lastPage: true,
        next: null,
        items: [],
      })),
      getWatchlist: vi.fn(async () => ({
        provider: 'toss' as const,
        fetchedAt: '2026-05-11T07:00:00.000Z',
        groups: [],
        items: [],
      })),
    };

    const result = await loadTossAccountRailSnapshot(deps);

    expect(result.sessionReady).toBe(true);
    expect(result.summary?.totalAssetAmount).toBe(1_200_000);
    expect(result.positions?.positions).toEqual([]);
    expect(result.pendingOrders?.orders).toEqual([]);
    expect(result.completedOrders?.orders).toEqual([]);
    expect(result.transactionsOverview?.orderableAmountKrw).toBe(500_000);
    expect(result.transactions?.items).toEqual([]);
    expect(result.watchlist?.items).toEqual([]);
  });

  it('keeps the core Toss account summary when optional surfaces fail', async () => {
    const deps = {
      getAuthStatus: vi.fn(async () => auth('persistent')),
      getSummary: vi.fn(async () => ({
        provider: 'toss' as const,
        fetchedAt: '2026-05-11T07:00:00.000Z',
        totalAssetAmount: 1_200_000,
        evaluatedProfitAmount: 125_000,
        profitRate: 11.6,
        orderableAmountKrw: 500_000,
        orderableAmountUsd: 12.5,
        withdrawable: { kr: [], us: [] },
        markets: {},
      })),
      getPositions: vi.fn(async () => {
        throw new Error('TOSS_READ_REQUEST_FAILED');
      }),
      getPendingOrders: vi.fn(async () => ({
        provider: 'toss' as const,
        fetchedAt: '2026-05-11T07:00:00.000Z',
        orders: [],
      })),
      getCompletedOrders: vi.fn(async () => ({
        provider: 'toss' as const,
        fetchedAt: '2026-05-11T07:00:00.000Z',
        range: {
          market: 'all' as const,
          from: '2026-05-01',
          to: '2026-05-11',
          size: 5,
          number: 1,
        },
        orders: [],
      })),
      getTransactionsOverview: vi.fn(async () => ({
        provider: 'toss' as const,
        fetchedAt: '2026-05-11T07:00:00.000Z',
        market: 'kr' as const,
        orderableAmountKrw: 500_000,
        orderableAmountUsd: 12.5,
        withdrawable: [],
        displayWithdrawable: [],
        deposit: [],
        estimateSettlement: [],
        withdrawableBottomSheet: [],
      })),
      getTransactions: vi.fn(async () => ({
        provider: 'toss' as const,
        fetchedAt: '2026-05-11T07:00:00.000Z',
        market: 'kr' as const,
        range: {
          market: 'kr' as const,
          from: '2026-05-01',
          to: '2026-05-11',
          filter: 'all' as const,
          size: 5,
          number: 1,
        },
        lastPage: true,
        next: null,
        items: [],
      })),
      getWatchlist: vi.fn(async () => {
        throw new Error('TOSS_READ_REQUEST_FAILED');
      }),
    };

    const result = await loadTossAccountRailSnapshot(deps);

    expect(result.sessionReady).toBe(true);
    expect(result.summary?.totalAssetAmount).toBe(1_200_000);
    expect(result.positions).toBeNull();
    expect(result.pendingOrders?.orders).toEqual([]);
    expect(result.completedOrders?.orders).toEqual([]);
    expect(result.transactionsOverview?.orderableAmountKrw).toBe(500_000);
    expect(result.transactions?.items).toEqual([]);
    expect(result.watchlist).toBeNull();
  });
});
