import { describe, expect, it, vi } from 'vitest';
import {
  fetchTossMinuteCandles,
  mapTossMinuteChartRows,
} from '../toss-minute-chart.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('mapTossMinuteChartRows', () => {
  it('maps Toss minute rows into 1m candles with session labels', () => {
    const candles = mapTossMinuteChartRows(
      '005930',
      [
        {
          dt: '2026-05-11T17:51:00+09:00',
          open: 283500,
          high: 284000,
          low: 283500,
          close: 284000,
          volume: 577,
        },
        {
          dt: '2026-05-11T17:50:00+09:00',
          open: 284000,
          high: 284000,
          low: 284000,
          close: 284000,
          volume: 0,
        },
      ],
      '2026-05-11T09:00:00.000Z',
      'toss-time-today',
    );

    expect(candles).toEqual([
      expect.objectContaining({
        ticker: '005930',
        interval: '1m',
        bucketAt: '2026-05-11T08:51:00.000Z',
        session: 'after',
        open: 283500,
        close: 284000,
        volume: 577,
        source: 'toss-time-today',
      }),
    ]);
  });
});

describe('fetchTossMinuteCandles', () => {
  it('uses the Toss min:1 c-chart endpoint with a KST cursor', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({
      result: {
        code: 'A005930',
        candles: [
          {
            dt: '2026-05-11T17:51:00+09:00',
            open: 283500,
            high: 284000,
            low: 283500,
            close: 284000,
            volume: 577,
          },
        ],
      },
    }));

    const candles = await fetchTossMinuteCandles({
      ticker: '005930',
      dateYmd: '20260511',
      toHms: '175100',
      source: 'toss-time-daily',
      now: () => new Date('2026-05-11T09:00:00.000Z'),
      fetchFn: fetchFn as unknown as typeof fetch,
      infoBaseUrl: 'https://example.test',
    });

    expect(candles).toHaveLength(1);
    expect(candles[0]?.source).toBe('toss-time-daily');
    const url = new URL(fetchFn.mock.calls[0]?.[0] as string);
    expect(url.pathname).toBe('/api/v1/c-chart/kr-s/A005930/min:1');
    expect(url.searchParams.get('from')).toBe('2026-05-11T17:51:00+09:00');
    expect(url.searchParams.get('session')).toBe('all');
    expect(url.searchParams.get('investMode')).toBe('integrated');
  });

  it('rejects invalid cursors before making a request', async () => {
    const fetchFn = vi.fn();

    await expect(fetchTossMinuteCandles({
      ticker: 'US0378331005',
      dateYmd: '20260511',
      toHms: '175100',
      source: 'toss-time-today',
      fetchFn: fetchFn as unknown as typeof fetch,
    })).rejects.toThrow('Korean stock ticker');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
