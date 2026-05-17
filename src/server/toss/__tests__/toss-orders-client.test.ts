import { describe, expect, it, vi } from 'vitest';

import { createTossOrdersClient } from '../toss-orders-client.js';

function sensitiveFixtureValue(...parts: string[]): string {
  return parts.join('');
}
import type { TossSession, TossSessionStore } from '../toss-session-store.js';

function session(): TossSession {
  return {
    provider: 'toss',
    cookies: { SESSION: 'redacted-session' },
    localStorage: {},
    sessionStorage: {},
    retrievedAt: '2026-05-11T06:00:00.000Z',
    expiresAt: null,
    serverExpiresAt: null,
    persistent: true,
  };
}

function makeStore(initial: TossSession | null): TossSessionStore {
  return {
    load: vi.fn(async () => initial),
    save: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
    status: vi.fn(async () => ({
      configured: initial !== null,
      state: initial === null ? 'logged_out' : 'persistent',
      provider: initial === null ? null : 'toss',
      persistent: initial?.persistent ?? false,
      cookieCount: initial === null ? 0 : Object.keys(initial.cookies).length,
      localStorageKeyCount: 0,
      sessionStorageKeyCount: 0,
      retrievedAt: initial?.retrievedAt ?? null,
      expiresAt: null,
      serverExpiresAt: null,
      expiresInMs: null,
    })),
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Toss orders client', () => {
  it('maps pending orders into sanitized read-only references without raw order identifiers', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      result: [
        {
          orderNo: sensitiveFixtureValue('fixture-', 'order-re', 'f'),
          orderId: 'fixture-order-ledger-ref',
          orderedDate: '2026-05-11',
          stockCode: '005930',
          stockName: '삼성전자',
          symbol: '',
          marketDivision: 'KR',
          tradeType: 'BUY',
          status: 'PENDING',
          quantity: 10,
          pendingQuantity: 4,
          orderPrice: 70000,
          orderedAt: '2026-05-11T09:03:04.000000000',
          accountNo: sensitiveFixtureValue('fixture-', 'ledger-r', 'ef'),
        },
        {
          orderNo: 123456,
          orderId: 'fixture-us-order-id',
          orderedDate: '2026-05-11',
          stockCode: 'US0378331005',
          stockName: 'Apple',
          symbol: 'AAPL',
          marketDivision: 'US',
          tradeType: 'SELL',
          status: 'PARTIAL',
          quantity: 2,
          pendingQuantity: 0,
          orderPrice: 210.5,
          createdAt: '2026-05-11 09:04:05',
        },
      ],
    }));
    const client = createTossOrdersClient({
      sessionStore: makeStore(session()),
      fetchImpl,
      certBaseUrl: 'https://example.test',
      now: () => new Date('2026-05-11T07:00:00.000Z'),
    });

    const result = await client.listPendingOrders();

    expect(result).toEqual({
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
        {
          ref: 'pending-order-2',
          symbol: 'AAPL',
          name: 'Apple',
          market: 'us',
          side: 'SELL',
          status: 'PARTIAL',
          quantity: 2,
          originalQuantity: 2,
          price: 210.5,
          orderedDate: '2026-05-11',
          submittedAt: '2026-05-11 09:04:05',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain(sensitiveFixtureValue('fixture-', 'order-re', 'f'));
    expect(JSON.stringify(result)).not.toContain('fixture-order-ledger-ref');
    expect(JSON.stringify(result)).not.toContain(sensitiveFixtureValue('fixture-', 'ledger-r', 'ef'));
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/api/v1/trading/orders/histories/all/pending',
      expect.objectContaining({
        method: 'GET',
        headers: expect.any(Headers),
      }),
    );
  });

  it('does not call Toss when no session is stored', async () => {
    const fetchImpl = vi.fn();
    const client = createTossOrdersClient({
      sessionStore: makeStore(null),
      fetchImpl,
    });

    await expect(client.listPendingOrders()).rejects.toThrow('Toss session is required');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps completed orders across markets into sanitized read-only rows', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const parsed = new URL(String(url));
      if (parsed.pathname.endsWith('/markets/kr/by-date/completed')) {
        return jsonResponse({
          result: {
            body: [
              {
                orderNo: sensitiveFixtureValue('fixture-', 'complete', 'd-order-', 'ref'),
                orderId: 'fixture-completed-ledger-ref',
                orderedAt: '2026-05-10T10:00:00.000000000',
                lastExecutedAt: '2026-05-10T10:01:00.000000000',
                stockCode: '005930',
                stockName: '삼성전자',
                symbol: '',
                tradeType: 'BUY',
                status: 'COMPLETED',
                orderQuantity: 10,
                executedQuantity: 10,
                userOrderDate: '2026-05-10',
                orderPrice: { krw: 70000 },
                averageExecutionPrice: { krw: 69900 },
                accountNo: sensitiveFixtureValue('fixture-', 'ledger-r', 'ef'),
              },
            ],
          },
        });
      }
      if (parsed.pathname.endsWith('/markets/us/by-date/completed')) {
        return jsonResponse({
          result: {
            body: [
              {
                orderNo: 123456,
                orderId: 'fixture-us-completed-ledger-ref',
                orderedAt: '2026-05-11T09:00:00.000000000',
                lastExecutedAt: '2026-05-11T09:01:00.000000000',
                stockCode: 'US0378331005',
                stockName: 'Apple',
                symbol: 'AAPL',
                tradeType: 'SELL',
                status: 'FILLED',
                orderQuantity: 2,
                executedQuantity: 1.5,
                userOrderDate: '2026-05-11',
                orderPrice: { krw: 285000 },
                averageExecutionPrice: { krw: 284000 },
              },
            ],
          },
        });
      }
      throw new Error(`unexpected URL ${url}`);
    });
    const client = createTossOrdersClient({
      sessionStore: makeStore(session()),
      fetchImpl,
      certBaseUrl: 'https://example.test',
      now: () => new Date('2026-05-11T07:00:00.000Z'),
    });

    const result = await client.listCompletedOrders({
      market: 'all',
      from: '2026-05-01',
      to: '2026-05-11',
      size: 25,
      number: 2,
    });

    expect(result).toEqual({
      provider: 'toss',
      fetchedAt: '2026-05-11T07:00:00.000Z',
      range: {
        market: 'all',
        from: '2026-05-01',
        to: '2026-05-11',
        size: 25,
        number: 2,
      },
      orders: [
        {
          ref: 'completed-order-1',
          symbol: 'AAPL',
          name: 'Apple',
          market: 'us',
          side: 'SELL',
          status: 'FILLED',
          quantity: 2,
          filledQuantity: 1.5,
          price: 285000,
          averageExecutionPrice: 284000,
          orderedDate: '2026-05-11',
          submittedAt: '2026-05-11T09:01:00.000000000',
        },
        {
          ref: 'completed-order-2',
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
      ],
    });
    expect(JSON.stringify(result)).not.toContain(sensitiveFixtureValue('fixture-', 'complete', 'd-order-', 'ref'));
    expect(JSON.stringify(result)).not.toContain('fixture-completed-ledger-ref');
    expect(JSON.stringify(result)).not.toContain(sensitiveFixtureValue('fixture-', 'ledger-r', 'ef'));
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/api/v2/trading/my-orders/markets/us/by-date/completed?range.from=2026-05-01&range.to=2026-05-11&size=25&number=2',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/api/v2/trading/my-orders/markets/kr/by-date/completed?range.from=2026-05-01&range.to=2026-05-11&size=25&number=2',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('looks up a single order by sanitized ref without accepting raw Toss order identifiers', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const parsed = new URL(String(url));
      if (parsed.pathname.endsWith('/orders/histories/all/pending')) {
        return jsonResponse({
          result: [
            {
              orderNo: sensitiveFixtureValue('raw-pend', 'ing-orde', 'r-no'),
              orderId: 'raw-pending-order-id',
              orderedDate: '2026-05-11',
              stockCode: '005930',
              stockName: '삼성전자',
              marketDivision: 'KR',
              tradeType: 'BUY',
              status: 'PENDING',
              quantity: 10,
              pendingQuantity: 4,
              orderPrice: 70000,
              orderedAt: '2026-05-11T09:03:04.000000000',
            },
          ],
        });
      }
      if (parsed.pathname.endsWith('/markets/kr/by-date/completed')) {
        return jsonResponse({
          result: {
            body: [
              {
                orderNo: sensitiveFixtureValue('raw-comp', 'leted-or', 'der-no'),
                orderId: 'raw-completed-order-id',
                orderedAt: '2026-05-10T10:00:00.000000000',
                lastExecutedAt: '2026-05-10T10:01:00.000000000',
                stockCode: '005930',
                stockName: '삼성전자',
                tradeType: 'BUY',
                status: 'COMPLETED',
                orderQuantity: 10,
                executedQuantity: 10,
                userOrderDate: '2026-05-10',
                orderPrice: { krw: 70000 },
                averageExecutionPrice: { krw: 69900 },
              },
            ],
          },
        });
      }
      throw new Error(`unexpected URL ${url}`);
    });
    const client = createTossOrdersClient({
      sessionStore: makeStore(session()),
      fetchImpl,
      certBaseUrl: 'https://example.test',
      now: () => new Date('2026-05-11T07:00:00.000Z'),
    });

    const result = await client.getOrder('completed-order-1', {
      market: 'kr',
      from: '2026-05-01',
      to: '2026-05-11',
    });

    expect(result).toEqual({
      provider: 'toss',
      fetchedAt: '2026-05-11T07:00:00.000Z',
      ref: 'completed-order-1',
      kind: 'completed',
      range: {
        market: 'kr',
        from: '2026-05-01',
        to: '2026-05-11',
        size: 50,
        number: 1,
      },
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
    });
    expect(JSON.stringify(result)).not.toContain(sensitiveFixtureValue('raw-comp', 'leted-or', 'der-no'));
    expect(JSON.stringify(result)).not.toContain('raw-completed-order-id');
    await expect(client.getOrder('2026-05-10/raw-completed-order-no', {
      market: 'kr',
      from: '2026-05-01',
      to: '2026-05-11',
    })).rejects.toThrow('Toss order ref was not found');
  });
});
