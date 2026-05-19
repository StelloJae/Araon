import { describe, expect, it, vi } from 'vitest';

import { createTossAccountSummaryClient } from '../toss-account-summary-client.js';
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

describe('Toss account summary client', () => {
  it('combines overview, orderable amounts, and withdrawable buckets without raw account identifiers', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const path = new URL(String(url)).pathname;
      if (path === '/api/v3/my-assets/summaries/markets/all/overview') {
        return jsonResponse({
          result: {
            accountNo: 'fixture-ledger-ref',
            totalAssetAmount: 210000,
            evaluatedProfitAmount: 15000,
            profitRate: 7.6923,
            overviewByMarket: {
              kr: {
                market: 'kr',
                accountNo: 'fixture-kr-ledger-ref',
                pendingBuyOrderAmount: 1000,
                evaluatedAmount: 200000,
                principalAmount: 185000,
                evaluatedProfitAmount: 15000,
                profitRate: 8.1081,
                totalAssetAmount: 201000,
                orderableAmount: { krw: 5000, usd: null },
              },
              us: {
                market: 'us',
                accountNo: 'fixture-us-ledger-ref',
                pendingBuyOrderAmount: 0,
                evaluatedAmount: 9000,
                principalAmount: 9000,
                evaluatedProfitAmount: 0,
                profitRate: 0,
                totalAssetAmount: 9000,
                orderableAmount: { krw: 14, usd: 0.01 },
              },
            },
          },
        });
      }
      if (path === '/api/v1/dashboard/common/cached-orderable-amount') {
        return jsonResponse({
          result: {
            orderableAmountKr: { krw: 5000, usd: null },
            orderableAmountUs: { krw: 14, usd: 0.01 },
          },
        });
      }
      if (path === '/api/v1/my-assets/summaries/markets/kr/withdrawable-amount') {
        return jsonResponse({
          result: {
            amount0: { krw: 5000, usd: null },
            date0: '2026-05-11',
            amount1: { krw: 4000, usd: null },
            date1: '2026-05-12',
          },
        });
      }
      if (path === '/api/v1/my-assets/summaries/markets/us/withdrawable-amount') {
        return jsonResponse({
          result: {
            amount0: { krw: 14, usd: 0.01 },
            date0: '2026-05-11',
          },
        });
      }
      throw new Error(`unexpected URL ${url}`);
    });
    const client = createTossAccountSummaryClient({
      sessionStore: makeStore(session()),
      fetchImpl,
      apiBaseUrl: 'https://api.example.test',
      certBaseUrl: 'https://cert.example.test',
      now: () => new Date('2026-05-11T06:45:00.000Z'),
    });

    const result = await client.getSummary();

    expect(result).toEqual({
      provider: 'toss',
      fetchedAt: '2026-05-11T06:45:00.000Z',
      totalAssetAmount: 210000,
      evaluatedProfitAmount: 15000,
      profitRate: 7.6923,
      orderableAmountKrw: 5000,
      orderableAmountUsd: 0.01,
      withdrawable: {
        kr: [
          { date: '2026-05-11', krw: 5000, usd: 0 },
          { date: '2026-05-12', krw: 4000, usd: 0 },
        ],
        us: [
          { date: '2026-05-11', krw: 14, usd: 0.01 },
        ],
      },
      markets: {
        kr: {
          market: 'kr',
          pendingBuyOrderAmount: 1000,
          evaluatedAmount: 200000,
          principalAmount: 185000,
          evaluatedProfitAmount: 15000,
          profitRate: 8.1081,
          totalAssetAmount: 201000,
          orderableAmountKrw: 5000,
          orderableAmountUsd: 0,
        },
        us: {
          market: 'us',
          pendingBuyOrderAmount: 0,
          evaluatedAmount: 9000,
          principalAmount: 9000,
          evaluatedProfitAmount: 0,
          profitRate: 0,
          totalAssetAmount: 9000,
          orderableAmountKrw: 14,
          orderableAmountUsd: 0.01,
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain('fixture-ledger-ref');
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('does not call Toss when no session is stored', async () => {
    const fetchImpl = vi.fn();
    const client = createTossAccountSummaryClient({
      sessionStore: makeStore(null),
      fetchImpl,
    });

    await expect(client.getSummary()).rejects.toThrow('Toss session is required');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
