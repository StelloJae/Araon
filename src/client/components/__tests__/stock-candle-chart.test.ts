import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  CandleChartView,
  ChartAutoBackfillStatus,
  ChartRepairButton,
  CandleDataInspector,
  PinnedCandlePanel,
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
    expect(html).toContain('이 종목의 저장된 candle이 아직 부족합니다');
    expect(html).toContain('장중에는 현재 선택 종목의 오늘 분봉부터 보강합니다');
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
    expect(html).toContain('마우스를 올리면 OHLCV 표시');
    expect(html).toContain('클릭하면 봉 고정');
  });

  it('renders a compact chart data inspector from coverage metadata', () => {
    const html = renderToStaticMarkup(
      createElement(CandleDataInspector, {
        coverage: {
          from: '2026-05-05T00:00:00.000Z',
          to: '2026-05-05T01:00:00.000Z',
          localOnly: false,
          backfilled: true,
          sourceMix: ['kis-time-daily'],
          partialCount: 0,
          gapCount: 2,
          oldestBucketAt: '2026-05-05T00:00:00.000Z',
          newestBucketAt: '2026-05-05T01:00:00.000Z',
          ledger: {
            completeSegments: 1,
            partialSegments: 0,
            failedSegments: 0,
            skippedSegments: 0,
            latestCompletedAt: '2026-05-05T11:10:00.000Z',
          },
        },
      }),
    );

    expect(html).toContain('데이터 검사');
    expect(html).toContain('KIS 과거 분봉');
    expect(html).toContain('공백 2');
    expect(html).toContain('장부 완료 1');
  });

  it('renders a pinned candle inspection panel from actual candle rows', () => {
    const html = renderToStaticMarkup(
      createElement(PinnedCandlePanel, {
        rows: [
          ['시각', '2026. 05. 05. 09:00'],
          ['시가', '70,000'],
          ['종가', '70,200'],
        ],
        onClear: () => undefined,
      }),
    );

    expect(html).toContain('고정된 봉');
    expect(html).toContain('2026. 05. 05. 09:00');
    expect(html).toContain('70,200');
    expect(html).toContain('해제');
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

  it('renders automatic chart coverage status instead of manual fetch buttons', () => {
    const intraday = renderToStaticMarkup(
      createElement(ChartAutoBackfillStatus, {
        interval: '5m',
        pending: false,
        message: '과거 분봉 자동 보강 완료',
      }),
    );
    const daily = renderToStaticMarkup(
      createElement(ChartAutoBackfillStatus, {
        interval: '1D',
        pending: true,
        message: '과거 일봉 자동 보강 중',
      }),
    );

    expect(intraday).toContain('분봉 자동');
    expect(intraday).toContain('분봉 자동 · 과거 분봉 자동 보강 완료');
    expect(daily).toContain('보강 중');
    expect(intraday).not.toContain('오늘 분봉 가져오기');
    expect(daily).not.toContain('과거 일봉 가져오기');
  });

  it('renders a compact chart repair control for the visible range', () => {
    const html = renderToStaticMarkup(
      createElement(ChartRepairButton, {
        running: false,
        onRepair: () => undefined,
      }),
    );

    expect(html).toContain('차트 재검사');
    expect(html).toContain('현재 보이는 종목과 범위만 다시 보강합니다');
    expect(html).not.toContain('disabled');
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
