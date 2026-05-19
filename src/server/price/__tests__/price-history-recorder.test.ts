import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { migrateUp } from '../../db/migrator.js';
import {
  PriceHistoryPointRepository,
  StockRepository,
} from '../../db/repositories.js';
import { PriceStore } from '../price-store.js';
import {
  createPriceHistoryAggregator,
  createPriceHistoryRecorder,
} from '../price-history-recorder.js';
import type { Price } from '@shared/types.js';

function openMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrateUp(db);
  new StockRepository(db).upsert({
    ticker: '005930',
    name: '삼성전자',
    market: 'KOSPI',
  });
  return db;
}

function price(overrides: Partial<Price> = {}): Price {
  return {
    ticker: '005930',
    price: 70_000,
    changeRate: 1.2,
    volume: 1_000,
    tradeAt: '2026-05-07T00:00:01.000Z',
    updatedAt: '2026-05-07T00:00:01.100Z',
    isSnapshot: false,
    source: 'ws-integrated',
    ...overrides,
  };
}

describe('PriceHistoryPointRepository', () => {
  it('upserts 5-second price points and returns them ordered', async () => {
    const db = openMemoryDb();
    const repo = new PriceHistoryPointRepository(db);

    await repo.bulkUpsertPoints([
      {
        ticker: '005930',
        bucketAt: '2026-05-07T00:00:00.000Z',
        price: 70_100,
        changeRate: 1.3,
        sampleCount: 2,
        source: 'ws-integrated',
        createdAt: '2026-05-07T00:00:01.000Z',
        updatedAt: '2026-05-07T00:00:04.000Z',
      },
      {
        ticker: '005930',
        bucketAt: '2026-05-07T00:00:05.000Z',
        price: 70_200,
        changeRate: 1.4,
        sampleCount: 1,
        source: 'ws-integrated',
        createdAt: '2026-05-07T00:00:06.000Z',
        updatedAt: '2026-05-07T00:00:06.000Z',
      },
    ]);

    expect(
      repo.listPoints({
        ticker: '005930',
        from: '2026-05-07T00:00:00.000Z',
        to: '2026-05-07T00:00:10.000Z',
      }),
    ).toEqual([
      expect.objectContaining({
        bucketAt: '2026-05-07T00:00:00.000Z',
        price: 70_100,
        sampleCount: 2,
      }),
      expect.objectContaining({
        bucketAt: '2026-05-07T00:00:05.000Z',
        price: 70_200,
        sampleCount: 1,
      }),
    ]);

    db.close();
  });

  it('prunes old point history without touching today points', async () => {
    const db = openMemoryDb();
    const repo = new PriceHistoryPointRepository(db);
    await repo.bulkUpsertPoints([
      {
        ticker: '005930',
        bucketAt: '2026-05-05T00:00:00.000Z',
        price: 69_000,
        changeRate: -1,
        sampleCount: 1,
        source: 'ws-integrated',
        createdAt: '2026-05-05T00:00:00.000Z',
        updatedAt: '2026-05-05T00:00:00.000Z',
      },
      {
        ticker: '005930',
        bucketAt: '2026-05-07T00:00:00.000Z',
        price: 70_000,
        changeRate: 1,
        sampleCount: 1,
        source: 'ws-integrated',
        createdAt: '2026-05-07T00:00:00.000Z',
        updatedAt: '2026-05-07T00:00:00.000Z',
      },
    ]);

    expect(repo.pruneOldPoints(new Date('2026-05-07T12:00:00.000Z'), 1)).toBe(1);
    expect(repo.listPoints({ ticker: '005930' })).toHaveLength(1);

    db.close();
  });
});

