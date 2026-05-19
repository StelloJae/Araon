import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import Database from 'better-sqlite3';

import { migrateUp } from '../../db/migrator.js';
import {
  PriceCandleRepository,
  SectorRepository,
  StockRepository,
  StockSignalEventRepository,
  MasterStockRepository,
} from '../../db/repositories.js';
import { createAgentEventQueue } from '../../agent/agent-event-queue.js';
import { createStockService } from '../../services/stock-service.js';
import { stockRoutes } from '../stocks.js';
import type { PriceCandle } from '@shared/types.js';
import type { AgentEventQueue } from '../../agent/agent-event-queue.js';

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
  const signalEventRepo = new StockSignalEventRepository(db);
  const candleRepo = new PriceCandleRepository(db);
  let nextAgentEventId = 1;
  const agentEventQueue = createAgentEventQueue({
    idFactory: () => `evt-${nextAgentEventId++}`,
  });
  const service = createStockService({ stockRepo, sectorRepo, masterRepo });
  stockRepo.upsert({ ticker: '005930', name: '삼성전자', market: 'KOSPI' });

  const app = Fastify({ logger: false });
  app.register(stockRoutes, { service, signalEventRepo, candleRepo, agentEventQueue });
  return { app, signalEventRepo, candleRepo, agentEventQueue };
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
  let signalEventRepo: StockSignalEventRepository;
  let candleRepo: PriceCandleRepository;
  let agentEventQueue: AgentEventQueue;

  beforeEach(() => {
    db = openMemoryDb();
    ({ app, signalEventRepo, candleRepo, agentEventQueue } = buildApp(db));
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

  it('enqueues realtime momentum signals as sanitized market movement events once', async () => {
    const payload = {
      name: '삼성전자',
      signalType: 'overheat',
      source: 'realtime-momentum',
      signalPrice: 70_000,
      signalAt: '2026-05-06T01:00:00.000Z',
      baselinePrice: 67_000,
      baselineAt: '2026-05-06T00:59:30.000Z',
      momentumPct: 4.48,
      momentumWindow: '30s',
      dailyChangePct: 5.1,
      volume: 123_000,
      volumeSurgeRatio: 2.4,
      volumeBaselineStatus: 'ready',
    };

    const first = await app.inject({
      method: 'POST',
      url: '/stocks/005930/signals',
      payload,
    });
    await app.inject({
      method: 'POST',
      url: '/stocks/005930/signals',
      payload,
    });

    expect(first.statusCode).toBe(201);
    expect(agentEventQueue.snapshot()).toEqual([
      expect.objectContaining({
        type: 'market_movement_detected',
        ticker: '005930',
        source: 'realtime-momentum',
        publishedAt: '2026-05-06T01:00:00.000Z',
        relevance: 1,
        confidence: 0.9,
        payloadRef: `stock-signal:${first.json().data.id}`,
      }),
    ]);
    expect(agentEventQueue.snapshot()[0]?.reason).toContain('과열');
    expect(agentEventQueue.snapshot()[0]?.reason).toContain('30초');
    expect(agentEventQueue.snapshot()[0]?.reason).toContain('4.48%');
    expect(JSON.stringify(agentEventQueue.snapshot())).not.toContain('signalPrice');
    expect(JSON.stringify(agentEventQueue.snapshot())).not.toContain('baselinePrice');
  });

  it('records market movement signals for untracked provider-ranked tickers', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/stocks/347700/signals',
      payload: {
        name: '피엔케이피부임상연구센타',
        signalType: 'strong_scalp',
        source: 'realtime-momentum',
        signalPrice: 45_300,
        signalAt: '2026-05-18T00:05:00.000Z',
        baselinePrice: 43_000,
        baselineAt: '2026-05-18T00:04:30.000Z',
        momentumPct: 5.35,
        momentumWindow: '30s',
        dailyChangePct: 7.86,
        volume: null,
        volumeSurgeRatio: null,
        volumeBaselineStatus: 'collecting',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.ticker).toBe('347700');
    expect(signalEventRepo.listByTicker('347700')).toHaveLength(1);
    expect(agentEventQueue.snapshot()).toEqual([
      expect.objectContaining({
        type: 'market_movement_detected',
        ticker: '347700',
        source: 'realtime-momentum',
      }),
    ]);
  });

  it('does not expose the removed observation timeline route', async () => {
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

    expect(res.statusCode).toBe(404);
  });

  it('prunes old signal events while retaining recent observation history', () => {
    signalEventRepo.create({
      ticker: '005930',
      name: '삼성전자',
      signalType: 'scalp',
      source: 'realtime-momentum',
      signalPrice: 70_000,
      signalAt: '2026-01-01T00:00:00.000Z',
      baselinePrice: null,
      baselineAt: null,
      momentumPct: 0.8,
      momentumWindow: '30s',
      dailyChangePct: null,
      volume: null,
      volumeSurgeRatio: null,
      volumeBaselineStatus: 'collecting',
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    const recent = signalEventRepo.create({
      ticker: '005930',
      name: '삼성전자',
      signalType: 'strong_scalp',
      source: 'realtime-momentum',
      signalPrice: 71_000,
      signalAt: '2026-05-01T00:00:00.000Z',
      baselinePrice: null,
      baselineAt: null,
      momentumPct: 1.2,
      momentumWindow: '30s',
      dailyChangePct: null,
      volume: null,
      volumeSurgeRatio: null,
      volumeBaselineStatus: 'collecting',
      now: new Date('2026-05-01T00:00:00.000Z'),
    });

    const pruned = signalEventRepo.pruneOldSignalEvents(new Date('2026-05-06T00:00:00.000Z'), 90);

    expect(pruned).toBe(1);
    expect(signalEventRepo.listByTicker('005930')).toEqual([recent]);
  });

  it('clamps signal event reads to the repository max limit', () => {
    for (let i = 0; i < 205; i += 1) {
      signalEventRepo.create({
        ticker: '005930',
        name: '삼성전자',
        signalType: 'scalp',
        source: 'realtime-momentum',
        signalPrice: 70_000 + i,
        signalAt: new Date(Date.UTC(2026, 4, 6, 0, i)).toISOString(),
        baselinePrice: null,
        baselineAt: null,
        momentumPct: 0.8,
        momentumWindow: '30s',
        dailyChangePct: null,
        volume: null,
        volumeSurgeRatio: null,
        volumeBaselineStatus: 'collecting',
        now: new Date(Date.UTC(2026, 4, 6, 0, i)),
      });
    }

    expect(signalEventRepo.listByTicker('005930', 500)).toHaveLength(200);
  });
});
