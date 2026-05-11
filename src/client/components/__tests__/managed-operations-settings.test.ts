import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  BackgroundBackfillControl,
  DataHealthPanel,
  DevModeControl,
  LocalBackupPanel,
  NotifTab,
  RealtimeSessionControl,
  SurgeTab,
  TossDataControl,
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
    expect(html).not.toContain('운영자 재검증');
    expect(html).not.toContain('data-testid="realtime-cap-select"');
    expect(html).not.toContain('세션에서 켜기');
  });

  it('shows operator recheck only when dev diagnostics are enabled', () => {
    const html = renderToStaticMarkup(
      createElement(RealtimeSessionControl, {
        status: null,
        selectedCap: 40,
        confirmed: false,
        phase: { kind: 'idle' },
        runtimeStarted: true,
        operatorDiagnosticsEnabled: true,
        onCapChange: vi.fn(),
        onConfirmChange: vi.fn(),
        onEnable: vi.fn(),
        onDisable: vi.fn(),
        onEmergencyDisable: vi.fn(),
      }),
    );

    expect(html).toContain('운영자 재검증');
  });

  it('exposes Toss session and SSE controls without raw session values', () => {
    const html = renderToStaticMarkup(
      createElement(TossDataControl, {
        session: {
          configured: true,
          state: 'persistent',
          provider: 'toss',
          persistent: true,
          cookieCount: 6,
          localStorageKeyCount: 2,
          sessionStorageKeyCount: 1,
          retrievedAt: '2026-05-11T06:00:00.000Z',
          expiresAt: '2026-06-11T06:00:00.000Z',
          serverExpiresAt: null,
          expiresInMs: 30 * 24 * 60 * 60 * 1000,
        },
        login: {
          state: 'idle',
          startedAt: null,
          updatedAt: null,
          finishedAt: null,
          message: null,
          persistent: false,
          cookieCount: 0,
          localStorageKeyCount: 0,
          sessionStorageKeyCount: 0,
          expiresAt: null,
          missingCookieCount: 0,
          missingLocalStorageKeyCount: 0,
        },
        realtime: {
          state: 'connected',
          startedAt: '2026-05-11T06:01:00.000Z',
          updatedAt: '2026-05-11T06:02:00.000Z',
          stoppedAt: null,
          eventCount: 3,
          reconnectCount: 0,
          lastEventType: 'wts-notification',
          lastStockCode: '005930',
          lastEventAt: '2026-05-11T06:02:00.000Z',
          lastError: null,
          thinNotificationOnly: true,
        },
        phase: { kind: 'idle' },
        onLoginStart: vi.fn(),
        onLoginCancel: vi.fn(),
        onSessionClear: vi.fn(),
        onRealtimeStart: vi.fn(),
        onRealtimeStop: vi.fn(),
      }),
    );

    expect(html).toContain('토스 데이터 연결');
    expect(html).toContain('세션 유지');
    expect(html).toContain('SSE 알림');
    expect(html).toContain('thin notification');
    expect(html).not.toContain('session-value');
    expect(html).not.toContain('storage-value');
  });

  it('presents dev mode as the explicit switch for simulated tools', () => {
    const html = renderToStaticMarkup(
      createElement(DevModeControl, {
        enabled: false,
        onChange: vi.fn(),
      }),
    );

    expect(html).toContain('개발 모드');
    expect(html).toContain('Simulated Market');
    expect(html).toContain('운영자 재검증');
  });

  it('distinguishes notification thresholds from dashboard surge filters', () => {
    const notifHtml = renderToStaticMarkup(createElement(NotifTab));
    const surgeHtml = renderToStaticMarkup(createElement(SurgeTab));

    expect(notifHtml).toContain('즐겨찾기 알림 기준');
    expect(notifHtml).toContain('메인 급상승 목록에는 영향을 주지 않습니다');
    expect(notifHtml).not.toContain('Phase 6');
    expect(surgeHtml).toContain('메인 급상승 표시 기준');
    expect(surgeHtml).toContain('알림을 보내지는 않습니다');
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
          tossQuotePollingEnabled: true,
          tossQuotePollingIntervalMs: 3000,
          tossQuotePollingBatchSize: 100,
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
            running: true,
            lastRunAt: '2026-05-06T11:05:00.000Z',
            lastFinishedAt: null,
            lastAttempted: 2,
            lastSucceeded: 1,
            lastFailed: 0,
            lastSkippedReason: null,
            budgetDateKey: '2026-05-06',
            dailyCallCount: 4,
            dailyCallBudget: null,
            cooldownUntil: null,
            cooldownActive: false,
            noWorkCooldownCount: 1,
            nextNoWorkRetryAt: '2026-05-06T17:05:10.000Z',
            recent: [
              {
                ticker: '005930',
                status: 'success',
                requested: 20,
                inserted: 20,
                updated: 0,
                source: 'kis-daily',
                finishedAt: '2026-05-06T11:05:10.000Z',
                errorCode: null,
              },
            ],
          },
          kisOutboundLimiter: {
            configured: true,
            currentState: 'recovering',
            ratePerSec: 15,
            burst: 15,
            tokens: 7.5,
            globalMinStartGapMs: 200,
            queueDepth: 0,
            queuedByPriority: {},
            currentAllowedRps: 4,
            lastThrottleAt: '2026-05-08T14:01:00.000Z',
            lastThrottleClass: 'polling',
            lastThrottleCode: 'EGW00201',
            recoveryAttemptCount: 0,
            circuitBreakerUntil: null,
            recentThrottleCount: 1,
            recentSuccessCount: 3,
            policies: [],
            profiles: [
              {
                profileId: 'primary',
                endpointClass: 'polling',
                priorityClass: 'polling',
                state: 'recovering',
                cooldownUntil: '2026-05-08T14:01:30.000Z',
                cooldownActive: false,
                firstLimitedAt: '2026-05-08T14:01:00.000Z',
                lastLimitedAt: '2026-05-08T14:01:00.000Z',
                recoveredAt: '2026-05-08T14:01:31.250Z',
                observedRecoveryMs: 31_250,
                nextRetryAt: null,
                circuitBreakerUntil: null,
                lastThrottleCode: 'EGW00201',
                recoveryAttemptCount: 0,
                recentThrottleCount: 1,
                recentSuccessCount: 3,
                currentAllowedRps: 4,
                minStartGapMs: 250,
                maxInFlight: 2,
              },
            ],
          },
          tossQuotePolling: {
            configured: true,
            running: true,
            enabled: true,
            source: 'toss-public',
            cycleCount: 4,
            lastCycleMs: 52,
            tickersInCycle: 12,
            requestedCount: 12,
            returnedCount: 11,
            missingCount: 1,
            errorCount: 0,
            consecutiveFailureCount: 0,
            lastSuccessAt: '2026-05-06T09:00:02.000Z',
            lastFailureAt: null,
            lastErrorCode: null,
            lastMessage: 'partial_quote_batch',
            intervalMs: 3000,
            batchSize: 100,
            suppressingKisPolling: true,
          },
          marketTopMovers: {
            configured: true,
            status: 'ready',
            source: 'toss-overview-ranking',
            sourcePhase: 'regular',
            sourceLabel: '토스 웹 랭킹',
            sourceReason: '토스증권 웹 overview ranking 기반 상승/하락 랭킹입니다.',
            frozen: false,
            lastGoodAgeMs: 5000,
            partialReason: null,
            stopReason: null,
            rankingDiagnostics: null,
            rankingRateLimited: true,
            lastFetchedAt: '2026-05-06T09:00:00.000Z',
            lastGeneratedAt: '2026-05-06T09:00:05.000Z',
            cacheAgeMs: 5_000,
            cacheTtlMs: 10_000,
            staleAfterMs: 30_000,
            cooldownUntil: null,
            cooldownActive: false,
            inflight: false,
            lastMessage: '토스 웹 랭킹 · 10초마다 갱신',
            lastErrorCode: 'TOSS_RATE_LIMITED',
            coverage: {
              requestedLimit: 100,
              gainersCount: 100,
              losersCount: 100,
              gainersComplete: true,
              losersComplete: true,
              marketUniverse: 'toss-web-ranking',
              guaranteedTop100: true,
              includesLocalFallback: false,
            },
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
            disclosures: {
              itemCount: 4,
              staleItemCount: 1,
              oldestFetchedAt: '2026-05-05T09:00:00.000Z',
              newestFetchedAt: '2026-05-06T09:00:00.000Z',
              ttlHours: 24,
            },
          },
          notifications: {
            phoneConfigured: true,
            phoneDeliveryCount: 3,
            phoneSentCount: 2,
            phoneFailedCount: 1,
            phoneSkippedCount: 0,
            phoneLastStatus: 'failed',
            phoneLastAt: '2026-05-06T09:05:00.000Z',
            phoneLastErrorCode: 'HTTP_502',
          },
          maintenance: {
            lastRunAt: '2026-05-06T06:00:00.000Z',
            candlePruneLastRunAt: '2026-05-06T06:00:00.000Z',
            candlePruneLastError: null,
          },
          signalOutcomes: {
            totalSignals: 9,
            evaluatedSignals: 6,
            pendingSignals: 3,
            horizons: [
              {
                horizon: '5m',
                total: 9,
                ready: 6,
                pending: 3,
                averageChangePct: 0.8,
                bestChangePct: 2.1,
                worstChangePct: -0.4,
              },
              {
                horizon: '15m',
                total: 9,
                ready: 4,
                pending: 5,
                averageChangePct: 0.6,
                bestChangePct: 1.8,
                worstChangePct: -0.6,
              },
              {
                horizon: '30m',
                total: 9,
                ready: 2,
                pending: 7,
                averageChangePct: 0.3,
                bestChangePct: 1.2,
                worstChangePct: -0.8,
              },
            ],
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
    expect(html).toContain('자동 복기');
    expect(html).toContain('6/9 평가');
    expect(html).toContain('5m 평균 +0.80%');
    expect(html).toContain('15m 평균 +0.60%');
    expect(html).toContain('30m 평균 +0.30%');
    expect(html).toContain('뉴스 캐시');
    expect(html).toContain('공시 캐시');
    expect(html).toContain('폰 알림');
    expect(html).toContain('candle 정리');
    expect(html).toContain('오늘 백필 호출');
    expect(html).toContain('4회');
    expect(html).toContain('KIS 요청 제한');
    expect(html).toContain('31.3초');
    expect(html).toContain('Toss 가격 갱신');
    expect(html).toContain('11/12 수신');
    expect(html).toContain('KIS polling 억제');
    expect(html).toContain('TOP100 보장');
    expect(html).toContain('토스 웹 랭킹');
    expect(html).toContain('토스 호출 제한');
    expect(html).toContain('보강 대기 제외');
    expect(html).toContain('1종목');
    expect(html).toContain('최근 보강');
    expect(html).toContain('005930');
  });

  it('presents local backup as user data only and excludes credentials copy', () => {
    const html = renderToStaticMarkup(
      createElement(LocalBackupPanel, {
        phase: { kind: 'idle' },
        onExport: vi.fn(),
        onRestore: vi.fn(),
      }),
    );

    expect(html).toContain('로컬 백업 / 복원');
    expect(html).toContain('추적 종목');
    expect(html).toContain('즐겨찾기');
    expect(html).not.toContain('관찰 메모');
    expect(html).not.toContain('관찰 계획');
    expect(html).toContain('credentials');
    expect(html).toContain('candle 데이터는 포함하지 않습니다');
    expect(html).toContain('백업 내보내기');
    expect(html).toContain('백업 복원');
  });
});
