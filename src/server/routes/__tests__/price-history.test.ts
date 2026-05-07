import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { migrateUp } from '../../db/migrator.js';
import {
  PriceHistoryPointRepository,
  StockRepository,
} from '../../db/repositories.js';
import { stockRoutes } from '../stocks.js';
import type { StockService } from '../../services/stock-service.js';
import type { PriceHistoryPoint } from '@shared/types.js';

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
});
