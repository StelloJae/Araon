import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { migrateUp } from '../../db/migrator.js';
import {
  PriceHistoryPointRepository,
  StockRepository,
} from '../../db/repositories.js';
import { stockRoutes } from '../stocks.js';
import type { StockService } from '../../services/stock-service.js';
import type { PriceCandle, PriceHistoryPoint } from '@shared/types.js';

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

function serviceStub(): StockService {
  return {
    addOne: async () => {
      throw new Error('not used');
    },
    addBulk: async () => {
      throw new Error('not used');
    },
    remove: () => undefined,
    list: () => [],
  } as unknown as StockService;
}

function point(bucketAt: string, price = 70_000): PriceHistoryPoint {
  return {
    ticker: '005930',
    bucketAt,
    price,
    changeRate: 1.1,
    sampleCount: 1,
    source: 'ws-integrated',
    createdAt: bucketAt,
    updatedAt: bucketAt,
  };
}

function sourcedPoint(
  bucketAt: string,
  price: number,
  source: PriceHistoryPoint['source'],
): PriceHistoryPoint {
  return {
    ...point(bucketAt, price),
    source,
  };
}

function minuteCandle(bucketAt: string, close: number): PriceCandle {
  return {
    ticker: '298380',
    interval: '1m',
    bucketAt,
    session: 'regular',
    open: close - 10,
    high: close + 20,
    low: close - 20,
    close,
    volume: 100,
    sampleCount: 1,
    source: 'toss-time-today',
    isPartial: false,
    createdAt: bucketAt,
    updatedAt: bucketAt,
  };
}

