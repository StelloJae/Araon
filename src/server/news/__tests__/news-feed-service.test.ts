import { describe, expect, it, vi } from 'vitest';

import {
  createStockNewsFeedService,
  parseNaverFinanceNews,
} from '../news-feed-service';

describe('stock news feed service', () => {
  it('parses Naver Finance news anchors into source links', () => {
    const items = parseNaverFinanceNews(
      `
      <a href="/item/news_read.naver?article_id=1&office_id=001&code=005930">삼성전자 &amp; 반도체 뉴스</a>
      <a href="/item/main.naver?code=005930">종목 메인</a>
      <a href="/item/news_read.naver?article_id=1&office_id=001&code=005930">중복</a>
      `,
      '005930',
      '2026-05-06T09:00:00.000Z',
    );

    expect(items).toEqual([
      {
        ticker: '005930',
        source: 'naver-finance',
        title: '삼성전자 & 반도체 뉴스',
        url: 'https://finance.naver.com/item/news_read.naver?article_id=1&office_id=001&code=005930',
        publishedAt: null,
        fetchedAt: '2026-05-06T09:00:00.000Z',
      },
    ]);
  });

  it('refreshes and caches parsed feed items through the repository', async () => {
    const upsertMany = vi.fn((items) =>
      items.map((item: any, index: number) => ({ id: `news-${index}`, ...item })),
    );
    const listByTicker = vi.fn(() => []);
    const service = createStockNewsFeedService({
      repo: { upsertMany, listByTicker },
      fetchHtml: vi.fn(async () =>
        '<a href="/item/news_read.naver?article_id=2&office_id=001&code=005930">새 뉴스</a>',
      ),
    });

    const items = await service.refresh({
      ticker: '005930',
      now: new Date('2026-05-06T09:00:00.000Z'),
    });

    expect(upsertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        ticker: '005930',
        title: '새 뉴스',
        source: 'naver-finance',
      }),
    ]);
    expect(items[0]).toMatchObject({ id: 'news-0', title: '새 뉴스' });
  });
});
