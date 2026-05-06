import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import Database from 'better-sqlite3';

import { migrateUp } from '../../db/migrator.js';
import {
  SectorRepository,
  StockNoteRepository,
  StockRepository,
  MasterStockRepository,
} from '../../db/repositories.js';
import { createStockService } from '../../services/stock-service.js';
import { stockRoutes } from '../stocks.js';

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
  const service = createStockService({ stockRepo, sectorRepo, masterRepo });
  stockRepo.upsert({ ticker: '005930', name: '삼성전자', market: 'KOSPI' });

  const app = Fastify({ logger: false });
  app.register(stockRoutes, { service, noteRepo });
  return { app, noteRepo, stockRepo };
}

describe('StockNoteRepository', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openMemoryDb();
    new StockRepository(db).upsert({ ticker: '005930', name: '삼성전자', market: 'KOSPI' });
  });

  afterEach(() => {
    db.close();
  });

  it('persists notes per ticker and orders newest first', () => {
    const repo = new StockNoteRepository(db);

    const older = repo.create({
      ticker: '005930',
      body: '분할 매수 후보',
      now: new Date('2026-05-05T01:00:00.000Z'),
    });
    const newer = repo.create({
      ticker: '005930',
      body: '실적 발표 전 거래량 확인',
      now: new Date('2026-05-05T02:00:00.000Z'),
    });

    expect(repo.listByTicker('005930')).toEqual([newer, older]);
  });

  it('limits and offsets notes per ticker without pruning user records', () => {
    const repo = new StockNoteRepository(db);
    for (let i = 0; i < 55; i += 1) {
      repo.create({
        ticker: '005930',
        body: `note-${i}`,
        now: new Date(Date.UTC(2026, 4, 5, 0, i)),
      });
    }

    expect(repo.listByTicker('005930')).toHaveLength(50);
    expect(repo.listByTicker('005930', { limit: 2, offset: 1 }).map((note) => note.body))
      .toEqual(['note-53', 'note-52']);
  });

  it('cascades notes when a tracked stock is removed', () => {
    const stockRepo = new StockRepository(db);
    const repo = new StockNoteRepository(db);
    repo.create({
      ticker: '005930',
      body: '삭제되면 같이 사라져야 함',
      now: new Date('2026-05-05T01:00:00.000Z'),
    });

    stockRepo.delete('005930');

    expect(repo.listByTicker('005930')).toEqual([]);
  });
});

describe('stock note routes', () => {
  let db: Database.Database;
  let app: ReturnType<typeof buildApp>['app'];

  beforeEach(() => {
    db = openMemoryDb();
    ({ app } = buildApp(db));
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it('lists an empty note log for a tracked ticker', async () => {
    const res = await app.inject({ method: 'GET', url: '/stocks/005930/notes' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: [] });
  });

  it('supports bounded note pagination for a tracked ticker', async () => {
    for (const body of ['oldest', 'middle', 'newest']) {
      await app.inject({
        method: 'POST',
        url: '/stocks/005930/notes',
        payload: { body },
      });
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    const res = await app.inject({ method: 'GET', url: '/stocks/005930/notes?limit=1&offset=1' });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ success: true; data: Array<{ body: string }> }>();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.body).toBe('middle');
  });

  it('creates trimmed local observation notes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/stocks/005930/notes',
      payload: { body: '  장후 일봉 백필 확인  ' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{
      success: true;
      data: { ticker: string; body: string; createdAt: string; updatedAt: string };
    }>();
    expect(body.data).toMatchObject({
      ticker: '005930',
      body: '장후 일봉 백필 확인',
    });
    expect(new Date(body.data.createdAt).getTime()).not.toBeNaN();
    expect(body.data.updatedAt).toBe(body.data.createdAt);
  });

  it('rejects blank observation notes without storing them', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/stocks/005930/notes',
      payload: { body: '   ' },
    });

    expect(res.statusCode).toBe(400);

    const list = await app.inject({ method: 'GET', url: '/stocks/005930/notes' });
    expect(list.json()).toEqual({ success: true, data: [] });
  });

  it('deletes a note by ticker and note id', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/stocks/005930/notes',
      payload: { body: '삭제 테스트' },
    });
    const note = created.json<{ data: { id: string } }>().data;

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/stocks/005930/notes/${note.id}`,
    });

    expect(deleted.statusCode).toBe(204);
    const list = await app.inject({ method: 'GET', url: '/stocks/005930/notes' });
    expect(list.json()).toEqual({ success: true, data: [] });
  });
});