describe('GET /stocks/:ticker/price-history', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openMemoryDb();
  });

  afterEach(() => {
    db.close();
  });

  it('returns persisted downsampled price points for the requested window', async () => {
    const repo = new PriceHistoryPointRepository(db);
    await repo.bulkUpsertPoints([
      point('2026-05-07T00:00:00.000Z', 70_000),
      point('2026-05-07T00:00:05.000Z', 70_300),
    ]);
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      priceHistoryRepo: repo,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/stocks/005930/price-history?from=2026-05-07T00:00:00.000Z&to=2026-05-07T00:00:10.000Z',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      ticker: '005930',
      resolutionMs: 5000,
      retentionHours: 48,
      items: [
        {
          time: 1778112000,
          bucketAt: '2026-05-07T00:00:00.000Z',
          price: 70_000,
          changePct: 1.1,
          sampleCount: 1,
          source: 'ws-integrated',
        },
        {
          time: 1778112005,
          bucketAt: '2026-05-07T00:00:05.000Z',
          price: 70_300,
          changePct: 1.1,
          sampleCount: 1,
          source: 'ws-integrated',
        },
      ],
    });
  });

  it('validates ticker and limit', async () => {
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      priceHistoryRepo: new PriceHistoryPointRepository(db),
    });

    const invalidTicker = await app.inject({
      method: 'GET',
      url: '/stocks/ABC/price-history',
    });
    const invalidLimit = await app.inject({
      method: 'GET',
      url: '/stocks/005930/price-history?limit=99999',
    });

    expect(invalidTicker.statusCode).toBe(400);
    expect(invalidLimit.statusCode).toBe(400);
  });

  it('prefers realtime history over REST fallback when both are present', async () => {
    const repo = new PriceHistoryPointRepository(db);
    await repo.bulkUpsertPoints([
      sourcedPoint('2026-05-07T00:00:00.000Z', 100_800, 'ws-integrated'),
      sourcedPoint('2026-05-07T00:00:05.000Z', 100_300, 'rest'),
      sourcedPoint('2026-05-07T00:00:10.000Z', 100_300, 'mixed'),
      sourcedPoint('2026-05-07T00:00:15.000Z', 100_900, 'ws-integrated'),
    ]);
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      priceHistoryRepo: repo,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/stocks/005930/price-history?from=2026-05-07T00:00:00.000Z&to=2026-05-07T00:00:20.000Z',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.items).toEqual([
      expect.objectContaining({
        bucketAt: '2026-05-07T00:00:00.000Z',
        price: 100_800,
        source: 'ws-integrated',
      }),
      expect.objectContaining({
        bucketAt: '2026-05-07T00:00:15.000Z',
        price: 100_900,
        source: 'ws-integrated',
      }),
    ]);
    expect(body.data.coverage.count).toBe(2);
  });

  it('keeps REST fallback history when no realtime source is present', async () => {
    const repo = new PriceHistoryPointRepository(db);
    await repo.bulkUpsertPoints([
      sourcedPoint('2026-05-07T00:00:00.000Z', 100_300, 'rest'),
      sourcedPoint('2026-05-07T00:00:05.000Z', 100_400, 'rest'),
    ]);
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      priceHistoryRepo: repo,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/stocks/005930/price-history?from=2026-05-07T00:00:00.000Z&to=2026-05-07T00:00:10.000Z',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.items.map((item: { source: string }) => item.source)).toEqual([
      'rest',
      'rest',
    ]);
  });

  it('uses real Toss minute candle closes as sparkline seed when persisted history is empty', async () => {
    const repo = new PriceHistoryPointRepository(db);
    const fetchSparklineSeedCandles = vi.fn(async () => [
      minuteCandle('2026-05-18T00:00:00.000Z', 111_500),
      minuteCandle('2026-05-18T00:01:00.000Z', 111_800),
    ]);
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      priceHistoryRepo: repo,
      fetchSparklineSeedCandles,
      now: () => new Date('2026-05-18T09:20:00.000Z'),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/stocks/298380/price-history?range=1d&includeCandleSeed=true',
    });

    expect(res.statusCode).toBe(200);
    expect(fetchSparklineSeedCandles).toHaveBeenCalledWith({
      ticker: '298380',
      window: {
        from: '2026-05-17T23:00:00.000Z',
        to: '2026-05-18T09:20:00.000Z',
      },
      now: new Date('2026-05-18T09:20:00.000Z'),
    });
    const body = JSON.parse(res.body);
    expect(body.data.items).toEqual([
      expect.objectContaining({
        bucketAt: '2026-05-18T00:00:00.000Z',
        price: 111_500,
        source: 'toss-time-today',
      }),
      expect.objectContaining({
        bucketAt: '2026-05-18T00:01:00.000Z',
        price: 111_800,
        source: 'toss-time-today',
      }),
    ]);
    expect(body.data.coverage.count).toBe(2);
  });

  it('keeps the previous KST trading session available before market opens', async () => {
    const repo = new PriceHistoryPointRepository(db);
    const fetchSparklineSeedCandles = vi.fn(async () => [
      { ...minuteCandle('2026-05-18T00:00:00.000Z', 9_470), ticker: '129920' },
      { ...minuteCandle('2026-05-18T00:01:00.000Z', 9_520), ticker: '129920' },
    ]);
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      priceHistoryRepo: repo,
      fetchSparklineSeedCandles,
      now: () => new Date('2026-05-18T16:20:00.000Z'),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/stocks/129920/price-history?range=1d&includeCandleSeed=true',
    });

    expect(res.statusCode).toBe(200);
    expect(fetchSparklineSeedCandles).toHaveBeenCalledWith({
      ticker: '129920',
      window: {
        from: '2026-05-17T23:00:00.000Z',
        to: '2026-05-18T11:00:00.000Z',
      },
      now: new Date('2026-05-18T16:20:00.000Z'),
    });
    const body = JSON.parse(res.body);
    expect(body.data.items).toEqual([
      expect.objectContaining({
        bucketAt: '2026-05-18T00:00:00.000Z',
        price: 9_470,
      }),
      expect.objectContaining({
        bucketAt: '2026-05-18T00:01:00.000Z',
        price: 9_520,
      }),
    ]);
  });

  it('uses real Toss minute candle seed when persisted realtime-like history is flat', async () => {
    new StockRepository(db).upsert({
      ticker: '129920',
      name: '대성하이텍',
      market: 'KOSDAQ',
    });
    const repo = new PriceHistoryPointRepository(db);
    await repo.bulkUpsertPoints([
      {
        ...sourcedPoint('2026-05-18T15:00:00.000Z', 9_200, 'rest'),
        ticker: '129920',
      },
      {
        ...sourcedPoint('2026-05-18T15:00:05.000Z', 9_200, 'rest'),
        ticker: '129920',
      },
      {
        ...sourcedPoint('2026-05-18T15:00:10.000Z', 9_200, 'rest'),
        ticker: '129920',
      },
      {
        ...sourcedPoint('2026-05-18T15:00:15.000Z', 9_200, 'toss-fast-quote'),
        ticker: '129920',
      },
    ]);
    const fetchSparklineSeedCandles = vi.fn(async () => [
      { ...minuteCandle('2026-05-18T00:00:00.000Z', 9_470), ticker: '129920' },
      { ...minuteCandle('2026-05-18T00:01:00.000Z', 9_520), ticker: '129920' },
    ]);
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      priceHistoryRepo: repo,
      fetchSparklineSeedCandles,
      now: () => new Date('2026-05-18T16:30:00.000Z'),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/stocks/129920/price-history?from=2026-05-18T15:00:00.000Z&to=2026-05-18T16:30:00.000Z&includeCandleSeed=true',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(fetchSparklineSeedCandles).toHaveBeenCalledOnce();
    expect(body.data.items).toEqual([
      expect.objectContaining({
        bucketAt: '2026-05-18T00:00:00.000Z',
        price: 9_470,
        source: 'toss-time-today',
      }),
      expect.objectContaining({
        bucketAt: '2026-05-18T00:01:00.000Z',
        price: 9_520,
        source: 'toss-time-today',
      }),
    ]);
  });
});
