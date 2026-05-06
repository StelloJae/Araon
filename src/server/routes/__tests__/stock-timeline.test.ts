import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import Database from 'better-sqlite3';

import { migrateUp } from '../../db/migrator.js';
import {
  PriceCandleRepository,
  SectorRepository,
  StockNoteRepository,
  StockRepository,
  StockSignalEventRepository,
  MasterStockRepository,
} from '../../db/repositories.js';
import { createStockService } from '../../services/stock-service.js';
import { stockRoutes } from '../stocks.js';
import type { PriceCandle } from '@shared/types.js';

function openMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrateUp(db);
  return db;
}

function buildApp(db: Database.Database) {
  const stockRepo = new StockRepository(db);
  const sectorRepo = new SectorRepository(db);
  const masterRepo = new MasterStockRepository(db);
  const noteRepo = new StockNoteRepository(db);
  const signalEventRepo = new StockSignalEventRepository(db);
  const candleRepo = new PriceCandleRepository(db);
  const service = createStockService({ stockRepo, sectorRepo, masterRepo });
  stockRepo.upsert({ ticker: '005930', name: '삼성전자', market: 'KOSPI' });

  const app = Fastify({ logger: false });
  app.register(stockRoutes, { service, noteRepo, signalEventRepo, candleRepo });
  return { app, noteRepo, signalEventRepo, candleRepo };
}

function candle(bucketAt: string, overrides: Partial<PriceCandle> = {}): PriceCandle {
  return {
    ticker: '005930',
    interval: '1m',
    bucketAt,
    session: 'regular',
    open: 70_000,
    high: 70_000,
    low: 70_000,
    close: 70_000,
    volume: 10,
    sampleCount: 1,
    source: 'ws-integrated',
    isPartial: false,
    createdAt: bucketAt,
    updatedAt: bucketAt,
    ...overrides,
  };
}

describe('stock signal timeline routes', () => {
  let db: Database.Database;
  let app: ReturnType<typeof buildApp>['app'];
  let noteRepo: StockNoteRepository;
  let candleRepo: PriceCandleRepository;

  beforeEach(() => {
    db = openMemoryDb();
    ({ app, noteRepo, candleRepo } = buildApp(db));
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it('records realtime momentum signals idempotently', async () => {
    const payload = {
      name: '삼성전자',
      signalType: 'strong_scalp',
      source: 'realtime-momentum',
      signalPrice: 70_000,
      signalAt: '2026-05-06T01:00:00.000Z',
      baselinePrice: 69_000,
      baselineAt: '2026-05-06T00:59:30.000Z',
      momentumPct: 1.45,
      momentumWindow: '30s',
      dailyChangePct: 2.1,
      volume: 123_000,
      volumeSurgeRatio: null,
      volumeBaselineStatus: 'collecting',
    };

    const first = await app.inject({
      method: 'POST',
      url: '/stocks/005930/signals',
      payload,
    });
    const second = await app.inject({
      method: 'POST',
      url: '/stocks/005930/signals',
      payload,
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json().data.id).toBe(first.json().data.id);
  });

  it('returns notes and signal outcomes in one observation timeline', async () => {
    noteRepo.create({
      ticker: '005930',
      body: '장후 백필 이후 일봉 확인',
      now: new Date('2026-05-06T01:10:00.000Z'),
    });
    await candleRepo.bulkUpsertCandles([
      candle('2026-05-06T01:05:00.000Z', { close: 70_700 }),
      candle('2026-05-06T01:15:00.000Z', { close: 70_350 }),
    ]);
    await app.inject({
      method: 'POST',
      url: '/stocks/005930/signals',
      payload: {
        name: '삼성전자',
        signalType: 'scalp',
        source: 'realtime-momentum',
        signalPrice: 70_000,
        signalAt: '2026-05-06T01:00:00.000Z',
        baselinePrice: 69_600,
        baselineAt: '2026-05-06T00:59:30.000Z',
        momentumPct: 0.9,
        momentumWindow: '30s',
        dailyChangePct: 1.2,
        volume: null,
        volumeSurgeRatio: null,
        volumeBaselineStatus: 'collecting',
      },
    });

    const res = await app.inject({ method: 'GET', url: '/stocks/005930/timeline' });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ success: true; data: Array<Record<string, any>> }>();
    expect(body.data.map((item) => item.kind)).toEqual(['note', 'signal']);
    const signal = body.data.find((item) => item.kind === 'signal')!;
    expect(signal.outcomes).toEqual([
      expect.objectContaining({ horizon: '5m', state: 'ready', price: 70_700 }),
      expect.objectContaining({ horizon: '15m', state: 'ready', price: 70_350 }),
      expect.objectContaining({ horizon: '30m', state: 'pending', price: null }),
    ]);
  });
});
