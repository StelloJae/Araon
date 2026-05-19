import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  CandleChartView,
  ChartAutoBackfillStatus,
  ChartRepairButton,
  CandleDataInspector,
  PinnedCandlePanel,
  chartCoverageTimeoutMessage,
  candleSourceStatusText,
  formatCandleTooltipRows,
  formatKstChartTime,
  formatKstTickMark,
  getChartPalette,
  mergeCandleItemOverlays,
  mergeLiveQuoteIntoCandleItems,
  normalizeCandleRangeForInterval,
  resolveWithTimeout,
  shouldReplaceCandleTooltipRows,
  trimNonTradingEdgeCandles,
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
    expect(html).toContain('Toss 차트 데이터를 우선 보강합니다');
    expect(html).not.toContain('KIS 일봉 백필 후 표시');
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

  it('exposes latest candle metadata for browser progression QA without synthetic data', () => {
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
            source: 'toss-time-today',
            isPartial: false,
          },
          {
            time: 1777939260,
            bucketAt: '2026-05-05T00:01:00.000Z',
            open: 70_200,
            high: 70_700,
            low: 70_100,
            close: 70_500,
            volume: 145,
            sampleCount: 4,
            source: 'toss-fast-quote',
            isPartial: true,
          },
        ],
      }),
    );

    expect(html).toContain('data-testid="stock-candle-chart-host"');
    expect(html).toContain('data-candle-count="2"');
    expect(html).toContain('data-latest-candle-time="2026-05-05T00:01:00.000Z"');
    expect(html).toContain('data-latest-candle-close="70500"');
    expect(html).toContain('data-latest-candle-sample-count="4"');
    expect(html).toContain('data-latest-candle-source="toss-fast-quote"');
    expect(html).toContain('data-latest-candle-partial="true"');
  });

  it('trims non-trading REST placeholder candles from chart edges', () => {
    const trimmed = trimNonTradingEdgeCandles([
      {
        time: 1778607900,
        bucketAt: '2026-05-12T17:45:00.000Z',
        open: 272_500,
        high: 272_500,
        low: 272_500,
        close: 272_500,
        volume: 0,
        sampleCount: 10,
        source: 'rest',
        isPartial: true,
      },
      {
        time: 1778626800,
        bucketAt: '2026-05-12T23:00:00.000Z',
        open: 270_000,
        high: 270_000,
        low: 265_500,
        close: 268_000,
        volume: 634_311,
        sampleCount: 366,
        source: 'mixed',
        isPartial: true,
      },
      {
        time: 1778629860,
        bucketAt: '2026-05-12T23:51:00.000Z',
        open: 266_500,
        high: 266_500,
        low: 266_500,
        close: 266_500,
        volume: 0,
        sampleCount: 19,
        source: 'rest',
        isPartial: true,
      },
    ]);

    expect(trimmed).toHaveLength(1);
    expect(trimmed[0]?.source).toBe('mixed');
  });

  it('keeps prior live overlay candles when a new minute bucket arrives', () => {
    const first = mergeLiveQuoteIntoCandleItems([], {
      ticker: '005930',
      price: 70_000,
      volume: 10,
      updatedAt: '2026-05-14T00:00:10.000Z',
      isSnapshot: false,
      source: 'toss',
    }, '1m');
    const second = mergeLiveQuoteIntoCandleItems([], {
      ticker: '005930',
      price: 70_500,
      volume: 12,
      updatedAt: '2026-05-14T00:01:05.000Z',
      isSnapshot: false,
      source: 'toss',
    }, '1m');

    const merged = mergeCandleItemOverlays(first, second);

    expect(merged).toHaveLength(2);
    expect(merged.map((item) => item.bucketAt)).toEqual([
      '2026-05-14T00:00:00.000Z',
      '2026-05-14T00:01:00.000Z',
    ]);
    expect(merged.map((item) => item.close)).toEqual([70_000, 70_500]);
  });

  it('advances the current minute candle close and sample count from real live quotes', () => {
    const storedBucketAt = '2026-05-14T00:01:00.000Z';
    const stored = [
      {
        time: Math.trunc(Date.parse(storedBucketAt) / 1000),
        bucketAt: storedBucketAt,
        open: 70_000,
        high: 70_300,
        low: 69_900,
        close: 70_100,
        volume: 100,
        sampleCount: 3,
        source: 'toss-time-today' as const,
        isPartial: false,
      },
    ];

    const first = mergeLiveQuoteIntoCandleItems(stored, {
      ticker: '005930',
      price: 70_500,
      volume: 150,
      updatedAt: '2026-05-14T00:01:10.000Z',
      isSnapshot: false,
      source: 'toss-fast-quote',
    }, '1m');
    const second = mergeLiveQuoteIntoCandleItems(first, {
      ticker: '005930',
      price: 69_800,
      volume: 170,
      updatedAt: '2026-05-14T00:01:20.000Z',
      isSnapshot: false,
      source: 'toss-fast-quote',
    }, '1m');

    expect(first[0]).toMatchObject({
      open: 70_000,
      high: 70_500,
      low: 69_900,
      close: 70_500,
      volume: 150,
      sampleCount: 4,
      source: 'mixed',
      isPartial: true,
    });
    expect(second[0]).toMatchObject({
      open: 70_000,
      high: 70_500,
      low: 69_800,
      close: 69_800,
      volume: 170,
      sampleCount: 5,
      source: 'mixed',
      isPartial: true,
    });

    const html = renderToStaticMarkup(
      createElement(CandleChartView, {
        status: 'ready',
        interval: '1m',
        range: '1d',
        items: second,
      }),
    );

    expect(html).toContain('data-latest-candle-close="69800"');
    expect(html).toContain('data-latest-candle-sample-count="5"');
    expect(html).toContain('data-latest-candle-source="mixed"');
    expect(html).toContain('data-latest-candle-partial="true"');
  });

  it('does not append live quotes from a different KST session to stored intraday candles', () => {
    const storedBucketAt = '2026-05-15T07:03:00.000Z';
    const stored = [
      {
        time: Math.trunc(Date.parse(storedBucketAt) / 1000),
        bucketAt: storedBucketAt,
        open: 820_000,
        high: 821_000,
        low: 819_000,
        close: 820_000,
        volume: 10,
        sampleCount: 1,
        source: 'toss-time-today' as const,
        isPartial: false,
      },
    ];

    const merged = mergeLiveQuoteIntoCandleItems(stored, {
      ticker: '277810',
      price: 817_000,
      volume: 734_000,
      updatedAt: '2026-05-17T09:33:10.000Z',
      isSnapshot: false,
      source: 'toss-fast-quote',
    }, '1m');

    expect(merged).toEqual(stored);
  });

  it('does not create closed-night live candles without stored candle data for that bucket', () => {
    const storedBucketAt = '2026-05-15T07:03:00.000Z';
    const stored = [
      {
        time: Math.trunc(Date.parse(storedBucketAt) / 1000),
        bucketAt: storedBucketAt,
        open: 820_000,
        high: 821_000,
        low: 819_000,
        close: 820_000,
        volume: 10,
        sampleCount: 1,
        source: 'toss-time-today' as const,
        isPartial: false,
      },
    ];

    const merged = mergeLiveQuoteIntoCandleItems(stored, {
      ticker: '277810',
      price: 818_000,
      volume: 734_000,
      updatedAt: '2026-05-15T12:30:10.000Z',
      isSnapshot: false,
      source: 'toss-fast-quote',
    }, '1m');

    expect(merged).toEqual(stored);
  });

  it('supports Korean and US candlestick color conventions', () => {
    expect(getChartPalette('kr')).toMatchObject({
      upColor: '#F6465D',
      downColor: '#1EAEDB',
    });
    expect(getChartPalette('us')).toMatchObject({
      upColor: '#0ECB81',
      downColor: '#F6465D',
    });
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

  it('formats chart axis and crosshair time in KST', () => {
    expect(formatKstChartTime(1777939200)).toContain('09:00');
    expect(formatKstTickMark(1777939200)).toBe('09:00');
  });

  it('updates crosshair tooltip rows only when the candle changes', () => {
    expect(shouldReplaceCandleTooltipRows(null, 1777939200)).toBe(true);
    expect(shouldReplaceCandleTooltipRows(1777939200, 1777939200)).toBe(false);
    expect(shouldReplaceCandleTooltipRows(1777939200, 1777939260)).toBe(true);
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

  it('falls back when chart coverage checks stall', async () => {
    const result = await resolveWithTimeout(
      new Promise<string>(() => undefined),
      0,
      'timeout',
    );

    expect(result).toBe('timeout');
  });

  it('does not imply chart loading is blocked when stored candles are already visible', () => {
    expect(chartCoverageTimeoutMessage(true)).toContain('저장된 candle을 표시');
    expect(chartCoverageTimeoutMessage(true)).toContain('백그라운드');
    expect(chartCoverageTimeoutMessage(false)).toContain('보강 확인이 오래 걸려');
  });

  it('does not attribute provider-neutral backfilled candles to KIS', () => {
    expect(candleSourceStatusText([], true)).toBe('자동 차트 백필 포함');
    expect(candleSourceStatusText(['toss-daily'], true)).toBe('토스 일봉 백필 포함');
    expect(candleSourceStatusText(['kis-daily'], true)).toBe('legacy KIS 일봉 포함');
  });

  it('uses the coverage result when it resolves before timeout', async () => {
    const result = await resolveWithTimeout(
      Promise.resolve('ready'),
      100,
      'timeout',
    );

    expect(result).toBe('ready');
  });
});
