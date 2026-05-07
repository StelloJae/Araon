import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import Database from 'better-sqlite3';

import { migrateUp } from '../../db/migrator.js';
import {
  SectorRepository,
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
  const service = createStockService({ stockRepo, sectorRepo, masterRepo });
  stockRepo.upsert({ ticker: '005930', name: '삼성전자', market: 'KOSPI' });

  const app = Fastify({ logger: false });
  app.register(stockRoutes, { service });
  return { app, stockRepo };
}

describe('removed stock observation routes', () => {
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

  it('does not expose stock note routes', async () => {
    const list = await app.inject({ method: 'GET', url: '/stocks/005930/notes' });
    const create = await app.inject({
      method: 'POST',
      url: '/stocks/005930/notes',
      payload: { body: '삭제된 기능' },
    });
    const remove = await app.inject({
      method: 'DELETE',
      url: '/stocks/005930/notes/00000000-0000-0000-0000-000000000000',
    });

    expect(list.statusCode).toBe(404);
    expect(create.statusCode).toBe(404);
    expect(remove.statusCode).toBe(404);
  });

  it('does not expose stock observation plan routes', async () => {
    const read = await app.inject({ method: 'GET', url: '/stocks/005930/observation-plan' });
    const save = await app.inject({
      method: 'PUT',
      url: '/stocks/005930/observation-plan',
      payload: {
        thesis: '삭제된 기능',
        trigger: '삭제된 기능',
        invalidation: '삭제된 기능',
        status: 'watching',
      },
    });

    expect(read.statusCode).toBe(404);
    expect(save.statusCode).toBe(404);
  });
});
