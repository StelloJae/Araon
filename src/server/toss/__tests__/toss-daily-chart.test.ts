import { describe, expect, it, vi } from 'vitest';
import {
  fetchTossDailyCandles,
  mapTossDailyChartRows,
} from '../toss-daily-chart.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('mapTossDailyChartRows', () => {
  it('maps Toss chart rows into daily candles and filters the requested window', () => {
    const candles = mapTossDailyChartRows(
      '005930',
      [
        {
          dt: '2026-05-11T00:00:00+09:00',
          open: 285000,
          high: 286000,
          low: 283000,
          close: 284000,
          volume: 1000,
        },
        {
          dt: '2026-05-01T00:00:00+09:00',
          open: 1,
          high: 1,
          low: 1,
          close: 1,
          volume: 1,
        },
      ],
      '2026-05-11T01:00:00.000Z',
      '20260510',
      '20260511',
    );

    expect(candles).toEqual([
      expect.objectContaining({
        ticker: '005930',
        interval: '1d',
        bucketAt: '2026-05-10T15:00:00.000Z',
        open: 285000,
        close: 284000,
        volume: 1000,
        source: 'toss-daily',
        isPartial: false,
      }),
    ]);
  });
});

describe('fetchTossDailyCandles', () => {
  it('uses the Toss c-chart endpoint from the requested to date', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({
      result: {
        code: 'A005930',
        nextDateTime: '2026-05-06T00:00:00+09:00',
        candles: [
          {
            dt: '2026-05-11T00:00:00+09:00',
            open: 285000,
            high: 286000,
            low: 283000,
            close: 284000,
            volume: 1000,
          },
        ],
      },
    }));

    const candles = await fetchTossDailyCandles({
      ticker: '005930',
      fromYmd: '20260511',
      toYmd: '20260511',
      now: () => new Date('2026-05-11T01:00:00.000Z'),
      fetchFn: fetchFn as unknown as typeof fetch,
      infoBaseUrl: 'https://example.test',
    });

    expect(candles).toHaveLength(1);
    const url = new URL(fetchFn.mock.calls[0]?.[0] as string);
    expect(url.pathname).toBe('/api/v1/c-chart/kr-s/A005930/day:1');
    expect(url.searchParams.get('from')).toBe('2026-05-11T00:00:00+09:00');
    expect(url.searchParams.get('session')).toBe('all');
    expect(url.searchParams.get('investMode')).toBe('integrated');
    expect(url.searchParams.get('useAdjustedRate')).toBe('true');
  });

  it('follows nextDateTime when the first page does not reach the requested start', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        result: {
          nextDateTime: '2026-05-06T00:00:00+09:00',
          candles: [
            {
              dt: '2026-05-11T00:00:00+09:00',
              open: 10,
              high: 11,
              low: 9,
              close: 10,
              volume: 10,
            },
          ],
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        result: {
          nextDateTime: '2026-04-30T00:00:00+09:00',
          candles: [
            {
              dt: '2026-05-06T00:00:00+09:00',
              open: 20,
              high: 21,
              low: 19,
              close: 20,
              volume: 20,
            },
          ],
        },
      }));

    const candles = await fetchTossDailyCandles({
      ticker: 'A005930',
      fromYmd: '20260506',
      toYmd: '20260511',
      now: () => new Date('2026-05-11T01:00:00.000Z'),
      fetchFn: fetchFn as unknown as typeof fetch,
      infoBaseUrl: 'https://example.test',
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(candles.map((candle) => candle.close)).toEqual([20, 10]);
    const secondUrl = new URL(fetchFn.mock.calls[1]?.[0] as string);
    expect(secondUrl.searchParams.get('from')).toBe('2026-05-06T00:00:00+09:00');
  });

  it('rejects non-Korean product codes before making a request', async () => {
    const fetchFn = vi.fn();

    await expect(fetchTossDailyCandles({
      ticker: 'US0378331005',
      fromYmd: '20260501',
      toYmd: '20260511',
      fetchFn: fetchFn as unknown as typeof fetch,
    })).rejects.toThrow('Korean stock ticker');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
