import { describe, expect, it, vi } from 'vitest';

import {
  fetchTossStockByTicker,
  fetchTossQuoteBatch,
  fetchTossRealtimeRanking,
  fetchTossStockSearch,
} from '../toss-public-client.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('toss public client', () => {
  it('maps Toss bulk stock prices into Araon Price rows', async () => {
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      expect(url).toContain('/api/v1/product/stock-prices');
      expect(url).toContain('A005930%2CA000660');
      return jsonResponse({
        result: [
          {
            productCode: 'A005930',
            currency: 'KRW',
            base: 268_500,
            close: 284_000,
            volume: 56_326_493,
          },
          {
            productCode: 'A000660',
            currency: 'KRW',
            base: 180_000,
            close: 171_000,
            volume: 10_000,
          },
        ],
      });
    });

    const rows = await fetchTossQuoteBatch({
      tickers: ['005930', 'A000660', '005930'],
      now: () => new Date('2026-05-11T06:05:00.000Z'),
      fetchFn,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      ticker: '005930',
      price: 284_000,
      changeAbs: 15_500,
      volume: 56_326_493,
      updatedAt: '2026-05-11T06:05:00.000Z',
      isSnapshot: false,
      source: 'rest',
    });
    expect(rows[0]?.changeRate).toBeCloseTo(5.7728119180633145, 12);
    expect(rows[1]).toEqual({
      ticker: '000660',
      price: 171_000,
      changeRate: -5,
      changeAbs: -9_000,
      volume: 10_000,
      updatedAt: '2026-05-11T06:05:00.000Z',
      isSnapshot: false,
      source: 'rest',
    });
  });

  it('combines realtime ranking metadata with bulk public prices', async () => {
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/api/v1/rankings/realtime/stock')) {
        return jsonResponse({
          result: {
            dateTime: '2025-03-10T16:44:43',
            data: [
              {
                code: 'A005930',
                symbol: '005930',
                name: '삼성전자',
                currency: 'KRW',
                market: { displayName: '코스피' },
              },
              {
                code: 'US20100629001',
                symbol: 'TSLA',
                name: '테슬라',
                currency: 'USD',
                market: { displayName: 'NASDAQ' },
              },
            ],
          },
        });
      }
      if (url.includes('/api/v1/product/stock-prices')) {
        expect(url).toContain('A005930%2CUS20100629001');
        return jsonResponse({
          result: [
            {
              productCode: 'A005930',
              currency: 'KRW',
              base: 268_500,
              close: 284_000,
              volume: 56_326_493,
            },
            {
              productCode: 'US20100629001',
              currency: 'USD',
              base: 260,
              close: 275.2,
              volume: 9_999,
            },
          ],
        });
      }
      throw new Error(`unexpected URL ${url}`);
    });

    const result = await fetchTossRealtimeRanking({
      limit: 100,
      market: 'all',
      now: () => new Date('2026-05-11T06:05:00.000Z'),
      fetchFn,
    });

    expect(result.source).toBe('toss-public-realtime-ranking');
    expect(result.rankingTimestampStatus).toBe('stale');
    expect(result.coverage).toEqual({
      requestedLimit: 100,
      returnedCount: 2,
      pricedCount: 2,
      market: 'all',
    });
    expect(result.items[0]).toMatchObject({
      rank: 1,
      ticker: '005930',
      productCode: 'A005930',
      name: '삼성전자',
      price: 284_000,
      changeAbs: 15_500,
      currency: 'KRW',
    });
    expect(result.items[0]?.changePct).toBeCloseTo(5.7728119180633145, 12);
  });

  it('keeps the source honest when filtering to Korean stocks', async () => {
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/api/v1/rankings/realtime/stock')) {
        return jsonResponse({
          result: {
            dateTime: '2026-05-11T15:04:00+09:00',
            data: [
              {
                code: 'US20100629001',
                symbol: 'TSLA',
                name: '테슬라',
                currency: 'USD',
                market: { displayName: 'NASDAQ' },
              },
              {
                code: 'A005930',
                symbol: '005930',
                name: '삼성전자',
                currency: 'KRW',
                market: { displayName: '코스피' },
              },
            ],
          },
        });
      }
      return jsonResponse({
        result: [
          {
            productCode: 'A005930',
            currency: 'KRW',
            base: 268_500,
            close: 284_000,
            volume: 56_326_493,
          },
        ],
      });
    });

    const result = await fetchTossRealtimeRanking({
      limit: 100,
      market: 'kr',
      now: () => new Date('2026-05-11T06:05:00.000Z'),
      fetchFn,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.ticker).toBe('005930');
    expect(result.coverage.market).toBe('kr');
    expect(result.message).toContain('토스 공개 인기 랭킹');
  });

  it('searches Toss stocks and keeps only Korean stocks with known markets', async () => {
    const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/v2/search/stocks')) {
        expect(init?.method).toBe('POST');
        expect(init?.body).toBe(JSON.stringify({ query: '삼성' }));
        return jsonResponse({
          result: {
            stocks: [
              { stockCode: 'A005930', stockName: '삼성전자', matchType: 'EXACT' },
              { stockCode: 'A028260', stockName: '삼성물산', matchType: 'AFFILIATE' },
              { stockCode: 'US123456789', stockName: 'Samsung US', matchType: 'UNKNOWN' },
            ],
          },
        });
      }
      if (url.includes('/api/v1/stock-infos')) {
        expect(url).toContain('A005930%2CA028260');
        return jsonResponse({
          result: [
            {
              code: 'A005930',
              symbol: '005930',
              name: '삼성전자',
              currency: 'KRW',
              market: { code: 'KSP', displayName: '코스피' },
            },
            {
              code: 'A028260',
              symbol: '028260',
              name: '삼성물산',
              currency: 'KRW',
              market: { code: 'KSP', displayName: '코스피' },
            },
          ],
        });
      }
      throw new Error(`unexpected URL ${url}`);
    });

    const rows = await fetchTossStockSearch({ query: '삼성', limit: 8, fetchFn });

    expect(rows).toEqual([
      {
        ticker: '005930',
        productCode: 'A005930',
        name: '삼성전자',
        market: 'KOSPI',
        matchType: 'EXACT',
        source: 'toss-public-search',
      },
      {
        ticker: '028260',
        productCode: 'A028260',
        name: '삼성물산',
        market: 'KOSPI',
        matchType: 'AFFILIATE',
        source: 'toss-public-search',
      },
    ]);
  });

  it('loads a single Toss stock by ticker for local catalog promotion', async () => {
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      expect(url).toContain('/api/v1/stock-infos');
      expect(url).toContain('A000660');
      return jsonResponse({
        result: [
          {
            code: 'A000660',
            symbol: '000660',
            name: 'SK하이닉스',
            currency: 'KRW',
            market: { code: 'KSP', displayName: '코스피' },
          },
        ],
      });
    });

    const row = await fetchTossStockByTicker({ ticker: '000660', fetchFn });

    expect(row).toEqual({
      ticker: '000660',
      productCode: 'A000660',
      name: 'SK하이닉스',
      market: 'KOSPI',
      matchType: null,
      source: 'toss-public-search',
    });
  });
});
