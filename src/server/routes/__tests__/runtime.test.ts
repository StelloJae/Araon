import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

import type { KisRuntime, KisRuntimeRef } from '../../bootstrap-kis.js';
import type { CredentialStore } from '../../credential-store.js';
import type { MarketPhase } from '../../lifecycle/market-hours-scheduler.js';
import type { PollingSchedulerStatus } from '../../polling/polling-scheduler.js';
import {
  DEFAULT_SETTINGS,
  type Settings,
  type SettingsStore,
} from '../../settings-store.js';
import {
  createRealtimeSessionGate,
  type RealtimeSessionGate,
} from '../../realtime/runtime-operator.js';
import { runtimeRoutes } from '../runtime.js';

function settingsStore(overrides: Partial<Settings> = {}): SettingsStore {
  const snapshot = {
    ...DEFAULT_SETTINGS,
    ...overrides,
  };
  return {
    load: vi.fn(async () => snapshot),
    save: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined),
    snapshot: vi.fn(() => snapshot),
  };
}

function credentialStore(configured: boolean): CredentialStore {
  return {
    load: vi.fn(async () =>
      configured
        ? {
            credentials: {
              appKey: 'app-key-placeholder',
              appSecret: 'app-secret-placeholder',
              isPaper: false,
            },
          }
        : null,
    ),
    saveCredentials: vi.fn(async () => undefined),
    saveToken: vi.fn(async () => undefined),
    clearToken: vi.fn(async () => undefined),
    clearCredentials: vi.fn(async () => undefined),
  };
}

function runtimeRef(state: ReturnType<KisRuntimeRef['get']>): KisRuntimeRef {
  return {
    get: vi.fn(() => state),
    start: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  };
}

function startedRuntime(
  overrides: {
    favorites?: Array<{ ticker: string; tier: 'realtime' | 'polling'; addedAt: string }>;
    bridge?: {
      connect?: ReturnType<typeof vi.fn>;
      applyDiff?: ReturnType<typeof vi.fn>;
      disconnectAll?: ReturnType<typeof vi.fn>;
      stopSession?: ReturnType<typeof vi.fn>;
      getStats?: ReturnType<typeof vi.fn>;
    };
    outboundLimiter?: KisRuntime['outboundLimiter'];
    restProfileRouter?: KisRuntime['restProfileRouter'];
    governorAimd?: Partial<NonNullable<KisRuntime['governorAimd']>> & { snapshot(): unknown };
    marketPhase?: MarketPhase;
    pollingStatus?: Partial<PollingSchedulerStatus>;
    pollingStop?: ReturnType<typeof vi.fn>;
    sessionGate?: RealtimeSessionGate;
  } = {},
): KisRuntime {
  const bridge = {
    connect: overrides.bridge?.connect ?? vi.fn(async () => undefined),
    applyDiff: overrides.bridge?.applyDiff ?? vi.fn(async () => undefined),
    disconnectAll: overrides.bridge?.disconnectAll ?? vi.fn(async () => undefined),
    stopSession: overrides.bridge?.stopSession ?? vi.fn(async () => undefined),
    getStats: overrides.bridge?.getStats ?? vi.fn(() => ({
      parsedTickCount: 0,
      appliedTickCount: 0,
      ignoredStaleTickCount: 0,
      sessionLimitIgnoredCount: 0,
      parseErrorCount: 0,
      applyErrorCount: 0,
      lastTickAt: null,
    })),
  };
  return {
    bridge,
    tierManager: {
      listFavorites: vi.fn(() => overrides.favorites ?? []),
    },
    sessionGate: overrides.sessionGate ?? createRealtimeSessionGate(),
    outboundLimiter: overrides.outboundLimiter ?? {
      acquire: vi.fn(async () => undefined),
      recordFailure: vi.fn(),
      recordSuccess: vi.fn(),
      snapshot: vi.fn(() => ({
        ratePerSec: 15,
        burst: 15,
        tokens: 15,
        globalMinStartGapMs: 200,
        policies: [],
        profiles: [],
      })),
    },
    restProfileRouter: overrides.restProfileRouter,
    settingsStore: undefined,
    pollingScheduler: {
      stop: overrides.pollingStop ?? vi.fn(async () => undefined),
      getStatus: vi.fn(() => ({
        running: true,
        cycleCount: 0,
        lastCycleMs: 0,
        tickersInCycle: 0,
        errorCount: 0,
        throttledCount: 0,
        lastCycleP95Ms: 0,
        ...overrides.pollingStatus,
      })),
    },
    wsClient: {
      getStatus: vi.fn(() => ({
        state: 'idle',
        reconnectAttempts: 0,
        nextReconnectAt: null,
        lastConnectedAt: null,
        lastError: null,
        stopReason: null,
      })),
      activeSubscriptions: vi.fn(() => []),
    },
    approvalIssuer: {
      getState: vi.fn(() => ({ status: 'none' })),
    },
    marketHoursScheduler: {
      start: vi.fn(),
      stop: vi.fn(),
      getCurrentPhase: vi.fn(() => overrides.marketPhase ?? 'closed'),
    },
    governorAimd: overrides.governorAimd,
  } as unknown as KisRuntime;
}

function defaultAimdPayload() {
  return {
    enabled: false,
    mode: 'observe_only',
    currentPollingMinStartGapMs: 350,
    currentPollingRecoveryRatePerSec: 3,
    baselinePollingMinStartGapMs: 350,
    lastAdjustmentAt: null,
    lastAdjustmentDirection: 'none',
    lastAdjustmentReason: null,
    nextEvaluationAt: null,
    cleanRegularMarketWindowCount: 0,
    degradedWindowCount: 0,
    lastDecision: null,
    observationWindow: null,
    rollbackBaseline: {
      pollingMinStartGapMs: 350,
      pollingRecoveryRatePerSec: 3,
    },
  };
}

function defaultKisBudgetPayload() {
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
  return {
    generatedAt: null,
    riskState: 'idle',
    riskLabel: 'KIS 대기',
    riskReason: null,
    windows: {
      tenSec: emptyWindow,
      sixtySec: emptyWindow,
    },
  };
}

function defaultAimdState() {
  return {
    enabled: false,
    mode: 'observe_only' as const,
    currentPollingMinStartGapMs: 350,
    currentPollingRecoveryRatePerSec: 3,
    baselinePollingMinStartGapMs: 350,
    lastAdjustmentAtMs: null,
    lastAdjustmentDirection: 'none' as const,
    lastAdjustmentReason: null,
    nextEvaluationAtMs: null,
    cleanRegularMarketWindowCount: 0,
    degradedWindowCount: 0,
    rollbackBaseline: {
      pollingMinStartGapMs: 350,
      pollingRecoveryRatePerSec: 3,
    },
  };
}

async function build(
  opts: {
    runtimeRef: KisRuntimeRef;
    settingsStore?: SettingsStore;
    credentialStore?: CredentialStore;
    stockRepo?: { findAll(): Array<{ ticker: string; name: string; market: 'KOSPI' | 'KOSDAQ' }> };
    favoriteRepo?: { findAll(): Array<{ ticker: string; tier: 'realtime' | 'polling'; addedAt: string }> };
    backupStockRepo?: {
      findAll(): Array<{ ticker: string; name: string; market: 'KOSPI' | 'KOSDAQ' }>;
      bulkUpsert(stocks: readonly Array<{ ticker: string; name: string; market: 'KOSPI' | 'KOSDAQ' }>): Promise<void> | void;
    };
    backupFavoriteRepo?: {
      findAll(): Array<{ ticker: string; tier: 'realtime' | 'polling'; addedAt: string }>;
      upsert(favorite: { ticker: string; tier: 'realtime' | 'polling'; addedAt: string }): void;
    };
    candleRepo?: { summarizeCoverage(): Array<{ interval: '1m' | '1d'; tickerCount: number; candleCount: number; newestBucketAt: string | null }> };
    signalEventRepo?: {
      summarizeGrowth(): { eventCount: number; oldestSignalEventAt: string | null; newestSignalEventAt: string | null };
      listRecent?(limit?: number): any[];
    };
    newsRepo?: { summarizeGrowth(now: Date, staleAfterMs: number): { itemCount: number; staleItemCount: number; oldestFetchedAt: string | null; newestFetchedAt: string | null; failedFetchCount: number; lastFetchStatus: 'success' | 'failed' | null; lastFetchErrorCode: string | null; lastFetchedAt: string | null } };
    disclosureRepo?: { summarizeGrowth(now: Date, staleAfterMs: number): { itemCount: number; staleItemCount: number; oldestFetchedAt: string | null; newestFetchedAt: string | null } };
    dataRetention?: { snapshot(): { lastRunAt: string | null; candlePruneLastRunAt: string | null; candlePruneLastError: string | null } };
    priceStore?: { getAllPrices(): Array<{ ticker: string; price: number; changeRate: number; volume: number; updatedAt: string; isSnapshot: boolean; volumeBaselineStatus?: 'ready' | 'collecting' | 'unavailable' }> };
    backfillStateStore?: { load(): Promise<{ budgetDateKey: string | null; dailyCallCount: number; cooldownUntilMs: number }>; save(): Promise<void>; snapshot(): { budgetDateKey: string | null; dailyCallCount: number; cooldownUntilMs: number } };
    backgroundBackfill?: { snapshot(): { running: boolean; lastRunAt: string | null; lastFinishedAt: string | null; lastAttempted: number; lastSucceeded: number; lastFailed: number; lastSkippedReason: 'disabled' | 'market_not_allowed' | 'no_tickers' | 'no_stale_tickers' | 'already_running' | 'cooldown' | null } };
    marketTopMoversService?: { snapshot(): any };
    tossQuotePolling?: { snapshot(): any };
    phoneNotifier?: {
      status(): { configured: boolean; provider: 'telegram'; mode: 'env' };
      sendAlert(input: { title: string; detail: string; ticker: string; name: string }): Promise<{ sent: boolean; reason?: string }>;
      sendTest(): Promise<{ sent: boolean; reason?: string }>;
    };
    phoneDeliveryLog?: {
      record(entry: any): void;
      list(limit?: number): any[];
      summarize(): {
        total: number;
        sent: number;
        failed: number;
        skipped: number;
        lastStatus: 'sent' | 'failed' | 'skipped' | null;
        lastAt: string | null;
        lastErrorCode: string | null;
      };
    };
  },
) {
  const app = Fastify({ logger: false });
  await app.register(runtimeRoutes, {
    runtimeRef: opts.runtimeRef,
    settingsStore: opts.settingsStore ?? settingsStore(),
    credentialStore: opts.credentialStore ?? credentialStore(true),
    stockRepo: opts.backupStockRepo ?? opts.stockRepo,
    favoriteRepo: opts.backupFavoriteRepo ?? opts.favoriteRepo,
    candleRepo: opts.candleRepo,
    signalEventRepo: opts.signalEventRepo,
    newsRepo: opts.newsRepo,
    disclosureRepo: opts.disclosureRepo,
    dataRetention: opts.dataRetention,
    priceStore: opts.priceStore,
    backfillStateStore: opts.backfillStateStore,
    backgroundBackfill: opts.backgroundBackfill,
    marketTopMoversService: opts.marketTopMoversService,
    tossQuotePolling: opts.tossQuotePolling,
    phoneNotifier: opts.phoneNotifier,
    phoneDeliveryLog: opts.phoneDeliveryLog,
  });
  return app;
}

