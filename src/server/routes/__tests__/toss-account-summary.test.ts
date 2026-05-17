import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { tossAccountSummaryRoutes } from '../toss-account-summary.js';
import type { TossAccountSummaryClient } from '../../toss/toss-account-summary-client.js';

describe('toss account summary routes', () => {
  it('returns sanitized Toss account summary through a read-only route', async () => {
    const summaryClient: TossAccountSummaryClient = {
      getSummary: vi.fn(async () => ({
        provider: 'toss',
        fetchedAt: '2026-05-11T06:45:00.000Z',
        totalAssetAmount: 210000,
        evaluatedProfitAmount: 15000,
        profitRate: 7.6923,
        orderableAmountKrw: 5000,
        orderableAmountUsd: 0.01,
        withdrawable: {
          kr: [{ date: '2026-05-11', krw: 5000, usd: 0 }],
          us: [{ date: '2026-05-11', krw: 14, usd: 0.01 }],
        },
        markets: {},
      })),
    };
    const app = Fastify({ logger: false });
    await app.register(tossAccountSummaryRoutes, { summaryClient });

    const res = await app.inject({ method: 'GET', url: '/toss/account/summary' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: {
        provider: 'toss',
        fetchedAt: '2026-05-11T06:45:00.000Z',
        totalAssetAmount: 210000,
        evaluatedProfitAmount: 15000,
        profitRate: 7.6923,
        orderableAmountKrw: 5000,
        orderableAmountUsd: 0.01,
        withdrawable: {
          kr: [{ date: '2026-05-11', krw: 5000, usd: 0 }],
          us: [{ date: '2026-05-11', krw: 14, usd: 0.01 }],
        },
        markets: {},
      },
    });
    expect(res.body).not.toContain('accountNo');
    expect(res.body).not.toContain('fixture-ledger-ref');
  });

  it('maps missing Toss session to 503 without leaking internals', async () => {
    const summaryClient: TossAccountSummaryClient = {
      getSummary: vi.fn(async () => {
        throw new Error('Toss session is required');
      }),
    };
    const app = Fastify({ logger: false });
    await app.register(tossAccountSummaryRoutes, { summaryClient });

    const res = await app.inject({ method: 'GET', url: '/toss/account/summary' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      success: false,
      error: { code: 'TOSS_SESSION_REQUIRED' },
    });
  });

  it('sanitizes unexpected Toss account summary failures', async () => {
    const summaryClient: TossAccountSummaryClient = {
      getSummary: vi.fn(async () => {
        throw new Error('raw Toss summary response SESSION=[test-session] accountNo=[test-account]');
      }),
    };
    const app = Fastify({ logger: false });
    await app.register(tossAccountSummaryRoutes, { summaryClient });

    const res = await app.inject({ method: 'GET', url: '/toss/account/summary' });

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
    expect(res.body).not.toContain('accountNo');
  });
});
