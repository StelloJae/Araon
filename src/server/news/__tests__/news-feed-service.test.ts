import { describe, expect, it, vi } from 'vitest';

import {
  createNaverSearchNewsProvider,
  createStockNewsFeedService,
  parseNaverFinanceNews,
} from '../news-feed-service';

describe('stock news feed service', () => {
  it('parses Naver Finance iframe rows into source links with provider and published time', () => {
    const items = parseNaverFinanceNews(
      `
      <table class="type5">
        <tbody>
          <tr class="first">
            <td class="title">
              <a href="/item/news_read.naver?article_id=0002421682&office_id=092&code=005930&page=&sm=" class="tit">삼성전자 &amp; 반도체 뉴스</a>
            </td>
            <td class="info">지디넷코리아</td>
            <td class="date">2026.05.07 12:38</td>
          </tr>
          <tr>
            <td class="title">
              <a href="/item/news_read.naver?article_id=0002421682&office_id=092&code=005930&page=&sm=" class="tit">중복</a>
            </td>
            <td class="info">지디넷코리아</td>
            <td class="date">2026.05.07 12:38</td>
          </tr>
        </tbody>
      </table>
      `,
      '005930',
      '2026-05-06T09:00:00.000Z',
    );

    expect(items).toEqual([
      {
        ticker: '005930',
        source: 'naver-finance',
        title: '삼성전자 & 반도체 뉴스',
        url: 'https://n.news.naver.com/mnews/article/092/0002421682',
        description: '지디넷코리아',
        publishedAt: '2026-05-07T03:38:00.000Z',
        fetchedAt: '2026-05-06T09:00:00.000Z',
      },
    ]);
  });

  it('uses the Naver Finance iframe endpoint instead of the empty wrapper endpoint', async () => {
    const fetchHtml = vi.fn(async () =>
      '<a href="/item/news_read.naver?article_id=2&office_id=001&code=005930">새 뉴스</a>',
    );
    const service = createStockNewsFeedService({
      repo: {
        upsertMany: vi.fn(() => []),
        listByTicker: vi.fn(() => []),
        countByTicker: vi.fn(() => 0),
        recordFetchStatus: vi.fn(),
        getFetchStatus: vi.fn(() => null),
      },
      fetchHtml,
    });

    await service.refresh({
      ticker: '005930',
      name: '삼성전자',
      now: new Date('2026-05-06T09:00:00.000Z'),
    });

    expect(fetchHtml).toHaveBeenCalledWith(
      'https://finance.naver.com/item/news_news.naver?code=005930&page=&clusterId=',
    );
  });

  it('refreshes and caches parsed feed items through the repository', async () => {
    const upsertMany = vi.fn((items) =>
      items.map((item: any, index: number) => ({ id: `news-${index}`, ...item })),
    );
    const listByTicker = vi.fn(() => []);
    const recordFetchStatus = vi.fn();
    const service = createStockNewsFeedService({
      repo: {
        upsertMany,
        listByTicker,
        countByTicker: vi.fn(() => 0),
        recordFetchStatus,
        getFetchStatus: vi.fn(() => null),
      },
      fetchHtml: vi.fn(async () =>
        '<a href="/item/news_read.naver?article_id=2&office_id=001&code=005930">새 뉴스</a>',
      ),
    });

    const items = await service.refresh({
      ticker: '005930',
      name: '삼성전자',
      now: new Date('2026-05-06T09:00:00.000Z'),
    });

    expect(upsertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        ticker: '005930',
        title: '새 뉴스',
        source: 'naver-finance',
      }),
    ]);
    expect(recordFetchStatus).toHaveBeenCalledWith({
      ticker: '005930',
      lastFetchStatus: 'success',
      lastFetchErrorCode: null,
      lastFetchedAt: '2026-05-06T09:00:00.000Z',
      updatedAt: '2026-05-06T09:00:00.000Z',
    });
    expect(items[0]).toMatchObject({ id: 'news-0', title: '새 뉴스', isNew: true });
  });

  it('marks already cached news URLs as not new after refresh', async () => {
    const url = 'https://finance.naver.com/item/news_read.naver?article_id=2&office_id=001&code=005930';
    const upsertMany = vi.fn((items) =>
      items.map((item: any, index: number) => ({ id: `news-${index}`, ...item })),
    );
    const listByTicker = vi.fn(() => [
      {
        id: 'cached-0',
        ticker: '005930',
        source: 'naver-finance' as const,
        title: '기존 뉴스',
        url,
        description: null,
        publishedAt: null,
        fetchedAt: '2026-05-05T09:00:00.000Z',
      },
    ]);
    const service = createStockNewsFeedService({
      repo: {
        upsertMany,
        listByTicker,
        countByTicker: vi.fn(() => 1),
        recordFetchStatus: vi.fn(),
        getFetchStatus: vi.fn(() => null),
      },
      fetchHtml: vi.fn(async () =>
        '<a href="/item/news_read.naver?article_id=2&office_id=001&code=005930">다시 본 뉴스</a>',
      ),
    });

    const items = await service.refresh({
      ticker: '005930',
      name: '삼성전자',
      now: new Date('2026-05-06T09:00:00.000Z'),
    });

    expect(items[0]).toMatchObject({ id: 'news-0', title: '다시 본 뉴스', isNew: false });
  });

  it('adds Naver Search API news when credentials are configured', async () => {
    const upsertMany = vi.fn((items) =>
      items.map((item: any, index: number) => ({ id: `news-${index}`, ...item })),
    );
    const service = createStockNewsFeedService({
      repo: {
        upsertMany,
        listByTicker: vi.fn(() => []),
        countByTicker: vi.fn(() => 0),
        recordFetchStatus: vi.fn(),
        getFetchStatus: vi.fn(() => null),
      },
      fetchHtml: vi.fn(async () => ''),
      searchNews: vi.fn(async () => [
        {
          title: '삼성전자 검색 뉴스',
          url: 'https://news.example.com/article',
          description: '검색 API가 제공한 기사 패시지',
          publishedAt: '2026-05-06T08:30:00.000Z',
        },
      ]),
    });

    await service.refresh({
      ticker: '005930',
      name: '삼성전자',
      now: new Date('2026-05-06T09:00:00.000Z'),
    });

    expect(upsertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        ticker: '005930',
        source: 'naver-search',
        title: '삼성전자 검색 뉴스',
        description: '검색 API가 제공한 기사 패시지',
        url: 'https://news.example.com/article',
        publishedAt: '2026-05-06T08:30:00.000Z',
      }),
    ]);
  });

  it('requests the maximum Naver Search display size to widen cached news coverage with one call', async () => {
    const fetchJson = vi.fn(async (url: string) => {
      return {
        items: [
          {
            title: '<b>삼성전자</b> 검색 뉴스',
            originallink: 'https://news.example.com/article',
            description: '검색 API 패시지',
            pubDate: 'Wed, 06 May 2026 17:30:00 +0900',
          },
        ],
      };
    });
    const provider = createNaverSearchNewsProvider({
      clientId: 'redacted-client-id',
      clientSecret: 'redacted-client-secret',
      fetchJson,
    });

    const items = await provider!({
      ticker: '005930',
      name: '삼성전자',
      now: new Date('2026-05-06T09:00:00.000Z'),
    });

    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(new URL(fetchJson.mock.calls[0]![0]).searchParams.get('display')).toBe('100');
    expect(new URL(fetchJson.mock.calls[0]![0]).searchParams.get('start')).toBe('1');
    expect(items.map((item) => item.url)).toEqual([
      'https://news.example.com/article',
    ]);
  });

  it('keeps more than one page of search news in the local cache', async () => {
    const upsertMany = vi.fn((items) =>
      items.map((item: any, index: number) => ({ id: `news-${index}`, ...item })),
    );
    const service = createStockNewsFeedService({
      repo: {
        upsertMany,
        listByTicker: vi.fn(() => []),
        countByTicker: vi.fn(() => 0),
        recordFetchStatus: vi.fn(),
        getFetchStatus: vi.fn(() => null),
      },
      fetchHtml: vi.fn(async () => ''),
      searchNews: vi.fn(async () =>
        Array.from({ length: 25 }, (_, index) => ({
          title: `검색 뉴스 ${index}`,
          url: `https://news.example.com/article-${index}`,
          description: null,
          publishedAt: '2026-05-06T08:30:00.000Z',
        })),
      ),
    });

    await service.refresh({
      ticker: '005930',
      name: '삼성전자',
      now: new Date('2026-05-06T09:00:00.000Z'),
    });

    expect(upsertMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ url: 'https://news.example.com/article-24' }),
      ]),
    );
    expect(upsertMany.mock.calls[0]?.[0]).toHaveLength(25);
  });
});
