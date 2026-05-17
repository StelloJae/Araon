import { describe, expect, it, vi } from 'vitest';

import { createTossTransactionsClient } from '../toss-transactions-client.js';
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

describe('Toss transactions client', () => {
  it('maps Toss transaction ledger rows without raw identifiers', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const parsed = new URL(String(url));
      expect(parsed.pathname).toBe('/api/v3/my-assets/transactions/markets/kr');
      expect(parsed.searchParams.get('range.from')).toBe('2026-05-01');
      expect(parsed.searchParams.get('range.to')).toBe('2026-05-11');
      expect(parsed.searchParams.get('filters')).toBe('0');
      expect(parsed.searchParams.get('size')).toBe('25');
      expect(parsed.searchParams.get('number')).toBe('2');
      return jsonResponse({
        result: {
          pagingParam: {
            number: 2,
            size: 25,
            key: 'fixture-ledger-page-key',
            filters: '0',
            type: '',
          },
          body: [
            {
              type: '1',
              transactionType: { code: '5', displayName: '매수' },
              displayType: '50',
              summary: null,
              stockCode: '005930',
              stockName: '삼성전자',
              quantity: 10,
              amount: 1_000_000,
              adjustedAmount: -1_000_000,
              commissionAmount: 15,
              totalTaxAmount: 0,
              date: '2026-05-10',
              settlementDate: '2026-05-12',
              referenceId: 'fixture-[test-reference]erence-id',
              compositeKey: {
                orderDate: '2026-05-10',
                tradeType: 'buy',
                stockCode: '005930',
                id: 'fixture-[test-composite]-id',
              },
            },
            {
              type: '2',
              transactionType: { code: '1', displayName: '입금' },
              displayType: '13',
              summary: '이체입금',
              amount: 50_000,
              adjustedAmount: 50_000,
              balanceAmount: 70_000,
              dateTime: '2026-05-11 10:00:00.000',
              referenceType: 'cash',
              referenceId: 'fixture-raw-cash-reference',
              compositeKey: {
                date: '2026-05-11',
                no: 'fixture-raw-cash-no',
              },
            },
          ],
          lastPage: true,
        },
      });
    });
    const client = createTossTransactionsClient({
      sessionStore: makeStore(session()),
      fetchImpl,
      apiBaseUrl: 'https://api.example.test',
      now: () => new Date('2026-05-11T06:45:00.000Z'),
    });

    const result = await client.listTransactions({
      market: 'kr',
      from: '2026-05-01',
      to: '2026-05-11',
      filter: 'all',
      size: 25,
      number: 2,
    });

    expect(result).toEqual({
      provider: 'toss',
      fetchedAt: '2026-05-11T06:45:00.000Z',
      market: 'kr',
      range: {
        market: 'kr',
        from: '2026-05-01',
        to: '2026-05-11',
        filter: 'all',
        size: 25,
        number: 2,
      },
      lastPage: true,
      next: null,
      items: [
        {
          ref: 'transaction-1',
          market: 'kr',
          category: 'trade',
          type: '1',
          code: '5',
          displayName: '매수',
          displayType: '50',
          summary: null,
          symbol: '005930',
          name: '삼성전자',
          currency: 'KRW',
          quantity: 10,
          amount: 1_000_000,
          adjustedAmount: -1_000_000,
          commissionAmount: 15,
          taxAmount: 0,
          balanceAmount: 0,
          date: '2026-05-10',
          dateTime: null,
          orderDate: '2026-05-10',
          settlementDate: '2026-05-12',
          tradeType: 'buy',
          referenceType: null,
        },
        {
          ref: 'transaction-2',
          market: 'kr',
          category: 'cash',
          type: '2',
          code: '1',
          displayName: '입금',
          displayType: '13',
          summary: '이체입금',
          symbol: '',
          name: '',
          currency: 'KRW',
          quantity: 0,
          amount: 50_000,
          adjustedAmount: 50_000,
          commissionAmount: 0,
          taxAmount: 0,
          balanceAmount: 70_000,
          date: null,
          dateTime: '2026-05-11 10:00:00.000',
          orderDate: null,
          settlementDate: null,
          tradeType: '',
          referenceType: 'cash',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('fixture-[test-reference]erence-id');
    expect(JSON.stringify(result)).not.toContain('fixture-[test-composite]-id');
    expect(JSON.stringify(result)).not.toContain('fixture-ledger-page-key');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('maps Toss transaction cash overview without raw account material', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const parsed = new URL(String(url));
      expect(parsed.pathname).toBe('/api/v3/my-assets/transactions/markets/kr/overview');
      return jsonResponse({
        result: {
          orderableAmount: { krw: 100_000, usd: null },
          withdrawableAmount: {
            amount0: { krw: 90_000, usd: null },
            date0: '2026-05-11',
            amount1: { krw: 100_000, usd: null },
            date1: '2026-05-12',
            amount2: null,
            date2: null,
          },
          displayWithdrawableAmount: {
            amount0: { krw: 90_000, usd: null },
            date0: '2026-05-11',
          },
          depositAmount: {
            amount0: { krw: 25_000, usd: null },
            date0: '2026-05-13',
          },
          estimateSettlementAmount: {
            day1: { settlementKorDate: '2026-05-12', buyAmount: 10_000, sellAmount: 0 },
            day2: { settlementKorDate: '2026-05-13', buyAmount: 0, sellAmount: 25_000 },
          },
          withdrawableAmountBottomSheet: [
            {
              title: '출금가능금액',
              amount: { krw: 90_000, usd: null },
              accountNo: 'fixture-account-no',
            },
          ],
          accountNo: 'fixture-account-no',
        },
      });
    });
    const client = createTossTransactionsClient({
      sessionStore: makeStore(session()),
      fetchImpl,
      apiBaseUrl: 'https://api.example.test',
      now: () => new Date('2026-05-11T07:45:00.000Z'),
    });

    const result = await client.getOverview('kr');

    expect(result).toEqual({
      provider: 'toss',
      fetchedAt: '2026-05-11T07:45:00.000Z',
      market: 'kr',
      orderableAmountKrw: 100_000,
      orderableAmountUsd: 0,
      withdrawable: [
        { date: '2026-05-11', krw: 90_000, usd: 0 },
        { date: '2026-05-12', krw: 100_000, usd: 0 },
      ],
      displayWithdrawable: [
        { date: '2026-05-11', krw: 90_000, usd: 0 },
      ],
      deposit: [
        { date: '2026-05-13', krw: 25_000, usd: 0 },
      ],
      estimateSettlement: [
        { date: '2026-05-12', buyAmount: 10_000, sellAmount: 0 },
        { date: '2026-05-13', buyAmount: 0, sellAmount: 25_000 },
      ],
      withdrawableBottomSheet: [
        { title: '출금가능금액', krw: 90_000, usd: 0 },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('fixture-account-no');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not call Toss when no session is stored', async () => {
    const fetchImpl = vi.fn();
    const client = createTossTransactionsClient({
      sessionStore: makeStore(null),
      fetchImpl,
    });

    await expect(client.listTransactions()).rejects.toThrow('Toss session is required');
    await expect(client.getOverview()).rejects.toThrow('Toss session is required');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
