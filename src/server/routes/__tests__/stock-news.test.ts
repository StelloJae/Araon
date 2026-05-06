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
  return { app, fetchHtml, newsRepo };
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

  it('records sanitized refresh failure state without storing raw HTML', async () => {
    const stockRepo = new StockRepository(db);
    const sectorRepo = new SectorRepository(db);
    const masterRepo = new MasterStockRepository(db);
    const newsRepo = new StockNewsRepository(db);
    const service = createStockService({ stockRepo, sectorRepo, masterRepo });
    const newsFeedService = createStockNewsFeedService({
      repo: newsRepo,
      fetchHtml: vi.fn(async () => {
        throw new Error('news feed fetch failed: 503 upstream unavailable');
      }),
    });
    const failedApp = Fastify({ logger: false });
    await failedApp.register(stockRoutes, {
      service,
      newsFeedService,
      now: () => new Date('2026-05-06T09:00:00.000Z'),
    });

    const res = await failedApp.inject({
      method: 'POST',
      url: '/stocks/005930/news/refresh',
    });

    expect(res.statusCode).toBe(503);
    expect(newsRepo.getFetchStatus('005930')).toEqual({
      ticker: '005930',
      lastFetchStatus: 'failed',
      lastFetchErrorCode: 'HTTP_503',
      lastFetchedAt: '2026-05-06T09:00:00.000Z',
      updatedAt: '2026-05-06T09:00:00.000Z',
    });
    await failedApp.close();
  });

  it('prunes stale cached links while retaining recent links', () => {
    const newsRepo = new StockNewsRepository(db);
    newsRepo.upsertMany([
      {
        ticker: '005930',
        source: 'naver-finance',
        title: 'old',
        url: 'https://finance.naver.com/item/news_read.naver?article_id=1&office_id=001&code=005930',
        publishedAt: null,
        fetchedAt: '2026-04-20T00:00:00.000Z',
      },
      {
        ticker: '005930',
        source: 'naver-finance',
        title: 'recent',
        url: 'https://finance.naver.com/item/news_read.naver?article_id=2&office_id=001&code=005930',
        publishedAt: null,
        fetchedAt: '2026-05-05T00:00:00.000Z',
      },
    ]);

    const pruned = newsRepo.pruneOldNewsItems(new Date('2026-05-06T00:00:00.000Z'), 7);

    expect(pruned).toBe(1);
    expect(newsRepo.listByTicker('005930').map((item) => item.title)).toEqual(['recent']);
  });

  it('summarizes stale cached links against the 24 hour TTL', () => {
    const newsRepo = new StockNewsRepository(db);
    newsRepo.upsertMany([
      {
        ticker: '005930',
        source: 'naver-finance',
        title: 'stale',
        url: 'https://finance.naver.com/item/news_read.naver?article_id=3&office_id=001&code=005930',
        publishedAt: null,
        fetchedAt: '2026-05-04T00:00:00.000Z',
      },
      {
        ticker: '005930',
        source: 'naver-finance',
        title: 'fresh',
        url: 'https://finance.naver.com/item/news_read.naver?article_id=4&office_id=001&code=005930',
        publishedAt: null,
        fetchedAt: '2026-05-05T13:00:00.000Z',
      },
    ]);

    expect(newsRepo.summarizeGrowth(new Date('2026-05-06T00:00:00.000Z'), 24 * 60 * 60_000))
      .toEqual({
        itemCount: 2,
        staleItemCount: 1,
        oldestFetchedAt: '2026-05-04T00:00:00.000Z',
        newestFetchedAt: '2026-05-05T13:00:00.000Z',
        failedFetchCount: 0,
        lastFetchStatus: null,
        lastFetchErrorCode: null,
        lastFetchedAt: null,
      });
  });
});