describe('runtime phone notification routes', () => {
  it('reports unconfigured Telegram bridge without sending anything', async () => {
    const sendAlert = vi.fn();
    const app = await build({
      runtimeRef: runtimeRef({ status: 'unconfigured' }),
      phoneNotifier: {
        status: () => ({ configured: false, provider: 'telegram', mode: 'env' }),
        sendAlert,
        sendTest: vi.fn(),
      },
    });

    const status = await app.inject({
      method: 'GET',
      url: '/runtime/notifications/telegram/status',
    });
    const alert = await app.inject({
      method: 'POST',
      url: '/runtime/notifications/telegram/alert',
      payload: {
        ticker: '005930',
        name: '삼성전자',
        title: '삼성전자 · 룰 발동',
        detail: '005930 · 등락률 ≥ 5%',
        kind: 'rule',
        direction: 'up',
        changePct: 5.2,
      },
    });

    expect(status.statusCode).toBe(200);
    expect(status.json().data.configured).toBe(false);
    expect(alert.statusCode).toBe(409);
    expect(alert.json().error.code).toBe('PHONE_NOTIFICATION_NOT_CONFIGURED');
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('sends a sanitized Telegram alert payload when configured', async () => {
    const sendAlert = vi.fn(async () => ({ sent: true }));
    const app = await build({
      runtimeRef: runtimeRef({ status: 'unconfigured' }),
      phoneNotifier: {
        status: () => ({ configured: true, provider: 'telegram', mode: 'env' }),
        sendAlert,
        sendTest: vi.fn(),
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/runtime/notifications/telegram/alert',
      payload: {
        ticker: '005930',
        name: '삼성전자',
        title: '삼성전자 · 룰 발동',
        detail: '005930 · 거래량 배수 ≥ 2.5배',
        kind: 'rule',
        direction: 'up',
        changePct: 5.2,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.sent).toBe(true);
    expect(sendAlert).toHaveBeenCalledWith({
      ticker: '005930',
      name: '삼성전자',
      title: '삼성전자 · 룰 발동',
      detail: '005930 · 거래량 배수 ≥ 2.5배',
      kind: 'rule',
      direction: 'up',
      changePct: 5.2,
    });
  });

  it('keeps a bounded sanitized server-side Telegram delivery log', async () => {
    const sendAlert = vi.fn(async () => ({ sent: true }));
    const app = await build({
      runtimeRef: runtimeRef({ status: 'unconfigured' }),
      phoneNotifier: {
        status: () => ({ configured: true, provider: 'telegram', mode: 'env' }),
        sendAlert,
        sendTest: vi.fn(),
      },
    });

    await app.inject({
      method: 'POST',
      url: '/runtime/notifications/telegram/alert',
      payload: {
        ticker: '005930',
        name: '삼성전자',
        title: '삼성전자 · 룰 발동',
        detail: '005930 · 등락률 ≥ 5%',
        kind: 'rule',
        direction: 'up',
        changePct: 5.2,
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/runtime/notifications/telegram/deliveries?limit=5',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      summary: {
        total: 1,
        sent: 1,
        failed: 0,
        skipped: 0,
        lastStatus: 'sent',
        lastErrorCode: null,
      },
      items: [
        {
          type: 'alert',
          status: 'sent',
          provider: 'telegram',
          ticker: '005930',
          name: '삼성전자',
          errorCode: null,
        },
      ],
    });
    expect(JSON.stringify(res.json())).not.toContain('token');
    expect(JSON.stringify(res.json())).not.toContain('chat_id');
  });
});

describe('GET /runtime/data-health', () => {
  it('summarizes tracking, candle coverage, backfill calls, and volume baselines safely', async () => {
    const app = await build({
      runtimeRef: runtimeRef({ status: 'unconfigured' }),
      settingsStore: settingsStore({
        backgroundDailyBackfillEnabled: true,
        backgroundDailyBackfillRange: '3m',
      }),
      stockRepo: {
        findAll: vi.fn(() => [
          { ticker: '005930', name: '삼성전자', market: 'KOSPI' },
          { ticker: '000660', name: 'SK하이닉스', market: 'KOSPI' },
        ]),
      },
      favoriteRepo: {
        findAll: vi.fn(() => [
          { ticker: '005930', tier: 'realtime', addedAt: '2026-05-06T00:00:00.000Z' },
        ]),
      },
      candleRepo: {
        summarizeCoverage: vi.fn(() => [
          { interval: '1m', tickerCount: 1, candleCount: 120, newestBucketAt: '2026-05-06T06:30:00.000Z' },
          { interval: '1d', tickerCount: 2, candleCount: 40, newestBucketAt: '2026-05-05T15:00:00.000Z' },
        ]),
      },
      signalEventRepo: {
        summarizeGrowth: vi.fn(() => ({
          eventCount: 12,
          oldestSignalEventAt: '2026-05-01T00:00:00.000Z',
          newestSignalEventAt: '2026-05-06T06:00:00.000Z',
        })),
      },
      newsRepo: {
        summarizeGrowth: vi.fn(() => ({
          itemCount: 4,
          staleItemCount: 1,
          oldestFetchedAt: '2026-05-01T00:00:00.000Z',
          newestFetchedAt: '2026-05-06T06:00:00.000Z',
          failedFetchCount: 1,
          lastFetchStatus: 'failed',
          lastFetchErrorCode: 'HTTP_503',
          lastFetchedAt: '2026-05-06T06:00:00.000Z',
        })),
      },
      disclosureRepo: {
        summarizeGrowth: vi.fn(() => ({
          itemCount: 5,
          staleItemCount: 2,
          oldestFetchedAt: '2026-05-02T00:00:00.000Z',
          newestFetchedAt: '2026-05-06T05:00:00.000Z',
        })),
      },
      dataRetention: {
        snapshot: vi.fn(() => ({
          lastRunAt: '2026-05-06T06:00:00.000Z',
          candlePruneLastRunAt: '2026-05-06T06:00:00.000Z',
          candlePruneLastError: null,
        })),
      },
      priceStore: {
        getAllPrices: vi.fn(() => [
          { ticker: '005930', price: 70_000, changeRate: 1, volume: 1, updatedAt: '2026-05-06T06:30:00.000Z', isSnapshot: false, volumeBaselineStatus: 'ready' },
          { ticker: '000660', price: 140_000, changeRate: 2, volume: 1, updatedAt: '2026-05-06T06:30:00.000Z', isSnapshot: false, volumeBaselineStatus: 'collecting' },
        ]),
      },
      backfillStateStore: {
        load: vi.fn(async () => ({
          budgetDateKey: '2026-05-06',
          dailyCallCount: 4,
          cooldownUntilMs: 0,
        })),
        save: vi.fn(async () => undefined),
        snapshot: vi.fn(() => ({ budgetDateKey: '2026-05-06', dailyCallCount: 4, cooldownUntilMs: 0 })),
      },
      backgroundBackfill: {
        snapshot: vi.fn(() => ({
          running: true,
          lastRunAt: '2026-05-06T11:05:00.000Z',
          lastFinishedAt: null,
          lastAttempted: 2,
          lastSucceeded: 1,
          lastFailed: 0,
          lastSkippedReason: null,
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
        })),
      },
    });

    const res = await app.inject({ method: 'GET', url: '/runtime/data-health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: {
        tracking: { trackedCount: 2, favoriteCount: 1 },
        candles: [
          { interval: '1m', tickerCount: 1, candleCount: 120, newestBucketAt: '2026-05-06T06:30:00.000Z' },
          { interval: '1d', tickerCount: 2, candleCount: 40, newestBucketAt: '2026-05-05T15:00:00.000Z' },
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
          circuitBreakerUntil: null,
          recentThrottleCount: 0,
          recentSuccessCount: 0,
          budget: defaultKisBudgetPayload(),
          aimd: defaultAimdPayload(),
          telemetry: {
            capacity: 0,
            eventCount: 0,
            oldestAt: null,
            newestAt: null,
            recent: [],
          },
          policies: [],
          profiles: [],
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
          configured: false,
          running: false,
          enabled: false,
          source: null,
          cycleCount: 0,
          lastCycleMs: 0,
          tickersInCycle: 0,
          requestedCount: 0,
          returnedCount: 0,
          missingCount: 0,
          errorCount: 0,
          consecutiveFailureCount: 0,
          lastSuccessAt: null,
          lastFailureAt: null,
          lastErrorCode: null,
          lastMessage: null,
          intervalMs: null,
          batchSize: null,
          suppressingKisPolling: false,
        },
        marketTopMovers: {
          configured: false,
          status: 'unconfigured',
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
          total: 2,
          ready: 1,
          collecting: 1,
          unavailable: 0,
        },
        growth: {
          signals: {
            eventCount: 12,
            oldestSignalEventAt: '2026-05-01T00:00:00.000Z',
            newestSignalEventAt: '2026-05-06T06:00:00.000Z',
            retentionDays: 90,
          },
          news: {
            itemCount: 4,
            staleItemCount: 1,
            oldestFetchedAt: '2026-05-01T00:00:00.000Z',
            newestFetchedAt: '2026-05-06T06:00:00.000Z',
            ttlHours: 24,
            pruneAfterDays: 7,
            failedFetchCount: 1,
            lastFetchStatus: 'failed',
            lastFetchErrorCode: 'HTTP_503',
            lastFetchedAt: '2026-05-06T06:00:00.000Z',
          },
          disclosures: {
            itemCount: 5,
            staleItemCount: 2,
            oldestFetchedAt: '2026-05-02T00:00:00.000Z',
            newestFetchedAt: '2026-05-06T05:00:00.000Z',
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
        signalOutcomes: {
          totalSignals: 0,
          evaluatedSignals: 0,
          pendingSignals: 0,
          horizons: [
            {
              horizon: '5m',
              total: 0,
              ready: 0,
              pending: 0,
              averageChangePct: null,
              bestChangePct: null,
              worstChangePct: null,
            },
            {
              horizon: '15m',
              total: 0,
              ready: 0,
              pending: 0,
              averageChangePct: null,
              bestChangePct: null,
              worstChangePct: null,
            },
            {
              horizon: '30m',
              total: 0,
              ready: 0,
              pending: 0,
              averageChangePct: null,
              bestChangePct: null,
              worstChangePct: null,
            },
          ],
        },
        maintenance: {
          lastRunAt: '2026-05-06T06:00:00.000Z',
          candlePruneLastRunAt: '2026-05-06T06:00:00.000Z',
          candlePruneLastError: null,
        },
      },
    });
  });

  it('exposes sanitized Toss quote polling health', async () => {
    const app = await build({
      runtimeRef: runtimeRef({ status: 'unconfigured' }),
      tossQuotePolling: {
        snapshot: vi.fn(() => ({
          running: true,
          enabled: true,
          source: 'toss-public',
          cycleCount: 3,
          lastCycleMs: 42,
          tickersInCycle: 52,
          requestedCount: 52,
          returnedCount: 51,
          missingCount: 1,
          errorCount: 0,
          consecutiveFailureCount: 0,
          lastSuccessAt: '2026-05-11T01:00:00.000Z',
          lastFailureAt: null,
          lastErrorCode: null,
          lastMessage: 'partial_quote_batch',
          intervalMs: 3000,
          batchSize: 100,
        })),
      },
    });

    const res = await app.inject({ method: 'GET', url: '/runtime/data-health' });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.data.tossQuotePolling).toEqual({
      configured: true,
      running: true,
      enabled: true,
      source: 'toss-public',
      cycleCount: 3,
      lastCycleMs: 42,
      tickersInCycle: 52,
      requestedCount: 52,
      returnedCount: 51,
      missingCount: 1,
      errorCount: 0,
      consecutiveFailureCount: 0,
      lastSuccessAt: '2026-05-11T01:00:00.000Z',
      lastFailureAt: null,
      lastErrorCode: null,
      lastMessage: 'partial_quote_batch',
      intervalMs: 3000,
      batchSize: 100,
      suppressingKisPolling: true,
    });
    expect(JSON.stringify(body.data.tossQuotePolling)).not.toContain('cookie');
    expect(JSON.stringify(body.data.tossQuotePolling)).not.toContain('token');
  });

  it('exposes sanitized market TOP100 cache and coverage diagnostics', async () => {
    const app = await build({
      runtimeRef: runtimeRef({ status: 'unconfigured' }),
      marketTopMoversService: {
        snapshot: vi.fn(() => ({
          status: 'partial',
          source: 'kis-ranking-auto',
          sourcePhase: 'regular',
          sourceLabel: '본장',
          sourceReason: '정규장 등락률 랭킹입니다.',
          frozen: false,
          lastGoodAgeMs: 5_000,
          partialReason: 'under_requested_limit',
          stopReason: 'upstream_partial_limit_suspected',
          rankingDiagnostics: {
            gainers: {
              direction: 'gainers',
              pagesAttempted: 1,
              rowsReceived: 80,
              rowsAccepted: 80,
              rowsPerPage: [80],
              continuationValues: [null],
              stopReason: 'upstream_partial_limit_suspected',
              durationMs: 120,
            },
            losers: null,
          },
          rankingRateLimited: false,
          lastFetchedAt: '2026-05-10T10:00:00.000Z',
          lastGeneratedAt: '2026-05-10T10:00:05.000Z',
          cacheAgeMs: 5_000,
          cacheTtlMs: 10_000,
          staleAfterMs: 30_000,
          cooldownUntil: null,
          cooldownActive: false,
          inflight: false,
          lastMessage: 'KIS 직접 랭킹 일부만 수신했습니다.',
          lastErrorCode: null,
          coverage: {
            requestedLimit: 100,
            gainersCount: 80,
            losersCount: 100,
            gainersComplete: false,
            losersComplete: true,
            marketUniverse: 'kis-full-market-ranking',
            guaranteedTop100: false,
            includesLocalFallback: false,
          },
        })),
      },
    });

    const res = await app.inject({ method: 'GET', url: '/runtime/data-health' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.marketTopMovers).toEqual({
      configured: true,
      status: 'partial',
      source: 'kis-ranking-auto',
      sourcePhase: 'regular',
      sourceLabel: '본장',
      sourceReason: '정규장 등락률 랭킹입니다.',
      frozen: false,
      lastGoodAgeMs: 5_000,
      partialReason: 'under_requested_limit',
      stopReason: 'upstream_partial_limit_suspected',
      rankingDiagnostics: {
        gainers: {
          direction: 'gainers',
          pagesAttempted: 1,
          rowsReceived: 80,
          rowsAccepted: 80,
          rowsPerPage: [80],
          continuationValues: [null],
          stopReason: 'upstream_partial_limit_suspected',
          durationMs: 120,
        },
        losers: null,
      },
      rankingRateLimited: false,
      lastFetchedAt: '2026-05-10T10:00:00.000Z',
      lastGeneratedAt: '2026-05-10T10:00:05.000Z',
      cacheAgeMs: 5_000,
      cacheTtlMs: 10_000,
      staleAfterMs: 30_000,
      cooldownUntil: null,
      cooldownActive: false,
      inflight: false,
      lastMessage: 'KIS 직접 랭킹 일부만 수신했습니다.',
      lastErrorCode: null,
      coverage: {
        requestedLimit: 100,
        gainersCount: 80,
        losersCount: 100,
        gainersComplete: false,
        losersComplete: true,
        marketUniverse: 'kis-full-market-ranking',
        guaranteedTop100: false,
        includesLocalFallback: false,
      },
    });
  });

  it('exposes KIS outbound limiter cooldown and observed recovery timing safely', async () => {
    const app = await build({
      runtimeRef: runtimeRef({
        status: 'started',
        runtime: startedRuntime({
          outboundLimiter: {
            acquire: vi.fn(async () => undefined),
            recordFailure: vi.fn(),
            recordSuccess: vi.fn(),
            snapshot: vi.fn(() => ({
              ratePerSec: 15,
              burst: 15,
              tokens: 7.5,
              globalMinStartGapMs: 200,
              queueDepth: 2,
              queuedByPriority: {
                foreground: 1,
                background_backfill: 1,
              },
              telemetry: {
                capacity: 3,
                eventCount: 1,
                recent: [
                  {
                    atMs: Date.parse('2026-05-08T14:01:00.000Z'),
                    event: 'throttle',
                    profileId: 'primary',
                    endpointClass: 'polling',
                    priorityClass: 'polling',
                    state: 'throttled',
                    throttleCode: 'EGW00201',
                    recoveryAttemptCount: 0,
                    observedRecoveryMs: null,
                    currentAllowedRps: 15,
                    minStartGapMs: 250,
                    maxInFlight: 2,
                  },
                ],
              },
              policies: [
                {
                  endpointClass: 'selected_backfill',
                  priorityClass: 'selected_backfill',
                  minStartGapMs: 1_000,
                  maxInFlight: 1,
                  recoveryRatePerSec: 1,
                },
                {
                  endpointClass: 'background_backfill',
                  priorityClass: 'background_backfill',
                  minStartGapMs: 1_500,
                  maxInFlight: 1,
                  recoveryRatePerSec: 1,
                },
              ],
              profiles: [
                {
                  profileId: 'primary',
                  endpointClass: 'polling',
                  priorityClass: 'polling',
                  state: 'recovering',
                  cooldownUntilMs: Date.parse('2026-05-08T14:01:30.000Z'),
                  cooldownActive: false,
                  firstLimitedAtMs: Date.parse('2026-05-08T14:01:00.000Z'),
                  lastLimitedAtMs: Date.parse('2026-05-08T14:01:00.000Z'),
                  recoveredAtMs: Date.parse('2026-05-08T14:01:31.250Z'),
                  observedRecoveryMs: 31_250,
                  nextRetryAtMs: null,
                  circuitBreakerUntilMs: null,
                  lastThrottleCode: 'EGW00201',
                  recoveryAttemptCount: 0,
                  recentThrottleCount: 1,
                  recentSuccessCount: 3,
                  currentAllowedRps: 4,
                  minStartGapMs: 250,
                  maxInFlight: 2,
                },
              ],
            })),
          },
        }),
      }),
    });

    const res = await app.inject({ method: 'GET', url: '/runtime/data-health' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.kisOutboundLimiter).toEqual({
      configured: true,
      currentState: 'recovering',
      ratePerSec: 15,
      burst: 15,
      tokens: 7.5,
      globalMinStartGapMs: 200,
      queueDepth: 2,
      queuedByPriority: {
        foreground: 1,
        background_backfill: 1,
      },
      currentAllowedRps: 4,
      lastThrottleAt: '2026-05-08T14:01:00.000Z',
      lastThrottleClass: 'polling',
      lastThrottleCode: 'EGW00201',
      recoveryAttemptCount: 0,
      circuitBreakerUntil: null,
      recentThrottleCount: 1,
      recentSuccessCount: 3,
      budget: expect.objectContaining({
        riskState: 'recovering',
        riskLabel: 'KIS 회복중',
        riskReason: 'EGW00201',
      }),
      aimd: {
        ...defaultAimdPayload(),
        lastDecision: expect.objectContaining({
          source: 'telemetry_snapshot',
          action: 'hold',
          reason: 'insufficient_polling_cycles',
          currentPollingMinStartGapMs: 350,
          proposedPollingMinStartGapMs: 350,
          applyRuntimeChange: false,
        }),
        observationWindow: expect.objectContaining({
          classification: 'mixed',
          completedPollingCycles: 0,
          throttleCount: 1,
          circuitBreakerCount: 0,
        }),
      },
      telemetry: {
        capacity: 3,
        eventCount: 1,
        oldestAt: '2026-05-08T14:01:00.000Z',
        newestAt: '2026-05-08T14:01:00.000Z',
        recent: [
          {
            at: '2026-05-08T14:01:00.000Z',
            event: 'throttle',
            profileId: 'primary',
            endpointClass: 'polling',
            priorityClass: 'polling',
            state: 'throttled',
            throttleCode: 'EGW00201',
            recoveryAttemptCount: 0,
            observedRecoveryMs: null,
            currentAllowedRps: 15,
            minStartGapMs: 250,
            maxInFlight: 2,
          },
        ],
      },
      policies: [
        {
          endpointClass: 'selected_backfill',
          priorityClass: 'selected_backfill',
          minStartGapMs: 1_000,
          maxInFlight: 1,
          recoveryRatePerSec: 1,
        },
        {
          endpointClass: 'background_backfill',
          priorityClass: 'background_backfill',
          minStartGapMs: 1_500,
          maxInFlight: 1,
          recoveryRatePerSec: 1,
        },
      ],
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
    });
  });

  it('does not let expired inactive KIS circuit breakers dominate global health', async () => {
    const app = await build({
      runtimeRef: runtimeRef({
        status: 'started',
        runtime: startedRuntime({
          outboundLimiter: {
            acquire: vi.fn(async () => undefined),
            recordFailure: vi.fn(),
            recordSuccess: vi.fn(),
            snapshot: vi.fn(() => ({
              ratePerSec: 15,
              burst: 15,
              tokens: 15,
              queueDepth: 0,
              queuedByPriority: {},
              policies: [],
              profiles: [
                {
                  profileId: 'primary',
                  endpointClass: 'foreground',
                  priorityClass: 'foreground',
                  state: 'circuit_breaker',
                  cooldownUntilMs: Date.parse('2026-05-08T14:01:30.000Z'),
                  cooldownActive: false,
                  firstLimitedAtMs: Date.parse('2026-05-08T14:01:00.000Z'),
                  lastLimitedAtMs: Date.parse('2026-05-08T14:01:00.000Z'),
                  recoveredAtMs: null,
                  observedRecoveryMs: null,
                  nextRetryAtMs: Date.parse('2026-05-08T14:01:30.000Z'),
                  circuitBreakerUntilMs: Date.parse('2026-05-08T14:01:30.000Z'),
                  lastThrottleCode: 'EGW00201',
                  recoveryAttemptCount: 6,
                  recentThrottleCount: 6,
                  recentSuccessCount: 0,
                  currentAllowedRps: 15,
                  minStartGapMs: 80,
                  maxInFlight: 2,
                },
              ],
            })),
          },
        }),
      }),
    });

    const res = await app.inject({ method: 'GET', url: '/runtime/data-health' });
    const limiter = res.json().data.kisOutboundLimiter;

    expect(res.statusCode).toBe(200);
    expect(limiter.currentState).toBe('normal');
    expect(limiter.circuitBreakerUntil).toBeNull();
    expect(limiter.budget).toEqual(expect.objectContaining({
      riskState: 'idle',
      riskReason: null,
    }));
    expect(limiter.budget.riskLabel).not.toBe('KIS 제한');
    expect(limiter.profiles[0]).toEqual(expect.objectContaining({
      state: 'circuit_breaker',
      cooldownActive: false,
      circuitBreakerUntil: '2026-05-08T14:01:30.000Z',
      lastThrottleCode: 'EGW00201',
    }));
  });

  it('exposes sanitized KIS REST profile routing health', async () => {
    const app = await build({
      runtimeRef: runtimeRef({
        status: 'started',
        runtime: startedRuntime({
          restProfileRouter: {
            request: vi.fn(),
            requestWithMeta: vi.fn(),
            postToken: vi.fn(),
            snapshot: vi.fn(() => ({
              configured: true,
              primaryProfileId: 'primary',
              profileCount: 3,
              eligibleProfileCount: 2,
              endpointPolicies: [
                {
                  endpointClass: 'foreground',
                  selection: 'primary_first',
                  failoverEnabled: true,
                },
              ],
              profiles: [
                {
                  profileId: 'primary',
                  label: 'Primary',
                  isPaper: false,
                  enabled: true,
                  eligible: true,
                  ineligibleReason: null,
                  selectedCount: 3,
                  successCount: 2,
                  failureCount: 1,
                  failoverFromCount: 1,
                  failoverToCount: 0,
                  lastSelectedAtMs: Date.parse('2026-05-08T14:01:00.000Z'),
                  lastSuccessAtMs: Date.parse('2026-05-08T14:01:01.000Z'),
                  lastFailureAtMs: Date.parse('2026-05-08T14:01:02.000Z'),
                  lastFailureKind: 'KIS_RATE_LIMIT_SECOND_WINDOW',
                  lastFailureCode: 'EGW00201',
                  lastThrottleAtMs: Date.parse('2026-05-08T14:01:02.000Z'),
                  governorState: 'recovering',
                  cooldownActive: false,
                  activeEndpointClasses: ['polling'],
                  currentAllowedRps: 3,
                },
                {
                  profileId: 'secondary',
                  label: 'Secondary',
                  isPaper: false,
                  enabled: true,
                  eligible: true,
                  ineligibleReason: null,
                  selectedCount: 1,
                  successCount: 1,
                  failureCount: 0,
                  failoverFromCount: 0,
                  failoverToCount: 1,
                  lastSelectedAtMs: Date.parse('2026-05-08T14:01:03.000Z'),
                  lastSuccessAtMs: Date.parse('2026-05-08T14:01:04.000Z'),
                  lastFailureAtMs: null,
                  lastFailureKind: null,
                  lastFailureCode: null,
                  lastThrottleAtMs: null,
                  governorState: 'normal',
                  cooldownActive: false,
                  activeEndpointClasses: [],
                  currentAllowedRps: null,
                },
                {
                  profileId: 'paper-profile',
                  label: 'Paper',
                  isPaper: true,
                  enabled: true,
                  eligible: false,
                  ineligibleReason: 'paper_mismatch',
                  selectedCount: 0,
                  successCount: 0,
                  failureCount: 0,
                  failoverFromCount: 0,
                  failoverToCount: 0,
                  lastSelectedAtMs: null,
                  lastSuccessAtMs: null,
                  lastFailureAtMs: null,
                  lastFailureKind: null,
                  lastFailureCode: null,
                  lastThrottleAtMs: null,
                  governorState: 'normal',
                  cooldownActive: false,
                  activeEndpointClasses: [],
                  currentAllowedRps: null,
                },
              ],
            })),
          },
        }),
      }),
    });

    const res = await app.inject({ method: 'GET', url: '/runtime/data-health' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.kisRestProfiles).toEqual({
      configured: true,
      primaryProfileId: 'primary',
      profileCount: 3,
      eligibleProfileCount: 2,
      endpointPolicies: [
        {
          endpointClass: 'foreground',
          selection: 'primary_first',
          failoverEnabled: true,
        },
      ],
      profiles: [
        expect.objectContaining({
          profileId: 'primary',
          label: 'Primary',
          eligible: true,
          lastFailureKind: 'KIS_RATE_LIMIT_SECOND_WINDOW',
          lastFailureCode: 'EGW00201',
          lastThrottleAt: '2026-05-08T14:01:02.000Z',
          governorState: 'recovering',
          activeEndpointClasses: ['polling'],
        }),
        expect.objectContaining({
          profileId: 'secondary',
          eligible: true,
          failoverToCount: 1,
          lastSuccessAt: '2026-05-08T14:01:04.000Z',
        }),
        expect.objectContaining({
          profileId: 'paper-profile',
          eligible: false,
          ineligibleReason: 'paper_mismatch',
        }),
      ],
    });
    expect(JSON.stringify(res.json().data.kisRestProfiles)).not.toMatch(
      /appKey|appSecret|accessToken|approvalKey/i,
    );
  });

  it('exposes sanitized observe-only AIMD diagnostics', async () => {
    const app = await build({
      runtimeRef: runtimeRef({
        status: 'started',
        runtime: startedRuntime({
          governorAimd: {
            snapshot: vi.fn(() => ({
              enabled: true,
              mode: 'observe_only',
              currentPollingMinStartGapMs: 325,
              baselinePollingMinStartGapMs: 350,
              lastAdjustmentAtMs: Date.parse('2026-05-08T14:30:00.000Z'),
              lastAdjustmentDirection: 'decrease_gap',
              lastAdjustmentReason: 'clean_regular_market_windows',
              nextEvaluationAtMs: Date.parse('2026-05-08T14:40:00.000Z'),
              cleanRegularMarketWindowCount: 3,
              degradedWindowCount: 0,
              rollbackBaseline: {
                pollingMinStartGapMs: 350,
                pollingRecoveryRatePerSec: 3,
              },
              rawBody: 'SHOULD_NOT_APPEAR',
              appKey: 'SHOULD_NOT_APPEAR',
              appSecret: 'SHOULD_NOT_APPEAR',
              token: 'SHOULD_NOT_APPEAR',
              account: 'SHOULD_NOT_APPEAR',
            })),
          },
        }),
      }),
    });

    const res = await app.inject({ method: 'GET', url: '/runtime/data-health' });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.data.kisOutboundLimiter.aimd).toEqual({
      enabled: true,
      mode: 'observe_only',
      currentPollingMinStartGapMs: 325,
      currentPollingRecoveryRatePerSec: 3,
      baselinePollingMinStartGapMs: 350,
      lastAdjustmentAt: '2026-05-08T14:30:00.000Z',
      lastAdjustmentDirection: 'decrease_gap',
      lastAdjustmentReason: 'clean_regular_market_windows',
      nextEvaluationAt: '2026-05-08T14:40:00.000Z',
      cleanRegularMarketWindowCount: 3,
      degradedWindowCount: 0,
      lastDecision: null,
      observationWindow: null,
      rollbackBaseline: {
        pollingMinStartGapMs: 350,
        pollingRecoveryRatePerSec: 3,
      },
    });
    expect(JSON.stringify(body)).not.toContain('SHOULD_NOT_APPEAR');
  });

  it('exposes observe-only AIMD last decision from sanitized telemetry', async () => {
    const app = await build({
      runtimeRef: runtimeRef({
        status: 'started',
        runtime: startedRuntime({
          pollingStatus: {
            cycleCount: 2,
          },
          governorAimd: {
            snapshot: vi.fn(() => ({
              enabled: false,
              mode: 'observe_only',
              currentPollingMinStartGapMs: 350,
              baselinePollingMinStartGapMs: 350,
              lastAdjustmentAtMs: null,
              lastAdjustmentDirection: 'none',
              lastAdjustmentReason: null,
              nextEvaluationAtMs: null,
              cleanRegularMarketWindowCount: 0,
              degradedWindowCount: 0,
              rollbackBaseline: {
                pollingMinStartGapMs: 350,
                pollingRecoveryRatePerSec: 3,
              },
            })),
          },
          outboundLimiter: {
            acquire: vi.fn(async () => undefined),
            recordFailure: vi.fn(),
            recordSuccess: vi.fn(),
            snapshot: vi.fn(() => ({
              ratePerSec: 15,
              burst: 15,
              tokens: 10,
              profiles: [],
              telemetry: {
                capacity: 10,
                eventCount: 3,
                recent: [
                  {
                    atMs: Date.parse('2026-05-08T14:00:00.000Z'),
                    event: 'throttle',
                    profileId: 'primary',
                    endpointClass: 'polling',
                    priorityClass: 'polling',
                    state: 'throttled',
                    throttleCode: 'EGW00201',
                    recoveryAttemptCount: 0,
                    observedRecoveryMs: null,
                    currentAllowedRps: 15,
                    minStartGapMs: 350,
                    maxInFlight: 2,
                  },
                  {
                    atMs: Date.parse('2026-05-08T14:00:01.000Z'),
                    event: 'normal',
                    profileId: 'primary',
                    endpointClass: 'polling',
                    priorityClass: 'polling',
                    state: 'normal',
                    throttleCode: 'EGW00201',
                    recoveryAttemptCount: 0,
                    observedRecoveryMs: 500,
                    currentAllowedRps: 15,
                    minStartGapMs: 350,
                    maxInFlight: 2,
                  },
                  {
                    atMs: Date.parse('2026-05-08T14:10:00.000Z'),
                    event: 'throttle',
                    profileId: 'primary',
                    endpointClass: 'polling',
                    priorityClass: 'polling',
                    state: 'throttled',
                    throttleCode: 'EGW00201',
                    recoveryAttemptCount: 0,
                    observedRecoveryMs: null,
                    currentAllowedRps: 15,
                    minStartGapMs: 350,
                    maxInFlight: 2,
                  },
                ],
              },
            })),
          },
        }),
      }),
    });

    const res = await app.inject({ method: 'GET', url: '/runtime/data-health' });
    const aimd = res.json().data.kisOutboundLimiter.aimd;

    expect(res.statusCode).toBe(200);
    expect(aimd.lastDecision).toMatchObject({
      source: 'telemetry_snapshot',
      action: 'hold',
      reason: 'mixed_window',
      currentPollingMinStartGapMs: 350,
      proposedPollingMinStartGapMs: 350,
      applyRuntimeChange: false,
    });
    expect(aimd.observationWindow).toMatchObject({
      classification: 'mixed',
      completedPollingCycles: 2,
      throttleCount: 2,
      circuitBreakerCount: 0,
      cleanRegularMarketWindowCount: 0,
    });
  });

  it('classifies AIMD telemetry as regular market only while the market phase is open', async () => {
    const app = await build({
      runtimeRef: runtimeRef({
        status: 'started',
        runtime: startedRuntime({
          marketPhase: 'open',
          pollingStatus: {
            cycleCount: 2,
          },
          governorAimd: {
            snapshot: vi.fn(() => ({
              enabled: true,
              mode: 'observe_only',
              currentPollingMinStartGapMs: 350,
              baselinePollingMinStartGapMs: 350,
              lastAdjustmentAtMs: null,
              lastAdjustmentDirection: 'none',
              lastAdjustmentReason: null,
              nextEvaluationAtMs: null,
              cleanRegularMarketWindowCount: 0,
              degradedWindowCount: 0,
              rollbackBaseline: {
                pollingMinStartGapMs: 350,
                pollingRecoveryRatePerSec: 3,
              },
            })),
          },
          outboundLimiter: {
            acquire: vi.fn(async () => undefined),
            recordFailure: vi.fn(),
            recordSuccess: vi.fn(),
            snapshot: vi.fn(() => ({
              ratePerSec: 15,
              burst: 15,
              tokens: 10,
              profiles: [],
              telemetry: {
                capacity: 10,
                eventCount: 2,
                recent: [
                  {
                    atMs: Date.parse('2026-05-08T14:00:00.000Z'),
                    event: 'throttle',
                    profileId: 'primary',
                    endpointClass: 'polling',
                    priorityClass: 'polling',
                    state: 'throttled',
                    throttleCode: 'EGW00201',
                    recoveryAttemptCount: 0,
                    observedRecoveryMs: null,
                    currentAllowedRps: 15,
                    minStartGapMs: 350,
                    maxInFlight: 2,
                  },
                  {
                    atMs: Date.parse('2026-05-08T14:10:00.000Z'),
                    event: 'throttle',
                    profileId: 'primary',
                    endpointClass: 'polling',
                    priorityClass: 'polling',
                    state: 'throttled',
                    throttleCode: 'EGW00201',
                    recoveryAttemptCount: 0,
                    observedRecoveryMs: null,
                    currentAllowedRps: 15,
                    minStartGapMs: 350,
                    maxInFlight: 2,
                  },
                ],
              },
            })),
          },
        }),
      }),
    });

    const res = await app.inject({ method: 'GET', url: '/runtime/data-health' });
    const aimd = res.json().data.kisOutboundLimiter.aimd;

    expect(res.statusCode).toBe(200);
    expect(aimd.observationWindow).toMatchObject({
      classification: 'regular_market',
      completedPollingCycles: 2,
      throttleCount: 2,
    });
    expect(aimd.lastDecision).toMatchObject({
      source: 'telemetry_snapshot',
      action: 'tighten',
      reason: 'repeated_throttle',
      currentPollingMinStartGapMs: 350,
      proposedPollingMinStartGapMs: 438,
      applyRuntimeChange: false,
    });
  });

  it('anchors AIMD diagnostics to the active evaluation window', async () => {
    const app = await build({
      runtimeRef: runtimeRef({
        status: 'started',
        runtime: startedRuntime({
          marketPhase: 'open',
          pollingStatus: {
            cycleCount: 2,
          },
          governorAimd: {
            snapshot: vi.fn(() => ({
              enabled: true,
              mode: 'active',
              currentPollingMinStartGapMs: 548,
              baselinePollingMinStartGapMs: 350,
              lastAdjustmentAtMs: Date.parse('2026-05-08T14:10:00.000Z'),
              lastAdjustmentDirection: 'increase_gap',
              lastAdjustmentReason: 'repeated_throttle',
              nextEvaluationAtMs: Date.parse('2026-05-08T14:20:00.000Z'),
              cleanRegularMarketWindowCount: 0,
              degradedWindowCount: 1,
              rollbackBaseline: {
                pollingMinStartGapMs: 350,
                pollingRecoveryRatePerSec: 3,
              },
            })),
          },
          outboundLimiter: {
            acquire: vi.fn(async () => undefined),
            recordFailure: vi.fn(),
            recordSuccess: vi.fn(),
            snapshot: vi.fn(() => ({
              ratePerSec: 15,
              burst: 15,
              tokens: 10,
              profiles: [],
              telemetry: {
                capacity: 10,
                eventCount: 2,
                recent: [
                  {
                    atMs: Date.parse('2026-05-08T14:00:00.000Z'),
                    event: 'throttle',
                    profileId: 'primary',
                    endpointClass: 'polling',
                    priorityClass: 'polling',
                    state: 'throttled',
                    throttleCode: 'EGW00201',
                    recoveryAttemptCount: 0,
                    observedRecoveryMs: null,
                    currentAllowedRps: 15,
                    minStartGapMs: 350,
                    maxInFlight: 2,
                  },
                  {
                    atMs: Date.parse('2026-05-08T14:11:00.000Z'),
                    event: 'throttle',
                    profileId: 'primary',
                    endpointClass: 'polling',
                    priorityClass: 'polling',
                    state: 'throttled',
                    throttleCode: 'EGW00201',
                    recoveryAttemptCount: 0,
                    observedRecoveryMs: null,
                    currentAllowedRps: 15,
                    minStartGapMs: 548,
                    maxInFlight: 2,
                  },
                ],
              },
            })),
          },
        }),
      }),
    });

    const res = await app.inject({ method: 'GET', url: '/runtime/data-health' });
    const aimd = res.json().data.kisOutboundLimiter.aimd;

    expect(res.statusCode).toBe(200);
    expect(aimd.observationWindow).toMatchObject({
      classification: 'regular_market',
      completedPollingCycles: 2,
      throttleCount: 1,
    });
    expect(aimd.lastDecision).toMatchObject({
      action: 'keep',
      reason: 'single_throttle_observed',
      currentPollingMinStartGapMs: 548,
      proposedPollingMinStartGapMs: 548,
      applyRuntimeChange: false,
    });
  });

  it('uses polling scheduler cycle count for AIMD diagnostics', async () => {
    const app = await build({
      runtimeRef: runtimeRef({
        status: 'started',
        runtime: startedRuntime({
          marketPhase: 'open',
          pollingStatus: {
            cycleCount: 1,
          },
          governorAimd: {
            snapshot: vi.fn(() => ({
              enabled: true,
              mode: 'observe_only',
              currentPollingMinStartGapMs: 350,
              baselinePollingMinStartGapMs: 350,
              lastAdjustmentAtMs: null,
              lastAdjustmentDirection: 'none',
              lastAdjustmentReason: null,
              nextEvaluationAtMs: null,
              cleanRegularMarketWindowCount: 0,
              degradedWindowCount: 0,
              rollbackBaseline: {
                pollingMinStartGapMs: 350,
                pollingRecoveryRatePerSec: 3,
              },
            })),
          },
          outboundLimiter: {
            acquire: vi.fn(async () => undefined),
            recordFailure: vi.fn(),
            recordSuccess: vi.fn(),
            snapshot: vi.fn(() => ({
              ratePerSec: 15,
              burst: 15,
              tokens: 10,
              profiles: [],
              telemetry: {
                capacity: 10,
                eventCount: 2,
                recent: [
                  {
                    atMs: Date.parse('2026-05-08T14:00:00.000Z'),
                    event: 'throttle',
                    profileId: 'primary',
                    endpointClass: 'polling',
                    priorityClass: 'polling',
                    state: 'throttled',
                    throttleCode: 'EGW00201',
                    recoveryAttemptCount: 0,
                    observedRecoveryMs: null,
                    currentAllowedRps: 15,
                    minStartGapMs: 350,
                    maxInFlight: 2,
                  },
                  {
                    atMs: Date.parse('2026-05-08T14:10:00.000Z'),
                    event: 'throttle',
                    profileId: 'primary',
                    endpointClass: 'polling',
                    priorityClass: 'polling',
                    state: 'throttled',
                    throttleCode: 'EGW00201',
                    recoveryAttemptCount: 0,
                    observedRecoveryMs: null,
                    currentAllowedRps: 15,
                    minStartGapMs: 350,
                    maxInFlight: 2,
                  },
                ],
              },
            })),
          },
        }),
      }),
    });

    const res = await app.inject({ method: 'GET', url: '/runtime/data-health' });
    const aimd = res.json().data.kisOutboundLimiter.aimd;

    expect(res.statusCode).toBe(200);
    expect(aimd.observationWindow).toMatchObject({
      classification: 'regular_market',
      completedPollingCycles: 1,
      throttleCount: 2,
    });
    expect(aimd.lastDecision).toMatchObject({
      action: 'hold',
      reason: 'insufficient_polling_cycles',
      currentPollingMinStartGapMs: 350,
      proposedPollingMinStartGapMs: 350,
      applyRuntimeChange: false,
    });
  });

  it('does not summarize a pending throttle probe as normal when cooldown time has elapsed', async () => {
    const app = await build({
      runtimeRef: runtimeRef({
        status: 'started',
        runtime: startedRuntime({
          outboundLimiter: {
            acquire: vi.fn(async () => undefined),
            recordFailure: vi.fn(),
            recordSuccess: vi.fn(),
            snapshot: vi.fn(() => ({
              ratePerSec: 15,
              burst: 15,
              tokens: 12,
              queueDepth: 0,
              queuedByPriority: {},
              profiles: [
                {
                  profileId: 'primary',
                  endpointClass: 'polling',
                  priorityClass: 'polling',
                  state: 'throttled',
                  cooldownUntilMs: Date.parse('2026-05-08T14:01:00.150Z'),
                  cooldownActive: false,
                  firstLimitedAtMs: Date.parse('2026-05-08T14:01:00.000Z'),
                  lastLimitedAtMs: Date.parse('2026-05-08T14:01:00.000Z'),
                  recoveredAtMs: null,
                  observedRecoveryMs: null,
                  nextRetryAtMs: Date.parse('2026-05-08T14:01:00.150Z'),
                  circuitBreakerUntilMs: null,
                  lastThrottleCode: 'EGW00201',
                  recoveryAttemptCount: 0,
                  recentThrottleCount: 1,
                  recentSuccessCount: 0,
                  currentAllowedRps: 15,
                  minStartGapMs: 120,
                  maxInFlight: 2,
                },
              ],
            })),
          },
        }),
      }),
    });

    const res = await app.inject({ method: 'GET', url: '/runtime/data-health' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.kisOutboundLimiter.currentState).toBe('throttled');
  });
});

describe('POST /runtime/kis-governor/aimd', () => {
  it('enables active AIMD and applies the polling override without leaking state extras', async () => {
    let current = {
      ...defaultAimdState(),
      rawBody: 'SHOULD_NOT_APPEAR',
      privateDiagnostic: 'SHOULD_NOT_APPEAR',
    } as any;
    const save = vi.fn(async (next: any) => {
      current = next;
    });
    const setClassPolicyOverride = vi.fn();
    const app = await build({
      runtimeRef: runtimeRef({
        status: 'started',
        runtime: startedRuntime({
          governorAimd: {
            load: vi.fn(async () => current),
            save,
            reset: vi.fn(async () => undefined),
            snapshot: vi.fn(() => current),
          },
          outboundLimiter: {
            acquire: vi.fn(async () => undefined),
            recordFailure: vi.fn(),
            recordSuccess: vi.fn(),
            setClassPolicyOverride,
            snapshot: vi.fn(() => ({
              ratePerSec: 15,
              burst: 15,
              tokens: 15,
              profiles: [],
            })),
          },
        }),
      }),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/runtime/kis-governor/aimd',
      payload: {
        action: 'enable_active',
        pollingMinStartGapMs: 320,
        pollingRecoveryRatePerSec: 4.5,
      },
    });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      mode: 'active',
      currentPollingMinStartGapMs: 320,
      currentPollingRecoveryRatePerSec: 4.5,
      nextEvaluationAtMs: null,
      cleanRegularMarketWindowCount: 0,
      degradedWindowCount: 0,
    }));
    expect(setClassPolicyOverride).toHaveBeenCalledWith('polling', {
      minStartGapMs: 320,
      recoveryRatePerSec: 4.5,
    });
    expect(body.data.aimd).toMatchObject({
      enabled: true,
      mode: 'active',
      currentPollingMinStartGapMs: 320,
      currentPollingRecoveryRatePerSec: 4.5,
      nextEvaluationAt: null,
    });
    expect(JSON.stringify(body)).not.toContain('SHOULD_NOT_APPEAR');
  });

  it('rolls AIMD back to disabled defaults and clears the polling override', async () => {
    let current = {
      ...defaultAimdState(),
      enabled: true,
      mode: 'active' as const,
      currentPollingMinStartGapMs: 438,
    };
    const reset = vi.fn(async () => {
      current = defaultAimdState();
    });
    const setClassPolicyOverride = vi.fn();
    const app = await build({
      runtimeRef: runtimeRef({
        status: 'started',
        runtime: startedRuntime({
          governorAimd: {
            load: vi.fn(async () => current),
            save: vi.fn(async (next) => {
              current = next;
            }),
            reset,
            snapshot: vi.fn(() => current),
          },
          outboundLimiter: {
            acquire: vi.fn(async () => undefined),
            recordFailure: vi.fn(),
            recordSuccess: vi.fn(),
            setClassPolicyOverride,
            snapshot: vi.fn(() => ({
              ratePerSec: 15,
              burst: 15,
              tokens: 15,
              profiles: [],
            })),
          },
        }),
      }),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/runtime/kis-governor/aimd',
      payload: { action: 'rollback' },
    });

    expect(res.statusCode).toBe(200);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(setClassPolicyOverride).toHaveBeenCalledWith('polling', null);
    expect(res.json().data.aimd).toMatchObject({
      enabled: false,
      mode: 'observe_only',
      currentPollingMinStartGapMs: 350,
    });
  });

  it('rejects AIMD control when KIS runtime is not started', async () => {
    const app = await build({
      runtimeRef: runtimeRef({ status: 'unconfigured' }),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/runtime/kis-governor/aimd',
      payload: { action: 'enable_active' },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      success: false,
      error: {
        code: 'KIS_RUNTIME_NOT_READY',
        runtime: 'unconfigured',
      },
    });
  });
});

describe('runtime local backup routes', () => {
  it('exports only local user data and excludes credentials or candle payloads', async () => {
    const app = await build({
      runtimeRef: runtimeRef({ status: 'unconfigured' }),
      backupStockRepo: {
        findAll: vi.fn(() => [
          { ticker: '005930', name: '삼성전자', market: 'KOSPI' },
        ]),
        bulkUpsert: vi.fn(),
      },
      backupFavoriteRepo: {
        findAll: vi.fn(() => [
          { ticker: '005930', tier: 'realtime', addedAt: '2026-05-06T00:00:00.000Z' },
        ]),
        upsert: vi.fn(),
      },
    });

    const res = await app.inject({ method: 'GET', url: '/runtime/backup/export' });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.data).toMatchObject({
      schemaVersion: 1,
      stocks: [{ ticker: '005930', name: '삼성전자', market: 'KOSPI' }],
      favorites: [{ ticker: '005930', tier: 'realtime' }],
    });
    expect(JSON.stringify(json)).not.toContain('appSecret');
    expect(JSON.stringify(json)).not.toContain('accessToken');
    expect(JSON.stringify(json)).not.toContain('candles');
  });

  it('restores a local backup in dependency order without touching runtime secrets', async () => {
    const stockRepo = {
      findAll: vi.fn(() => []),
      bulkUpsert: vi.fn(async () => undefined),
    };
    const favoriteRepo = {
      findAll: vi.fn(() => []),
      upsert: vi.fn(),
    };
    const app = await build({
      runtimeRef: runtimeRef({ status: 'unconfigured' }),
      backupStockRepo: stockRepo,
      backupFavoriteRepo: favoriteRepo,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/runtime/backup/restore',
      payload: {
        schemaVersion: 1,
        exportedAt: '2026-05-06T01:00:00.000Z',
        stocks: [{ ticker: '005930', name: '삼성전자', market: 'KOSPI' }],
        favorites: [{ ticker: '005930', tier: 'realtime', addedAt: '2026-05-06T01:00:00.000Z' }],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      stocks: 1,
      favorites: 1,
    });
    expect(stockRepo.bulkUpsert).toHaveBeenCalledWith([
      { ticker: '005930', name: '삼성전자', market: 'KOSPI' },
    ]);
    expect(favoriteRepo.upsert).toHaveBeenCalledWith({
      ticker: '005930',
      tier: 'realtime',
      addedAt: '2026-05-06T01:00:00.000Z',
    });
  });
});

describe('GET /runtime/signals/outcomes', () => {
  it('summarizes ready and pending signal outcomes without inventing missing returns', async () => {
    const app = await build({
      runtimeRef: runtimeRef({ status: 'unconfigured' }),
      signalEventRepo: {
        summarizeGrowth: vi.fn(() => ({
          eventCount: 2,
          oldestSignalEventAt: '2026-05-06T01:00:00.000Z',
          newestSignalEventAt: '2026-05-06T02:00:00.000Z',
        })),
        listRecent: vi.fn(() => [
          {
            id: 'signal-ready',
            ticker: '005930',
            name: '삼성전자',
            signalType: 'scalp',
            source: 'realtime-momentum',
            signalPrice: 70_000,
            signalAt: '2026-05-06T01:00:00.000Z',
            baselinePrice: null,
            baselineAt: null,
            momentumPct: 1,
            momentumWindow: '30s',
            dailyChangePct: null,
            volume: null,
            volumeSurgeRatio: null,
            volumeBaselineStatus: 'collecting',
            createdAt: '2026-05-06T01:00:00.000Z',
            updatedAt: '2026-05-06T01:00:00.000Z',
          },
          {
            id: 'signal-pending',
            ticker: '000660',
            name: 'SK하이닉스',
            signalType: 'strong_scalp',
            source: 'realtime-momentum',
            signalPrice: 140_000,
            signalAt: '2026-05-06T02:00:00.000Z',
            baselinePrice: null,
            baselineAt: null,
            momentumPct: 2,
            momentumWindow: '30s',
            dailyChangePct: null,
            volume: null,
            volumeSurgeRatio: null,
            volumeBaselineStatus: 'collecting',
            createdAt: '2026-05-06T02:00:00.000Z',
            updatedAt: '2026-05-06T02:00:00.000Z',
          },
        ]),
      },
      candleRepo: {
        summarizeCoverage: vi.fn(() => []),
        findFirstCandleAtOrAfter: vi.fn((query: { ticker: string }) =>
          query.ticker === '005930'
            ? {
                ticker: '005930',
                interval: '1m',
                bucketAt: '2026-05-06T01:05:00.000Z',
                session: 'regular',
                open: 70_700,
                high: 70_700,
                low: 70_700,
                close: 70_700,
                volume: 1,
                sampleCount: 1,
                source: 'kis-time-daily',
                isPartial: false,
                createdAt: '2026-05-06T01:05:00.000Z',
                updatedAt: '2026-05-06T01:05:00.000Z',
              }
            : null,
        ),
      },
    });

    const res = await app.inject({ method: 'GET', url: '/runtime/signals/outcomes' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      totalSignals: 2,
      evaluatedSignals: 1,
      pendingSignals: 1,
      horizons: [
        {
          horizon: '5m',
          total: 2,
          ready: 1,
          pending: 1,
          averageChangePct: 1,
          bestChangePct: 1,
          worstChangePct: 1,
        },
        {
          horizon: '15m',
          total: 2,
          ready: 1,
          pending: 1,
        },
        {
          horizon: '30m',
          total: 2,
          ready: 1,
          pending: 1,
        },
      ],
    });
  });
});

describe('GET /runtime/realtime/status', () => {
  it('returns a safe disabled status when KIS runtime is not started', async () => {
    const app = await build({
      runtimeRef: runtimeRef({ status: 'unconfigured' }),
      credentialStore: credentialStore(false),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/runtime/realtime/status',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        configured: false,
        runtimeStatus: 'unconfigured',
        state: 'disabled',
        source: 'integrated',
        websocketEnabled: true,
        applyTicksToPriceStore: true,
        canApplyTicksToPriceStore: false,
        subscribedTickerCount: 0,
        subscribedTickers: [],
        reconnectAttempts: 0,
        lastConnectedAt: null,
        lastTickAt: null,
        parsedTickCount: 0,
        appliedTickCount: 0,
        ignoredStaleTickCount: 0,
        sessionLimitIgnoredCount: 0,
        parseErrorCount: 0,
        applyErrorCount: 0,
        approvalKey: { status: 'none', issuedAt: null },
      }),
    });
  });

  it('returns started runtime counters without raw approval key material', async () => {
    const rawApprovalKey = [
      'rawapprovalkey',
      '1234567890',
      '1234567890',
      '1234567890',
    ].join('');
    const runtime = {
      wsClient: {
        getStatus: vi.fn(() => ({
          state: 'connected',
          reconnectAttempts: 1,
          nextReconnectAt: null,
          lastConnectedAt: '2026-04-28T01:00:00.000Z',
          lastError: null,
          stopReason: null,
        })),
        activeSubscriptions: vi.fn(() => [
          { trId: 'H0UNCNT0', trKey: '005930' },
        ]),
      },
      bridge: {
        getStats: vi.fn(() => ({
          parsedTickCount: 12,
          appliedTickCount: 6,
          ignoredStaleTickCount: 4,
          sessionLimitIgnoredCount: 2,
          parseErrorCount: 1,
          applyErrorCount: 0,
          lastTickAt: '2026-04-28T01:00:05.000Z',
        })),
      },
      approvalIssuer: {
        getState: vi.fn(() => ({
          status: 'ready',
          issuedAt: '2026-04-28T00:59:00.000Z',
          approvalKey: rawApprovalKey,
        })),
      },
      sessionGate: createRealtimeSessionGate(),
      tierManager: {
        listFavorites: vi.fn(() => Array.from({ length: 7 }, (_, i) => ({
          ticker: String(i + 1).padStart(6, '0'),
          tier: 'realtime' as const,
          addedAt: `2026-04-28T01:0${i}:00.000Z`,
        }))),
      },
    } as unknown as KisRuntime;
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
      settingsStore: settingsStore({
        websocketEnabled: true,
        applyTicksToPriceStore: true,
      }),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/runtime/realtime/status',
    });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.data).toMatchObject({
      configured: true,
      runtimeStatus: 'started',
      state: 'connected',
      websocketEnabled: true,
      applyTicksToPriceStore: true,
      subscribedTickerCount: 1,
      subscribedTickers: ['005930'],
      reconnectAttempts: 1,
      parsedTickCount: 12,
      appliedTickCount: 6,
      ignoredStaleTickCount: 4,
      sessionLimitIgnoredCount: 2,
      parseErrorCount: 1,
      applyErrorCount: 0,
      approvalKey: {
        status: 'ready',
        issuedAt: '2026-04-28T00:59:00.000Z',
      },
      readiness: {
        cap1Ready: true,
        cap3Ready: true,
        cap5Ready: true,
        cap10RouteReady: true,
        cap10UiPathReady: true,
        cap10UiHardLimitReady: true,
        cap10UiHardLimitConditional: false,
        readyForCap20: true,
        readyForCap40: true,
        verifiedCaps: [1, 3, 5, 10, 20, 40],
        nextCandidateCap: 20,
        cap20Readiness: expect.objectContaining({
          status: 'verified',
          blockers: [],
          warnings: [],
        }),
        cap20Preview: {
          requestedCap: 20,
          effectiveCap: 20,
          candidateCount: 7,
          shortage: 13,
          tickers: [
            '000001',
            '000002',
            '000003',
            '000004',
            '000005',
            '000006',
            '000007',
          ],
          usesFavoritesOnly: true,
        },
        cap40Readiness: expect.objectContaining({
          status: 'verified',
          blockers: [],
          warnings: [],
        }),
      },
    });
    expect(body.data.readiness.warnings).not.toContain(
      'cap10_ui_hard_limit_live_burst_not_observed',
    );
    expect(body.data.readiness.blockers).not.toContain('cap20_not_verified');
    expect(body.data.readiness.blockers).not.toContain('cap40_not_verified');
    expect(JSON.stringify(body)).not.toContain(rawApprovalKey);
  });

  it('sanitizes failed runtime error text in the status response', async () => {
    const secretLike = `secretkey=${[
      'rawsecret',
      '1234567890',
      '1234567890',
    ].join('')}`;
    const app = await build({
      runtimeRef: runtimeRef({
        status: 'failed',
        error: {
          code: 'KIS_START_FAILED',
          message: `upstream rejected ${secretLike}`,
        },
      }),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/runtime/realtime/status',
    });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.data.runtimeError.message).toContain('[REDACTED]');
    expect(JSON.stringify(body)).not.toContain('rawsecret');
  });

  it('returns session gate state in the status response', async () => {
    const enabledAt = new Date(Date.now() + 60_000).toISOString();
    const expiresAt = new Date(Date.parse(enabledAt) + 60_000).toISOString();
    const sessionGate = createRealtimeSessionGate({
      now: () => enabledAt,
    });
    sessionGate.enable({
      cap: 3,
      tickers: ['005930', '000660'],
    });
    const runtime = startedRuntime({ sessionGate });
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/runtime/realtime/status',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      sessionRealtimeEnabled: true,
      sessionApplyTicksToPriceStore: true,
      sessionCap: 3,
      sessionSource: 'integrated',
      sessionEnabledAt: enabledAt,
      sessionTickers: ['005930', '000660'],
      session: expect.objectContaining({
        enabled: true,
        cap: 3,
        maxSessionMs: 60000,
        expiresAt,
        maxAppliedTicks: 15,
        maxParsedTicks: 300,
        parsedTickCountAtSessionStart: 0,
        appliedTickCountAtSessionStart: 0,
        sessionParsedTickCount: 0,
        sessionAppliedTickCount: 0,
        sessionLimitIgnoredCount: 0,
        endReason: null,
      }),
    });
  });

  it('auto-disables and disconnects when applied tick session limit is reached', async () => {
    const stopSession = vi.fn(async () => undefined);
    const pollingStop = vi.fn(async () => undefined);
    const sessionGate = createRealtimeSessionGate({
      now: () => '2026-04-28T02:00:00.000Z',
    });
    sessionGate.enable({
      cap: 1,
      tickers: ['005930'],
      enabledAt: new Date().toISOString(),
      stats: {
        parsedTickCount: 10,
        appliedTickCount: 20,
      },
    });
    const runtime = startedRuntime({
      sessionGate,
      pollingStop,
      bridge: {
        stopSession,
        getStats: vi.fn(() => ({
          parsedTickCount: 12,
          appliedTickCount: 25,
          ignoredStaleTickCount: 0,
          sessionLimitIgnoredCount: 3,
          parseErrorCount: 0,
          applyErrorCount: 0,
          lastTickAt: '2026-04-28T02:00:01.000Z',
        })),
      },
    });
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/runtime/realtime/status',
    });

    expect(res.statusCode).toBe(200);
    expect(stopSession).toHaveBeenCalledTimes(1);
    expect(pollingStop).not.toHaveBeenCalled();
    expect(res.json().data).toMatchObject({
      sessionRealtimeEnabled: false,
      session: expect.objectContaining({
        enabled: false,
        parsedTickCountAtSessionStart: 10,
        appliedTickCountAtSessionStart: 20,
        sessionParsedTickCount: 2,
        sessionAppliedTickCount: 5,
        sessionLimitIgnoredCount: 3,
        endReason: 'applied_tick_limit_reached',
      }),
      subscribedTickerCount: 0,
    });
  });

  it.each([
    {
      label: 'parsed tick',
      reason: 'parsed_tick_limit_reached',
      enabledAt: () => new Date().toISOString(),
      stats: {
        parsedTickCount: 100,
        appliedTickCount: 0,
        ignoredStaleTickCount: 0,
        sessionLimitIgnoredCount: 0,
        parseErrorCount: 0,
        applyErrorCount: 0,
        lastTickAt: '2026-04-28T02:00:01.000Z',
      },
    },
    {
      label: 'time',
      reason: 'time_limit_reached',
      enabledAt: () => new Date(Date.now() - 11_000).toISOString(),
      stats: {
        parsedTickCount: 1,
        appliedTickCount: 0,
        ignoredStaleTickCount: 0,
        sessionLimitIgnoredCount: 0,
        parseErrorCount: 0,
        applyErrorCount: 0,
        lastTickAt: '2026-04-28T02:00:01.000Z',
      },
    },
  ])('auto-disables and disconnects when $label session limit is reached', async (input) => {
    const stopSession = vi.fn(async () => undefined);
    const sessionGate = createRealtimeSessionGate();
    sessionGate.enable({
      cap: 1,
      tickers: ['005930'],
      enabledAt: input.enabledAt(),
      maxSessionMs: 10_000,
      stats: {
        parsedTickCount: 0,
        appliedTickCount: 0,
      },
    });
    const runtime = startedRuntime({
      sessionGate,
      bridge: {
        stopSession,
        getStats: vi.fn(() => input.stats),
      },
    });
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/runtime/realtime/status',
    });

    expect(res.statusCode).toBe(200);
    expect(stopSession).toHaveBeenCalledTimes(1);
    expect(res.json().data.session).toMatchObject({
      enabled: false,
      endReason: input.reason,
    });
  });
});

