/**
 * Route integration tests for /stocks endpoints.
 *
 * Uses Fastify's inject() so no real port is opened. The database is an
 * in-memory SQLite instance migrated fresh for each test suite.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { migrateUp } from '../../db/migrator.js';
import {
  StockRepository,
  SectorRepository,
  MasterStockRepository,
} from '../../db/repositories.js';
import { createStockService } from '../../services/stock-service.js';
import { stockRoutes } from '../stocks.js';

// === Helpers ==================================================================

function openMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function buildApp(db: Database.Database) {
  const stockRepo = new StockRepository(db);
  const sectorRepo = new SectorRepository(db);
  const masterRepo = new MasterStockRepository(db);
  const service = createStockService({ stockRepo, sectorRepo, masterRepo });

  const app = Fastify({ logger: false });
  app.register(stockRoutes, { service });
  return app;
}

function makeCsvRow(i: number): string {
  const ticker = String(i + 1).padStart(6, '0');
  return `${ticker},종목명${i + 1},KOSPI`;
}

function makeCsv(count: number): string {
  const header = '종목코드,종목명,market';
  const rows = Array.from({ length: count }, (_, i) => makeCsvRow(i));
  return [header, ...rows].join('\n');
}

// === Test suites ==============================================================

describe('POST /stocks — single add', () => {
  let db: Database.Database;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    db = openMemoryDb();
    migrateUp(db);
    app = buildApp(db);
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it('creates a stock and returns 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/stocks',
      payload: { ticker: '005930', name: '삼성전자', market: 'KOSPI' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ success: boolean; data: { stock: { ticker: string } } }>();
    expect(body.success).toBe(true);
    expect(body.data.stock.ticker).toBe('005930');
  });

  it('rejects invalid ticker (5 digits) with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/stocks',
      payload: { ticker: '12345', name: '테스트', market: 'KOSPI' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('upsets duplicate ticker without error', async () => {
    const payload = { ticker: '005930', name: '삼성전자', market: 'KOSPI' };
    await app.inject({ method: 'POST', url: '/stocks', payload });
    const res = await app.inject({ method: 'POST', url: '/stocks', payload: { ...payload, name: '삼성전자 (updated)' } });
    expect(res.statusCode).toBe(201);

    const listRes = await app.inject({ method: 'GET', url: '/stocks' });
    const listBody = listRes.json<{ data: Array<{ ticker: string; name: string }> }>();
    const entry = listBody.data.find((s) => s.ticker === '005930');
    expect(entry?.name).toBe('삼성전자 (updated)');
  });
});

describe('GET /stocks — list', () => {
  let db: Database.Database;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    db = openMemoryDb();
    migrateUp(db);
    app = buildApp(db);
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it('returns empty array when no stocks', async () => {
    const res = await app.inject({ method: 'GET', url: '/stocks' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[] }>();
    expect(body.data).toEqual([]);
  });

  it('returns inserted stocks', async () => {
    await app.inject({
      method: 'POST',
      url: '/stocks',
      payload: { ticker: '005930', name: '삼성전자', market: 'KOSPI' },
    });
    const res = await app.inject({ method: 'GET', url: '/stocks' });
    const body = res.json<{ data: Array<{ ticker: string }> }>();
    expect(body.data.some((s) => s.ticker === '005930')).toBe(true);
  });

  it('attaches autoSector from master_stocks krx_sector_flags', async () => {
    // Seed master with classification for 005380 → KRX자동차 = Y → 자동차.
    db.prepare(
      `INSERT INTO master_stocks (
         ticker, name, market, standard_code, source, updated_at,
         security_group_code, krx_sector_flags
       ) VALUES (?, ?, ?, ?, 'kis_mst', '2026-04-27T00:00:00.000Z', 'ST', ?)`,
    ).run(
      '005380',
      '현대차',
      'KOSPI',
      'KR7005380001',
      JSON.stringify({
        krxAuto: 'Y',
        krxSemiconductor: 'N',
        krxBio: 'N',
        krxBank: 'N',
        krxEnergyChem: 'N',
        krxSteel: 'N',
        krxMediaTel: 'N',
        krxConstruction: 'N',
        krxSecurities: 'N',
        krxShip: 'N',
        krxInsurance: 'N',
        krxTransport: 'N',
      }),
    );

    await app.inject({
      method: 'POST',
      url: '/stocks',
      payload: { ticker: '005380', name: '현대차', market: 'KOSPI' },
    });

    const res = await app.inject({ method: 'GET', url: '/stocks' });
    const body = res.json<{ data: Array<{ ticker: string; autoSector?: string | null }> }>();
    const entry = body.data.find((s) => s.ticker === '005380');
    expect(entry?.autoSector).toBe('자동차');
  });

  it('prefers KIS official index industry classification over KRX sector flags', async () => {
    // Samsung Electronics is KIS index industry 0027/0013 (전기전자), but the
    // broad KRX sector-index flags can all be N. Official index industry
    // classification should still drive autoSector.
    db.prepare(
      `INSERT INTO master_stocks (
         ticker, name, market, standard_code, source, updated_at,
         security_group_code, index_industry_large, index_industry_middle,
         index_industry_small, krx_sector_flags
       ) VALUES (?, ?, ?, ?, 'kis_mst', '2026-04-27T00:00:00.000Z',
         'ST', '0027', '0013', '0000', ?)`,
    ).run(
      '005930',
      '삼성전자',
      'KOSPI',
      'KR7005930003',
      JSON.stringify({
        krxAuto: 'N',
        krxSemiconductor: 'N',
        krxBio: 'N',
        krxBank: 'N',
        krxEnergyChem: 'N',
        krxSteel: 'N',
        krxMediaTel: 'N',
        krxConstruction: 'N',
        krxSecurities: 'N',
        krxShip: 'N',
        krxInsurance: 'N',
        krxTransport: 'N',
      }),
    );

    await app.inject({
      method: 'POST',
      url: '/stocks',
      payload: { ticker: '005930', name: '삼성전자', market: 'KOSPI' },
    });

    const res = await app.inject({ method: 'GET', url: '/stocks' });
    const body = res.json<{ data: Array<{ ticker: string; autoSector?: string | null }> }>();
    const entry = body.data.find((s) => s.ticker === '005930');
    expect(entry?.autoSector).toBe('전기전자');
  });

  it('returns autoSector=null when no master row exists', async () => {
    await app.inject({
      method: 'POST',
      url: '/stocks',
      payload: { ticker: '005930', name: '삼성전자', market: 'KOSPI' },
    });
    const res = await app.inject({ method: 'GET', url: '/stocks' });
    const body = res.json<{ data: Array<{ ticker: string; autoSector?: string | null }> }>();
    const entry = body.data.find((s) => s.ticker === '005930');
    expect(entry?.autoSector).toBeNull();
  });
});

describe('DELETE /stocks/:ticker', () => {
  let db: Database.Database;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    db = openMemoryDb();
    migrateUp(db);
    app = buildApp(db);
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it('removes a stock and returns 204', async () => {
    await app.inject({
      method: 'POST',
      url: '/stocks',
      payload: { ticker: '005930', name: '삼성전자', market: 'KOSPI' },
    });

    const res = await app.inject({ method: 'DELETE', url: '/stocks/005930' });
    expect(res.statusCode).toBe(204);

    const listRes = await app.inject({ method: 'GET', url: '/stocks' });
    const body = listRes.json<{ data: Array<{ ticker: string }> }>();
    expect(body.data.find((s) => s.ticker === '005930')).toBeUndefined();
  });
});

describe('POST /stocks/bulk — CSV import', () => {
  let db: Database.Database;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    db = openMemoryDb();
    migrateUp(db);
    app = buildApp(db);
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it('inserts 100 valid rows — all succeed', async () => {
    const csv = makeCsv(100);
    const res = await app.inject({
      method: 'POST',
      url: '/stocks/bulk',
      payload: { csv },
    });

    expect(res.statusCode).toBe(207);
    const body = res.json<{ data: { succeeded: number; failed: number } }>();
    expect(body.data.succeeded).toBe(100);
    expect(body.data.failed).toBe(0);

    const listRes = await app.inject({ method: 'GET', url: '/stocks' });
    const listBody = listRes.json<{ data: unknown[] }>();
    expect(listBody.data.length).toBe(100);
  });

  it('3 bad rows out of 100 → 97 succeeded + 3 errors', async () => {
    const header = '종목코드,종목명,market';
    const goodRows = Array.from({ length: 97 }, (_, i) => {
      const ticker = String(i + 1).padStart(6, '0');
      return `${ticker},종목명${i + 1},KOSPI`;
    });
    // 3 invalid tickers: 5-digit, non-numeric, empty
    const badRows = ['12345,나쁜종목,KOSPI', 'ABCDEF,다른나쁜종목,KOSPI', ',이름없음,KOSPI'];
    const csv = [header, ...goodRows, ...badRows].join('\n');

    const res = await app.inject({
      method: 'POST',
      url: '/stocks/bulk',
      payload: { csv },
    });

    expect(res.statusCode).toBe(207);
    const body = res.json<{ data: { succeeded: number; failed: number; errors: unknown[] } }>();
    expect(body.data.succeeded).toBe(97);
    expect(body.data.failed).toBe(3);
    expect(body.data.errors).toHaveLength(3);
  });

  it('duplicate ticker in CSV upserts without error', async () => {
    // Insert one stock then bulk-insert the same ticker again
    await app.inject({
      method: 'POST',
      url: '/stocks',
      payload: { ticker: '000001', name: '원래이름', market: 'KOSPI' },
    });

    const csv = '종목코드,종목명,market\n000001,새이름,KOSPI';
    const res = await app.inject({
      method: 'POST',
      url: '/stocks/bulk',
      payload: { csv },
    });

    expect(res.statusCode).toBe(207);
    const body = res.json<{ data: { succeeded: number; failed: number } }>();
    expect(body.data.succeeded).toBe(1);
    expect(body.data.failed).toBe(0);
  });

  it('rejects empty csv body with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/stocks/bulk',
      payload: { csv: '' },
    });
    expect(res.statusCode).toBe(400);
  });
});
