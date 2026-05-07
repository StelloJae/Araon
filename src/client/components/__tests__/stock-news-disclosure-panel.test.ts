import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { NewsFeedItemLink, StockNewsDisclosurePanel } from '../StockNewsDisclosurePanel';

describe('StockNewsDisclosurePanel', () => {
  it('renders useful news and disclosure links without placeholder copy', () => {
    const html = renderToStaticMarkup(
      createElement(StockNewsDisclosurePanel, {
        ticker: '005930',
        name: '삼성전자',
      }),
    );

    expect(html).toContain('관련 뉴스 · 공시');
    expect(html).toContain('뉴스 피드 갱신');
    expect(html).toContain('네이버 금융 뉴스');
    expect(html).toContain('DART 공시 검색');
    expect(html).toContain('KIND 공시');
    expect(html).toContain('code=005930');
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain('연동 예정');
  });

  it('marks newly discovered news links without implying analysis', () => {
    const html = renderToStaticMarkup(
      createElement(NewsFeedItemLink, {
        item: {
          id: 'news-1',
          ticker: '005930',
          source: 'naver-finance',
          title: '삼성전자 신규 뉴스',
          url: 'https://finance.naver.com/item/news_read.naver?article_id=1&office_id=001&code=005930',
          publishedAt: null,
          fetchedAt: '2026-05-06T09:00:00.000Z',
          isNew: true,
        },
        first: true,
      }),
    );

    expect(html).toContain('새 링크');
    expect(html).toContain('삼성전자 신규 뉴스');
    expect(html).not.toContain('뉴스 분석');
    expect(html).not.toContain('요약');
  });
});
