import { describe, expect, it, vi } from 'vitest';

import {
  fetchTossOverviewRanking,
  mapTossOverviewRankingProducts,
} from '../toss-overview-ranking-client.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('toss overview ranking client', () => {
  it('normalizes Toss overview ranking products into market top mover items', () => {
    const rows = mapTossOverviewRankingProducts([
      {
        rank: 1,
        productCode: 'A439960',
        name: '코스모로보틱스',
        price: {
          base: 6_000,
          close: 24_000,
          marketVolume: 41_077_929,
        },
      },
      {
        rank: 2,
        productCode: 'A452200',
        name: '민테크',
        price: {
          base: 3_450,
          close: 4_485,
          marketVolume: 13_822_248,
        },
      },
      {
        rank: 3,
        productCode: 'bad',
        name: '깨진종목',
        price: { base: 1, close: 2 },
      },
    ]);

    expect(rows).toEqual([
      {
        rank: 1,
        ticker: '439960',
        name: '코스모로보틱스',
        price: 24_000,
        changeAbs: 18_000,
        changePct: 300,
        volume: 41_077_929,
      },
      {
        rank: 2,
        ticker: '452200',
        name: '민테크',
        price: 4_485,
        changeAbs: 1_035,
        changePct: 30,
        volume: 13_822_248,
      },
    ]);
  });

  it('fetches Korean gainer and loser TOP100 through the Toss overview ranking endpoint', async () => {
    const diagnostics: unknown[] = [];
    const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      expect(url).toBe('https://wts-cert-api.tossinvest.com/api/v2/dashboard/wts/overview/ranking');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({
        id: 'heavy_soar',
        tag: 'kr',
        duration: '1d',
        filters: [],
      });

      return jsonResponse({
        result: {
          basedAt: '2026-05-11T15:19:11.268+09:00',
          products: Array.from({ length: 100 }, (_, idx) => ({
            rank: idx + 1,
            productCode: `A${String(439960 + idx).padStart(6, '0')}`,
            name: `상승${idx + 1}`,
            price: {
              base: 1_000,
              close: 1_100 + idx,
              marketVolume: 10_000 + idx,
            },
          })),
        },
      });
    });

    const result = await fetchTossOverviewRanking({
      direction: 'gainers',
      count: 100,
      market: 'kr',
      fetchFn,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(result).toHaveLength(100);
    expect(result[0]).toMatchObject({
      rank: 1,
      ticker: '439960',
      name: '상승1',
      price: 1_100,
      changeAbs: 100,
      changePct: 10,
    });
    expect(diagnostics).toEqual([
      expect.objectContaining({
        direction: 'gainers',
        pagesAttempted: 1,
        rowsReceived: 100,
        rowsAccepted: 100,
        rowsPerPage: [100],
        continuationValues: [null],
        stopReason: 'complete',
      }),
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain('appSecret');
  });
});
