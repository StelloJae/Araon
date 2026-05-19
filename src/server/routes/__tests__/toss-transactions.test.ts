import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { tossTransactionsRoutes } from '../toss-transactions.js';
import type { TossTransactionsClient } from '../../toss/toss-transactions-client.js';

describe('toss transactions routes', () => {
  it('returns sanitized Toss transaction ledger rows with query options', async () => {
    const transactionsClient: TossTransactionsClient = {
      listTransactions: vi.fn(async () => ({
        provider: 'toss',
        fetchedAt: '2026-05-11T06:45:00.000Z',
        market: 'us',
        range: {
          market: 'us',
          from: '2026-05-01',
          to: '2026-05-11',
          filter: 'cash',
          size: 25,
          number: 2,
        },
        lastPage: true,
        next: null,
        items: [{
          ref: 'transaction-1',
          market: 'us',
          category: 'cash',
          type: '2',
          code: '1',
          displayName: '입금',
          displayType: '13',
          summary: '이체입금',
          symbol: '',
          name: '',
          currency: 'USD',
          quantity: 0,
          amount: 10,
          adjustedAmount: 10,
          commissionAmount: 0,
          taxAmount: 0,
          balanceAmount: 10,
          date: null,
          dateTime: '2026-05-11 10:00:00.000',
          orderDate: null,
          settlementDate: null,
          tradeType: '',
          referenceType: 'cash',
        }],
      })),
      getOverview: vi.fn(),
    };
    const app = Fastify({ logger: false });
    await app.register(tossTransactionsRoutes, { transactionsClient });

    const res = await app.inject({
      method: 'GET',
      url: '/toss/transactions?market=us&from=2026-05-01&to=2026-05-11&filter=cash&size=25&number=2',
    });

    expect(res.statusCode).toBe(200);
    expect(transactionsClient.listTransactions).toHaveBeenCalledWith({
      market: 'us',
      from: '2026-05-01',
      to: '2026-05-11',
      filter: 'cash',
      size: 25,
      number: 2,
    });
    expect(res.body).not.toContain('referenceId');
    expect(res.body).not.toContain('compositeKey');
    expect(res.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        provider: 'toss',
        market: 'us',
        items: [expect.objectContaining({ ref: 'transaction-1' })],
      }),
    });
  });

  it('rejects invalid query options before calling the client', async () => {
    const transactionsClient: TossTransactionsClient = {
      listTransactions: vi.fn(),
      getOverview: vi.fn(),
    };
    const app = Fastify({ logger: false });
    await app.register(tossTransactionsRoutes, { transactionsClient });

    const res = await app.inject({
      method: 'GET',
      url: '/toss/transactions?market=all&size=500',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      success: false,
      error: { code: 'INVALID_TOSS_TRANSACTIONS_QUERY' },
    });
    expect(transactionsClient.listTransactions).not.toHaveBeenCalled();
  });

  it('returns sanitized Toss transaction overview for a market', async () => {
    const transactionsClient: TossTransactionsClient = {
      listTransactions: vi.fn(),
      getOverview: vi.fn(async () => ({
        provider: 'toss',
        fetchedAt: '2026-05-11T07:45:00.000Z',
        market: 'kr',
        orderableAmountKrw: 100_000,
        orderableAmountUsd: 0,
        withdrawable: [{ date: '2026-05-11', krw: 90_000, usd: 0 }],
        displayWithdrawable: [{ date: '2026-05-11', krw: 90_000, usd: 0 }],
        deposit: [{ date: '2026-05-13', krw: 25_000, usd: 0 }],
        estimateSettlement: [{ date: '2026-05-13', buyAmount: 0, sellAmount: 25_000 }],
        withdrawableBottomSheet: [{ title: '출금가능금액', krw: 90_000, usd: 0 }],
      })),
    };
    const app = Fastify({ logger: false });
    await app.register(tossTransactionsRoutes, { transactionsClient });

    const res = await app.inject({
      method: 'GET',
      url: '/toss/transactions/overview?market=kr',
    });

    expect(res.statusCode).toBe(200);
    expect(transactionsClient.getOverview).toHaveBeenCalledWith('kr');
    expect(res.body).not.toContain('accountNo');
    expect(res.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        provider: 'toss',
        market: 'kr',
        deposit: [expect.objectContaining({ krw: 25_000 })],
      }),
    });
  });

  it('rejects invalid transaction overview query before calling the client', async () => {
    const transactionsClient: TossTransactionsClient = {
      listTransactions: vi.fn(),
      getOverview: vi.fn(),
    };
    const app = Fastify({ logger: false });
    await app.register(tossTransactionsRoutes, { transactionsClient });

    const res = await app.inject({
      method: 'GET',
      url: '/toss/transactions/overview?market=all',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      success: false,
      error: { code: 'INVALID_TOSS_TRANSACTIONS_OVERVIEW_QUERY' },
    });
    expect(transactionsClient.getOverview).not.toHaveBeenCalled();
  });

  it('returns 503 for transaction overview when Toss session is absent', async () => {
    const transactionsClient: TossTransactionsClient = {
      listTransactions: vi.fn(),
      getOverview: vi.fn(async () => {
        throw new Error('Toss session is required');
      }),
    };
    const app = Fastify({ logger: false });
    await app.register(tossTransactionsRoutes, { transactionsClient });

    const res = await app.inject({
      method: 'GET',
      url: '/toss/transactions/overview',
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      success: false,
      error: { code: 'TOSS_SESSION_REQUIRED' },
    });
  });

  it('sanitizes unexpected Toss transaction failures', async () => {
    const transactionsClient: TossTransactionsClient = {
      listTransactions: vi.fn(async () => {
        throw new Error('raw Toss transaction response SESSION=[test-session] referenceId=[test-reference]');
      }),
      getOverview: vi.fn(),
    };
    const app = Fastify({ logger: false });
    await app.register(tossTransactionsRoutes, { transactionsClient });

    const res = await app.inject({ method: 'GET', url: '/toss/transactions' });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({
      success: false,
      error: {
        code: 'TOSS_READ_REQUEST_FAILED',
        message: 'Toss read request failed',
      },
    });
    expect(res.body).not.toContain(['SESSION', ''].join('='));
    expect(res.body).not.toContain('[test-session]');
    expect(res.body).not.toContain('referenceId');
    expect(res.body).not.toContain('[test-reference]');
  });
});
