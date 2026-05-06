import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { migrateUp } from '../../db/migrator.js';
import { PriceCandleRepository, StockRepository } from '../../db/repositories.js';
import { stockRoutes } from '../stocks.js';
import type { StockService } from '../../services/stock-service.js';
import type { PriceCandle } from '@shared/types.js';

function openMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrateUp(db);
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

function candle(bucketAt: string, overrides: Partial<PriceCandle> = {}): PriceCandle {
  return {
    ticker: '005930',
    interval: '1m',
    bucketAt,
    session: 'regular',
    open: 70_000,
    high: 70_200,
    low: 69_900,
    close: 70_100,
    volume: 123,
    sampleCount: 3,
    source: 'ws-integrated',
    isPartial: false,
    createdAt: bucketAt,
    updatedAt: bucketAt,
    ...overrides,
  };
}

describe('GET /stocks/:ticker/candles', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openMemoryDb();
    new StockRepository(db).upsert({
      ticker: '005930',
      name: '삼성전자',
      market: 'KOSPI',
    });
  });

  afterEach(() => {
    db.close();
  });

  it('returns empty local-only coverage when no candles exist', async () => {
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      candleRepo: new PriceCandleRepository(db),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/stocks/005930/candles?interval=1m&range=1d',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual([]);
    expect(body.data.coverage).toMatchObject({
      localOnly: true,
      backfilled: false,
      sourceMix: [],
      partialCount: 0,
      oldestBucketAt: null,
      newestBucketAt: null,
    });
    expect(body.data.status.state).toBe('collecting');
  });

  it('validates supported candle intervals', async () => {
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      candleRepo: new PriceCandleRepository(db),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/stocks/005930/candles?interval=2m',
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns aggregated candles with Lightweight Charts unix time', async () => {
    const repo = new PriceCandleRepository(db);
    await repo.bulkUpsertCandles([
      candle('2026-05-05T00:00:00.000Z', { open: 100, high: 102, low: 99, close: 101, volume: 10 }),
      candle('2026-05-05T00:01:00.000Z', { open: 101, high: 105, low: 100, close: 104, volume: 20 }),
      candle('2026-05-05T00:02:00.000Z', { open: 104, high: 106, low: 103, close: 105, volume: 30 }),
    ]);
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      candleRepo: repo,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/stocks/005930/candles?interval=3m&from=2026-05-05T00:00:00.000Z&to=2026-05-05T00:03:00.000Z',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.interval).toBe('3m');
    expect(body.data.items).toEqual([
      expect.objectContaining({
        time: 1777939200,
        bucketAt: '2026-05-05T00:00:00.000Z',
        open: 100,
        high: 106,
        low: 99,
        close: 105,
        volume: 60,
        sampleCount: 9,
        isPartial: false,
      }),
    ]);
  });

  it('returns weekly candles from stored 1d historical candles', async () => {
    const repo = new PriceCandleRepository(db);
    await repo.bulkUpsertCandles([
      candle('2026-05-03T15:00:00.000Z', {
        interval: '1d',
        open: 100,
        high: 110,
        low: 95,
        close: 108,
        volume: 1_000,
        sampleCount: 1,
        source: 'kis-daily',
      }),
      candle('2026-05-07T15:00:00.000Z', {
        interval: '1d',
        open: 108,
        high: 125,
        low: 104,
        close: 120,
        volume: 2_000,
        sampleCount: 1,
        source: 'kis-daily',
      }),
    ]);
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      candleRepo: repo,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/stocks/005930/candles?interval=1W&from=2026-05-01T00:00:00.000Z&to=2026-05-10T00:00:00.000Z',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.interval).toBe('1W');
    expect(body.data.items).toEqual([
      expect.objectContaining({
        bucketAt: '2026-05-03T15:00:00.000Z',
        open: 100,
        high: 125,
        low: 95,
        close: 120,
        volume: 3_000,
      }),
    ]);
    expect(body.data.coverage).toMatchObject({
      localOnly: false,
      backfilled: true,
      sourceMix: ['kis-daily'],
    });
    expect(body.data.status.state).toBe('ready');
  });

  it('rejects manual daily backfill during market hours', async () => {
    const backfillDailyCandles = vi.fn();
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      candleRepo: new PriceCandleRepository(db),
      dailyBackfillService: { backfillDailyCandles },
      now: () => new Date('2026-05-05T06:00:00.000Z'),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/stocks/005930/candles/backfill',
      payload: { interval: '1d', range: '3m' },
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('BACKFILL_NOT_ALLOWED_DURING_MARKET');
    expect(backfillDailyCandles).not.toHaveBeenCalled();
  });

  it('runs manual daily backfill after close with a mock service', async () => {
    const backfillDailyCandles = vi.fn().mockResolvedValue({
      ticker: '005930',
      requested: 64,
      inserted: 60,
      updated: 4,
      from: '2026-02-05T15:00:00.000Z',
      to: '2026-05-04T15:00:00.000Z',
      source: 'kis-daily',
      coverage: { backfilled: true, localOnly: false },
    });
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      candleRepo: new PriceCandleRepository(db),
      dailyBackfillService: { backfillDailyCandles },
      now: () => new Date('2026-05-05T11:05:00.000Z'),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/stocks/005930/candles/backfill',
      payload: { interval: '1d', range: '3m' },
    });

    expect(res.statusCode).toBe(200);
    expect(backfillDailyCandles).toHaveBeenCalledWith({
      ticker: '005930',
      range: '3m',
      now: new Date('2026-05-05T11:05:00.000Z'),
    });
    expect(JSON.parse(res.body).data).toMatchObject({
      ticker: '005930',
      requested: 64,
      source: 'kis-daily',
    });
  });

  it('rejects selected ticker minute backfill during market hours', async () => {
    const backfillTodayMinuteCandles = vi.fn();
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      candleRepo: new PriceCandleRepository(db),
      todayMinuteBackfillService: { backfillTodayMinuteCandles },
      now: () => new Date('2026-05-05T06:00:00.000Z'),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/stocks/005930/candles/backfill-minute',
      payload: { interval: '1m', maxPages: 2 },
    });

    expect(res.statusCode).toBe(423);
    expect(JSON.parse(res.body).error.code).toBe('MARKET_HOURS');
    expect(backfillTodayMinuteCandles).not.toHaveBeenCalled();
  });

  it('runs selected ticker minute backfill after close with a mock service', async () => {
    const backfillTodayMinuteCandles = vi.fn().mockResolvedValue({
      ticker: '005930',
      requested: 60,
      inserted: 58,
      updated: 2,
      from: '2026-05-05T05:30:00.000Z',
      to: '2026-05-05T06:30:00.000Z',
      source: 'kis-time-today',
      pages: 2,
      coverage: { backfilled: true, localOnly: false },
    });
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      candleRepo: new PriceCandleRepository(db),
      todayMinuteBackfillService: { backfillTodayMinuteCandles },
      now: () => new Date('2026-05-05T11:10:00.000Z'),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/stocks/005930/candles/backfill-minute',
      payload: { interval: '1m', maxPages: 2 },
    });

    expect(res.statusCode).toBe(200);
    expect(backfillTodayMinuteCandles).toHaveBeenCalledWith({
      ticker: '005930',
      now: new Date('2026-05-05T11:10:00.000Z'),
      maxPages: 2,
    });
    expect(JSON.parse(res.body).data).toMatchObject({
      ticker: '005930',
      requested: 60,
      source: 'kis-time-today',
      pages: 2,
    });
  });

  it('repository lists stored local candles and skips untracked tickers', async () => {
    const repo = new PriceCandleRepository(db);
    await repo.bulkUpsertCandles([
      candle('2026-05-05T00:00:00.000Z'),
      candle('2026-05-05T00:01:00.000Z'),
      candle('2026-05-05T00:02:00.000Z', { ticker: '999999' }),
    ]);

    const rows = repo.listCandles({
      ticker: '005930',
      interval: '1m',
      from: '2026-05-05T00:00:00.000Z',
      to: '2026-05-05T00:02:00.000Z',
    });

    expect(rows.map((row) => row.bucketAt)).toEqual([
      '2026-05-05T00:00:00.000Z',
      '2026-05-05T00:01:00.000Z',
    ]);
    expect(repo.countExistingCandles(rows)).toBe(2);
    expect(repo.listCandles({ ticker: '999999', interval: '1m' })).toEqual([]);
  });
});
