import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  BackgroundBackfillControl,
  AgentEventMonitorControl,
  AgentEventsFeedControl,
  DataHealthPanel,
  ChartSettingsTab,
  DevModeControl,
  KisWsSlotControl,
  LocalBackupPanel,
  NotifTab,
  OrderIntentApprovalControl,
  RealtimeSessionControl,
  TossAccountSurfaceControl,
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
    expect(html).toContain('실시간 추적은 최대 40개 한국 종목');
    expect(html).toContain('기본 가격 갱신은 Toss');
    expect(html).toContain('비상정지');
    expect(html).not.toContain('KIS realtime rail');
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
          serverExpiresAt: '2026-05-18T06:00:00.000Z',
          effectiveExpiresAt: '2026-05-18T06:00:00.000Z',
          expiresInMs: 7 * 24 * 60 * 60 * 1000,
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
          priceRefreshEventCount: 1,
          userNotificationEventCount: 1,
          priceRefreshDispatchCount: 1,
          priceRefreshDispatchFailureCount: 0,
          refreshHintCount: 1,
          refreshHintDispatchCount: 1,
          refreshHintDispatchFailureCount: 0,
          refreshHints: [{ resource: 'quote', count: 1 }],
          eventTypes: [{ type: 'wts-notification', count: 3 }],
          reconnectCount: 0,
          lastEventType: 'wts-notification',
          lastStockCode: '005930',
          lastEventAt: '2026-05-11T06:02:00.000Z',
          lastPriceRefreshAt: '2026-05-11T06:02:00.000Z',
          lastUserNotificationAt: '2026-05-11T06:02:00.000Z',
          lastPriceRefreshDispatchAt: '2026-05-11T06:02:01.000Z',
          lastRefreshHintAt: '2026-05-11T06:02:00.000Z',
          lastRefreshHintResource: 'quote',
          lastRefreshHintTicker: '005930',
          lastError: null,
          thinNotificationOnly: true,
        },
        refreshResults: {
          items: [
            {
              id: 'refresh-result-1',
              resource: 'portfolio-positions',
              ticker: '005930',
              sourceType: 'share-holdings',
              receivedAt: '2026-05-11T06:02:00.000Z',
              result: 'refreshed',
              reason: 'Toss SSE share-holdings thin notification',
              recordedAt: '2026-05-11T06:02:01.000Z',
              error: null,
            },
            {
              id: 'refresh-result-2',
              resource: 'completed-orders',
              ticker: null,
              sourceType: 'order-refresh',
              receivedAt: '2026-05-11T06:01:00.000Z',
              result: 'throttled',
              reason: 'Toss SSE order-refresh thin notification',
              recordedAt: '2026-05-11T06:01:01.000Z',
              error: 'Toss orders HTTP 503',
            },
          ],
          returnedCount: 2,
        },
        phase: { kind: 'idle' },
        onLoginStart: vi.fn(),
        onLoginCancel: vi.fn(),
        onSessionClear: vi.fn(),
        onSessionExtend: vi.fn(),
        onRealtimeStart: vi.fn(),
        onRealtimeStop: vi.fn(),
      }),
    );

    expect(html).toContain('토스 데이터 연결');
    expect(html).toContain('세션 유지');
    expect(html).toContain('유효 만료');
    expect(html).toContain('서버 만료');
    expect(html).toContain('쿠키 만료');
    expect(html).toContain('로그인 진단');
    expect(html).toContain('토스 알림');
    expect(html).toContain('사용자 알림');
    expect(html).toContain('알림 후 REST 갱신');
    expect(html).toContain('데이터 갱신 결과');
    expect(html).toContain('portfolio-positions');
    expect(html).toContain('갱신됨');
    expect(html).toContain('completed-orders');
    expect(html).toContain('속도 제한');
    expect(html).toContain('세션 연장');
    expect(html).not.toContain(`session-${'value'}`);
    expect(html).not.toContain('storage-value');
    expect(html).not.toContain('accountNo');
    expect(html).not.toContain('raw-key-hidden');
  });

  it('shows sanitized Toss QR login diagnostics without exposing session material', () => {
    const html = renderToStaticMarkup(
      createElement(TossDataControl, {
        session: {
          configured: false,
          state: 'logged_out',
          provider: null,
          persistent: false,
          cookieCount: 0,
          localStorageKeyCount: 0,
          sessionStorageKeyCount: 0,
          retrievedAt: null,
          expiresAt: null,
          serverExpiresAt: null,
          effectiveExpiresAt: null,
          expiresInMs: null,
        },
        login: {
          state: 'waiting_for_qr',
          startedAt: '2026-05-11T20:00:00.000Z',
          updatedAt: '2026-05-11T20:01:00.000Z',
          finishedAt: null,
          message: 'Waiting for Toss QR login',
          persistent: false,
          cookieCount: 9,
          localStorageKeyCount: 2,
          sessionStorageKeyCount: 2,
          expiresAt: null,
          missingCookieCount: 3,
          missingLocalStorageKeyCount: 1,
        },
        realtime: null,
        refreshResults: null,
        phase: { kind: 'idle' },
        onLoginStart: vi.fn(),
        onLoginCancel: vi.fn(),
        onSessionClear: vi.fn(),
        onSessionExtend: vi.fn(),
        onRealtimeStart: vi.fn(),
        onRealtimeStop: vi.fn(),
      }),
    );

    expect(html).toContain('Toss QR 로그인 창을 열었습니다.');
    expect(html).toContain('새로고침');
    expect(html).not.toContain('Waiting for Toss QR login');
    expect(html).toContain('쿠키 9');
    expect(html).toContain('local 2');
    expect(html).toContain('session 2');
    expect(html).toContain('누락 4');
    expect(html).not.toContain(['SESSION', ''].join('='));
    expect(html).not.toContain(['UTK', ''].join('='));
    expect(html).not.toContain('accountNo');
  });

  it('shows the agent event monitor as opt-in bounded monitoring', () => {
    const html = renderToStaticMarkup(
      createElement(AgentEventMonitorControl, {
        status: {
          enabled: false,
          running: false,
          intervalMs: 30_000,
          maxTickersPerCycle: 5,
          providerCooldownMs: 10_000,
          watchPolicy: {
            sources: ['favorite', 'agent_event', 'tracked'],
            fullMarket: false,
          },
          dispatchPolicy: {
            mode: 'best_effort_after_first_seen',
            targetFirstSeenToDispatchMs: {
              min: 10_000,
              max: 30_000,
            },
            providerPublicationGuarantee: false,
            autoPollingRequiresOptIn: true,
            fullMarketPolling: false,
          },
          providers: {
            news: true,
            tossNews: true,
            tossSignal: false,
            disclosure: true,
          },
          providerPolicies: {
            news: {
              enabled: true,
              cooldownMs: 10_000,
              freshness: 'published_at_when_available',
              firstSeen: 'araon_observed_at',
            },
            tossNews: {
              enabled: true,
              cooldownMs: 10_000,
              freshness: 'published_at_when_available',
              firstSeen: 'araon_observed_at',
            },
            tossSignal: {
              enabled: false,
              cooldownMs: 10_000,
              freshness: 'published_at_when_available',
              firstSeen: 'araon_observed_at',
            },
            disclosure: {
              enabled: true,
              cooldownMs: 10_000,
              freshness: 'published_at_when_available',
              firstSeen: 'araon_observed_at',
            },
          },
          providerStates: {
            news: {
              enabled: true,
              reason: 'refresh-ready',
            },
            tossNews: {
              enabled: true,
              reason: 'session-gated',
            },
            tossSignal: {
              enabled: false,
              reason: 'request-body-template-missing',
            },
            disclosure: {
              enabled: true,
              reason: 'dart-configured',
            },
          },
          providerObservations: {
            news: {
              lastAttemptedAt: '2026-05-11T06:00:30.000Z',
              lastDurationMs: 120,
              lastOutcome: 'refreshed',
              lastInsertedEvents: 1,
              lastErrorCode: null,
            },
            tossNews: {
              lastAttemptedAt: '2026-05-11T06:00:30.000Z',
              lastDurationMs: 240,
              lastOutcome: 'refreshed',
              lastInsertedEvents: 0,
              lastErrorCode: null,
            },
            tossSignal: {
              lastAttemptedAt: null,
              lastDurationMs: null,
              lastOutcome: null,
              lastInsertedEvents: 0,
              lastErrorCode: null,
            },
            disclosure: {
              lastAttemptedAt: '2026-05-11T06:00:30.000Z',
              lastDurationMs: null,
              lastOutcome: 'skipped_cooldown',
              lastInsertedEvents: 0,
              lastErrorCode: null,
            },
          },
          tossSignalContract: {
            endpoint: {
              method: 'POST',
              host: 'wts-info-api.tossinvest.com',
              path: '/api/v1/dashboard/intelligences/all',
            },
            bodyContract: 'capture_required',
            captureRequired: true,
            externalCallsEnabled: false,
            requestBodyTemplateSource: 'ARAON_TOSS_SIGNAL_REQUEST_BODY_TEMPLATE',
            rawTemplateExposed: false,
            shapeProbeCandidates: [
              {
                method: 'GET',
                host: 'wts-info-api.tossinvest.com',
                path: '/api/v1/trading/analysis/productCode/{productCode}',
                purpose: 'shape_probe_only',
                rawPayloadExposed: false,
                rawSessionExposed: false,
              },
              {
                method: 'GET',
                host: 'wts-cert-api.tossinvest.com',
                path: '/api/v1/trading/analysis/productCode/{productCode}',
                purpose: 'shape_probe_only',
                rawPayloadExposed: false,
                rawSessionExposed: false,
              },
            ],
            semanticPolicy: {
              emptyResponse: 'supported_empty_not_actionable',
              eventEmission: 'non_empty_items_only',
              agentEventType: 'toss_signal_detected',
              rawPayloadExposed: false,
            },
            captureGuidance: {
              required: true,
              requiresUserLoginForCapture: true,
              requiresDevToolsForCapture: true,
              rawTemplateExposed: false,
              nextAction: 'user-assisted-capture-required',
            },
            reference: 'tossinvest-cli rpc-catalog',
          },
          cycleCount: 0,
          watchedTickers: ['005930', '000660'],
          watchedCandidates: [
            {
              ticker: '005930',
              name: '삼성전자',
              source: 'favorite',
              reason: '사용자 관심종목',
            },
            {
              ticker: '000660',
              name: 'SK하이닉스',
              source: 'tracked',
              reason: '추적 종목 보조 후보',
            },
          ],
          lastCycleAt: null,
          lastCycleDurationMs: null,
          lastSkippedRefreshes: 0,
          lastErrorCode: null,
        },
        phase: { kind: 'idle' },
        onTick: vi.fn(),
        onStart: vi.fn(),
        onStop: vi.fn(),
      }),
    );

    expect(html).toContain('뉴스·공시·시그널 감시');
    expect(html).toContain('명시적으로 켜기 전까지 자동 호출 없음');
    expect(html).toContain('005930 · 사용자 관심종목');
    expect(html).toContain('000660 · 추적 종목 보조 후보');
    expect(html).toContain('제공자 보호');
    expect(html).toContain('10초 · 건너뜀 0회');
    expect(html).toContain('처음 감지 후 10-30초 목표');
    expect(html).toContain('제공자 발행 시점 보장 아님');
    expect(html).toContain('네이버 10초 · 토스 뉴스 10초 · 토스 시그널 꺼짐 · 공시 10초');
    expect(html).toContain('즐겨찾기 · 에이전트 이벤트 · 로컬 캐시');
    expect(html).toContain('네이버 준비 · 토스 뉴스 세션 필요 · 토스 시그널 요청 형식 필요 · 공시 준비');
    expect(html).toContain('제공자 지연');
    expect(html).toContain('네이버 갱신 120ms · 1건');
    expect(html).toContain('토스 뉴스 갱신 240ms · 0건');
    expect(html).toContain('토스 시그널 대기');
    expect(html).toContain('공시 대기');
    expect(html).toContain('Toss 시그널 확인');
    expect(html).toContain('관찰 필요 · 외부 호출 꺼짐');
    expect(html).toContain('사용자 로그인 + 브라우저 관찰 필요');
    expect(html).toContain('후보 경로 관찰됨');
    expect(html).toContain('형식 후보: 후보 2개');
    expect(html).toContain('빈 응답은 비시그널 · 항목이 있을 때만 이벤트');
    expect(html).toContain('원문 템플릿 숨김');
    expect(html).toContain('수동 확인');
    expect(html).toContain('자동 시작');
    expect(html).toContain('자동 정지');
    expect(html).not.toContain('SESSION');
    expect(html).not.toContain('rcpNo=');
    expect(html).not.toContain('{{productCode}}');
  });

  it('keeps the agent event monitor neutral while status is loading', () => {
    const html = renderToStaticMarkup(
      createElement(AgentEventMonitorControl, {
        status: null,
        phase: { kind: 'idle' },
        onTick: vi.fn(),
      }),
    );

    expect(html).toContain('불러오는 중');
    expect(html).not.toContain('var(--kr-down)');
  });

  it('summarizes manual monitor results by provider surface', () => {
    const html = renderToStaticMarkup(
      createElement(AgentEventMonitorControl, {
        status: null,
        phase: {
          kind: 'success',
          result: {
            state: 'completed',
            reason: 'manual',
            tickers: ['005930'],
            refreshedNews: 1,
            refreshedTossNews: 1,
            refreshedTossSignals: 1,
            refreshedDisclosures: 0,
            skippedRefreshes: 0,
            insertedEvents: 2,
          },
        },
        onTick: vi.fn(),
      }),
    );

    expect(html).toContain('최근 결과:');
    expect(html).toContain('1종목');
    expect(html).toContain('이벤트 2개');
    expect(html).toContain('토스뉴스 1회');
    expect(html).toContain('토스시그널 1회');
    expect(html).toContain('수동 확인 완료');
  });

  it('shows a sanitized agent event feed without provider dedupe keys', () => {
    const html = renderToStaticMarkup(
      createElement(AgentEventsFeedControl, {
        events: [
          {
            id: 'event-1',
            type: 'news_detected',
            ticker: '005930',
            source: 'naver-finance',
            publishedAt: '2026-05-11T06:00:00.000Z',
            firstSeenAt: '2026-05-11T06:00:18.000Z',
            freshnessMs: 18_000,
            freshness: 'near_realtime',
            relevance: 0.7,
            confidence: 0.72,
            reason: 'New stock news detected: 삼성전자 신규 뉴스',
            payloadRef: 'stock-news:42',
            createdAt: '2026-05-11T06:00:18.000Z',
          },
          {
            id: 'event-2',
            type: 'toss_signal_detected',
            ticker: '035720',
            source: 'toss-signal',
            publishedAt: '2026-03-21T06:00:00.000Z',
            firstSeenAt: '2026-05-11T06:00:26.400Z',
            freshnessMs: 4_406_526_400,
            freshness: 'stale',
            relevance: 0.5,
            confidence: 0.6,
            reason: 'Provider signal surfaced after a long delay',
            payloadRef: null,
            createdAt: '2026-05-11T06:00:26.400Z',
          },
        ],
        deliveries: [
          {
            id: 'delivery-1',
            eventId: 'event-1',
            eventType: 'news_detected',
            ticker: '005930',
            channel: 'browser-sse',
            target: 'local-ui',
            status: 'dispatched',
            clientCount: 1,
            reason: 'agent-event SSE notification',
            dispatchLatencyMs: 1_000,
            createdAt: '2026-05-11T06:00:19.000Z',
          },
        ],
        deliverySummary: {
          targetFirstSeenToDispatchMs: 30_000,
          totalCount: 1,
          dispatchedCount: 1,
          skippedNoClientCount: 0,
          dispatchedWithinTargetCount: 1,
          dispatchedLateCount: 0,
          lastDispatchLatencyMs: 1_000,
          maxDispatchLatencyMs: 1_000,
        },
        busy: false,
        error: null,
        onRefresh: vi.fn(),
      }),
    );

    expect(html).toContain('에이전트 이벤트 피드');
    expect(html).toContain('뉴스 감지');
    expect(html).toContain('005930');
    expect(html).not.toContain('naver-finance');
    expect(html).toContain('삼성전자 신규 뉴스');
    expect(html).toContain('신호 표시 지연');
    expect(html).toContain('18.0초');
    expect(html).toContain('51일');
    expect(html).not.toContain('4406526.4초');
    expect(html).toContain('알림 전달 기록');
    expect(html).toContain('목표 30.0초');
    expect(html).toContain('목표 내 1건');
    expect(html).toContain('브라우저 알림');
    expect(html).toContain('전달 1명');
    expect(html).toContain('1.0초');
    expect(html).not.toContain('agent-event SSE notification');
    expect(html).not.toContain('internal-key');
    expect(html).not.toContain('dedupeKey');
    expect(html).not.toContain('delivery-1');
    expect(html).not.toContain('SESSION');
  });

  it('shows KIS WS slot allocation without exposing raw runtime frames', () => {
    const html = renderToStaticMarkup(
      createElement(KisWsSlotControl, {
        status: {
          enabled: true,
          provider: 'kis',
          perProfileCap: 40,
          activeCount: 32,
          fallbackCount: 2,
          churnCooldownMs: 30_000,
          diff: {
            subscribe: ['005930'],
            unsubscribe: ['035420'],
          },
          candidates: [
            {
              ticker: '005930',
              state: 'subscribed',
              source: 'current_view',
              reason: '현재 화면',
              score: 0.92,
              ttlMs: 60_000,
              lastSeenAt: '2026-05-11T06:00:00.000Z',
              pinned: false,
            },
            {
              ticker: '000660',
              state: 'fallback',
              source: 'manual_watchlist',
              reason: '슬롯 부족',
              score: 0.5,
              ttlMs: null,
              lastSeenAt: '2026-05-11T05:59:00.000Z',
              pinned: false,
            },
          ],
        },
        onReload: vi.fn(),
      }),
    );

    expect(html).toContain('실시간 추적 슬롯');
    expect(html).toContain('32 / 40');
    expect(html).toContain('+1 / -1');
    expect(html).toContain('005930');
    expect(html).toContain('실시간 구독');
    expect(html).toContain('000660');
    expect(html).toContain('대기');
    expect(html).toContain('슬롯 부족');
    expect(html).not.toContain('approval');
    expect(html).not.toContain('raw frame');
  });

  it('shows temporary agent candidates with TTL in the KIS WS slot control', () => {
    const html = renderToStaticMarkup(
      createElement(KisWsSlotControl, {
        status: {
          enabled: true,
          provider: 'kis',
          perProfileCap: 40,
          activeCount: 1,
          fallbackCount: 0,
          churnCooldownMs: 30_000,
          diff: {
            subscribe: ['000660'],
            unsubscribe: [],
          },
          candidates: [
            {
              ticker: '000660',
              state: 'subscribed',
              source: 'agent_candidate',
              reason: 'agent order-intent 후보',
              score: 0.75,
              ttlMs: 60_000,
              lastSeenAt: '2026-05-11T07:00:00.000Z',
              pinned: false,
            },
          ],
        },
        onReload: vi.fn(),
      }),
    );

    expect(html).toContain('000660');
    expect(html).toContain('에이전트 후보');
    expect(html).toContain('유지 60초');
    expect(html).not.toContain('intent-');
    expect(html).not.toContain('audit-');
  });

  it('labels TOP100 rotation candidates as waiting samples', () => {
    const html = renderToStaticMarkup(
      createElement(KisWsSlotControl, {
        status: {
          enabled: true,
          provider: 'kis',
          perProfileCap: 40,
          activeCount: 40,
          fallbackCount: 1,
          churnCooldownMs: 30_000,
          diff: {
            subscribe: [],
            unsubscribe: [],
          },
          candidates: [
            {
              ticker: '010130',
              state: 'fallback',
              source: 'top100_rotation',
              reason: 'TOP100 rotation sample',
              score: 0.12,
              ttlMs: 30_000,
              lastSeenAt: '2026-05-11T07:01:00.000Z',
              pinned: false,
            },
          ],
        },
        onReload: vi.fn(),
      }),
    );

    expect(html).toContain('010130');
    expect(html).toContain('TOP100 샘플');
    expect(html).toContain('대기');
    expect(html).toContain('유지 30초');
  });

  it('shows Toss account and portfolio as read-only session-gated data', () => {
    const html = renderToStaticMarkup(
      createElement(TossAccountSurfaceControl, {
        sessionReady: true,
        busy: false,
        error: null,
        summary: {
          provider: 'toss',
          fetchedAt: '2026-05-11T07:00:00.000Z',
          totalAssetAmount: 210000,
          evaluatedProfitAmount: 15000,
          profitRate: 7.6923,
          orderableAmountKrw: 5000,
          orderableAmountUsd: 0.01,
          withdrawable: { kr: [], us: [] },
          markets: {},
        },
        positions: {
          provider: 'toss',
          fetchedAt: '2026-05-11T07:00:00.000Z',
          positions: [
            {
              productCode: '005930',
              symbol: '005930',
              name: '삼성전자',
              marketType: 'KR',
              marketCode: 'KRX',
              quantity: 3,
              averagePrice: 65000,
              currentPrice: 70000,
              marketValue: 210000,
              unrealizedPnl: 15000,
              profitRate: 7.6923,
              dailyProfitLoss: 1200,
              dailyProfitRate: 0.57,
              averagePriceUsd: 0,
              currentPriceUsd: 0,
              marketValueUsd: 0,
              unrealizedPnlUsd: 0,
              profitRateUsd: 0,
              dailyProfitLossUsd: 0,
              dailyProfitRateUsd: 0,
            },
          ],
        },
        pendingOrders: {
          provider: 'toss',
          fetchedAt: '2026-05-11T07:00:00.000Z',
          orders: [
            {
              ref: 'pending-order-1',
              symbol: '005930',
              name: '삼성전자',
              market: 'kr',
              side: 'BUY',
              status: 'PENDING',
              quantity: 4,
              originalQuantity: 10,
              price: 70000,
              orderedDate: '2026-05-11',
              submittedAt: '2026-05-11T09:03:04.000000000',
            },
          ],
        },
        completedOrders: {
          provider: 'toss',
          fetchedAt: '2026-05-11T07:00:00.000Z',
          range: {
            market: 'all',
            from: '2026-05-01',
            to: '2026-05-11',
            size: 10,
            number: 1,
          },
          orders: [
            {
              ref: 'completed-order-raw-ref',
              symbol: '000660',
              name: 'SK하이닉스',
              market: 'kr',
              side: 'SELL',
              status: 'FILLED',
              quantity: 2,
              filledQuantity: 2,
              price: 190000,
              averageExecutionPrice: 191000,
              orderedDate: '2026-05-11',
              submittedAt: '2026-05-11T10:03:04.000000000',
            },
          ],
        },
        transactions: {
          provider: 'toss',
          fetchedAt: '2026-05-11T07:00:00.000Z',
          market: 'kr',
          range: {
            market: 'kr',
            from: '2026-05-01',
            to: '2026-05-11',
            filter: 'all',
            size: 10,
            number: 0,
          },
          lastPage: true,
          next: null,
          items: [
            {
              ref: 'transaction-raw-ref',
              market: 'kr',
              category: 'trade',
              type: 'sell',
              code: '000660',
              displayName: '매도 체결',
              displayType: 'trade',
              summary: null,
              symbol: '000660',
              name: 'SK하이닉스',
              currency: 'KRW',
              quantity: 2,
              amount: 382000,
              adjustedAmount: 382000,
              commissionAmount: 0,
              taxAmount: 0,
              balanceAmount: 382000,
              date: '2026-05-11',
              dateTime: '2026-05-11T10:03:05.000000000',
              orderDate: '2026-05-11',
              settlementDate: '2026-05-13',
              tradeType: 'SELL',
              referenceType: null,
            },
          ],
        },
        transactionsOverview: {
          provider: 'toss',
          fetchedAt: '2026-05-11T07:00:00.000Z',
          market: 'kr',
          orderableAmountKrw: 5000,
          orderableAmountUsd: 0,
          withdrawable: [{ date: '2026-05-11', krw: 5000, usd: 0 }],
          displayWithdrawable: [{ date: '2026-05-11', krw: 5000, usd: 0 }],
          deposit: [{ date: '2026-05-13', krw: 25000, usd: 0 }],
          estimateSettlement: [
            { date: '2026-05-13', buyAmount: 0, sellAmount: 25000 },
          ],
          withdrawableBottomSheet: [
            { title: '출금가능금액', krw: 5000, usd: 0 },
          ],
        },
        watchlist: {
          provider: 'toss',
          fetchedAt: '2026-05-11T07:00:00.000Z',
          groups: [
            {
              ref: 'watchlist-group-raw-ref',
              name: '관심',
              items: [],
            },
          ],
          items: [
            {
              ref: 'watchlist-item-raw-ref',
              groupRef: 'watchlist-group-raw-ref',
              groupName: '관심',
              productCode: '000660',
              symbol: '000660',
              name: 'SK하이닉스',
              currency: 'KRW',
              base: 190000,
              last: 191000,
            },
          ],
        },
        onRefresh: vi.fn(),
      }),
    );

    expect(html).toContain('토스 계좌 / 포트폴리오');
    expect(html).toContain('읽기 전용');
    expect(html).toContain('총 자산');
    expect(html).toContain('210,000원');
    expect(html).toContain('삼성전자');
    expect(html).toContain('미체결 1건');
    expect(html).toContain('완료 주문');
    expect(html).toContain('SK하이닉스');
    expect(html).toContain('최근 거래내역');
    expect(html).toContain('예정입금');
    expect(html).toContain('결제 예정');
    expect(html).toContain('토스 관심종목');
    expect(html).not.toContain('accountNo');
    expect(html).not.toContain('pending-order-1');
    expect(html).not.toContain('completed-order-raw-ref');
    expect(html).not.toContain('transaction-raw-ref');
    expect(html).not.toContain('watchlist-item-raw-ref');
    expect(html).not.toContain('watchlist-group-raw-ref');
  });

  it('shows order intents and approval audit as live-locked safety foundation', () => {
    const html = renderToStaticMarkup(
      createElement(OrderIntentApprovalControl, {
        previews: [
          {
            id: 'intent-1',
            ticker: '005930',
            side: 'buy',
            market: 'KR',
            requestedMode: 'simulated',
            executionMode: 'simulated',
            status: 'preview_ready',
            liveExecutionLocked: true,
            quantity: null,
            cashAmount: 500000,
            orderType: 'market',
            limitPrice: null,
            triggerEventId: 'event-1',
            agentId: 'agent-1',
            reason: 'news_detected candidate',
            riskChecks: [
              {
                code: 'live_execution_locked',
                status: 'blocked',
                message: 'Live execution requires approval.',
              },
            ],
            lifecycle: [
              {
                code: 'execution_locked',
                status: 'blocked',
                label: '실행 잠금',
                detail: 'Toss 주문 실행은 잠겨 있습니다.',
              },
            ],
            createdAt: '2026-05-11T07:10:00.000Z',
            expiresAt: '2026-05-11T07:15:00.000Z',
            auditRef: 'audit-1',
          },
        ],
        audit: [
          {
            id: 'audit-1',
            intentId: 'intent-1',
            event: 'confirm_token_verified_live_locked',
            decision: 'blocked',
            ticker: '005930',
            side: 'buy',
            requestedMode: 'live',
            agentId: 'agent-1',
            triggerEventId: 'event-1',
            reason: 'Live order execution is disabled.',
            createdAt: '2026-05-11T07:11:00.000Z',
          },
        ],
        approvalChallenges: [
          {
            id: 'challenge-1',
            intentId: 'intent-1',
            ticker: '005930',
            side: 'buy',
            requestedMode: 'live',
            status: 'confirmed_live_locked',
            confirmationText: 'CONFIRM 005930 BUY LIVE',
            liveExecutionLocked: true,
            operatorId: 'local-user',
            createdAt: '2026-05-11T07:10:30.000Z',
            expiresAt: '2026-05-11T07:11:30.000Z',
            confirmedAt: '2026-05-11T07:11:00.000Z',
            auditRef: 'audit-2',
          },
        ],
        livePolicy: {
          liveExecutionEnabled: false,
          policyApproved: false,
          killSwitch: 'engaged',
          allowedTickers: [],
          maxOrderKrw: null,
          maxDailyLossKrw: null,
          tradingHours: null,
          allowedOrderTypes: [],
          cooldownMs: null,
          missingConstraints: [
            'policy_approval',
            'allowed_tickers',
            'max_order_amount',
            'max_daily_loss',
            'trading_hours',
            'order_type',
            'cooldown',
            'kill_switch_release',
          ],
          automationReadinessGaps: [
            {
              code: 'decision_engine',
              status: 'not_ready',
              severity: 'blocking',
              label: '의사결정 엔진',
              detail: '자동 매매 판단 엔진은 아직 준비되지 않았습니다.',
            },
            {
              code: 'risk_policy',
              status: 'not_ready',
              severity: 'blocking',
              label: '리스크 정책',
              detail: '실거래 리스크 정책이 준비되지 않았습니다.',
            },
            {
              code: 'toss_order_execution',
              status: 'locked',
              severity: 'blocking',
              label: 'Toss 주문 실행',
              detail: '실제 Toss 주문 실행은 잠겨 있습니다.',
            },
          ],
          generatedAt: '2026-05-11T07:12:00.000Z',
        },
        busy: false,
        error: null,
        onRefresh: vi.fn(),
      }),
    );

    expect(html).toContain('주문 미리보기 / 승인 기록');
    expect(html).toContain('실거래 잠금');
    expect(html).toContain('판단 단계');
    expect(html).toContain('실행 잠금 차단');
    expect(html).toContain('005930');
    expect(html).toContain('모의');
    expect(html).toContain('500,000원');
    expect(html).toContain('차단');
    expect(html).toContain('승인 확인');
    expect(html).toContain('확인 문구 준비됨');
    expect(html).not.toContain('CONFIRM 005930 BUY LIVE');
    expect(html).toContain('승인 확인 · 실행 잠금');
    expect(html).toContain('정책 미승인 · 긴급 정지 켜짐');
    expect(html).toContain('필수 정책 8개 미승인');
    expect(html).toContain('자동거래 준비 3개 필요');
    expect(html).toContain('의사결정 엔진 · 리스크 정책 · Toss 주문 실행');
    expect(html).toContain('실행 없음');
    expect(html).not.toContain('intent-1');
    expect(html).not.toContain('audit-1');
    expect(html).not.toContain('challenge-1');
  });

  it('presents dev mode as the explicit switch for simulated tools', () => {
    const html = renderToStaticMarkup(
      createElement(DevModeControl, {
        enabled: false,
        onChange: vi.fn(),
      }),
    );

    expect(html).toContain('개발 모드');
    expect(html).toContain('모의 시장');
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

  it('presents candle backfill as Toss-primary with emergency pause only', () => {
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

    expect(html).toContain('Toss 차트 보강');
    expect(html).toContain('자동 운영');
    expect(html).toContain('장중 07:55~20:05');
    expect(html).toContain('비상정지');
    expect(html).toContain('KIS 차트 경로는 기본 경로가 아니며');
    expect(html).not.toContain('credentials 등록 후');
    expect(html).not.toContain('KIS 런타임 준비됨');
    expect(html).not.toContain('자동 백필 꺼짐');
  });

  it('describes chart settings as Toss candle first', () => {
    const html = renderToStaticMarkup(createElement(ChartSettingsTab));

    expect(html).toContain('Toss 차트');
    expect(html).toContain('저장된 봉이 있을 때만 표시');
    expect(html).toContain('KIS 차트 경로는 명시적으로 켠 이전 호환 경로');
    expect(html).not.toContain('KIS 일봉을 기준으로 보강');
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
          marketDataProviders: [
            {
              providerId: 'toss-public',
              label: 'Toss public web',
              status: 'ready',
              requiresAuth: false,
              authenticated: true,
              capabilities: ['top-movers', 'quote-batch', 'daily-candles', 'search'],
              lastErrorCode: null,
              lastErrorAt: null,
              message: '토스 공개 웹 데이터 provider가 준비되었습니다.',
            },
            {
              providerId: 'kis-legacy',
              label: 'KIS legacy REST helper',
              status: 'unavailable',
              requiresAuth: true,
              authenticated: false,
              capabilities: [
                'top-movers',
                'quote-batch',
                'trade-subscribe',
                'daily-candles',
                'stock-metadata',
              ],
              lastErrorCode: null,
              lastErrorAt: null,
              message: 'KIS credentials가 없어 legacy REST 보조 경로는 꺼져 있습니다.',
            },
          ],
          kisLegacyRest: {
            role: 'optional_fallback',
            runtimeStatus: 'unconfigured',
            accountOrderTruthSource: false,
            liveTradingTruthSource: false,
            realtimeRail: 'kis-ws-only',
            externalCallsWithoutCredentials: false,
            surfaces: [
              {
                id: 'foreground-quote-fallback',
                label: 'Foreground quote legacy REST helper',
                state: 'off',
                mode: 'credentials_required',
                automatic: false,
                envGate: 'ARAON_KIS_QUOTE_FALLBACK_ENABLED',
                primaryProvider: 'toss-public',
                reason: 'KIS credentials가 없어 legacy REST 보조 경로는 꺼져 있습니다.',
              },
              {
                id: 'watchlist-polling-fallback',
                label: 'Watchlist quote legacy REST helper',
                state: 'off',
                mode: 'credentials_required',
                automatic: false,
                envGate: 'ARAON_KIS_POLLING_FALLBACK_ENABLED',
                primaryProvider: 'toss-public',
                reason: 'KIS credentials가 없어 legacy REST 보조 경로는 꺼져 있습니다.',
              },
              {
                id: 'daily-chart-fallback',
                label: 'Daily chart legacy REST helper',
                state: 'off',
                mode: 'credentials_required',
                automatic: false,
                envGate: 'ARAON_KIS_CHART_FALLBACK_ENABLED',
                primaryProvider: 'toss-public-c-chart',
                reason: 'KIS credentials가 없어 legacy REST 보조 경로는 꺼져 있습니다.',
              },
              {
                id: 'minute-chart-fallback',
                label: 'Minute chart legacy REST helper',
                state: 'off',
                mode: 'credentials_required',
                automatic: false,
                envGate: 'ARAON_KIS_CHART_FALLBACK_ENABLED',
                primaryProvider: 'toss-public-c-chart',
                reason: 'KIS credentials가 없어 legacy REST 보조 경로는 꺼져 있습니다.',
              },
              {
                id: 'master-metadata-refresh',
                label: 'Master metadata refresh',
                state: 'off',
                mode: 'credentials_required',
                automatic: false,
                envGate: 'ARAON_KIS_MASTER_AUTO_REFRESH',
                primaryProvider: 'local-cache+toss-search',
                reason: 'KIS credentials가 없어 metadata refresh는 꺼져 있습니다.',
              },
              {
                id: 'kis-watchlist-import',
                label: 'KIS watchlist import',
                state: 'off',
                mode: 'credentials_required',
                automatic: false,
                envGate: null,
                primaryProvider: 'toss-watchlist',
                reason: 'KIS credentials가 없어 import는 꺼져 있습니다.',
              },
            ],
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
    expect(html).toContain('실시간 추적 억제');
    expect(html).toContain('데이터 소스');
    expect(html).toContain('Toss 기본');
    expect(html).toContain('이전 호환 보조 경로 꺼짐');
    expect(html).toContain('이전 KIS 경로');
    expect(html).toContain('꺼짐 6');
    expect(html).toContain('이전 KIS 경로: 역할=선택 보조');
    expect(html).toContain('전경 시세 이전 호환 보조');
    expect(html).toContain('관심종목 시세 이전 호환 보조');
    expect(html).toContain('마스터 메타데이터 수동 갱신');
    expect(html).toContain('KIS 관심종목 수동 가져오기');
    expect(html).toContain('자격증명 필요');
    expect(html).toContain('자동 꺼짐');
    expect(html).toContain('ARAON_KIS_MASTER_AUTO_REFRESH');
    expect(html).toContain('TOP100 보장');
    expect(html).toContain('토스 웹 랭킹');
    expect(html).toContain('토스 호출 제한');
    expect(html).toContain('보강 대기 제외');
    expect(html).toContain('1종목');
    expect(html).toContain('최근 보강');
    expect(html).toContain('005930');
  });

  it('shows KIS auxiliary path as allowed when Toss quote refresh is repeatedly failing', () => {
    const emptyWindow = {
      windowMs: 0,
      startedCount: 0,
      successCount: 0,
      failureCount: 0,
      throttleCount: 0,
      callPerSec: 0,
      successPerSec: 0,
      failurePerMin: 0,
      throttlePerMin: 0,
      byClass: [],
    };
    const html = renderToStaticMarkup(
      createElement(DataHealthPanel, {
        health: {
          tracking: { trackedCount: 0, favoriteCount: 0 },
          candles: [
            { interval: '1m', tickerCount: 0, candleCount: 0, newestBucketAt: null },
            { interval: '1d', tickerCount: 0, candleCount: 0, newestBucketAt: null },
          ],
          backfill: {
            enabled: false,
            range: '1mo',
            running: false,
            lastRunAt: null,
            lastFinishedAt: null,
            lastAttempted: 0,
            lastSucceeded: 0,
            lastFailed: 0,
            lastSkippedReason: null,
            budgetDateKey: null,
            dailyCallCount: 0,
            dailyCallBudget: null,
            cooldownUntil: null,
            cooldownActive: false,
            noWorkCooldownCount: 0,
            nextNoWorkRetryAt: null,
            recent: [],
          },
          kisOutboundLimiter: {
            configured: false,
            currentState: 'unconfigured',
            ratePerSec: null,
            burst: null,
            tokens: null,
            globalMinStartGapMs: null,
            queueDepth: 0,
            queuedByPriority: {},
            currentAllowedRps: null,
            lastThrottleAt: null,
            lastThrottleClass: null,
            lastThrottleCode: null,
            recoveryAttemptCount: 0,
            profiles: [],
            budget: {
              generatedAt: null,
              riskState: 'idle',
              riskLabel: 'KIS 대기',
              riskReason: null,
              windows: {
                tenSec: emptyWindow,
                sixtySec: emptyWindow,
              },
            },
          },
          kisRestProfiles: {
            configured: false,
            primaryProfileId: null,
            profileCount: 0,
            eligibleProfileCount: 0,
            endpointPolicies: [],
            profiles: [],
          },
          tossQuotePolling: {
            configured: true,
            running: true,
            enabled: true,
            source: 'toss-public',
            cycleCount: 8,
            lastCycleMs: 1200,
            tickersInCycle: 4,
            requestedCount: 4,
            returnedCount: 0,
            missingCount: 4,
            errorCount: 3,
            consecutiveFailureCount: 3,
            lastSuccessAt: null,
            lastFailureAt: '2026-05-12T00:00:00.000Z',
            lastErrorCode: 'TOSS_QUOTE_POLLING_FAILED',
            lastMessage: null,
            intervalMs: 3000,
            batchSize: 100,
            suppressingKisPolling: false,
          },
          kisLegacyRest: {
            role: 'optional_fallback',
            runtimeStatus: 'started',
            accountOrderTruthSource: false,
            liveTradingTruthSource: false,
            realtimeRail: 'kis-ws-only',
            externalCallsWithoutCredentials: false,
            surfaces: [
              {
                id: 'watchlist-polling-fallback',
                label: 'Watchlist quote legacy REST helper',
                state: 'available',
                mode: 'conditional_fallback',
                automatic: true,
                envGate: 'ARAON_KIS_POLLING_FALLBACK_ENABLED',
                primaryProvider: 'toss-public',
                reason: 'Toss quote refresh가 반복 실패 중이라 KIS REST 보조 경로를 열어둡니다.',
              },
            ],
          },
          marketDataProviders: [],
          marketTopMovers: {
            configured: false,
            status: 'idle',
            source: null,
            sourcePhase: null,
            sourceLabel: null,
            sourceReason: null,
            frozen: false,
            lastGoodAgeMs: null,
            partialReason: null,
            stopReason: null,
            rankingDiagnostics: null,
            rankingRateLimited: false,
            lastFetchedAt: null,
            lastGeneratedAt: null,
            cacheAgeMs: null,
            cacheTtlMs: null,
            staleAfterMs: null,
            cooldownUntil: null,
            cooldownActive: false,
            inflight: false,
            lastMessage: null,
            lastErrorCode: null,
            coverage: null,
          },
          volumeBaseline: {
            total: 0,
            ready: 0,
            collecting: 0,
            unavailable: 0,
          },
          growth: {
            signals: {
              eventCount: 0,
              oldestSignalEventAt: null,
              newestSignalEventAt: null,
              retentionDays: 90,
            },
            news: {
              itemCount: 0,
              staleItemCount: 0,
              oldestFetchedAt: null,
              newestFetchedAt: null,
              failedFetchCount: 0,
              lastFetchStatus: null,
              lastFetchErrorCode: null,
              lastFetchedAt: null,
              ttlHours: 24,
              pruneAfterDays: 7,
            },
            disclosures: {
              itemCount: 0,
              staleItemCount: 0,
              oldestFetchedAt: null,
              newestFetchedAt: null,
              ttlHours: 24,
            },
          },
          notifications: {
            phoneConfigured: false,
            phoneDeliveryCount: 0,
            phoneSentCount: 0,
            phoneFailedCount: 0,
            phoneSkippedCount: 0,
            phoneLastStatus: null,
            phoneLastAt: null,
            phoneLastErrorCode: null,
          },
          maintenance: {
            lastRunAt: null,
            candlePruneLastRunAt: null,
            candlePruneLastError: null,
          },
          signalOutcomes: {
            totalSignals: 0,
            evaluatedSignals: 0,
            pendingSignals: 0,
            horizons: [],
          },
        } as any,
      }),
    );

    expect(html).toContain('실시간 추적');
    expect(html).toContain('실시간 추적 허용');
    expect(html).toContain('관심종목 시세 이전 호환 보조');
    expect(html).toContain('조건부 보조');
    expect(html).toContain('자동 가능');
    expect(html).toContain('ARAON_KIS_POLLING_FALLBACK_ENABLED');
    expect(html).toContain('Toss 가격 갱신이 반복 실패 중이라 KIS 이전 호환 보조 경로를 열어둡니다.');
    expect(html).toContain('계좌/주문 기준=아니오');
    expect(html).not.toContain('accountNo');
    expect(html).not.toContain(['SESSION', ''].join('='));
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