describe('POST /runtime/realtime/session-enable', () => {
  it('requires explicit confirmation', async () => {
    const runtime = startedRuntime();
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/runtime/realtime/session-enable',
      payload: { cap: 3, confirm: false },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('CONFIRM_REQUIRED');
  });

  it('rejects invalid caps outside the controlled cap set', async () => {
    const runtime = startedRuntime();
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
    });

    for (const cap of [0, 2, 41]) {
      const res = await app.inject({
        method: 'POST',
        url: '/runtime/realtime/session-enable',
        payload: { cap, confirm: true },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_SESSION_CAP');
    }
  });

  it('allows cap20 and cap40 sessions without exceeding the KIS hard cap', async () => {
    const applyDiff = vi.fn(async () => undefined);
    const connect = vi.fn(async () => undefined);
    const settings = settingsStore();
    const favorites = Array.from({ length: 42 }, (_, i) => ({
      ticker: String(i + 1).padStart(6, '0'),
      tier: 'realtime' as const,
      addedAt: `2026-04-28T01:${String(i).padStart(2, '0')}:00.000Z`,
    }));
    const runtime = startedRuntime({
      favorites,
      bridge: { connect, applyDiff },
    });
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
      settingsStore: settings,
    });

    const cap20 = await app.inject({
      method: 'POST',
      url: '/runtime/realtime/session-enable',
      payload: { cap: 20, confirm: true },
    });
    const cap40 = await app.inject({
      method: 'POST',
      url: '/runtime/realtime/session-enable',
      payload: { cap: 40, confirm: true },
    });

    expect(cap20.statusCode).toBe(200);
    expect(cap20.json().data).toMatchObject({
      outcome: 'enabled',
      sessionCap: 20,
      sessionMaxAppliedTicks: 100,
      sessionMaxParsedTicks: 2000,
      sessionMaxSessionMs: 90_000,
    });
    expect(cap20.json().data.sessionTickers).toHaveLength(20);
    expect(cap40.statusCode).toBe(200);
    expect(cap40.json().data).toMatchObject({
      outcome: 'enabled',
      sessionCap: 40,
      sessionMaxAppliedTicks: 200,
      sessionMaxParsedTicks: 4000,
      sessionMaxSessionMs: 120_000,
    });
    expect(cap40.json().data.sessionTickers).toHaveLength(40);
    expect(applyDiff).toHaveBeenLastCalledWith({
      subscribe: favorites.slice(0, 40).map((favorite) => favorite.ticker),
      unsubscribe: [],
    });
    expect(settings.save).not.toHaveBeenCalled();
  });

  it('returns no_candidates when there are no favorite candidates', async () => {
    const runtime = startedRuntime({ favorites: [] });
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/runtime/realtime/session-enable',
      payload: { cap: 3, confirm: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      outcome: 'no_candidates',
      sessionRealtimeEnabled: false,
    });
  });

  it('enables only favorite candidates and does not persist settings', async () => {
    const applyDiff = vi.fn(async () => undefined);
    const connect = vi.fn(async () => undefined);
    const settings = settingsStore();
    const runtime = startedRuntime({
      favorites: [
        { ticker: '005930', tier: 'realtime', addedAt: '2026-04-28T01:00:00.000Z' },
        { ticker: '000660', tier: 'polling', addedAt: '2026-04-28T01:01:00.000Z' },
      ],
      bridge: { connect, applyDiff },
    });
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
      settingsStore: settings,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/runtime/realtime/session-enable',
      payload: { cap: 10, confirm: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      outcome: 'enabled',
      sessionRealtimeEnabled: true,
      sessionCap: 10,
      sessionTickers: ['005930', '000660'],
    });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(applyDiff).toHaveBeenCalledWith({
      subscribe: ['005930', '000660'],
      unsubscribe: [],
    });
    expect(settings.save).not.toHaveBeenCalled();
  });

  it('accepts optional maxSessionMs and clamps it into the safe range', async () => {
    const settings = settingsStore();
    const runtime = startedRuntime({
      favorites: [
        { ticker: '005930', tier: 'realtime', addedAt: '2026-04-28T01:00:00.000Z' },
      ],
    });
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
      settingsStore: settings,
    });

    const low = await app.inject({
      method: 'POST',
      url: '/runtime/realtime/session-enable',
      payload: { cap: 1, confirm: true, maxSessionMs: 100 },
    });
    const high = await app.inject({
      method: 'POST',
      url: '/runtime/realtime/session-enable',
      payload: { cap: 1, confirm: true, maxSessionMs: 999_999 },
    });

    expect(low.statusCode).toBe(200);
    expect(low.json().data.sessionMaxSessionMs).toBe(10_000);
    expect(high.statusCode).toBe(200);
    expect(high.json().data.sessionMaxSessionMs).toBe(300_000);
    expect(settings.save).not.toHaveBeenCalled();
  });

  it('cleans up the session gate when bridge enable fails', async () => {
    const applyDiff = vi.fn(async () => {
      throw new Error('approval_key=synthetic');
    });
    const stopSession = vi.fn(async () => undefined);
    const sessionGate = createRealtimeSessionGate();
    const runtime = startedRuntime({
      favorites: [
        { ticker: '005930', tier: 'realtime', addedAt: '2026-04-28T01:00:00.000Z' },
      ],
      bridge: { applyDiff, stopSession },
      sessionGate,
    });
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/runtime/realtime/session-enable',
      payload: { cap: 1, confirm: true },
    });

    expect(res.statusCode).toBe(502);
    expect(res.json().error.message).toContain('[REDACTED]');
    expect(stopSession).toHaveBeenCalledTimes(1);
    expect(sessionGate.snapshot().sessionRealtimeEnabled).toBe(false);
  });
});

