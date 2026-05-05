import { describe, expect, it, vi } from 'vitest';
import { PriceStore } from '../price-store.js';
import {
  createCandleAggregator,
  createCandleRecorder,
  type PriceCandleWriter,
} from '../candle-aggregator.js';
import type { Price, PriceCandle } from '@shared/types.js';

function price(overrides: Partial<Price> = {}): Price {
  return {
    ticker: '005930',
    price: 70_000,
    changeRate: 1.2,
    volume: 1_000,
    updatedAt: '2026-05-05T00:00:05.000Z',
    isSnapshot: false,
    source: 'ws-integrated',
    ...overrides,
  };
}

function writer() {
  const batches: PriceCandle[][] = [];
  const repo: PriceCandleWriter = {
    bulkUpsertCandles: vi.fn(async (candles) => {
      batches.push([...candles]);
    }),
  };
  return { repo, batches };
}

describe('candle aggregator', () => {
  it('updates one-minute OHLC and uses cumulative volume deltas only', async () => {
    const { repo, batches } = writer();
    const aggregator = createCandleAggregator({ writer: repo });

    aggregator.recordPrice(price({ price: 100, volume: 1_000 }));
    aggregator.recordPrice(price({ price: 105, volume: 1_125, updatedAt: '2026-05-05T00:00:20.000Z' }));
    aggregator.recordPrice(price({ price: 98, volume: 1_200, updatedAt: '2026-05-05T00:00:50.000Z' }));

    await aggregator.flushDirty();

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(1);
    expect(batches[0]?.[0]).toMatchObject({
      ticker: '005930',
      interval: '1m',
      bucketAt: '2026-05-05T00:00:00.000Z',
      session: 'regular',
      open: 100,
      high: 105,
      low: 98,
      close: 98,
      volume: 200,
      sampleCount: 3,
      isPartial: true,
      source: 'ws-integrated',
    });
  });

  it('creates a new one-minute candle when the bucket changes', async () => {
    const { repo, batches } = writer();
    const aggregator = createCandleAggregator({ writer: repo });

    aggregator.recordPrice(price({ price: 100, volume: 1_000 }));
    aggregator.recordPrice(price({ price: 101, volume: 1_050, updatedAt: '2026-05-05T00:01:02.000Z' }));

    await aggregator.flushDirty();

    expect(batches[0]?.map((c) => c.bucketAt)).toEqual([
      '2026-05-05T00:00:00.000Z',
      '2026-05-05T00:01:00.000Z',
    ]);
    expect(batches[0]?.[1]?.volume).toBe(50);
  });

  it('does not treat the first cumulative volume as candle volume', async () => {
    const { repo, batches } = writer();
    const aggregator = createCandleAggregator({ writer: repo });

    aggregator.recordPrice(price({ price: 100, volume: 10_000 }));

    await aggregator.flushDirty();

    expect(batches[0]?.[0]?.volume).toBe(0);
    expect(batches[0]?.[0]?.isPartial).toBe(true);
  });

  it('handles cumulative volume reset without adding a negative delta', async () => {
    const { repo, batches } = writer();
    const aggregator = createCandleAggregator({ writer: repo });

    aggregator.recordPrice(price({ price: 100, volume: 1_000 }));
    aggregator.recordPrice(price({ price: 101, volume: 900, updatedAt: '2026-05-05T00:00:30.000Z' }));

    await aggregator.flushDirty();

    expect(batches[0]?.[0]?.volume).toBe(0);
    expect(batches[0]?.[0]?.sampleCount).toBe(2);
    expect(batches[0]?.[0]?.isPartial).toBe(true);
  });

  it('ignores snapshot restore prices', async () => {
    const { repo } = writer();
    const aggregator = createCandleAggregator({ writer: repo });

    aggregator.recordPrice(price({ isSnapshot: true }));
    await aggregator.flushDirty();

    expect(repo.bulkUpsertCandles).not.toHaveBeenCalled();
  });
});

describe('candle recorder', () => {
  it('flushes dirty candles on the configured interval and cleans up listeners', async () => {
    const { repo } = writer();
    const aggregator = createCandleAggregator({ writer: repo });
    const priceStore = new PriceStore();
    const clearIntervalFn = vi.fn();
    let intervalCb: (() => void | Promise<void>) | null = null;
    const intervalHandle = { id: 1 };

    const recorder = createCandleRecorder({
      priceStore,
      aggregator,
      flushIntervalMs: 5_000,
      setIntervalFn: (cb, ms) => {
        expect(ms).toBe(5_000);
        intervalCb = cb;
        return intervalHandle;
      },
      clearIntervalFn,
    });

    priceStore.setPrice(price());
    await intervalCb?.();

    expect(repo.bulkUpsertCandles).toHaveBeenCalledOnce();

    await recorder.stop();
    expect(clearIntervalFn).toHaveBeenCalledWith(intervalHandle);
    expect(priceStore.listenerCount('price-update')).toBe(0);
  });
});
