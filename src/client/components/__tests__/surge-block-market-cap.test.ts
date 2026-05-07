import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SurgeBlock } from '../SurgeBlock';
import type { StockViewModel } from '../../lib/view-models';

function stock(overrides: Partial<StockViewModel> = {}): StockViewModel {
  return {
    code: '005930',
    name: '삼성전자',
    price: 70_000,
    changePct: 5,
    changeAbs: 3_000,
    volume: 1_000_000,
    market: 'KOSPI',
    updatedAt: '2026-05-07T01:00:00.000Z',
    isSnapshot: false,
    sectorId: null,
    effectiveSector: { name: '전기전자', source: 'kis-industry' },
    marketCapSize: 'large',
    ...overrides,
  };
}

describe('SurgeBlock market cap filter chrome', () => {
  it('renders market cap tier buttons as active controls', () => {
    const html = renderToStaticMarkup(
      createElement(SurgeBlock, {
        marketStatus: 'open',
        allStocks: [stock()],
        onOpenDetail: () => undefined,
      }),
    );

    const start = html.indexOf('시총 전체');
    const end = html.indexOf('소형', start);
    const capChrome = html.slice(start, end + 40);

    expect(capChrome).toContain('시총 전체');
    expect(capChrome).toContain('대형');
    expect(capChrome).toContain('중형');
    expect(capChrome).toContain('소형');
    expect(capChrome).not.toContain('disabled');
    expect(html).not.toContain('시총 데이터 연동 전');
  });
});
