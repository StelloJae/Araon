import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import Database from 'better-sqlite3';

import { migrateUp } from '../../db/migrator.js';
import {
  MasterStockRepository,
  SectorRepository,
  StockNewsRepository,
  StockRepository,
} from '../../db/repositories.js';
import { createStockService } from '../../services/stock-service.js';
import { createStockNewsFeedService } from '../../news/news-feed-service.js';
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
  const newsRepo = new StockNewsRepository(db);
  const service = createStockService({ stockRepo, sectorRepo, masterRepo });
  stockRepo.upsert({ ticker: '005930', name: '삼성전자', market: 'KOSPI' });
  const fetchHtml = vi.fn(async () =>
    '<a href="/item/news_read.naver?article_id=2&office_id=001&code=005930">새 뉴스</a>',
  );
  const newsFeedService = createStockNewsFeedService({ repo: newsRepo, fetchHtml });
  const app = Fastify({ logger: false });
  app.register(stockRoutes, {
    service,
    newsFeedService,
    now: () => new Date('2026-05-06T09:00:00.000Z'),
  });
  return { app, fetchHtml };
}

describe('stock news routes', () => {
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

  it('lists cached news feed items', async () => {
    const empty = await app.inject({ method: 'GET', url: '/stocks/005930/news' });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ success: true, data: [] });
  });

  it('refreshes news feed items without synthetic summaries', async () => {
    const refreshed = await app.inject({
      method: 'POST',
      url: '/stocks/005930/news/refresh',
    });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().data).toEqual([
      expect.objectContaining({
        ticker: '005930',
        title: '새 뉴스',
        source: 'naver-finance',
        publishedAt: null,
      }),
    ]);

    const listed = await app.inject({ method: 'GET', url: '/stocks/005930/news' });
    expect(listed.json().data).toHaveLength(1);
  });
});
