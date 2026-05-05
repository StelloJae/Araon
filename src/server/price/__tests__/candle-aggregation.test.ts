import { describe, expect, it } from 'vitest';
import { aggregateCandles, bucketAtForInterval } from '../candle-aggregation.js';
import type { PriceCandle } from '@shared/types.js';

function candle(minute: number, overrides: Partial<PriceCandle> = {}): PriceCandle {
  const bucketAt = new Date(Date.UTC(2026, 4, 5, 0, minute, 0)).toISOString();
  return {
    ticker: '005930',
    interval: '1m',
    bucketAt,
    session: 'regular',
    open: 100 + minute,
    high: 102 + minute,
    low: 99 + minute,
    close: 101 + minute,
    volume: 10 + minute,
    sampleCount: 2,
    source: 'ws-integrated',
    isPartial: false,
    createdAt: bucketAt,
    updatedAt: bucketAt,
    ...overrides,
  };
}

describe('candle interval buckets', () => {
  it('computes KST interval boundaries and daily buckets', () => {
    expect(bucketAtForInterval('2026-05-05T00:07:31.000Z', '5m')).toBe('2026-05-05T00:05:00.000Z');
    expect(bucketAtForInterval('2026-05-05T08:30:00.000Z', '1D')).toBe('2026-05-04T15:00:00.000Z');
    expect(bucketAtForInterval('2026-05-07T03:00:00.000Z', '1W')).toBe('2026-05-03T15:00:00.000Z');
    expect(bucketAtForInterval('2026-05-19T03:00:00.000Z', '1M')).toBe('2026-04-30T15:00:00.000Z');
  });
});

describe('aggregateCandles', () => {
  it('aggregates 1m candles into 3m OHLCV groups', () => {
    const result = aggregateCandles([candle(0), candle(1), candle(2), candle(3)], '3m');

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      bucketAt: '2026-05-05T00:00:00.000Z',
      open: 100,
      high: 104,
      low: 99,
      close: 103,
      volume: 33,
      sampleCount: 6,
      source: 'ws-integrated',
    });
    expect(result[1]?.bucketAt).toBe('2026-05-05T00:03:00.000Z');
  });

  it('aggregates 1m candles into 5m and 1h groups', () => {
    const source = [candle(0), candle(1), candle(2), candle(3), candle(4), candle(59)];

    expect(aggregateCandles(source, '5m')).toHaveLength(2);
    const hourly = aggregateCandles(source, '1h');

    expect(hourly).toHaveLength(1);
    expect(hourly[0]).toMatchObject({
      bucketAt: '2026-05-05T00:00:00.000Z',
      open: 100,
      close: 160,
      high: 161,
      low: 99,
      volume: 10 + 11 + 12 + 13 + 14 + 69,
      sampleCount: 12,
    });
  });

  it('aggregates 1D by KST calendar day', () => {
    const lateKst = {
      ...candle(0),
      bucketAt: '2026-05-05T14:59:00.000Z',
      close: 120,
    };
    const nextKstDay = {
      ...candle(0),
      bucketAt: '2026-05-05T15:00:00.000Z',
      open: 200,
      high: 210,
      low: 190,
      close: 205,
    };

    const result = aggregateCandles([lateKst, nextKstDay], '1D');

    expect(result.map((c) => c.bucketAt)).toEqual([
      '2026-05-04T15:00:00.000Z',
      '2026-05-05T15:00:00.000Z',
    ]);
  });

  it('aggregates 1d candles into 1W groups by KST Monday start', () => {
    const monday = {
      ...candle(0),
      interval: '1d' as const,
      bucketAt: '2026-05-03T15:00:00.000Z',
      open: 100,
      high: 110,
      low: 95,
      close: 108,
      volume: 1_000,
      sampleCount: 1,
      source: 'kis-daily' as const,
    };
    const friday = {
      ...monday,
      bucketAt: '2026-05-07T15:00:00.000Z',
      open: 108,
      high: 125,
      low: 104,
      close: 120,
      volume: 2_000,
      isPartial: true,
    };

    const result = aggregateCandles([friday, monday], '1W');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      interval: '1W',
      bucketAt: '2026-05-03T15:00:00.000Z',
      open: 100,
      high: 125,
      low: 95,
      close: 120,
      volume: 3_000,
      sampleCount: 2,
      source: 'kis-daily',
      isPartial: true,
    });
  });

  it('aggregates 1d candles into 1M groups by KST calendar month', () => {
    const may1 = {
      ...candle(0),
      interval: '1d' as const,
      bucketAt: '2026-04-30T15:00:00.000Z',
      open: 200,
      high: 210,
      low: 190,
      close: 205,
      volume: 1_500,
      sampleCount: 1,
      source: 'kis-daily' as const,
    };
    const may29 = {
      ...may1,
      bucketAt: '2026-05-28T15:00:00.000Z',
      open: 205,
      high: 230,
      low: 202,
      close: 225,
      volume: 2_500,
    };

    const result = aggregateCandles([may29, may1], '1M');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      interval: '1M',
      bucketAt: '2026-04-30T15:00:00.000Z',
      open: 200,
      high: 230,
      low: 190,
      close: 225,
      volume: 4_000,
      sampleCount: 2,
    });
  });
});
