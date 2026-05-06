import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  BackgroundBackfillControl,
  DataHealthPanel,
  RealtimeSessionControl,
} from '../SettingsModal';

describe('managed operations settings copy', () => {
  it('presents realtime as managed automatic operation with diagnostics collapsed', () => {
    const html = renderToStaticMarkup(
      createElement(RealtimeSessionControl, {
        status: null,
        selectedCap: 40,
        confirmed: false,
        phase: { kind: 'idle' },
        runtimeStarted: true,
        onCapChange: vi.fn(),
        onConfirmChange: vi.fn(),
        onEnable: vi.fn(),
        onDisable: vi.fn(),
        onEmergencyDisable: vi.fn(),
      }),
    );

    expect(html).toContain('자동 운영');
    expect(html).toContain('최대 40종목');
    expect(html).toContain('REST 폴링 fallback');
    expect(html).toContain('비상정지');
    expect(html).not.toContain('data-testid="realtime-cap-select"');
    expect(html).not.toContain('세션에서 켜기');
  });

  it('presents daily backfill as automatic with emergency pause only', () => {
    const html = renderToStaticMarkup(
      createElement(BackgroundBackfillControl, {
        settings: {
          pollingCycleDelayMs: 1000,
          pollingMaxInFlight: 5,
          pollingMinStartGapMs: 125,
          pollingStartJitterMs: 20,
          rateLimiterMode: 'live',
          websocketEnabled: true,
          applyTicksToPriceStore: true,
          backgroundDailyBackfillEnabled: true,
          backgroundDailyBackfillRange: '3m',
        },
        phase: { kind: 'idle' },
        runtimeStarted: true,
        onEmergencyDisable: vi.fn(),
      }),
    );

    expect(html).toContain('과거 일봉 자동 보강');
    expect(html).toContain('자동 운영');
    expect(html).toContain('장중 07:55~20:05');
    expect(html).toContain('비상정지');
    expect(html).not.toContain('자동 백필 꺼짐');
  });

  it('shows data health coverage and volume baseline readiness', () => {
    const html = renderToStaticMarkup(
      createElement(DataHealthPanel, {
        health: {
          tracking: { trackedCount: 12, favoriteCount: 3 },
          candles: [
            {
              interval: '1m',
              tickerCount: 5,
              candleCount: 240,
              newestBucketAt: '2026-05-06T06:30:00.000Z',
            },
            {
              interval: '1d',
              tickerCount: 8,
              candleCount: 120,
              newestBucketAt: '2026-05-05T15:00:00.000Z',
            },
          ],
          backfill: {
            enabled: true,
            range: '3m',
            budgetDateKey: '2026-05-06',
            dailyCallCount: 4,
            cooldownUntil: null,
            cooldownActive: false,
          },
          volumeBaseline: {
            total: 12,
            ready: 7,
            collecting: 5,
            unavailable: 0,
          },
          growth: {
            signals: {
              eventCount: 9,
              oldestSignalEventAt: '2026-05-01T09:00:00.000Z',
              newestSignalEventAt: '2026-05-06T09:00:00.000Z',
              retentionDays: 90,
            },
            notes: {
              noteCount: 4,
              oldestNoteAt: '2026-05-02T09:00:00.000Z',
              newestNoteAt: '2026-05-06T09:00:00.000Z',
            },
            news: {
              itemCount: 6,
              staleItemCount: 1,
              oldestFetchedAt: '2026-05-05T09:00:00.000Z',
              newestFetchedAt: '2026-05-06T09:00:00.000Z',
              failedFetchCount: 0,
              lastFetchStatus: 'success',
              lastFetchErrorCode: null,
              lastFetchedAt: '2026-05-06T09:00:00.000Z',
              ttlHours: 24,
              pruneAfterDays: 7,
            },
          },
          maintenance: {
            lastRunAt: '2026-05-06T06:00:00.000Z',
            candlePruneLastRunAt: '2026-05-06T06:00:00.000Z',
            candlePruneLastError: null,
          },
        },
      }),
    );

    expect(html).toContain('데이터 건강 상태');
    expect(html).toContain('1분봉 coverage');
    expect(html).toContain('일봉 coverage');
    expect(html).toContain('거래량 기준선');
    expect(html).toContain('7/12 준비');
    expect(html).toContain('신호 기록');
    expect(html).toContain('관찰 메모');
    expect(html).toContain('뉴스 캐시');
    expect(html).toContain('candle 정리');
  });
});
