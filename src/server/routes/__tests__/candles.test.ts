import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { migrateUp } from '../../db/migrator.js';
import {
  CandleCoverageRepository,
  PriceCandleRepository,
  StockRepository,
} from '../../db/repositories.js';
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

  it('reports visible candle gaps in coverage metadata', async () => {
    const repo = new PriceCandleRepository(db);
    await repo.bulkUpsertCandles([
      candle('2026-05-05T00:00:00.000Z'),
      candle('2026-05-05T00:02:00.000Z'),
      candle('2026-05-05T00:03:00.000Z'),
    ]);
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      candleRepo: repo,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/stocks/005930/candles?interval=1m&from=2026-05-05T00:00:00.000Z&to=2026-05-05T00:04:00.000Z',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.coverage.gapCount).toBe(1);
  });

  it('filters synthetic REST and no-trade minute rows from intraday chart output', async () => {
    const repo = new PriceCandleRepository(db);
    await repo.bulkUpsertCandles([
      candle('2026-05-05T00:00:00.000Z', {
        open: 100,
        high: 100,
        low: 100,
        close: 100,
        volume: 0,
        sampleCount: 4,
        source: null,
      }),
      candle('2026-05-05T00:01:00.000Z', {
        open: 101,
        high: 101,
        low: 101,
        close: 101,
        volume: 3_262_125,
        sampleCount: 1,
        source: 'kis-time-today',
      }),
      candle('2026-05-05T00:02:00.000Z', {
        open: 102,
        high: 104,
        low: 101,
        close: 103,
        volume: 10,
        sampleCount: 2,
        source: 'ws-integrated',
      }),
    ]);
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      candleRepo: repo,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/stocks/005930/candles?interval=1m&from=2026-05-05T00:00:00.000Z&to=2026-05-05T00:03:00.000Z',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0]).toMatchObject({
      bucketAt: '2026-05-05T00:02:00.000Z',
      source: 'ws-integrated',
    });
    expect(body.data.coverage.sourceMix).toEqual(['ws-integrated']);
  });

  it('filters implausible realtime minute candles from old corrupted local history', async () => {
    const repo = new PriceCandleRepository(db);
    await repo.bulkUpsertCandles([
      candle('2026-05-05T00:00:00.000Z', {
        open: 98_400,
        high: 98_700,
        low: 93_100,
        close: 98_300,
        volume: 3_390_891,
        sampleCount: 94,
        source: 'ws-integrated',
        isPartial: true,
      }),
      candle('2026-05-05T00:01:00.000Z', {
        open: 70_000,
        high: 70_200,
        low: 69_900,
        close: 70_100,
        volume: 1_000,
        sampleCount: 10,
        source: 'ws-integrated',
      }),
      candle('2026-05-05T00:02:00.000Z', {
        open: 70_000,
        high: 70_100,
        low: 69_900,
        close: 70_050,
        volume: 1_000_000,
        sampleCount: 200,
        source: 'ws-integrated',
        isPartial: true,
      }),
      candle('2026-05-05T00:03:00.000Z', {
        open: 99_200,
        high: 99_200,
        low: 93_100,
        close: 93_100,
        volume: 0,
        sampleCount: 5,
        source: 'ws-integrated',
        isPartial: true,
      }),
      candle('2026-05-05T00:04:00.000Z', {
        open: 93_100,
        high: 93_100,
        low: 93_100,
        close: 93_100,
        volume: 0,
        sampleCount: 4,
        source: '' as PriceCandle['source'],
      }),
    ]);
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      candleRepo: repo,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/stocks/005930/candles?interval=1m&from=2026-05-05T00:00:00.000Z&to=2026-05-05T00:05:00.000Z',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.items).toEqual([
      expect.objectContaining({
        bucketAt: '2026-05-05T00:01:00.000Z',
        volume: 1_000,
      }),
      expect.objectContaining({
        bucketAt: '2026-05-05T00:02:00.000Z',
        volume: 1_000_000,
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

  it('auto-ensures selected today-minute coverage during market hours for visible intraday charts', async () => {
    const backfillTodayMinuteCandles = vi.fn().mockResolvedValue({
      ticker: '005930',
      requested: 90,
      inserted: 90,
      updated: 0,
      from: '2026-05-05T04:30:00.000Z',
      to: '2026-05-05T06:00:00.000Z',
      source: 'kis-time-today',
      pages: 3,
      coverage: { backfilled: true, localOnly: false },
    });
    const backfillHistoricalMinuteCandles = vi.fn();
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      candleRepo: new PriceCandleRepository(db),
      todayMinuteBackfillService: { backfillTodayMinuteCandles },
      historicalMinuteBackfillService: { backfillHistoricalMinuteCandles },
      now: () => new Date('2026-05-05T06:00:00.000Z'),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/stocks/005930/candles/ensure-coverage',
      payload: { interval: '1m', range: '1d' },
    });

    expect(res.statusCode).toBe(200);
    expect(backfillTodayMinuteCandles).toHaveBeenCalledWith({
      ticker: '005930',
      now: new Date('2026-05-05T06:00:00.000Z'),
      maxPages: 4,
    });
    expect(backfillHistoricalMinuteCandles).not.toHaveBeenCalled();
    expect(JSON.parse(res.body).data).toMatchObject({
      state: 'backfilled',
      source: 'kis-time-today',
      requested: 90,
    });
  });

  it('does not refetch today-minute coverage when the selected chart already has fresh candles', async () => {
    const repo = new PriceCandleRepository(db);
    await repo.bulkUpsertCandles([
      candle('2026-05-05T05:59:00.000Z', {
        source: 'kis-time-today',
        sampleCount: 1,
      }),
    ]);
    const backfillTodayMinuteCandles = vi.fn();
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      candleRepo: repo,
      todayMinuteBackfillService: { backfillTodayMinuteCandles },
      now: () => new Date('2026-05-05T06:00:30.000Z'),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/stocks/005930/candles/ensure-coverage',
      payload: { interval: '1m', range: '1d' },
    });

    expect(res.statusCode).toBe(200);
    expect(backfillTodayMinuteCandles).not.toHaveBeenCalled();
    expect(JSON.parse(res.body).data).toMatchObject({
      state: 'current',
      source: 'kis-time-today',
      requested: 0,
    });
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

  it('auto-ensures daily candle coverage for daily chart ranges', async () => {
    const backfillDailyCandles = vi.fn().mockResolvedValue({
      ticker: '005930',
      requested: 20,
      inserted: 20,
      updated: 0,
      from: '2026-04-05T15:00:00.000Z',
      to: '2026-05-04T15:00:00.000Z',
      source: 'kis-daily',
      coverage: { backfilled: true, localOnly: false },
    });
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      candleRepo: new PriceCandleRepository(db),
      dailyBackfillService: { backfillDailyCandles },
      now: () => new Date('2026-05-05T11:10:00.000Z'),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/stocks/005930/candles/ensure-coverage',
      payload: { interval: '1D', range: '1m' },
    });

    expect(res.statusCode).toBe(200);
    expect(backfillDailyCandles).toHaveBeenCalledWith({
      ticker: '005930',
      range: '1m',
      now: new Date('2026-05-05T11:10:00.000Z'),
    });
    expect(JSON.parse(res.body).data).toMatchObject({
      state: 'backfilled',
      source: 'kis-daily',
      requested: 20,
    });
  });

  it('auto-ensures intraday candle coverage from KIS historical minute data', async () => {
    const backfillHistoricalMinuteCandles = vi.fn().mockResolvedValue({
      ticker: '005930',
      requested: 240,
      inserted: 200,
      updated: 40,
      from: '2026-05-04T00:00:00.000Z',
      to: '2026-05-04T11:00:00.000Z',
      source: 'kis-time-daily',
      pages: 3,
      tradingDays: 1,
      coverage: { backfilled: true, localOnly: false },
    });
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      candleRepo: new PriceCandleRepository(db),
      historicalMinuteBackfillService: { backfillHistoricalMinuteCandles },
      now: () => new Date('2026-05-05T11:10:00.000Z'),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/stocks/005930/candles/ensure-coverage',
      payload: { interval: '5m', range: '1d' },
    });

    expect(res.statusCode).toBe(200);
    expect(backfillHistoricalMinuteCandles).toHaveBeenCalledWith({
      ticker: '005930',
      from: expect.any(String),
      to: expect.any(String),
      now: new Date('2026-05-05T11:10:00.000Z'),
    });
    expect(JSON.parse(res.body).data).toMatchObject({
      state: 'backfilled',
      source: 'kis-time-daily',
      requested: 240,
    });
  });

  it('records selected intraday coverage and skips repeated coverage fetches', async () => {
    const backfillHistoricalMinuteCandles = vi.fn().mockResolvedValue({
      ticker: '005930',
      requested: 240,
      inserted: 200,
      updated: 40,
      from: '2026-05-04T00:00:00.000Z',
      to: '2026-05-04T11:00:00.000Z',
      source: 'kis-time-daily',
      pages: 3,
      tradingDays: 1,
      coverage: { backfilled: true, localOnly: false },
    });
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      candleRepo: new PriceCandleRepository(db),
      candleCoverageRepo: new CandleCoverageRepository(db),
      historicalMinuteBackfillService: { backfillHistoricalMinuteCandles },
      now: () => new Date('2026-05-05T11:10:00.000Z'),
    });

    const payload = {
      interval: '5m',
      range: '1d',
      from: '2026-05-04T00:00:00.000Z',
      to: '2026-05-04T11:00:00.000Z',
    };

    const first = await app.inject({
      method: 'POST',
      url: '/stocks/005930/candles/ensure-coverage',
      payload,
    });
    const second = await app.inject({
      method: 'POST',
      url: '/stocks/005930/candles/ensure-coverage',
      payload,
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(backfillHistoricalMinuteCandles).toHaveBeenCalledTimes(1);
    expect(JSON.parse(second.body).data).toMatchObject({
      state: 'current',
      source: 'kis-time-daily',
      requested: 0,
    });
  });

  it('force-repairs selected intraday coverage even when the ledger is already complete', async () => {
    const backfillHistoricalMinuteCandles = vi.fn().mockResolvedValue({
      ticker: '005930',
      requested: 120,
      inserted: 0,
      updated: 120,
      from: '2026-05-04T00:00:00.000Z',
      to: '2026-05-04T11:00:00.000Z',
      source: 'kis-time-daily',
      pages: 2,
      tradingDays: 1,
      coverage: { backfilled: true, localOnly: false },
    });
    const coverageRepo = new CandleCoverageRepository(db);
    coverageRepo.upsertSegment({
      ticker: '005930',
      interval: '1m',
      source: 'kis-time-daily',
      rangeFrom: '2026-05-04T00:00:00.000Z',
      rangeTo: '2026-05-04T11:00:00.000Z',
      status: 'complete',
      requested: 240,
      inserted: 200,
      updated: 40,
      now: new Date('2026-05-05T11:00:00.000Z'),
    });
    const app = Fastify({ logger: false });
    await app.register(stockRoutes, {
      service: serviceStub(),
      candleRepo: new PriceCandleRepository(db),
      candleCoverageRepo: coverageRepo,
      historicalMinuteBackfillService: { backfillHistoricalMinuteCandles },
      now: () => new Date('2026-05-05T11:10:00.000Z'),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/stocks/005930/candles/ensure-coverage',
      payload: {
        interval: '5m',
        range: '1d',
        from: '2026-05-04T00:00:00.000Z',
        to: '2026-05-04T11:00:00.000Z',
        force: true,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(backfillHistoricalMinuteCandles).toHaveBeenCalledTimes(1);
    expect(JSON.parse(res.body).data).toMatchObject({
      state: 'backfilled',
      source: 'kis-time-daily',
      requested: 120,
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