describe('createPriceHistoryAggregator', () => {
  it('compresses multiple live ticks into one 5-second point', async () => {
    const db = openMemoryDb();
    const repo = new PriceHistoryPointRepository(db);
    const aggregator = createPriceHistoryAggregator({
      writer: repo,
      now: () => new Date('2026-05-07T00:00:06.000Z'),
    });

    aggregator.recordPrice(price({ price: 70_000, tradeAt: '2026-05-07T00:00:01.000Z' }));
    aggregator.recordPrice(price({ price: 70_300, changeRate: 1.5, tradeAt: '2026-05-07T00:00:04.000Z' }));
    aggregator.recordPrice(price({ price: 70_500, changeRate: 1.8, tradeAt: '2026-05-07T00:00:06.000Z' }));
    await aggregator.flushDirty();

    expect(repo.listPoints({ ticker: '005930' })).toEqual([
      expect.objectContaining({
        bucketAt: '2026-05-07T00:00:00.000Z',
        price: 70_300,
        changeRate: 1.5,
        sampleCount: 2,
      }),
      expect.objectContaining({
        bucketAt: '2026-05-07T00:00:05.000Z',
        price: 70_500,
        changeRate: 1.8,
        sampleCount: 1,
      }),
    ]);

    db.close();
  });

  it('keeps realtime points ahead of REST fallback in the same bucket', async () => {
    const db = openMemoryDb();
    const repo = new PriceHistoryPointRepository(db);
    const aggregator = createPriceHistoryAggregator({
      writer: repo,
      now: () => new Date('2026-05-07T00:00:06.000Z'),
    });

    aggregator.recordPrice(price({ price: 100_900, source: 'ws-integrated' }));
    aggregator.recordPrice(price({ price: 100_300, source: 'rest' }));
    await aggregator.flushDirty();

    expect(repo.listPoints({ ticker: '005930' })).toEqual([
      expect.objectContaining({
        bucketAt: '2026-05-07T00:00:00.000Z',
        price: 100_900,
        source: 'ws-integrated',
        sampleCount: 2,
      }),
    ]);

    db.close();
  });

  it('keeps Toss fast quote points ahead of REST fallback in the same bucket', async () => {
    const db = openMemoryDb();
    const repo = new PriceHistoryPointRepository(db);
    const aggregator = createPriceHistoryAggregator({
      writer: repo,
      now: () => new Date('2026-05-07T00:00:06.000Z'),
    });

    aggregator.recordPrice(price({ price: 100_900, source: 'toss-fast-quote' }));
    aggregator.recordPrice(price({ price: 100_300, source: 'rest' }));
    await aggregator.flushDirty();

    expect(repo.listPoints({ ticker: '005930' })).toEqual([
      expect.objectContaining({
        bucketAt: '2026-05-07T00:00:00.000Z',
        price: 100_900,
        source: 'toss-fast-quote',
        sampleCount: 2,
      }),
    ]);

    db.close();
  });

  it('suppresses nearby REST fallback points after realtime history is flowing', async () => {
    const db = openMemoryDb();
    const repo = new PriceHistoryPointRepository(db);
    const aggregator = createPriceHistoryAggregator({
      writer: repo,
      now: () => new Date('2026-05-07T00:00:20.000Z'),
    });

    aggregator.recordPrice(price({
      price: 100_900,
      source: 'ws-integrated',
      tradeAt: '2026-05-07T00:00:00.000Z',
    }));
    aggregator.recordPrice(price({
      price: 100_300,
      source: 'rest',
      tradeAt: '2026-05-07T00:00:05.000Z',
    }));
    aggregator.recordPrice(price({
      price: 101_000,
      source: 'ws-integrated',
      tradeAt: '2026-05-07T00:00:10.000Z',
    }));
    await aggregator.flushDirty();

    expect(repo.listPoints({ ticker: '005930' })).toEqual([
      expect.objectContaining({
        bucketAt: '2026-05-07T00:00:00.000Z',
        price: 100_900,
        source: 'ws-integrated',
      }),
      expect.objectContaining({
        bucketAt: '2026-05-07T00:00:10.000Z',
        price: 101_000,
        source: 'ws-integrated',
      }),
    ]);

    db.close();
  });

  it('still records REST history when it is the only available source', async () => {
    const db = openMemoryDb();
    const repo = new PriceHistoryPointRepository(db);
    const aggregator = createPriceHistoryAggregator({
      writer: repo,
      now: () => new Date('2026-05-07T00:00:06.000Z'),
    });

    aggregator.recordPrice(price({ price: 100_300, source: 'rest' }));
    await aggregator.flushDirty();

    expect(repo.listPoints({ ticker: '005930' })).toEqual([
      expect.objectContaining({
        bucketAt: '2026-05-07T00:00:00.000Z',
        price: 100_300,
        source: 'rest',
      }),
    ]);

    db.close();
  });

  it('ignores warm snapshots and invalid prices', async () => {
    const db = openMemoryDb();
    const repo = new PriceHistoryPointRepository(db);
    const aggregator = createPriceHistoryAggregator({ writer: repo });

    aggregator.recordPrice(price({ isSnapshot: true }));
    aggregator.recordPrice(price({ price: 0 }));
    await aggregator.flushDirty();

    expect(repo.listPoints({ ticker: '005930' })).toEqual([]);
    db.close();
  });
});

describe('createPriceHistoryRecorder', () => {
  it('flushes dirty point history on stop and detaches listener', async () => {
    const db = openMemoryDb();
    const repo = new PriceHistoryPointRepository(db);
    const priceStore = new PriceStore();
    const recorder = createPriceHistoryRecorder({
      priceStore,
      aggregator: createPriceHistoryAggregator({ writer: repo }),
      setIntervalFn: () => ({ unref: () => undefined }),
      clearIntervalFn: () => undefined,
    });

    priceStore.setPrice(price());
    await recorder.stop();

    expect(repo.listPoints({ ticker: '005930' })).toHaveLength(1);
    expect(priceStore.listenerCount('price-update')).toBe(0);
    db.close();
  });
});
