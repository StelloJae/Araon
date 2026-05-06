import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { StockNewsDisclosurePanel } from '../StockNewsDisclosurePanel';

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
});
