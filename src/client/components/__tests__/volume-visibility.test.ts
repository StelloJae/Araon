import { createElement } from 'react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { StockViewModel } from '../../lib/view-models';
import { buildSignalExplanation } from '../../lib/signal-explainer';
import {
  areStockRowRenderPropsEqual,
  shouldPreloadRowPriceHistory,
  StockRow,
} from '../StockRow';
import { StockDetailModal } from '../StockDetailModal';
import { formatSurgeSubLabel, SurgeBlock, SurgeRow } from '../SurgeBlock';
import { usePriceHistoryStore } from '../../stores/price-history-store';
import { useSettingsStore } from '../../stores/settings-store';

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

  it('uses CSS hover styling instead of React hover state on compact stock rows', () => {
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

    expect(html).toContain('stock-row-interactive');
    expect(html).not.toContain('--stock-row-bg');
  });

  it('keeps sector stock rows inside a narrow two-column board', () => {
    const html = renderToStaticMarkup(
      createElement(StockRow, {
        stock: stock({ name: '일반전기전자', effectiveSector: { name: 'KIS 공식 지수업종', source: 'kis-industry' } }),
        rank: 1,
        isFav: false,
        onToggleFav: () => undefined,
        onOpenDetail: () => undefined,
        flashSeed: 0,
        isFirst: true,
        compact: true,
      }),
    );

    expect(html).toContain('grid-template-columns:16px 14px minmax(0,1fr) 58px minmax(54px,auto)');
    expect(html).not.toContain('KIS 공식 지수업종');
    expect(html).not.toContain('KOSPI');
  });

  it('keeps unchanged stock rows memoizable across parent quote flushes', () => {
    const noop = () => undefined;
    const base = {
      stock: stock(),
      rank: 1,
      isFav: true,
      onToggleFav: noop,
      onOpenDetail: noop,
      flashSeed: 0,
      isFirst: true,
    };

    expect(
      areStockRowRenderPropsEqual(base, {
        ...base,
        stock: stock(),
      }),
    ).toBe(true);
    expect(
      areStockRowRenderPropsEqual(base, {
        ...base,
        stock: stock({ price: 70_500 }),
      }),
    ).toBe(false);
  });

  it('renders an available row sparkline without waiting for hover', () => {
    usePriceHistoryStore.getState().clear();
    usePriceHistoryStore.getState().seedTicker('005930', [
      { price: 70_000, changePct: 3.1, ts: 1_700_000_000_000, source: 'rest' },
      { price: 70_500, changePct: 3.8, ts: 1_700_000_005_000, source: 'ws-integrated' },
    ]);

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

    expect(html).toContain('<svg');
  });

  it('preloads local sparkline history for non-favorite visible rows', () => {
    expect(shouldPreloadRowPriceHistory({ isFav: false })).toBe(true);
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
    useSettingsStore.getState().update({ surgeFilter: 'live', surgeThreshold: 3 });
    const html = renderToStaticMarkup(
      createElement(SurgeBlock, {
        marketStatus: 'open',
        allStocks: [],
        onOpenDetail: () => undefined,
      }),
    );

    expect(html).toContain('최근 급상승');
    expect(html).toContain('오늘 강세');
    expect(html).toContain('0~30초 · ≥3%');
    expect(html).toContain('최근 0~30초 기준');
    expect(html).not.toContain('최근 10초~30초 기준');
  });

  it('explains that recent surge is a live-session signal when market is closed', () => {
    useSettingsStore.getState().update({ surgeFilter: 'live', surgeThreshold: 3 });
    const html = renderToStaticMarkup(
      createElement(SurgeBlock, {
        marketStatus: 'closed',
        allStocks: [],
        onOpenDetail: () => undefined,
      }),
    );

    expect(html).toContain('장외 대기');
    expect(html).toContain(
      '장 시간 외 · 최근 급상승은 장중 0~30초 실시간 변화만 표시',
    );
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

  it('wires recent surge rows to the selected ticker handler', () => {
    const onOpenDetail = vi.fn();
    const row = SurgeRow({
      item: {
        code: '084670',
        name: '동양고속',
        price: 74_200,
        changePct: 3.26,
        volume: 926_000,
        ts: 1_700_000_000_000,
        isLive: true,
        signalType: 'strong_scalp',
        momentumPct: 3.26,
        momentumWindow: '30s',
      },
      now: 1_700_000_001_000,
      isFirst: true,
      explanation: null,
      onOpenDetail,
    }) as ReactElement<{
      onClick: () => void;
      'data-stock-row': string;
    }>;

    expect(row.props['data-stock-row']).toBe('084670');
    row.props.onClick();
    expect(onOpenDetail).toHaveBeenCalledWith('084670');
  });

  it('does not render observation reasons in the stock detail modal', () => {
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
        onClose: () => undefined,
        onNavigate: () => undefined,
        onToggleFav: () => undefined,
        onUntrack: () => undefined,
      }),
    );

    expect(html).not.toContain('관찰 근거');
    expect(html).not.toContain('오늘 +5.4% 강세');
    expect(html).not.toContain('전기전자 동반 강세');
    expect(html).not.toContain('거래량 기준선 대비');
  });

  it('exposes realtime and chart tabs in the stock detail modal', () => {
    const html = renderToStaticMarkup(
      createElement(StockDetailModal, {
        stock: stock(),
        allStocks: [stock()],
        isFavorite: false,
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

  it('shows foreground quote refresh status inside the detail modal', () => {
    const html = renderToStaticMarkup(
      createElement(StockDetailModal, {
        stock: stock({ isSnapshot: true }),
        allStocks: [stock()],
        isFavorite: false,
        quoteRefreshStatus: 'refreshing',
        onClose: () => undefined,
        onNavigate: () => undefined,
        onToggleFav: () => undefined,
        onUntrack: () => undefined,
      }),
    );

    expect(html).toContain('시세 갱신 중');
  });

  it('offers stock-scoped quick alert rule presets in the detail modal', () => {
    const html = renderToStaticMarkup(
      createElement(StockDetailModal, {
        stock: stock(),
        allStocks: [stock()],
        isFavorite: false,
        onClose: () => undefined,
        onNavigate: () => undefined,
        onToggleFav: () => undefined,
        onUntrack: () => undefined,
      }),
    );

    expect(html).toContain('알림 빠른 추가');
    expect(html).toContain('등락률 +5%');
    expect(html).toContain('거래량 2.5x');
    expect(html).toContain('현재가 +3%');
  });

  it('renders the realtime/chart tabs before the metrics heading in the stock detail modal', () => {
    const html = renderToStaticMarkup(
      createElement(StockDetailModal, {
        stock: stock(),
        allStocks: [stock()],
        isFavorite: false,
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
    expect(html.match(/data-testid="metric-grid-filler"/g)).toHaveLength(3);
  });
});
