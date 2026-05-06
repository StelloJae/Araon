import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  CandleChartView,
  ChartBackfillControl,
  formatCandleTooltipRows,
  normalizeCandleRangeForInterval,
} from '../StockCandleChart';

describe('StockCandleChart', () => {
  it('renders an honest empty state without synthetic chart data', () => {
    const html = renderToStaticMarkup(
      createElement(CandleChartView, {
        status: 'empty',
        items: [],
        interval: '1m',
        range: '1d',
      }),
    );

    expect(html).toContain('차트 데이터 수집 중');
    expect(html).toContain('Araon이 실행 중인 동안의 1분봉부터 저장됩니다');
    expect(html).not.toContain('<canvas');
  });

  it('renders a chart host when candle data is present', () => {
    const html = renderToStaticMarkup(
      createElement(CandleChartView, {
        status: 'ready',
        interval: '1m',
        range: '1d',
        items: [
          {
            time: 1777939200,
            bucketAt: '2026-05-05T00:00:00.000Z',
            open: 70_000,
            high: 70_500,
            low: 69_800,
            close: 70_200,
            volume: 123,
            sampleCount: 3,
            isPartial: false,
          },
        ],
      }),
    );

    expect(html).toContain('data-testid="stock-candle-chart-host"');
    expect(html).toContain('1m');
    expect(html).toContain('차트 위에 마우스를 올리면');
  });

  it('formats crosshair tooltip rows from actual candle values', () => {
    const rows = formatCandleTooltipRows({
      time: 1777939200,
      bucketAt: '2026-05-05T00:00:00.000Z',
      open: 70_000,
      high: 70_500,
      low: 69_800,
      close: 70_200,
      volume: 123_456,
      sampleCount: 3,
      source: 'kis-daily',
      isPartial: false,
    });

    expect(rows).toEqual([
      ['시각', '2026. 05. 05. 09:00'],
      ['시가', '70,000'],
      ['고가', '70,500'],
      ['저가', '69,800'],
      ['종가', '70,200'],
      ['거래량', '12.3만'],
      ['데이터', 'kis-daily'],
    ]);
  });

  it('renders a daily backfill control for weekly/monthly intervals only', () => {
    const weekly = renderToStaticMarkup(
      createElement(ChartBackfillControl, {
        interval: '1W',
        disabled: false,
        pending: false,
        message: 'KIS 과거 일봉을 가져옵니다.',
        onBackfill: () => undefined,
      }),
    );
    const intraday = renderToStaticMarkup(
      createElement(ChartBackfillControl, {
        interval: '5m',
        disabled: false,
        pending: false,
        message: null,
        onBackfill: () => undefined,
      }),
    );

    expect(weekly).toContain('과거 일봉 가져오기');
    expect(intraday).not.toContain('과거 일봉 가져오기');
  });

  it('can render weekly chart metadata without synthetic data', () => {
    const html = renderToStaticMarkup(
      createElement(CandleChartView, {
        status: 'ready',
        interval: '1W',
        range: '3m',
        items: [
          {
            time: 1777820400,
            bucketAt: '2026-05-03T15:00:00.000Z',
            open: 70_000,
            high: 72_000,
            low: 69_000,
            close: 71_000,
            volume: 123,
            sampleCount: 5,
            source: 'kis-daily',
            isPartial: false,
          },
        ],
      }),
    );

    expect(html).toContain('1W');
    expect(html).toContain('data-testid="stock-candle-chart-host"');
  });

  it('widens too-short ranges for daily and higher intervals', () => {
    expect(normalizeCandleRangeForInterval('1D', '1d')).toBe('1m');
    expect(normalizeCandleRangeForInterval('1W', '1m')).toBe('3m');
    expect(normalizeCandleRangeForInterval('1M', '6m')).toBe('1y');
    expect(normalizeCandleRangeForInterval('1D', '3m')).toBe('3m');
    expect(normalizeCandleRangeForInterval('5m', '1d')).toBe('1d');
  });
});