describe('POST /runtime/realtime/session-disable', () => {
  it('turns off session gate without stopping REST polling or persisting settings', async () => {
    const stopSession = vi.fn(async () => undefined);
    const pollingStop = vi.fn(async () => undefined);
    const settings = settingsStore();
    const sessionGate = createRealtimeSessionGate();
    sessionGate.enable({ cap: 3, tickers: ['005930'] });
    const runtime = startedRuntime({
      sessionGate,
      bridge: { stopSession },
      pollingStop,
    });
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
      settingsStore: settings,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/runtime/realtime/session-disable',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      sessionRealtimeEnabled: false,
      sessionCap: 3,
      sessionEndReason: 'operator_disabled',
    });
    expect(stopSession).toHaveBeenCalledTimes(1);
    expect(pollingStop).not.toHaveBeenCalled();
    expect(settings.save).not.toHaveBeenCalled();
  });
});

describe('POST /runtime/realtime/emergency-disable', () => {
  it('disconnects realtime, persists disabled gates, and leaves REST polling running', async () => {
    const disconnectAll = vi.fn(async () => undefined);
    const pollingStop = vi.fn(async () => undefined);
    const settings = settingsStore({
      websocketEnabled: true,
      applyTicksToPriceStore: true,
    });
    const runtime = startedRuntime({
      bridge: { disconnectAll },
      pollingStop,
    });
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
      settingsStore: settings,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/runtime/realtime/emergency-disable',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        state: 'manual-disabled',
        persistedSettingsChanged: true,
      },
    });
    expect(disconnectAll).toHaveBeenCalledTimes(1);
    expect(pollingStop).not.toHaveBeenCalled();
    expect(settings.save).toHaveBeenCalledWith(
      expect.objectContaining({
        websocketEnabled: false,
        applyTicksToPriceStore: false,
      }),
    );
  });
});
