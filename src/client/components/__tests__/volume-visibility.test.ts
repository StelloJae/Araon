import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { StockViewModel } from '../../lib/view-models';
import { buildSignalExplanation } from '../../lib/signal-explainer';
import { StockRow } from '../StockRow';
import { StockDetailModal } from '../StockDetailModal';
import { formatSurgeSubLabel, SurgeBlock, SurgeRow } from '../SurgeBlock';

function stock(overrides: Partial<StockViewModel> = {}): StockViewModel {
  return {
    code: '005930',
    name: '삼성전자',
    market: 'KOSPI',
    price: 70_000,
    changePct: 3.4,
    changeAbs: 2300,
    volume: 1_234_567,
    updatedAt: '2026-04-29T01:00:00.000Z',
    isSnapshot: false,
    sectorId: null,
    effectiveSector: { name: '전기전자', source: 'kis-industry' },
    ...overrides,
  };
}

describe('volume visibility', () => {
  it('keeps compact stock rows focused on price without a volume pill', () => {
    const html = renderToStaticMarkup(
      createElement(StockRow, {
        stock: stock(),
        rank: 1,
        isFav: true,
        onToggleFav: () => undefined,
        onOpenDetail: () => undefined,
        flashSeed: 0,
        isFirst: true,
      }),
    );

    expect(html).not.toContain('거래량');
    expect(html).not.toContain('123.5만');
  });

  it('shows current cumulative volume on surge row sublabels', () => {
    const label = formatSurgeSubLabel({
      code: '005930',
      name: '삼성전자',
      price: 70_000,
      changePct: 4.2,
      volume: 1_234_567,
      ts: 1_700_000_000_000,
      isLive: true,
    }, 1_000);

    expect(label).toContain('거래량');
    expect(label).toContain('123.5만');
  });

  it('does not invent a surge volume label when quote volume is missing', () => {
    const label = formatSurgeSubLabel({
      code: '005930',
      name: '삼성전자',
      price: 70_000,
      changePct: 4.2,
      volume: null,
      ts: 1_700_000_000_000,
      isLive: true,
    }, 1_000);

    expect(label).not.toContain('거래량');
  });

  it('shows collecting state instead of fake multiplier when baseline is missing', () => {
    const label = formatSurgeSubLabel({
      code: '005930',
      name: '삼성전자',
      price: 70_000,
      changePct: 4.2,
      volume: 1_234_567,
      volumeSurgeRatio: null,
      volumeBaselineStatus: 'collecting',
      ts: 1_700_000_000_000,
      isLive: true,
    }, 1_000);

    expect(label).toContain('기준선 수집 중');
    expect(label).not.toContain('x');
  });

  it('shows volume surge ratio when a same-time baseline is available', () => {
    const label = formatSurgeSubLabel({
      code: '005930',
      name: '삼성전자',
      price: 70_000,
      changePct: 4.2,
      volume: 1_234_567,
      volumeSurgeRatio: 5.24,
      volumeBaselineStatus: 'ready',
      ts: 1_700_000_000_000,
      isLive: true,
    }, 1_000);

    expect(label).toContain('거래량 5.2x');
  });

  it('labels realtime momentum rows by signal and window', () => {
    const label = formatSurgeSubLabel({
      code: '005930',
      name: '삼성전자',
      price: 70_000,
      changePct: 2.1,
      volume: 1_234_567,
      ts: 1_700_000_000_000,
      isLive: true,
      signalType: 'scalp',
      momentumWindow: '30s',
      momentumPct: 2.1,
      dailyChangePct: 6.8,
    }, 1_000);

    expect(label).toContain('급가속');
    expect(label).toContain('30초 +2.1%');
    expect(label).toContain('오늘 +6.8%');
  });

  it('shows exit warning text on realtime momentum rows', () => {
    const label = formatSurgeSubLabel({
      code: '005930',
      name: '삼성전자',
      price: 70_000,
      changePct: 2.1,
      volume: 1_234_567,
      ts: 1_700_000_000_000,
      isLive: true,
      signalType: 'scalp',
      momentumWindow: '30s',
      momentumPct: 2.1,
      dailyChangePct: 6.8,
      exitWarning: {
        type: 'drawdown_from_high',
        message: '이탈 경고',
        valuePct: -0.8,
      },
    }, 1_000);

    expect(label).toContain('이탈 경고');
  });

  it('renders clear surge tab labels for recent surge and today strength', () => {
    const html = renderToStaticMarkup(
      createElement(SurgeBlock, {
        marketStatus: 'open',
        allStocks: [],
        onOpenDetail: () => undefined,
      }),
    );

    expect(html).toContain('최근 급상승');
    expect(html).toContain('오늘 강세');
    expect(html).toContain('10~30초');
  });

  it('renders deterministic signal explanation on surge rows', () => {
    const item = {
      code: '005930',
      name: '삼성전자',
      price: 70_000,
      changePct: 1.8,
      volume: 1_234_567,
      volumeSurgeRatio: null,
      volumeBaselineStatus: 'collecting' as const,
      ts: 1_700_000_000_000,
      isLive: true,
      signalType: 'scalp' as const,
      momentumPct: 1.8,
      momentumWindow: '10s' as const,
      dailyChangePct: 4.2,
    };
    const s = stock({
      changePct: 4.2,
      volumeSurgeRatio: null,
      volumeBaselineStatus: 'collecting',
    });
    const explanation = buildSignalExplanation({
      stock: s,
      allStocks: [s],
      isFavorite: true,
      surgeItem: item,
      marketStatus: 'open',
    });

    const html = renderToStaticMarkup(
      createElement(SurgeRow, {
        item,
        now: 1_700_000_001_000,
        isFirst: true,
        explanation,
        onOpenDetail: () => undefined,
      }),
    );

    expect(html).toContain('실시간 10초 +1.8% 급가속');
    expect(html).toContain('오늘 +4.2% 강세');
    expect(html).toContain('즐겨찾기 종목');
    expect(html).toContain('거래량 기준선 수집 중');
    expect(html).not.toContain('거래량 기준선 대비');
  });

  it('renders signal explanation in the stock detail modal', () => {
    const html = renderToStaticMarkup(
      createElement(StockDetailModal, {
        stock: stock({
          changePct: 5.4,
          volumeSurgeRatio: null,
          volumeBaselineStatus: 'collecting',
        }),
        allStocks: [
          stock({ code: '005930', changePct: 5.4 }),
          stock({ code: '000660', name: 'SK하이닉스', changePct: 2.3 }),
          stock({ code: '042700', name: '한미반도체', changePct: 3.1 }),
        ],
        isFavorite: true,
        marketStatus: 'open',
        onClose: () => undefined,
        onNavigate: () => undefined,
        onToggleFav: () => undefined,
        onUntrack: () => undefined,
      }),
    );

    expect(html).toContain('관찰 근거');
    expect(html).toContain('오늘 +5.4% 강세');
    expect(html).toContain('전기전자 동반 강세');
    expect(html).toContain('거래량 기준선 수집 중');
    expect(html).not.toContain('거래량 기준선 대비');
  });

  it('exposes realtime and chart tabs in the stock detail modal', () => {
    const html = renderToStaticMarkup(
      createElement(StockDetailModal, {
        stock: stock(),
        allStocks: [stock()],
        isFavorite: false,
        marketStatus: 'open',
        onClose: () => undefined,
        onNavigate: () => undefined,
        onToggleFav: () => undefined,
        onUntrack: () => undefined,
      }),
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('실시간');
    expect(html).toContain('차트');
  });

  it('renders the realtime/chart tabs before the metrics heading in the stock detail modal', () => {
    const html = renderToStaticMarkup(
      createElement(StockDetailModal, {
        stock: stock(),
        allStocks: [stock()],
        isFavorite: false,
        marketStatus: 'open',
        onClose: () => undefined,
        onNavigate: () => undefined,
        onToggleFav: () => undefined,
        onUntrack: () => undefined,
      }),
    );

    const tabsIndex = html.indexOf('aria-label="종목 상세 탭"');
    const metricsHeadingIndex = html.indexOf('실시간 가격 추이');

    expect(tabsIndex).toBeGreaterThanOrEqual(0);
    expect(metricsHeadingIndex).toBeGreaterThanOrEqual(0);
    expect(tabsIndex).toBeLessThan(metricsHeadingIndex);
  });

  it('renders available detail metrics without placeholder copy', () => {
    const html = renderToStaticMarkup(
      createElement(StockDetailModal, {
        stock: stock({
          openPrice: 69_500,
          highPrice: 71_200,
          lowPrice: 68_900,
          accumulatedTradeValue: 86_420_000_000,
          marketCapKrw: 4_710_000_000_000,
          per: 14.2,
          pbr: 1.1,
          foreignOwnershipRate: 52.4,
          week52High: 92_000,
          week52Low: 61_000,
          volumeSurgeRatio: 2.4,
          volumeBaselineStatus: 'ready',
          dividendYield: null,
        }),
        allStocks: [stock()],
        isFavorite: false,
        marketStatus: 'open',
        onClose: () => undefined,
        onNavigate: () => undefined,
        onToggleFav: () => undefined,
        onUntrack: () => undefined,
      }),
    );

    expect(html).toContain('69,500');
    expect(html).toContain('71,200');
    expect(html).toContain('68,900');
    expect(html).toContain('4.7조');
    expect(html).toContain('14.20x');
    expect(html).toContain('1.10x');
    expect(html).toContain('52.40%');
    expect(html).toContain('92,000');
    expect(html).toContain('61,000');
    expect(html).toContain('기준선 대비 2.4x');
    expect(html).toContain('미제공');
  });
});
