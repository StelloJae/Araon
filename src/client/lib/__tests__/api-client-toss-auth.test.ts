import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  extendTossSession,
  getTossCompletedOrders,
  getTossOrder,
  getTossSseRefreshResults,
  getTossTransactions,
  getTossTransactionsOverview,
  getTossWatchlist,
  startTossLogin,
} from '../api-client';

describe('Toss auth API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests a bounded Toss session extension without exposing session material', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: {
        state: 'succeeded',
        requestedAt: '2026-05-11T07:00:00.000Z',
        finishedAt: '2026-05-11T07:00:10.000Z',
        serverExpiresAt: '2026-05-18T07:00:00.000Z',
        approvalState: 'COMPLETED',
      },
    })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await extendTossSession(60_000);

    expect(fetchMock).toHaveBeenCalledWith('/toss/auth/session/extend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeoutMs: 60_000 }),
    });
    expect(result.state).toBe('succeeded');
    expect(JSON.stringify(result)).not.toContain('SESSION');
    expect(JSON.stringify(result)).not.toContain('UTK');
    expect(JSON.stringify(result)).not.toContain('accountNo');
  });

  it('starts Toss QR login with an explicit ten-minute capture window', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: {
        state: 'starting',
        startedAt: '2026-05-11T20:00:00.000Z',
        updatedAt: '2026-05-11T20:00:00.000Z',
        finishedAt: null,
        message: 'Toss login browser is starting',
        persistent: false,
        cookieCount: 0,
        localStorageKeyCount: 0,
        sessionStorageKeyCount: 0,
        expiresAt: null,
        missingCookieCount: 0,
        missingLocalStorageKeyCount: 0,
      },
    })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await startTossLogin();

    expect(fetchMock).toHaveBeenCalledWith('/toss/auth/login/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headless: false, timeoutMs: 10 * 60_000 }),
    });
    expect(result.state).toBe('starting');
    expect(JSON.stringify(result)).not.toContain('SESSION');
    expect(JSON.stringify(result)).not.toContain('UTK');
  });

  it('requests read-only Toss account surfaces with sanitized query parameters', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('/toss/orders/completed')) {
        return new Response(JSON.stringify({
          success: true,
          data: {
            provider: 'toss',
            fetchedAt: '2026-05-11T07:00:00.000Z',
            range: { market: 'kr', from: '2026-05-01', to: '2026-05-11', size: 5, number: 2 },
            orders: [],
          },
        }));
      }
      if (url.startsWith('/toss/transactions')) {
        if (url.startsWith('/toss/transactions/overview')) {
          return new Response(JSON.stringify({
            success: true,
            data: {
              provider: 'toss',
              fetchedAt: '2026-05-11T07:00:00.000Z',
              market: 'kr',
              orderableAmountKrw: 5000,
              orderableAmountUsd: 0,
              withdrawable: [],
              displayWithdrawable: [],
              deposit: [],
              estimateSettlement: [],
              withdrawableBottomSheet: [],
            },
          }));
        }
        return new Response(JSON.stringify({
          success: true,
          data: {
            provider: 'toss',
            fetchedAt: '2026-05-11T07:00:00.000Z',
            market: 'us',
            range: { market: 'us', from: '2026-05-01', to: '2026-05-11', filter: 'trade', size: 5, number: 1 },
            lastPage: true,
            next: null,
            items: [],
          },
        }));
      }
      return new Response(JSON.stringify({
        success: true,
        data: {
          provider: 'toss',
          fetchedAt: '2026-05-11T07:00:00.000Z',
          groups: [],
          items: [],
        },
      }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await getTossCompletedOrders({
      market: 'kr',
      from: '2026-05-01',
      to: '2026-05-11',
      size: 5,
      number: 2,
    });
    await getTossTransactions({
      market: 'us',
      from: '2026-05-01',
      to: '2026-05-11',
      filter: 'trade',
      size: 5,
      number: 1,
    });
    await getTossTransactionsOverview('kr');
    await getTossWatchlist();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/toss/orders/completed?market=kr&from=2026-05-01&to=2026-05-11&size=5&number=2',
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/toss/transactions?market=us&from=2026-05-01&to=2026-05-11&filter=trade&size=5&number=1',
    );
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/toss/transactions/overview?market=kr');
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/toss/watchlist');
  });

  it('requests a single Toss order by sanitized ref only', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: {
        provider: 'toss',
        fetchedAt: '2026-05-11T07:00:00.000Z',
        ref: 'completed-order-1',
        kind: 'completed',
        range: { market: 'kr', from: '2026-05-01', to: '2026-05-11', size: 5, number: 2 },
        order: {
          ref: 'completed-order-1',
          symbol: '005930',
          name: '삼성전자',
          market: 'kr',
          side: 'BUY',
          status: 'COMPLETED',
          quantity: 10,
          filledQuantity: 10,
          price: 70000,
          averageExecutionPrice: 69900,
          orderedDate: '2026-05-10',
          submittedAt: '2026-05-10T10:01:00.000000000',
        },
      },
    })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getTossOrder('completed-order-1', {
      market: 'kr',
      from: '2026-05-01',
      to: '2026-05-11',
      size: 5,
      number: 2,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/toss/orders/completed-order-1?market=kr&from=2026-05-01&to=2026-05-11&size=5&number=2',
    );
    expect(result.kind).toBe('completed');
    expect(JSON.stringify(result)).not.toContain('orderNo');
    expect(JSON.stringify(result)).not.toContain('SESSION');
  });

  it('requests recent sanitized Toss SSE refresh results', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: {
        items: [
          {
            id: 'refresh-result-1',
            resource: 'portfolio-positions',
            ticker: '005930',
            sourceType: 'share-holdings',
            receivedAt: '2026-05-11T06:00:01.000Z',
            result: 'refreshed',
            reason: 'Toss SSE share-holdings thin notification',
            recordedAt: '2026-05-11T06:00:02.000Z',
            error: null,
          },
        ],
        returnedCount: 1,
      },
    })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getTossSseRefreshResults(5);

    expect(fetchMock).toHaveBeenCalledWith('/toss/realtime/refresh-results?limit=5');
    expect(result.returnedCount).toBe(1);
    expect(result.items[0]?.result).toBe('refreshed');
    expect(JSON.stringify(result)).not.toContain('SESSION');
    expect(JSON.stringify(result)).not.toContain('accountNo');
  });
});
