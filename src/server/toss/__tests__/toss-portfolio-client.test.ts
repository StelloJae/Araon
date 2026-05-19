import { describe, expect, it, vi } from 'vitest';

import {
  createCachingTossPortfolioClient,
  createTossPortfolioClient,
  createTossPortfolioSnapshotStore,
  type TossPortfolioClient,
  type TossPortfolioPositionsPayload,
} from '../toss-portfolio-client.js';
import { createTossProductIconCache } from '../toss-product-icon.js';
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

describe('Toss portfolio client', () => {
  it('maps SORTED_OVERVIEW holdings into sanitized portfolio positions', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === 'https://example-api.test/api/v1/account/list') {
        return jsonResponse({
          result: {
            primaryKey: 'raw-primary-account-key',
            accountList: [{ key: 'raw-primary-account-key', type: '위탁' }],
          },
        });
      }

      expect(String(url)).toBe('https://example.test/api/v2/dashboard/asset/sections/all');
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('X-Tossinvest-Account')).toBe('raw-primary-account-key');
      expect(init?.body).toBe(JSON.stringify({ types: ['SORTED_OVERVIEW'] }));
      return jsonResponse({
      result: {
        sections: [
          { type: 'SUMMARY', data: {} },
          {
            type: 'SORTED_OVERVIEW',
            data: {
              products: [
                {
                  marketType: 'KR',
                  items: [
                    {
                      stockCode: '005930',
                      stockSymbol: null,
                      stockName: '삼성전자',
                      logoImageUrl: 'https://static.toss.im/png-icons/securities/icn-sec-fill-005930.png',
                      quantity: 3,
                      currentPrice: { krw: 70000 },
                      purchasePrice: { krw: 65000 },
                      evaluatedAmount: { krw: 210000 },
                      profitLossAmount: { krw: 15000 },
                      profitLossRate: { krw: 7.6923 },
                      dailyProfitLossAmount: { krw: 1200 },
                      dailyProfitLossRate: { krw: 0.57 },
                      marketCode: 'KRX',
                      accountNo: 'fixture-ledger-ref',
                    },
                  ],
                },
                {
                  marketType: 'US',
                  items: [
                    {
                      stockCode: 'US0378331005',
                      stockSymbol: 'AAPL',
                      stockName: 'Apple',
                      quantity: 1.5,
                      currentPrice: { usd: 210.5 },
                      purchasePrice: { usd: 200 },
                      evaluatedAmount: { usd: 315.75 },
                      profitLossAmount: { usd: 15.75 },
                      profitLossRate: { usd: 5.25 },
                      dailyProfitLossAmount: { usd: -1.2 },
                      dailyProfitLossRate: { usd: -0.38 },
                      marketCode: 'NASDAQ',
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
      });
    });
    const iconCache = createTossProductIconCache();
    const client = createTossPortfolioClient({
      sessionStore: makeStore(session()),
      fetchImpl,
      iconCache,
      apiBaseUrl: 'https://example-api.test',
      certBaseUrl: 'https://example.test',
      now: () => new Date('2026-05-11T06:30:00.000Z'),
    });

    const result = await client.listPositions();

    expect(result).toEqual({
      provider: 'toss',
      fetchedAt: '2026-05-11T06:30:00.000Z',
      positions: [
        {
          productCode: '005930',
          symbol: '005930',
          name: '삼성전자',
          iconUrl: 'https://static.toss.im/png-icons/securities/icn-sec-fill-005930.png',
          marketType: 'KR',
          marketCode: 'KRX',
          quantity: 3,
          averagePrice: 65000,
          currentPrice: 70000,
          marketValue: 210000,
          unrealizedPnl: 15000,
          profitRate: 7.6923,
          dailyProfitLoss: 1200,
          dailyProfitRate: 0.57,
          averagePriceUsd: 0,
          currentPriceUsd: 0,
          marketValueUsd: 0,
          unrealizedPnlUsd: 0,
          profitRateUsd: 0,
          dailyProfitLossUsd: 0,
          dailyProfitRateUsd: 0,
        },
        {
          productCode: 'US0378331005',
          symbol: 'AAPL',
          name: 'Apple',
          marketType: 'US',
          marketCode: 'NASDAQ',
          quantity: 1.5,
          averagePrice: 200,
          currentPrice: 210.5,
          marketValue: 315.75,
          unrealizedPnl: 15.75,
          profitRate: 5.25,
          dailyProfitLoss: -1.2,
          dailyProfitRate: -0.38,
          averagePriceUsd: 200,
          currentPriceUsd: 210.5,
          marketValueUsd: 315.75,
          unrealizedPnlUsd: 15.75,
          profitRateUsd: 5.25,
          dailyProfitLossUsd: -1.2,
          dailyProfitRateUsd: -0.38,
        },
      ],
    });
    expect(iconCache.get('A005930')).toBe('https://static.toss.im/png-icons/securities/icn-sec-fill-005930.png');
    expect(JSON.stringify(result)).not.toContain('fixture-ledger-ref');
    expect(JSON.stringify(result)).not.toContain('raw-primary-account-key');
  });

  it('does not call Toss when no session is stored', async () => {
    const fetchImpl = vi.fn();
    const client = createTossPortfolioClient({
      sessionStore: makeStore(null),
      fetchImpl,
    });

    await expect(client.listPositions()).rejects.toThrow('Toss session is required');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('updates an in-memory snapshot only after successful position refreshes', async () => {
    const payload: TossPortfolioPositionsPayload = {
      provider: 'toss',
      fetchedAt: '2026-05-11T06:30:00.000Z',
      positions: [],
    };
    const snapshotStore = createTossPortfolioSnapshotStore();
    const baseClient: TossPortfolioClient = {
      listPositions: vi.fn(async () => payload),
    };
    const client = createCachingTossPortfolioClient(baseClient, snapshotStore);

    expect(snapshotStore.snapshot()).toBeNull();
    await expect(client.listPositions()).resolves.toBe(payload);
    expect(snapshotStore.snapshot()).toBe(payload);
    snapshotStore.clear();
    expect(snapshotStore.snapshot()).toBeNull();
  });
});
