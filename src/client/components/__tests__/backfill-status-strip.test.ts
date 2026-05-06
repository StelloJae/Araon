import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  BackfillStatusPillView,
  describeDailyBackfillStatus,
} from '../BackfillStatusStrip';
import type { RuntimeDataHealthPayload } from '../../lib/api-client';

function health(
  backfill: Partial<RuntimeDataHealthPayload['backfill']> = {},
): RuntimeDataHealthPayload {
  return {
    tracking: { trackedCount: 12, favoriteCount: 3 },
    candles: [
      { interval: '1m', tickerCount: 5, candleCount: 120, newestBucketAt: '2026-05-06T06:30:00.000Z' },
      { interval: '1d', tickerCount: 3, candleCount: 186, newestBucketAt: '2026-05-05T15:00:00.000Z' },
    ],
    backfill: {
      enabled: true,
      range: '3m',
      running: false,
      lastRunAt: null,
      lastFinishedAt: null,
      lastAttempted: 0,
      lastSucceeded: 0,
      lastFailed: 0,
      lastSkippedReason: null,
      budgetDateKey: '2026-05-07',
      dailyCallCount: 0,
      dailyCallBudget: null,
      cooldownUntil: null,
      cooldownActive: false,
      ...backfill,
    },
    volumeBaseline: { total: 12, ready: 0, collecting: 0, unavailable: 12 },
    growth: {
      signals: {
        eventCount: 0,
        oldestSignalEventAt: null,
        newestSignalEventAt: null,
        retentionDays: 90,
      },
      notes: { noteCount: 0, oldestNoteAt: null, newestNoteAt: null },
      news: {
        itemCount: 0,
        staleItemCount: 0,
        oldestFetchedAt: null,
        newestFetchedAt: null,
        failedFetchCount: 0,
        lastFetchStatus: 'success',
        lastFetchErrorCode: null,
        lastFetchedAt: null,
        ttlHours: 24,
        pruneAfterDays: 7,
      },
    },
    maintenance: {
      lastRunAt: null,
      candlePruneLastRunAt: null,
      candlePruneLastError: null,
    },
  };
}

describe('BackfillStatusPill', () => {
  it('shows running daily backfill as a compact header pill', () => {
    const status = describeDailyBackfillStatus(
      health({ running: true, lastAttempted: 2, lastSucceeded: 1 }),
    );
    const html = renderToStaticMarkup(createElement(BackfillStatusPillView, { status }));

    expect(html).toContain('일봉 보강 중');
    expect(html).toContain('1/2');
    expect(html).not.toContain('과거 일봉 자동 보강 실행 중');
  });

  it('shows today call count without an artificial budget cap', () => {
    const status = describeDailyBackfillStatus(
      health({ dailyCallCount: 300, dailyCallBudget: null }),
    );

    expect(status.label).toContain('대기');
    expect(status.detail).toContain('오늘 호출 300회');
    expect(status.detail).not.toContain('예산');
  });

  it('renders a compact header pill without the long dashboard banner copy', () => {
    const status = describeDailyBackfillStatus(
      health({ dailyCallCount: 80, dailyCallBudget: null }),
    );
    const html = renderToStaticMarkup(createElement(BackfillStatusPillView, { status }));

    expect(html).toContain('일봉');
    expect(html).toContain('80회');
    expect(html).not.toContain('과거 일봉 자동 보강 대기');
    expect(html).not.toContain('favorites와 추적 종목');
  });

  it('reports up-to-date tracked tickers without implying a failure', () => {
    const status = describeDailyBackfillStatus(
      health({ lastSkippedReason: 'no_stale_tickers' }),
    );

    expect(status.label).toContain('최신 상태');
    expect(status.detail).toContain('보강 필요한 추적 종목이 없습니다');
  });
});
