import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DisclosureItemLink, NewsFeedItemLink, StockNewsDisclosurePanel } from '../StockNewsDisclosurePanel';

describe('StockNewsDisclosurePanel', () => {
  it('keeps external source links as compact fallback instead of large cards', () => {
    const html = renderToStaticMarkup(
      createElement(StockNewsDisclosurePanel, {
        ticker: '005930',
        name: '삼성전자',
      }),
    );

    expect(html).toContain('관련 뉴스 · 공시');
    expect(html).toContain('뉴스·공시 갱신');
    expect(html).toContain('외부에서 확인');
    expect(html).toContain('네이버 금융 뉴스');
    expect(html).toContain('DART 공시 검색');
    expect(html).toContain('KIND 공시');
    expect(html).toContain('code=005930');
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain('종목 뉴스와 시황 기사');
    expect(html).not.toContain('금감원 전자공시 검색');
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
          description: '언론사 또는 검색 API 패시지',
          publishedAt: null,
          fetchedAt: '2026-05-06T09:00:00.000Z',
          isNew: true,
        },
        first: true,
      }),
    );

    expect(html).toContain('새 링크');
    expect(html).toContain('삼성전자 신규 뉴스');
    expect(html).toContain('언론사 또는 검색 API 패시지');
    expect(html).not.toContain('뉴스 분석');
    expect(html).not.toContain('요약');
  });

  it('labels important disclosure links without summarizing filings', () => {
    const html = renderToStaticMarkup(
      createElement(DisclosureItemLink, {
        item: {
          id: 'filing-1',
          ticker: '005930',
          source: 'dart',
          kind: 'filing',
          title: '주요사항보고서(유상증자결정)',
          url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260507000001',
          publishedAt: '2026-05-07T00:00:00.000Z',
          fetchedAt: '2026-05-07T01:00:00.000Z',
        },
        first: true,
      }),
    );

    expect(html).toContain('주요');
    expect(html).toContain('공시');
    expect(html).not.toContain('공시 분석');
    expect(html).not.toContain('요약');
  });
});
