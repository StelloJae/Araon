import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { StockViewModel } from '../../lib/view-models';
import {
  buildStockDataQuality,
  StockDataQualityPanelView,
} from '../StockDataQualityPanel';

function stock(overrides: Partial<StockViewModel> = {}): StockViewModel {
  return {
    code: '005930',
    name: '삼성전자',
    price: 70_000,
    changePct: 1.2,
    changeAbs: 800,
    volume: 1_000,
    market: 'KOSPI',
    updatedAt: '2026-05-06T01:00:00.000Z',
    isSnapshot: false,
    sectorId: null,
    effectiveSector: { name: '반도체', source: 'manual' },
    volumeBaselineStatus: 'ready',
    source: 'ws-integrated',
    ...overrides,
  };
}

describe('StockDataQualityPanel', () => {
  it('scores a stock from live price, candle coverage, and volume baseline', () => {
    const quality = buildStockDataQuality(stock(), {
      minuteCount: 12,
      minuteNewestAt: '2026-05-06T01:00:00.000Z',
      dailyCount: 20,
      dailyNewestAt: '2026-05-05T15:00:00.000Z',
    });

    const html = renderToStaticMarkup(
      createElement(StockDataQualityPanelView, {
        quality,
        loading: false,
        failed: false,
      }),
    );

    expect(html).toContain('데이터 품질 100점');
    expect(html).toContain('통합 실시간');
    expect(html).toContain('1분봉 12개');
    expect(html).toContain('일봉 20개');
    expect(html).toContain('거래량 기준선 준비');
  });

  it('does not overstate quality when candles are missing', () => {
    const quality = buildStockDataQuality(
      stock({ isSnapshot: true, volumeBaselineStatus: 'collecting' }),
      null,
    );

    expect(quality.score).toBe(0);
    expect(quality.reasons).toContain('1분봉 수집 중');
    expect(quality.reasons).toContain('일봉 보강 대기');
  });

  it('labels REST auxiliary data separately from integrated realtime', () => {
    const quality = buildStockDataQuality(stock({ source: 'rest' }), {
      minuteCount: 1,
      minuteNewestAt: '2026-05-06T01:00:00.000Z',
      dailyCount: 1,
      dailyNewestAt: '2026-05-05T15:00:00.000Z',
    });

    expect(quality.reasons).toContain('REST 보조');
  });
});
