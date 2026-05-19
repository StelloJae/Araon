import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import Database from 'better-sqlite3';

import { migrateUp } from '../../db/migrator.js';
import {
  MasterStockRepository,
  SectorRepository,
  StockDisclosureRepository,
  StockNewsRepository,
  StockRepository,
} from '../../db/repositories.js';
import { createStockService } from '../../services/stock-service.js';
import { createStockNewsFeedService } from '../../news/news-feed-service.js';
import { createAgentEventQueue } from '../../agent/agent-event-queue.js';
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
  const disclosureRepo = new StockDisclosureRepository(db);
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
    disclosureRepo,
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
    expect(empty.json()).toEqual({
      success: true,
      data: {
        items: [],
        pagination: {
          limit: 5,
          offset: 0,
          total: 0,
          hasNext: false,
          hasPrev: false,
        },
        fetchStatus: null,
      },
    });
  });

  it('refreshes news feed items without synthetic summaries', async () => {
    const refreshed = await app.inject({
      method: 'POST',
      url: '/stocks/005930/news/refresh',
    });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().data.items).toEqual([
      expect.objectContaining({
        ticker: '005930',
        title: '새 뉴스',
        source: 'naver-finance',
        description: null,
        publishedAt: null,
      }),
    ]);

    const listed = await app.inject({ method: 'GET', url: '/stocks/005930/news' });
    expect(listed.json().data.items).toHaveLength(1);
    expect(listed.json().data.pagination).toMatchObject({
      limit: 5,
      offset: 0,
      total: 1,
      hasNext: false,
      hasPrev: false,
    });
  });

  it('enqueues newly detected news for agent consumers', async () => {
    const stockRepo = new StockRepository(db);
    const sectorRepo = new SectorRepository(db);
    const masterRepo = new MasterStockRepository(db);
    const newsRepo = new StockNewsRepository(db);
    const service = createStockService({ stockRepo, sectorRepo, masterRepo });
    const agentEventQueue = createAgentEventQueue({
      idFactory: () => 'evt-news-1',
      now: () => '2026-05-06T09:00:00.000Z',
    });
    stockRepo.upsert({ ticker: '005930', name: '삼성전자', market: 'KOSPI' });
    const newsFeedService = createStockNewsFeedService({
      repo: newsRepo,
      fetchHtml: vi.fn(async () =>
        '<a href="/item/news_read.naver?article_id=2&office_id=001&code=005930">새 뉴스</a>',
      ),
    });
    const agentApp = Fastify({ logger: false });
    await agentApp.register(stockRoutes, {
      service,
      newsFeedService,
      agentEventQueue,
      now: () => new Date('2026-05-06T09:00:00.000Z'),
    });

    const res = await agentApp.inject({
      method: 'POST',
      url: '/stocks/005930/news/refresh',
    });

    expect(res.statusCode).toBe(200);
    expect(agentEventQueue.snapshot()).toEqual([
      expect.objectContaining({
        id: 'evt-news-1',
        type: 'news_detected',
        ticker: '005930',
        source: 'naver-finance',
        firstSeenAt: '2026-05-06T09:00:00.000Z',
        publishedAt: null,
        confidence: 0.72,
        reason: 'New stock news detected: 새 뉴스',
      }),
    ]);
    expect(JSON.stringify(agentEventQueue.snapshot())).not.toContain('article_id=2');
    await agentApp.close();
  });

  it('paginates cached news feed items', async () => {
    const newsRepo = new StockNewsRepository(db);
    newsRepo.upsertMany([
      {
        ticker: '005930',
        source: 'naver-finance',
        title: '첫 뉴스',
        url: 'https://finance.naver.com/item/news_read.naver?article_id=10&office_id=001&code=005930',
        description: null,
        publishedAt: '2026-05-06T08:00:00.000Z',
        fetchedAt: '2026-05-06T09:00:00.000Z',
      },
      {
        ticker: '005930',
        source: 'naver-finance',
        title: '둘째 뉴스',
        url: 'https://finance.naver.com/item/news_read.naver?article_id=11&office_id=001&code=005930',
        description: null,
        publishedAt: '2026-05-06T07:00:00.000Z',
        fetchedAt: '2026-05-06T09:00:00.000Z',
      },
    ]);

    const res = await app.inject({ method: 'GET', url: '/stocks/005930/news?limit=1&offset=1' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.items).toEqual([
      expect.objectContaining({ title: '둘째 뉴스' }),
    ]);
    expect(res.json().data.pagination).toEqual({
      limit: 1,
      offset: 1,
      total: 2,
      hasNext: false,
      hasPrev: true,
    });
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
        description: null,
        publishedAt: null,
        fetchedAt: '2026-04-20T00:00:00.000Z',
      },
      {
        ticker: '005930',
        source: 'naver-finance',
        title: 'recent',
        url: 'https://finance.naver.com/item/news_read.naver?article_id=2&office_id=001&code=005930',
        description: null,
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
        description: null,
        publishedAt: null,
        fetchedAt: '2026-05-04T00:00:00.000Z',
      },
      {
        ticker: '005930',
        source: 'naver-finance',
        title: 'fresh',
        url: 'https://finance.naver.com/item/news_read.naver?article_id=4&office_id=001&code=005930',
        description: null,
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

  it('returns structured disclosure search links without fetching external pages', async () => {
    const res = await app.inject({ method: 'GET', url: '/stocks/005930/disclosures' });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ success: true; data: { items: Array<{ source: string; kind: string; url: string }> } }>();
    expect(body.data.items).toEqual([
      expect.objectContaining({
        source: 'dart',
        kind: 'search-link',
        url: expect.stringContaining('dart.fss.or.kr'),
      }),
      expect.objectContaining({
        source: 'kind',
        kind: 'search-link',
        url: expect.stringContaining('kind.krx.co.kr'),
      }),
    ]);
  });

  it('summarizes disclosure cache growth for data-health diagnostics', () => {
    const disclosureRepo = new StockDisclosureRepository(db);
    disclosureRepo.upsertMany([
      {
        ticker: '005930',
        source: 'dart',
        kind: 'filing',
        title: 'old filing',
        url: 'https://dart.fss.or.kr/old',
        publishedAt: null,
        fetchedAt: '2026-05-04T00:00:00.000Z',
      },
      {
        ticker: '005930',
        source: 'kind',
        kind: 'filing',
        title: 'fresh filing',
        url: 'https://kind.krx.co.kr/fresh',
        publishedAt: null,
        fetchedAt: '2026-05-05T13:00:00.000Z',
      },
    ]);

    expect(
      disclosureRepo.summarizeGrowth(
        new Date('2026-05-06T00:00:00.000Z'),
        24 * 60 * 60_000,
      ),
    ).toEqual({
      itemCount: 2,
      staleItemCount: 1,
      oldestFetchedAt: '2026-05-04T00:00:00.000Z',
      newestFetchedAt: '2026-05-05T13:00:00.000Z',
    });
  });

  it('uses DART disclosure service when it is configured', async () => {
    const stockRepo = new StockRepository(db);
    const sectorRepo = new SectorRepository(db);
    const masterRepo = new MasterStockRepository(db);
    const disclosureRepo = new StockDisclosureRepository(db);
    const service = createStockService({ stockRepo, sectorRepo, masterRepo });
    stockRepo.upsert({ ticker: '005930', name: '삼성전자', market: 'KOSPI' });
    const dartDisclosureService = {
      isConfigured: vi.fn(() => true),
      refreshTicker: vi.fn(async () =>
        disclosureRepo.upsertMany([
          {
            ticker: '005930',
            source: 'dart',
            kind: 'filing',
            title: '주요사항보고서',
            url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260507000001',
            publishedAt: '2026-05-06T15:00:00.000Z',
            fetchedAt: '2026-05-07T04:00:00.000Z',
          },
        ]),
      ),
    };
    const dartApp = Fastify({ logger: false });
    await dartApp.register(stockRoutes, {
      service,
      disclosureRepo,
      dartDisclosureService,
      now: () => new Date('2026-05-07T04:00:00.000Z'),
    });

    const res = await dartApp.inject({ method: 'GET', url: '/stocks/005930/disclosures' });

    expect(res.statusCode).toBe(200);
    expect(dartDisclosureService.refreshTicker).toHaveBeenCalledWith({
      ticker: '005930',
      now: new Date('2026-05-07T04:00:00.000Z'),
    });
    expect(res.json().data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'filing', title: '주요사항보고서' }),
        expect.objectContaining({ kind: 'search-link', source: 'dart' }),
        expect.objectContaining({ kind: 'search-link', source: 'kind' }),
      ]),
    );
    await dartApp.close();
  });

  it('refreshes DART disclosures on demand and returns the first disclosure page', async () => {
    const stockRepo = new StockRepository(db);
    const sectorRepo = new SectorRepository(db);
    const masterRepo = new MasterStockRepository(db);
    const disclosureRepo = new StockDisclosureRepository(db);
    const service = createStockService({ stockRepo, sectorRepo, masterRepo });
    stockRepo.upsert({ ticker: '005930', name: '삼성전자', market: 'KOSPI' });
    const dartDisclosureService = {
      isConfigured: vi.fn(() => true),
      refreshTicker: vi.fn(async () =>
        disclosureRepo.upsertMany([
          {
            ticker: '005930',
            source: 'dart',
            kind: 'filing',
            title: '주요사항보고서',
            url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260507000001',
            publishedAt: '2026-05-06T15:00:00.000Z',
            fetchedAt: '2026-05-07T04:00:00.000Z',
          },
        ]),
      ),
    };
    const dartApp = Fastify({ logger: false });
    await dartApp.register(stockRoutes, {
      service,
      disclosureRepo,
      dartDisclosureService,
      now: () => new Date('2026-05-07T04:00:00.000Z'),
    });

    const res = await dartApp.inject({
      method: 'POST',
      url: '/stocks/005930/disclosures/refresh',
    });

    expect(res.statusCode).toBe(200);
    expect(dartDisclosureService.refreshTicker).toHaveBeenCalledWith({
      ticker: '005930',
      now: new Date('2026-05-07T04:00:00.000Z'),
    });
    expect(res.json().data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'filing', title: '주요사항보고서' }),
        expect.objectContaining({ kind: 'search-link', source: 'dart' }),
        expect.objectContaining({ kind: 'search-link', source: 'kind' }),
      ]),
    );
    expect(res.json().data.items[0]).toEqual(
      expect.objectContaining({ kind: 'filing', title: '주요사항보고서' }),
    );
    expect(res.json().data.pagination).toEqual({
      limit: 5,
      offset: 0,
      total: 3,
      hasNext: false,
      hasPrev: false,
    });
    await dartApp.close();
  });

  it('enqueues newly detected DART filings for agent consumers', async () => {
    const stockRepo = new StockRepository(db);
    const sectorRepo = new SectorRepository(db);
    const masterRepo = new MasterStockRepository(db);
    const disclosureRepo = new StockDisclosureRepository(db);
    const service = createStockService({ stockRepo, sectorRepo, masterRepo });
    const agentEventQueue = createAgentEventQueue({
      idFactory: () => 'evt-disclosure-1',
      now: () => '2026-05-07T04:00:00.000Z',
    });
    stockRepo.upsert({ ticker: '005930', name: '삼성전자', market: 'KOSPI' });
    const dartDisclosureService = {
      isConfigured: vi.fn(() => true),
      refreshTicker: vi.fn(async () =>
        disclosureRepo.upsertMany([
          {
            ticker: '005930',
            source: 'dart' as const,
            kind: 'filing' as const,
            title: '주요사항보고서',
            url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260507000001',
            publishedAt: '2026-05-06T15:00:00.000Z',
            fetchedAt: '2026-05-07T04:00:00.000Z',
          },
        ]),
      ),
    };
    const agentApp = Fastify({ logger: false });
    await agentApp.register(stockRoutes, {
      service,
      disclosureRepo,
      dartDisclosureService,
      agentEventQueue,
      now: () => new Date('2026-05-07T04:00:00.000Z'),
    });

    const res = await agentApp.inject({
      method: 'POST',
      url: '/stocks/005930/disclosures/refresh',
    });

    expect(res.statusCode).toBe(200);
    expect(agentEventQueue.snapshot()).toEqual([
      expect.objectContaining({
        id: 'evt-disclosure-1',
        type: 'disclosure_detected',
        ticker: '005930',
        source: 'dart',
        publishedAt: '2026-05-06T15:00:00.000Z',
        firstSeenAt: '2026-05-07T04:00:00.000Z',
        freshnessMs: 46_800_000,
        confidence: 0.9,
        reason: 'New DART filing detected: 주요사항보고서',
      }),
    ]);
    expect(JSON.stringify(agentEventQueue.snapshot())).not.toContain('rcpNo=20260507000001');
    await agentApp.close();
  });

  it('does not enqueue cached DART receipt URL variants for agent consumers', async () => {
    const stockRepo = new StockRepository(db);
    const sectorRepo = new SectorRepository(db);
    const masterRepo = new MasterStockRepository(db);
    const disclosureRepo = new StockDisclosureRepository(db);
    const service = createStockService({ stockRepo, sectorRepo, masterRepo });
    const agentEventQueue = createAgentEventQueue({
      idFactory: () => 'evt-disclosure-duplicate',
      now: () => '2026-05-07T04:00:00.000Z',
    });
    stockRepo.upsert({ ticker: '005930', name: '삼성전자', market: 'KOSPI' });
    disclosureRepo.upsertMany([
      {
        ticker: '005930',
        source: 'dart',
        kind: 'filing',
        title: '주요사항보고서',
        url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260507000001&dcmNo=9876543',
        publishedAt: '2026-05-06T15:00:00.000Z',
        fetchedAt: '2026-05-07T03:59:00.000Z',
      },
    ]);
    const dartDisclosureService = {
      isConfigured: vi.fn(() => true),
      refreshTicker: vi.fn(async () => [
        {
          id: 'filing-refreshed',
          ticker: '005930',
          source: 'dart' as const,
          kind: 'filing' as const,
          title: '주요사항보고서',
          url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260507000001',
          publishedAt: '2026-05-06T15:00:00.000Z',
          fetchedAt: '2026-05-07T04:00:00.000Z',
        },
      ]),
    };
    const agentApp = Fastify({ logger: false });
    await agentApp.register(stockRoutes, {
      service,
      disclosureRepo,
      dartDisclosureService,
      agentEventQueue,
      now: () => new Date('2026-05-07T04:00:00.000Z'),
    });

    const res = await agentApp.inject({
      method: 'POST',
      url: '/stocks/005930/disclosures/refresh',
    });

    expect(res.statusCode).toBe(200);
    expect(agentEventQueue.snapshot()).toEqual([]);
    await agentApp.close();
  });

  it('paginates disclosure items after fallback search links are stored', async () => {
    const first = await app.inject({ method: 'GET', url: '/stocks/005930/disclosures' });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'GET',
      url: '/stocks/005930/disclosures?limit=1&offset=1',
    });

    expect(second.statusCode).toBe(200);
    expect(second.json().data.items).toHaveLength(1);
    expect(second.json().data.pagination).toEqual({
      limit: 1,
      offset: 1,
      total: 2,
      hasNext: false,
      hasPrev: true,
    });
  });

  it('orders real disclosure filings before fallback search links', () => {
    const disclosureRepo = new StockDisclosureRepository(db);
    disclosureRepo.upsertMany([
      {
        ticker: '005930',
        source: 'dart',
        kind: 'search-link',
        title: 'DART 전자공시 검색',
        url: 'https://dart.fss.or.kr/search',
        publishedAt: null,
        fetchedAt: '2026-05-07T05:00:00.000Z',
      },
      {
        ticker: '005930',
        source: 'dart',
        kind: 'filing',
        title: '주요사항보고서',
        url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260507000001',
        publishedAt: '2026-05-07T00:00:00.000Z',
        fetchedAt: '2026-05-07T04:00:00.000Z',
      },
    ]);

    expect(disclosureRepo.listByTicker('005930').map((item) => item.kind)).toEqual([
      'filing',
      'search-link',
    ]);
  });
});
