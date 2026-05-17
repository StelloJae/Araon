import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';

import type {
  Favorite,
  LocalBackupPayload,
  LocalRestoreResult,
  Price,
  PriceCandle,
  Stock,
  StockSignalEvent,
  StockSignalOutcome,
  StockSignalOutcomeDashboard,
  VolumeBaselineStatus,
} from '@shared/types.js';
import { WS_MAX_SUBSCRIPTIONS } from '@shared/kis-constraints.js';
import type { KisRuntimeRef, KisRuntimeState } from '../bootstrap-kis.js';
import type { KisRuntime } from '../bootstrap-kis.js';
import type { CredentialStore, KisCredentialProfileSummary } from '../credential-store.js';
import type { SettingsStore } from '../settings-store.js';
import type { MarketPhase } from '../lifecycle/market-hours-scheduler.js';
import type {
  BackgroundBackfillSchedulerSnapshot,
  BackgroundBackfillStateStore,
} from '../chart/background-backfill-scheduler.js';
import type {
  PriceCandleCoverageSummary,
  StockDisclosureGrowthSummary,
  StockNewsGrowthSummary,
  StockSignalGrowthSummary,
} from '../db/repositories.js';
import {
  NEWS_PRUNE_AFTER_DAYS,
  NEWS_STALE_AFTER_MS,
  SIGNAL_RETENTION_DAYS,
  type DataRetentionSnapshot,
} from '../maintenance/data-retention.js';
import {
  buildInactiveRealtimeOperatorStatus,
  buildRealtimeOperatorStatus,
  evaluateNxtRolloutReadiness,
  sanitizeRealtimeStatusText,
  sessionLimitEndReason,
  SESSION_REALTIME_CAPS,
  NXT_CAP20_PREVIEW_CAP,
  operatorDisableRealtimeRuntime,
  type RealtimeOperatorState,
  type RealtimeOperatorStatus,
  type RealtimeSessionState,
  type SessionRealtimeCap,
  type NxtCapReadiness,
} from '../realtime/runtime-operator.js';
import {
  previewRealtimeCandidates,
  type RealtimeCandidatePreview,
} from '../realtime/tier-manager.js';
import {
  allocateKisWsSlots,
} from '../realtime/kis-ws-slot-allocator.js';
import {
  buildKisWsSlotCandidates,
  KIS_WS_SLOT_CHURN_COOLDOWN_MS,
} from '../realtime/kis-ws-slot-candidates.js';
import type { KisWsSlotStateStore } from '../realtime/kis-ws-slot-state.js';
import {
  planRealtimeSessionPool,
  type RealtimeSessionPoolPlan,
} from '../realtime/realtime-session-pool.js';
import type { AgentEventQueue } from '../agent/agent-event-queue.js';
import type { OrderIntentService } from '../agent/order-intent-service.js';
import type { TossPortfolioPositionsPayload } from '../toss/toss-portfolio-client.js';
import {
  createDisabledPhoneNotifier,
  type PhoneAlertInput,
  type PhoneNotifier,
} from '../notifications/phone-notifier.js';
import {
  createPhoneDeliveryLog,
  type PhoneDeliveryLog,
} from '../notifications/phone-delivery-log.js';
import type {
  KisBudgetMeterSnapshot,
  KisBudgetMeterWindowSnapshot,
  KisGovernorTelemetrySnapshot,
} from '../kis/kis-outbound-limiter.js';
import {
  buildKisGovernorAimdObservation,
  type KisGovernorAimdDecision,
  type KisGovernorAimdWindow,
  type KisGovernorAimdWindowClassification,
} from '../kis/kis-governor-aimd.js';
import {
  defaultKisGovernorAimdState,
  type KisGovernorAimdStateSnapshot,
} from '../kis/kis-governor-aimd-state.js';
import { KIS_GOVERNOR_AIMD_EVALUATION_INTERVAL_MS } from '../kis/kis-governor-aimd-runtime.js';
import type {
  MarketTopMoversService,
  MarketTopMoversServiceSnapshot,
} from '../market/market-top-movers-service.js';
import type {
  MarketDataProvider,
  MarketDataProviderHealth,
} from '../market/market-data-provider.js';
import type { KisRestProfileRouterSnapshot } from '../kis/kis-rest-profile-router.js';
import type { TossFastQuoteLaneSnapshot } from '../toss/toss-fast-quote-lane.js';
import type { TossQuotePollingSnapshot } from '../toss/toss-quote-polling-service.js';
import {
  shouldAutoRefreshLegacyKisMaster,
  shouldUseLegacyKisChartFallback,
  shouldUseLegacyKisPollingFallback,
  shouldUseLegacyKisQuoteFallback,
} from '../kis/kis-legacy-fallback-policy.js';

export interface RuntimeRoutesOptions extends FastifyPluginOptions {
  runtimeRef: KisRuntimeRef;
  settingsStore: SettingsStore;
  credentialStore: CredentialStore;
  stockRepo?: { findAll(): Stock[]; bulkUpsert?(stocks: readonly Stock[]): Promise<void> | void; upsert?(stock: Stock): void };
  favoriteRepo?: { findAll(): Favorite[]; upsert?(favorite: Favorite): void };
  candleRepo?: {
    summarizeCoverage(): PriceCandleCoverageSummary[];
    findFirstCandleAtOrAfter?(query: {
      ticker: string;
      interval?: '1m' | '1d';
      at: string;
    }): PriceCandle | null;
  };
  priceStore?: { getAllPrices(): Price[] };
  backfillStateStore?: BackgroundBackfillStateStore;
  backgroundBackfill?: { snapshot(): BackgroundBackfillSchedulerSnapshot };
  signalEventRepo?: {
    summarizeGrowth(): StockSignalGrowthSummary;
    listRecent?(limit?: number): StockSignalEvent[];
  };
  newsRepo?: { summarizeGrowth(now?: Date, staleAfterMs?: number): StockNewsGrowthSummary };
  disclosureRepo?: {
    summarizeGrowth(now?: Date, staleAfterMs?: number): StockDisclosureGrowthSummary;
  };
  dataRetention?: { snapshot(): DataRetentionSnapshot };
  marketTopMoversService?: Pick<MarketTopMoversService, 'snapshot'>;
  marketDataProviders?: ReadonlyArray<Pick<MarketDataProvider, 'getHealth'>>;
  tossQuotePolling?: { snapshot(): TossQuotePollingSnapshot };
  tossFastQuoteLane?: { snapshot(): TossFastQuoteLaneSnapshot };
  phoneNotifier?: PhoneNotifier;
  phoneDeliveryLog?: PhoneDeliveryLog;
  orderIntentService?: Pick<OrderIntentService, 'snapshotPreviews'>;
  agentEventQueue?: Pick<AgentEventQueue, 'snapshot'>;
  portfolioPositions?: { snapshot(): TossPortfolioPositionsPayload | null };
  kisWsSlotState?: KisWsSlotStateStore;
  now?: () => string;
}

export interface RuntimeRealtimeStatusPayload {
  readonly configured: boolean;
  readonly runtimeStatus: KisRuntimeState['status'];
  readonly state: RealtimeOperatorState;
  readonly source: RealtimeOperatorStatus['source'];
  readonly websocketEnabled: boolean;
  readonly applyTicksToPriceStore: boolean;
  readonly canApplyTicksToPriceStore: boolean;
  readonly subscribedTickerCount: number;
  readonly subscribedTickers: readonly string[];
  readonly reconnectAttempts: number;
  readonly nextReconnectAt: string | null;
  readonly lastConnectedAt: string | null;
  readonly lastTickAt: string | null;
  readonly parsedTickCount: number;
  readonly appliedTickCount: number;
  readonly ignoredStaleTickCount: number;
  readonly sessionLimitIgnoredCount: number;
  readonly parseErrorCount: number;
  readonly applyErrorCount: number;
  readonly approvalKey: RealtimeOperatorStatus['approvalKey'];
  readonly sessionRealtimeEnabled: boolean;
  readonly sessionApplyTicksToPriceStore: boolean;
  readonly sessionCap: number | null;
  readonly sessionSource: 'integrated';
  readonly sessionEnabledAt: string | null;
  readonly sessionTickers: readonly string[];
  readonly session: RuntimeRealtimeSessionPayload;
  readonly coverage: RuntimeRealtimeCoveragePayload;
  readonly readiness: {
    readonly cap1Ready: boolean;
    readonly cap3Ready: boolean;
    readonly cap5Ready: boolean;
    readonly cap10RouteReady: boolean;
    readonly cap10UiPathReady: boolean;
    readonly cap10UiHardLimitReady: boolean;
    readonly cap10UiHardLimitConditional: boolean;
    readonly verifiedCaps: readonly number[];
    readonly nextCandidateCap: typeof NXT_CAP20_PREVIEW_CAP;
    readonly cap20Readiness: NxtCapReadiness;
    readonly cap20Preview: RealtimeCandidatePreview;
    readonly cap40Readiness: NxtCapReadiness;
    readonly readyForCap20: boolean;
    readonly readyForCap40: boolean;
    readonly blockers: readonly string[];
    readonly warnings: readonly string[];
  };
  readonly runtimeError?: {
    readonly code: string;
    readonly message: string;
  };
}

export interface RuntimeRealtimeCoveragePayload {
  readonly profileCount: number;
  readonly enabledProfileCount: number;
  readonly activeSessionCount: number;
  readonly perSessionCap: number;
  readonly totalCapacity: number;
  readonly candidateCount: number;
  readonly assignedTickerCount: number;
  readonly fallbackTickerCount: number;
  readonly sessions: readonly {
    readonly profileId: string;
    readonly label: string;
    readonly cap: number;
    readonly assignedTickerCount: number;
    readonly state: 'active' | 'planned' | 'disabled';
  }[];
}

export interface RuntimeRealtimeSessionPayload {
  readonly enabled: boolean;
  readonly applyEnabled: boolean;
  readonly cap: number | null;
  readonly source: 'integrated';
  readonly enabledAt: string | null;
  readonly tickers: readonly string[];
  readonly maxSessionMs: number;
  readonly expiresAt: string | null;
  readonly maxAppliedTicks: number | null;
  readonly maxParsedTicks: number | null;
  readonly parsedTickCountAtSessionStart: number;
  readonly appliedTickCountAtSessionStart: number;
  readonly sessionAppliedTickCount: number;
  readonly sessionParsedTickCount: number;
  readonly sessionLimitIgnoredCount: number;
  readonly parsedTickDelta: number;
  readonly appliedTickDelta: number;
  readonly endReason: RealtimeSessionState['sessionEndReason'];
}

interface RuntimeKisLegacyRestSurface {
  readonly id:
    | 'foreground-quote-fallback'
    | 'watchlist-polling-fallback'
    | 'daily-chart-fallback'
    | 'minute-chart-fallback'
    | 'master-metadata-refresh'
    | 'kis-watchlist-import';
  readonly label: string;
  readonly state: 'off' | 'available' | 'suppressed';
  readonly mode:
    | 'credentials_required'
    | 'suppressed_by_default'
    | 'explicit_opt_in'
    | 'conditional_fallback'
    | 'manual_only';
  readonly automatic: boolean;
  readonly envGate:
    | 'ARAON_KIS_QUOTE_FALLBACK_ENABLED'
    | 'ARAON_KIS_POLLING_FALLBACK_ENABLED'
    | 'ARAON_KIS_CHART_FALLBACK_ENABLED'
    | 'ARAON_KIS_MASTER_AUTO_REFRESH'
    | null;
  readonly primaryProvider: string;
  readonly reason: string;
}

interface RuntimeKisLegacyRestPayload {
  readonly role: 'optional_fallback';
  readonly accountOrderTruthSource: boolean;
  readonly liveTradingTruthSource: boolean;
  readonly realtimeRail: 'kis-ws-only';
  readonly externalCallsWithoutCredentials: boolean;
  readonly runtimeStatus: KisRuntimeState['status'];
  readonly surfaces: readonly RuntimeKisLegacyRestSurface[];
}

export interface RuntimeKisOutboundLimiterPayload {
  readonly configured: boolean;
  readonly currentState: string;
  readonly ratePerSec: number | null;
  readonly burst: number | null;
  readonly tokens: number | null;
  readonly globalMinStartGapMs: number | null;
  readonly queueDepth: number;
  readonly queuedByPriority: Readonly<Record<string, number>>;
  readonly currentAllowedRps: number | null;
  readonly lastThrottleAt: string | null;
  readonly lastThrottleClass: string | null;
  readonly lastThrottleCode: string | null;
  readonly recoveryAttemptCount: number;
  readonly circuitBreakerUntil: string | null;
  readonly recentThrottleCount: number;
  readonly recentSuccessCount: number;
  readonly budget: RuntimeKisBudgetPayload;
  readonly aimd: RuntimeKisGovernorAimdPayload;
  readonly telemetry: {
    readonly capacity: number;
    readonly eventCount: number;
    readonly oldestAt: string | null;
    readonly newestAt: string | null;
    readonly recent: readonly {
      readonly at: string | null;
      readonly event: string;
      readonly profileId: string;
      readonly endpointClass: string | null;
      readonly priorityClass: string;
      readonly state: string;
      readonly throttleCode: string | null;
      readonly recoveryAttemptCount: number;
      readonly observedRecoveryMs: number | null;
      readonly currentAllowedRps: number;
      readonly minStartGapMs: number;
      readonly maxInFlight: number;
    }[];
  };
  readonly policies: readonly {
    readonly endpointClass: string;
    readonly priorityClass: string;
    readonly minStartGapMs: number;
    readonly maxInFlight: number;
    readonly recoveryRatePerSec: number;
  }[];
  readonly profiles: readonly {
    readonly profileId: string;
    readonly endpointClass: string | null;
    readonly priorityClass: string;
    readonly state: string;
    readonly cooldownUntil: string | null;
    readonly cooldownActive: boolean;
    readonly firstLimitedAt: string | null;
    readonly lastLimitedAt: string | null;
    readonly recoveredAt: string | null;
    readonly observedRecoveryMs: number | null;
    readonly nextRetryAt: string | null;
    readonly circuitBreakerUntil: string | null;
    readonly lastThrottleCode: string | null;
    readonly recoveryAttemptCount: number;
    readonly recentThrottleCount: number;
    readonly recentSuccessCount: number;
    readonly currentAllowedRps: number;
    readonly minStartGapMs: number;
    readonly maxInFlight: number;
  }[];
}

export type RuntimeKisBudgetRiskState =
  | 'idle'
  | 'safe'
  | 'busy'
  | 'recovering'
  | 'risky'
  | 'throttled';

export interface RuntimeKisBudgetPayload {
  readonly generatedAt: string | null;
  readonly riskState: RuntimeKisBudgetRiskState;
  readonly riskLabel: string;
  readonly riskReason: string | null;
  readonly windows: {
    readonly tenSec: RuntimeKisBudgetWindowPayload;
    readonly sixtySec: RuntimeKisBudgetWindowPayload;
  };
}

export interface RuntimeKisBudgetWindowPayload {
  readonly windowMs: number;
  readonly startedCount: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly throttleCount: number;
  readonly callPerSec: number;
  readonly successPerSec: number;
  readonly failurePerMin: number;
  readonly throttlePerMin: number;
  readonly byClass: readonly {
    readonly profileId: string;
    readonly endpointClass: string | null;
    readonly priorityClass: string;
    readonly startedCount: number;
    readonly successCount: number;
    readonly failureCount: number;
    readonly throttleCount: number;
    readonly callPerSec: number;
    readonly successPerSec: number;
    readonly failurePerMin: number;
    readonly throttlePerMin: number;
    readonly queueDepth: number;
    readonly currentAllowedRps: number | null;
  }[];
}

export interface RuntimeKisRestProfilesPayload {
  readonly configured: boolean;
  readonly primaryProfileId: string | null;
  readonly profileCount: number;
  readonly eligibleProfileCount: number;
  readonly endpointPolicies: readonly {
    readonly endpointClass: string;
    readonly selection: string;
    readonly failoverEnabled: boolean;
  }[];
  readonly profiles: readonly {
    readonly profileId: string;
    readonly label: string;
    readonly isPaper: boolean;
    readonly enabled: boolean;
    readonly eligible: boolean;
    readonly ineligibleReason: string | null;
    readonly selectedCount: number;
    readonly successCount: number;
    readonly failureCount: number;
    readonly failoverFromCount: number;
    readonly failoverToCount: number;
    readonly lastSelectedAt: string | null;
    readonly lastSuccessAt: string | null;
    readonly lastFailureAt: string | null;
    readonly lastFailureKind: string | null;
    readonly lastFailureCode: string | null;
    readonly lastThrottleAt: string | null;
    readonly governorState: string;
    readonly cooldownActive: boolean;
    readonly activeEndpointClasses: readonly string[];
    readonly currentAllowedRps: number | null;
  }[];
}

export interface RuntimeTossQuotePollingPayload {
  readonly configured: boolean;
  readonly running: boolean;
  readonly enabled: boolean;
  readonly source: 'toss-public' | null;
  readonly cycleCount: number;
  readonly lastCycleMs: number;
  readonly tickersInCycle: number;
  readonly requestedCount: number;
  readonly returnedCount: number;
  readonly missingCount: number;
  readonly errorCount: number;
  readonly consecutiveFailureCount: number;
  readonly lastSuccessAt: string | null;
  readonly lastFailureAt: string | null;
  readonly lastErrorCode: string | null;
  readonly lastMessage: string | null;
  readonly intervalMs: number | null;
  readonly batchSize: number | null;
  readonly suppressingKisPolling: boolean;
}

export interface RuntimeTossFastQuoteLanePayload {
  readonly configured: boolean;
  readonly running: boolean;
  readonly enabled: boolean;
  readonly source: 'toss-fast-quote' | null;
  readonly intervalMs: number | null;
  readonly targetCap: number | null;
  readonly hardCap: number | null;
  readonly candidateCount: number;
  readonly requestedCount: number;
  readonly returnedCount: number;
  readonly acceptedCount: number;
  readonly droppedUnchangedCount: number;
  readonly droppedStaleCount: number;
  readonly droppedInvalidCount: number;
  readonly skippedInFlightCount: number;
  readonly failureCount: number;
  readonly consecutiveFailureCount: number;
  readonly backoffUntil: string | null;
  readonly lastSuccessAt: string | null;
  readonly lastFailureAt: string | null;
  readonly lastErrorCode: string | null;
  readonly lastMessage: string | null;
}

export interface RuntimeKisGovernorAimdPayload {
  readonly enabled: boolean;
  readonly mode: string;
  readonly currentPollingMinStartGapMs: number;
  readonly currentPollingRecoveryRatePerSec: number;
  readonly baselinePollingMinStartGapMs: number;
  readonly lastAdjustmentAt: string | null;
  readonly lastAdjustmentDirection: string;
  readonly lastAdjustmentReason: string | null;
  readonly nextEvaluationAt: string | null;
  readonly cleanRegularMarketWindowCount: number;
  readonly degradedWindowCount: number;
  readonly lastDecision: RuntimeKisGovernorAimdDecisionPayload | null;
  readonly observationWindow: RuntimeKisGovernorAimdWindowPayload | null;
  readonly rollbackBaseline: {
    readonly pollingMinStartGapMs: number;
    readonly pollingRecoveryRatePerSec: number;
  };
}

export interface RuntimeKisGovernorAimdDecisionPayload {
  readonly evaluatedAt: string | null;
  readonly source: 'telemetry_snapshot';
  readonly action: string;
  readonly reason: string;
  readonly currentPollingMinStartGapMs: number;
  readonly proposedPollingMinStartGapMs: number;
  readonly applyRuntimeChange: boolean;
}

export interface RuntimeKisGovernorAimdWindowPayload {
  readonly classification: string;
  readonly durationMs: number;
  readonly completedPollingCycles: number;
  readonly throttleCount: number;
  readonly circuitBreakerCount: number;
  readonly throttleImmediatelyAfterNormal: boolean;
  readonly maxRecoveryAttemptCount: number;
  readonly queueStuckAfterRecovery: boolean;
  readonly telemetryMalformed: boolean;
  readonly dataHealthDisagrees: boolean;
  readonly cleanRegularMarketWindowCount: number;
}

export interface RuntimeMarketTopMoversPayload {
  readonly configured: boolean;
  readonly status: string;
  readonly source: string | null;
  readonly sourcePhase: string | null;
  readonly sourceLabel: string | null;
  readonly sourceReason: string | null;
  readonly frozen: boolean;
  readonly lastGoodAgeMs: number | null;
  readonly partialReason: string | null;
  readonly stopReason: string | null;
  readonly rankingDiagnostics: MarketTopMoversServiceSnapshot['rankingDiagnostics'] | null;
  readonly rankingRateLimited: boolean;
  readonly lastFetchedAt: string | null;
  readonly lastGeneratedAt: string | null;
  readonly cacheAgeMs: number | null;
  readonly cacheTtlMs: number | null;
  readonly staleAfterMs: number | null;
  readonly cooldownUntil: string | null;
  readonly cooldownActive: boolean;
  readonly inflight: boolean;
  readonly lastMessage: string | null;
  readonly lastErrorCode: string | null;
  readonly coverage: MarketTopMoversServiceSnapshot['coverage'] | null;
}

const sessionEnableBodySchema = z.object({
  cap: z.number().int(),
  confirm: z.boolean(),
  maxSessionMs: z.number().int().optional(),
  currentTicker: z.string().min(1).max(16).optional(),
});

const phoneAlertBodySchema = z.object({
  ticker: z.string().min(1).max(16),
  name: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  detail: z.string().min(1).max(500),
  kind: z.enum(['fav-pct', 'rule']),
  direction: z.enum(['up', 'down']),
  changePct: z.number().finite(),
});

const deliveryLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const backupStockSchema = z.object({
  ticker: z.string().min(1).max(16),
  name: z.string().min(1).max(100),
  market: z.enum(['KOSPI', 'KOSDAQ']),
  autoSector: z.string().nullable().optional(),
  instrumentType: z.string().nullable().optional(),
});

const backupFavoriteSchema = z.object({
  ticker: z.string().min(1).max(16),
  tier: z.enum(['realtime', 'polling']),
  addedAt: z.string().min(1),
});

const localBackupPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string().min(1),
  stocks: z.array(backupStockSchema).max(5000),
  favorites: z.array(backupFavoriteSchema).max(5000),
});

const kisGovernorAimdControlBodySchema = z.object({
  action: z.enum(['enable_active', 'enable_observe_only', 'disable', 'rollback']),
  pollingMinStartGapMs: z.number().int().min(0).max(1_200).optional(),
  pollingRecoveryRatePerSec: z.number().min(0.1).max(10).optional(),
});

const sessionTimers = new WeakMap<KisRuntime, ReturnType<typeof setTimeout>>();

export async function runtimeRoutes(
  app: FastifyInstance,
  opts: RuntimeRoutesOptions,
): Promise<void> {
  const phoneNotifier = opts.phoneNotifier ?? createDisabledPhoneNotifier();
  const phoneDeliveryLog = opts.phoneDeliveryLog ?? createPhoneDeliveryLog();

  app.get('/runtime/notifications/telegram/status', async (_request, reply) => {
    return reply.send({
      success: true,
      data: phoneNotifier.status(),
    });
  });

  app.post('/runtime/notifications/telegram/test', async (_request, reply) => {
    if (!phoneNotifier.status().configured) {
      phoneDeliveryLog.record({
        type: 'test',
        status: 'skipped',
        ticker: null,
        name: null,
        title: 'Telegram 테스트 알림',
        detail: null,
        errorCode: 'NOT_CONFIGURED',
      });
      return reply.status(409).send({
        success: false,
        error: {
          code: 'PHONE_NOTIFICATION_NOT_CONFIGURED',
          message: 'Telegram 폰 알림 환경 변수가 설정되지 않았습니다.',
        },
      });
    }
    const result = await phoneNotifier.sendTest();
    if (!result.sent) {
      phoneDeliveryLog.record({
        type: 'test',
        status: 'failed',
        ticker: null,
        name: null,
        title: 'Telegram 테스트 알림',
        detail: null,
        errorCode: sanitizeRealtimeStatusText(result.reason ?? 'send_failed').toUpperCase(),
      });
      return reply.status(502).send({
        success: false,
        error: {
          code: 'PHONE_NOTIFICATION_SEND_FAILED',
          message: sanitizeRealtimeStatusText(result.reason ?? 'send_failed'),
        },
      });
    }
    phoneDeliveryLog.record({
      type: 'test',
      status: 'sent',
      ticker: null,
      name: null,
      title: 'Telegram 테스트 알림',
      detail: null,
      errorCode: null,
    });
    return reply.send({ success: true, data: result });
  });

  app.post<{ Body: z.infer<typeof phoneAlertBodySchema> }>(
    '/runtime/notifications/telegram/alert',
    async (request, reply) => {
      if (!phoneNotifier.status().configured) {
        const maybeAlert = phoneAlertBodySchema.safeParse(request.body);
        phoneDeliveryLog.record({
          type: 'alert',
          status: 'skipped',
          ticker: maybeAlert.success ? maybeAlert.data.ticker : null,
          name: maybeAlert.success ? maybeAlert.data.name : null,
          title: maybeAlert.success ? maybeAlert.data.title : 'Telegram 알림',
          detail: maybeAlert.success ? maybeAlert.data.detail : null,
          errorCode: 'NOT_CONFIGURED',
        });
        return reply.status(409).send({
          success: false,
          error: {
            code: 'PHONE_NOTIFICATION_NOT_CONFIGURED',
            message: 'Telegram 폰 알림 환경 변수가 설정되지 않았습니다.',
          },
        });
      }
      const parsed = phoneAlertBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_PHONE_NOTIFICATION_PAYLOAD' },
        });
      }
      const result = await phoneNotifier.sendAlert(parsed.data as PhoneAlertInput);
      if (!result.sent) {
        phoneDeliveryLog.record({
          type: 'alert',
          status: 'failed',
          ticker: parsed.data.ticker,
          name: parsed.data.name,
          title: parsed.data.title,
          detail: parsed.data.detail,
          errorCode: sanitizeRealtimeStatusText(result.reason ?? 'send_failed').toUpperCase(),
        });
        return reply.status(502).send({
          success: false,
          error: {
            code: 'PHONE_NOTIFICATION_SEND_FAILED',
            message: sanitizeRealtimeStatusText(result.reason ?? 'send_failed'),
          },
        });
      }
      phoneDeliveryLog.record({
        type: 'alert',
        status: 'sent',
        ticker: parsed.data.ticker,
        name: parsed.data.name,
        title: parsed.data.title,
        detail: parsed.data.detail,
        errorCode: null,
      });
      return reply.send({ success: true, data: result });
    },
  );

  app.get('/runtime/notifications/telegram/deliveries', async (request, reply) => {
    const parsed = deliveryLogQuerySchema.safeParse(request.query);
    const limit = parsed.success ? parsed.data.limit : undefined;
    return reply.send({
      success: true,
      data: {
        summary: phoneDeliveryLog.summarize(),
        items: phoneDeliveryLog.list(limit),
      },
    });
  });

  app.get('/runtime/signals/outcomes', async (_request, reply) => {
    const signals = opts.signalEventRepo?.listRecent?.(100) ?? [];
    return reply.send({
      success: true,
      data: summarizeSignalOutcomeDashboard(signals, opts.candleRepo),
    });
  });

  app.get('/runtime/backup/export', async (_request, reply) => {
    const payload = buildLocalBackupPayload(opts, new Date());
    return reply.send({ success: true, data: payload });
  });

  app.post('/runtime/backup/restore', async (request, reply) => {
    const parsed = localBackupPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_BACKUP_PAYLOAD',
          message: '백업 파일 형식이 올바르지 않습니다.',
        },
      });
    }

    if (!canRestoreLocalBackup(opts)) {
      return reply.status(503).send({
        success: false,
        error: {
          code: 'BACKUP_RESTORE_UNAVAILABLE',
          message: '로컬 백업 복원 저장소가 준비되지 않았습니다.',
        },
      });
    }

    const result = await restoreLocalBackup(opts, parsed.data as LocalBackupPayload);
    return reply.send({ success: true, data: result });
  });

  app.get('/runtime/data-health', async (_request, reply) => {
    const now = new Date();
    const settings = opts.settingsStore.snapshot();
    const backfillState =
      opts.backfillStateStore !== undefined
        ? await opts.backfillStateStore.load()
        : { budgetDateKey: null, dailyCallCount: 0, cooldownUntilMs: 0 };
    const prices = opts.priceStore?.getAllPrices() ?? [];
    const baselineCounts = countVolumeBaselineStatuses(prices);
    const signalGrowth = opts.signalEventRepo?.summarizeGrowth() ?? emptySignalGrowth();
    const newsGrowth = opts.newsRepo?.summarizeGrowth(now, NEWS_STALE_AFTER_MS)
      ?? emptyNewsGrowth();
    const disclosureGrowth = opts.disclosureRepo?.summarizeGrowth(now, NEWS_STALE_AFTER_MS)
      ?? emptyDisclosureGrowth();
    const maintenance = opts.dataRetention?.snapshot() ?? emptyMaintenance();
    const backgroundBackfill = opts.backgroundBackfill?.snapshot() ?? emptyBackgroundBackfill();
    const phoneSummary = phoneDeliveryLog.summarize();

    const tossQuoteSnapshot = opts.tossQuotePolling?.snapshot();
    const tossQuotePolling = buildTossQuotePollingPayload(tossQuoteSnapshot);
    const tossFastQuoteLane = buildTossFastQuoteLanePayload(
      opts.tossFastQuoteLane?.snapshot(),
    );
    const runtimeState = opts.runtimeRef.get();

    return reply.send({
      success: true,
      data: {
        tracking: {
          trackedCount: opts.stockRepo?.findAll().length ?? 0,
          favoriteCount: opts.favoriteRepo?.findAll().length ?? 0,
        },
        candles: opts.candleRepo?.summarizeCoverage() ?? [
          { interval: '1m', tickerCount: 0, candleCount: 0, newestBucketAt: null },
          { interval: '1d', tickerCount: 0, candleCount: 0, newestBucketAt: null },
        ],
        backfill: {
          enabled: settings.backgroundDailyBackfillEnabled,
          range: settings.backgroundDailyBackfillRange,
          running: backgroundBackfill.running,
          lastRunAt: backgroundBackfill.lastRunAt,
          lastFinishedAt: backgroundBackfill.lastFinishedAt,
          lastAttempted: backgroundBackfill.lastAttempted,
          lastSucceeded: backgroundBackfill.lastSucceeded,
          lastFailed: backgroundBackfill.lastFailed,
          lastSkippedReason: backgroundBackfill.lastSkippedReason,
          budgetDateKey: backfillState.budgetDateKey,
          dailyCallCount: backfillState.dailyCallCount,
          dailyCallBudget: null,
          cooldownUntil: backfillState.cooldownUntilMs > 0
            ? new Date(backfillState.cooldownUntilMs).toISOString()
            : null,
          cooldownActive: backfillState.cooldownUntilMs > Date.now(),
          noWorkCooldownCount: backgroundBackfill.noWorkCooldownCount,
          nextNoWorkRetryAt: backgroundBackfill.nextNoWorkRetryAt,
          recent: backgroundBackfill.recent,
        },
        kisLegacyRest: buildKisLegacyRestPayload(runtimeState, tossQuoteSnapshot),
        kisOutboundLimiter: buildKisOutboundLimiterPayload(runtimeState),
        kisRestProfiles: buildKisRestProfilesPayload(runtimeState),
        tossQuotePolling,
        tossFastQuoteLane,
        marketDataProviders: buildMarketDataProvidersPayload(
          opts.marketDataProviders,
          runtimeState,
        ),
        marketTopMovers: buildMarketTopMoversPayload(opts.marketTopMoversService?.snapshot()),
        volumeBaseline: baselineCounts,
        growth: {
          signals: {
            ...signalGrowth,
            retentionDays: SIGNAL_RETENTION_DAYS,
          },
          news: {
            ...newsGrowth,
            ttlHours: Math.round(NEWS_STALE_AFTER_MS / (60 * 60 * 1000)),
            pruneAfterDays: NEWS_PRUNE_AFTER_DAYS,
          },
          disclosures: {
            ...disclosureGrowth,
            ttlHours: Math.round(NEWS_STALE_AFTER_MS / (60 * 60 * 1000)),
          },
        },
        notifications: {
          phoneConfigured: phoneNotifier.status().configured,
          phoneDeliveryCount: phoneSummary.total,
          phoneSentCount: phoneSummary.sent,
          phoneFailedCount: phoneSummary.failed,
          phoneSkippedCount: phoneSummary.skipped,
          phoneLastStatus: phoneSummary.lastStatus,
          phoneLastAt: phoneSummary.lastAt,
          phoneLastErrorCode: phoneSummary.lastErrorCode,
        },
        signalOutcomes: summarizeSignalOutcomeDashboard(
          opts.signalEventRepo?.listRecent?.(100) ?? [],
          opts.candleRepo,
        ),
        maintenance,
      },
    });
  });

  app.post<{ Body: z.infer<typeof kisGovernorAimdControlBodySchema> }>(
    '/runtime/kis-governor/aimd',
    async (request, reply) => {
      const parsed = kisGovernorAimdControlBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_KIS_GOVERNOR_AIMD_BODY' },
        });
      }

      const runtimeState = opts.runtimeRef.get();
      if (runtimeState.status !== 'started') {
        return reply.status(503).send({
          success: false,
          error: {
            code: 'KIS_RUNTIME_NOT_READY',
            runtime: runtimeState.status,
          },
        });
      }
      if (runtimeState.runtime.governorAimd === undefined) {
        return reply.status(503).send({
          success: false,
          error: { code: 'KIS_GOVERNOR_AIMD_UNAVAILABLE' },
        });
      }

      const nextState = await applyKisGovernorAimdControl(
        runtimeState.runtime,
        parsed.data,
      );
      const limiterSnapshot = runtimeState.runtime.outboundLimiter.snapshot();
      return reply.send({
        success: true,
        data: {
          aimd: buildKisGovernorAimdPayload(
            nextState,
            limiterSnapshot.telemetry,
            classifyAimdWindowFromMarketPhase(
              runtimeState.runtime.marketHoursScheduler.getCurrentPhase(),
            ),
            runtimeState.runtime.pollingScheduler.getStatus().cycleCount,
          ),
        },
      });
    },
  );

  app.get('/runtime/realtime/status', async (_request, reply) => {
    const configured = await isCredentialConfigured(opts.credentialStore);
    const runtimeState = opts.runtimeRef.get();
    const gates = opts.settingsStore.snapshot();
    const credentialProfiles = await listCredentialProfiles(opts.credentialStore);

    if (runtimeState.status === 'started') {
      await enforceSessionLimits(runtimeState.runtime);
      const bridgeWithSource = runtimeState.runtime.bridge as {
        getSource?: () => RealtimeOperatorStatus['source'];
      };
      const bridgeSource =
        typeof bridgeWithSource.getSource === 'function'
          ? bridgeWithSource.getSource()
          : 'integrated';
      const status = buildRealtimeOperatorStatus({
        wsStatus: runtimeState.runtime.wsClient.getStatus(),
        activeSubscriptions: runtimeState.runtime.wsClient.activeSubscriptions(),
        gates,
        session: runtimeState.runtime.sessionGate.snapshot(),
        stats: runtimeState.runtime.bridge.getStats(),
        approvalKeyState: runtimeState.runtime.approvalIssuer.getState(),
        source: bridgeSource,
      });

      return reply.send({
        success: true,
        data: toPayload(
          configured,
          runtimeState.status,
          status,
          undefined,
          runtimeState.runtime.tierManager.listFavorites(),
          credentialProfiles,
        ),
      });
    }

    const state =
      runtimeState.status === 'starting' ? 'connecting' : 'disabled';
    const status = buildInactiveRealtimeOperatorStatus(gates, state);
    const runtimeError =
      runtimeState.status === 'failed'
        ? {
            code: runtimeState.error.code,
            message: sanitizeRealtimeStatusText(runtimeState.error.message),
          }
        : undefined;

    return reply.send({
      success: true,
      data: toPayload(
        configured,
        runtimeState.status,
        status,
        runtimeError,
        [],
        credentialProfiles,
      ),
    });
  });

  app.post<{ Body: z.infer<typeof sessionEnableBodySchema> }>(
    '/runtime/realtime/session-enable',
    async (request, reply) => {
      const parsed = sessionEnableBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_SESSION_ENABLE_BODY' },
        });
      }
      if (parsed.data.confirm !== true) {
        return reply.status(400).send({
          success: false,
          error: { code: 'CONFIRM_REQUIRED' },
        });
      }
      if (!isAllowedSessionCap(parsed.data.cap)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_SESSION_CAP',
            allowedCaps: SESSION_REALTIME_CAPS,
          },
        });
      }

      const runtimeState = opts.runtimeRef.get();
      if (runtimeState.status !== 'started') {
        return reply.status(503).send({
          success: false,
          error: {
            code: 'KIS_RUNTIME_NOT_READY',
            runtime: runtimeState.status,
          },
        });
      }

      let plan: ReturnType<typeof allocateKisWsSlots>;
      try {
        const favorites = runtimeState.runtime.tierManager.listFavorites();
        const now = opts.now?.() ?? new Date().toISOString();
        const marketPhase = runtimeState.runtime.marketHoursScheduler.getCurrentPhase();
        plan = allocateKisWsSlots({
          candidates: buildKisWsSlotCandidates({
            favorites,
            portfolioSnapshot: opts.portfolioPositions?.snapshot() ?? null,
            currentTicker: parsed.data.currentTicker,
            agentEvents: opts.agentEventQueue?.snapshot(40) ?? [],
            orderIntentPreviews: opts.orderIntentService?.snapshotPreviews(40) ?? [],
            topMoverRotationCandidates:
              opts.marketTopMoversService?.snapshot().rotationCandidates ?? [],
            marketPhase,
            now,
          }),
          previousSubscribed: runtimeState.runtime.bridge.getRealtimeTickers(),
          previousSlots: opts.kisWsSlotState?.snapshot() ?? [],
          cap: parsed.data.cap,
          now,
          churnCooldownMs: KIS_WS_SLOT_CHURN_COOLDOWN_MS,
        });
      } catch {
        return reply.status(502).send({
          success: false,
          error: {
            code: 'REALTIME_SESSION_ENABLE_FAILED',
            message: 'Realtime session enable failed',
          },
        });
      }
      const candidateTickers = plan.subscribed.map((item) => item.ticker);
      if (candidateTickers.length === 0) {
        opts.kisWsSlotState?.clear();
        opts.kisWsSlotState?.recordRebalance({
          requestedAt: plan.generatedAt,
          reason: 'session-enable',
          outcome: 'no_candidates',
          activeCount: 0,
          fallbackCount: 0,
          diff: plan.diff,
        });
        runtimeState.runtime.sessionGate.disable();
        return reply.send({
          success: true,
          data: {
            outcome: 'no_candidates',
            ...runtimeState.runtime.sessionGate.snapshot(),
          },
        });
      }

      const session = runtimeState.runtime.sessionGate.enable({
        cap: parsed.data.cap,
        tickers: candidateTickers,
        stats: runtimeState.runtime.bridge.getStats(),
        ...(parsed.data.maxSessionMs !== undefined
          ? { maxSessionMs: parsed.data.maxSessionMs }
          : {}),
      });

      try {
        await runtimeState.runtime.bridge.connect();
        await runtimeState.runtime.bridge.applyDiff(plan.diff);
        opts.kisWsSlotState?.applyPlan(plan);
        opts.kisWsSlotState?.recordRebalance({
          requestedAt: plan.generatedAt,
          reason: 'session-enable',
          outcome: plan.diff.subscribe.length === 0 && plan.diff.unsubscribe.length === 0
            ? 'unchanged'
            : 'rebalanced',
          activeCount: plan.used,
          fallbackCount: plan.fallback.length,
          diff: plan.diff,
        });
        scheduleSessionTimer(runtimeState.runtime, session, opts.kisWsSlotState);
      } catch (err: unknown) {
        clearSessionTimer(runtimeState.runtime);
        try {
          await runtimeState.runtime.bridge.stopSession();
        } catch {
          // Keep the reported error focused on the enable failure.
        }
        opts.kisWsSlotState?.clear();
        runtimeState.runtime.sessionGate.disable();
        return reply.status(502).send({
          success: false,
          error: {
            code: 'REALTIME_SESSION_ENABLE_FAILED',
            message: sanitizeRealtimeStatusText(
              err instanceof Error ? err.message : String(err),
            ),
          },
        });
      }

      return reply.send({
        success: true,
        data: {
          outcome: 'enabled',
          ...session,
        },
      });
    },
  );

  app.post('/runtime/realtime/session-disable', async (_request, reply) => {
    const runtimeState = opts.runtimeRef.get();
    if (runtimeState.status !== 'started') {
      return reply.status(503).send({
        success: false,
        error: {
          code: 'KIS_RUNTIME_NOT_READY',
          runtime: runtimeState.status,
        },
      });
    }

    await runtimeState.runtime.bridge.stopSession();
    opts.kisWsSlotState?.clear();
    clearSessionTimer(runtimeState.runtime);
    const session = runtimeState.runtime.sessionGate.disable('operator_disabled');
    return reply.send({
      success: true,
      data: session,
    });
  });

  app.post('/runtime/realtime/emergency-disable', async (_request, reply) => {
    const runtimeState = opts.runtimeRef.get();
    if (runtimeState.status !== 'started') {
      const current = opts.settingsStore.snapshot();
      await opts.settingsStore.save({
        ...current,
        websocketEnabled: false,
        applyTicksToPriceStore: false,
      });
      return reply.send({
        success: true,
        data: {
          state: 'manual-disabled',
          persistedSettingsChanged: true,
        },
      });
    }

    const result = await operatorDisableRealtimeRuntime(
      {
        bridge: runtimeState.runtime.bridge,
        settingsStore: opts.settingsStore,
      },
      { persistSettings: true },
    );
    opts.kisWsSlotState?.clear();
    return reply.send({ success: true, data: result });
  });
}

function buildKisOutboundLimiterPayload(
  runtimeState: KisRuntimeState,
): RuntimeKisOutboundLimiterPayload {
  if (runtimeState.status !== 'started' || runtimeState.runtime === undefined) {
    return {
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
      budget: buildKisBudgetPayload(undefined, {
        currentState: 'unconfigured',
        queueDepth: 0,
        currentAllowedRps: null,
        lastThrottleCode: null,
        lastThrottleClass: null,
      }),
      aimd: buildKisGovernorAimdPayload(undefined, undefined),
      telemetry: buildKisGovernorTelemetryPayload(undefined),
      policies: [],
      profiles: [],
    };
  }
  const snapshot = runtimeState.runtime.outboundLimiter.snapshot();
  const profiles = snapshot.profiles.map((profile) => ({
    profileId: profile.profileId,
    endpointClass: profile.endpointClass,
    priorityClass: profile.priorityClass,
    state: profile.state,
    cooldownUntil: millisToIso(profile.cooldownUntilMs),
    cooldownActive: profile.cooldownActive,
    firstLimitedAt: millisToIso(profile.firstLimitedAtMs),
    lastLimitedAt: millisToIso(profile.lastLimitedAtMs),
    recoveredAt: millisToIso(profile.recoveredAtMs),
    observedRecoveryMs: profile.observedRecoveryMs,
    nextRetryAt: millisToIso(profile.nextRetryAtMs),
    circuitBreakerUntil: millisToIso(profile.circuitBreakerUntilMs),
    lastThrottleCode: profile.lastThrottleCode,
    recoveryAttemptCount: profile.recoveryAttemptCount,
    recentThrottleCount: profile.recentThrottleCount,
    recentSuccessCount: profile.recentSuccessCount,
    currentAllowedRps: profile.currentAllowedRps,
    minStartGapMs: profile.minStartGapMs,
    maxInFlight: profile.maxInFlight,
  }));
  const lastThrottle = profiles
    .filter((profile) => profile.lastLimitedAt !== null)
    .sort((a, b) => String(b.lastLimitedAt).localeCompare(String(a.lastLimitedAt)))[0];
  const pollingStatus = runtimeState.runtime.pollingScheduler?.getStatus?.();
  const mostRestrictiveRps = profiles.length > 0
    ? Math.min(...profiles.map((profile) => profile.currentAllowedRps))
    : snapshot.ratePerSec;
  const activeCircuitBreaker = profiles.find((profile) =>
    profile.state === 'circuit_breaker' && profile.cooldownActive
  );
  const active = profiles.find((profile) => profile.cooldownActive && profile.state !== 'circuit_breaker')
    ?? profiles.find((profile) => profile.state === 'throttled')
    ?? profiles.find((profile) => profile.state === 'half_open')
    ?? profiles.find((profile) => profile.state === 'recovering');
  const currentState = activeCircuitBreaker?.state ?? active?.state ?? 'normal';
  return {
    configured: true,
    currentState,
    ratePerSec: snapshot.ratePerSec,
    burst: snapshot.burst,
    tokens: snapshot.tokens,
    globalMinStartGapMs: snapshot.globalMinStartGapMs,
    queueDepth: snapshot.queueDepth ?? 0,
    queuedByPriority: snapshot.queuedByPriority ?? {},
    currentAllowedRps: mostRestrictiveRps,
    lastThrottleAt: lastThrottle?.lastLimitedAt ?? null,
    lastThrottleClass: lastThrottle?.priorityClass ?? null,
    lastThrottleCode: lastThrottle?.lastThrottleCode ?? null,
    recoveryAttemptCount: profiles.reduce(
      (max, profile) => Math.max(max, profile.recoveryAttemptCount),
      0,
    ),
    circuitBreakerUntil: activeCircuitBreaker?.circuitBreakerUntil ?? null,
    recentThrottleCount: profiles.reduce((sum, profile) => sum + profile.recentThrottleCount, 0),
    recentSuccessCount: profiles.reduce((sum, profile) => sum + profile.recentSuccessCount, 0),
    budget: buildKisBudgetPayload(snapshot.budget, {
      currentState,
      queueDepth: snapshot.queueDepth ?? 0,
      currentAllowedRps: mostRestrictiveRps,
      lastThrottleCode: lastThrottle?.lastThrottleCode ?? null,
      lastThrottleClass: lastThrottle?.priorityClass ?? null,
    }),
    aimd: buildKisGovernorAimdPayload(
      runtimeState.runtime.governorAimd?.snapshot(),
      snapshot.telemetry,
      classifyAimdWindowFromMarketPhase(
        runtimeState.runtime.marketHoursScheduler?.getCurrentPhase?.(),
      ),
      pollingStatus?.cycleCount,
    ),
    telemetry: buildKisGovernorTelemetryPayload(snapshot.telemetry),
    policies: (snapshot.policies ?? []).map((policy) => ({
      endpointClass: policy.endpointClass,
      priorityClass: policy.priorityClass,
      minStartGapMs: policy.minStartGapMs,
      maxInFlight: policy.maxInFlight,
      recoveryRatePerSec: policy.recoveryRatePerSec,
    })),
    profiles,
  };
}

function buildKisBudgetPayload(
  snapshot: KisBudgetMeterSnapshot | undefined,
  context: {
    currentState: string;
    queueDepth: number;
    currentAllowedRps: number | null;
    lastThrottleCode: string | null;
    lastThrottleClass: string | null;
  },
): RuntimeKisBudgetPayload {
  const tenSec = buildKisBudgetWindowPayload(snapshot?.windows.tenSec);
  const sixtySec = buildKisBudgetWindowPayload(snapshot?.windows.sixtySec);
  const risk = classifyKisBudgetRisk({
    context,
    sixtySec,
  });
  return {
    generatedAt: millisToIso(snapshot?.generatedAtMs ?? null),
    riskState: risk.riskState,
    riskLabel: risk.riskLabel,
    riskReason: risk.riskReason,
    windows: { tenSec, sixtySec },
  };
}

function buildKisBudgetWindowPayload(
  window: KisBudgetMeterWindowSnapshot | undefined,
): RuntimeKisBudgetWindowPayload {
  if (window === undefined) {
    return {
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
  }
  return {
    windowMs: window.windowMs,
    startedCount: window.startedCount,
    successCount: window.successCount,
    failureCount: window.failureCount,
    throttleCount: window.throttleCount,
    callPerSec: window.callPerSec,
    successPerSec: window.successPerSec,
    failurePerMin: window.failurePerMin,
    throttlePerMin: window.throttlePerMin,
    byClass: window.byClass.map((item) => ({
      profileId: item.profileId,
      endpointClass: item.endpointClass,
      priorityClass: item.priorityClass,
      startedCount: item.startedCount,
      successCount: item.successCount,
      failureCount: item.failureCount,
      throttleCount: item.throttleCount,
      callPerSec: item.callPerSec,
      successPerSec: item.successPerSec,
      failurePerMin: item.failurePerMin,
      throttlePerMin: item.throttlePerMin,
      queueDepth: item.queueDepth,
      currentAllowedRps: item.currentAllowedRps,
    })),
  };
}

function classifyKisBudgetRisk(input: {
  context: {
    currentState: string;
    queueDepth: number;
    currentAllowedRps: number | null;
    lastThrottleCode: string | null;
    lastThrottleClass: string | null;
  };
  sixtySec: RuntimeKisBudgetWindowPayload;
}): Pick<RuntimeKisBudgetPayload, 'riskState' | 'riskLabel' | 'riskReason'> {
  const { context, sixtySec } = input;
  if (context.currentState === 'unconfigured') {
    return { riskState: 'idle', riskLabel: 'KIS 대기', riskReason: null };
  }
  if (context.currentState === 'throttled' || context.currentState === 'circuit_breaker') {
    return {
      riskState: 'throttled',
      riskLabel: 'KIS 제한',
      riskReason: context.lastThrottleCode ?? 'throttle',
    };
  }
  if (context.currentState === 'recovering' || context.currentState === 'half_open') {
    return {
      riskState: 'recovering',
      riskLabel: 'KIS 회복중',
      riskReason: context.lastThrottleCode ?? context.currentState,
    };
  }
  if (sixtySec.throttleCount > 0 || sixtySec.throttlePerMin > 0) {
    return {
      riskState: 'risky',
      riskLabel: 'KIS 위험',
      riskReason: context.lastThrottleClass !== null
        ? `${context.lastThrottleClass} 제한`
        : '최근 요청 제한',
    };
  }
  if (context.queueDepth >= 5) {
    return {
      riskState: 'busy',
      riskLabel: 'KIS 주의',
      riskReason: `queue ${context.queueDepth}`,
    };
  }
  if (
    context.currentAllowedRps !== null
    && context.currentAllowedRps > 0
    && sixtySec.callPerSec >= context.currentAllowedRps * 0.7
  ) {
    return {
      riskState: 'busy',
      riskLabel: 'KIS 주의',
      riskReason: `${sixtySec.callPerSec.toFixed(1)}/s`,
    };
  }
  if (sixtySec.startedCount === 0) {
    return { riskState: 'idle', riskLabel: 'KIS 대기', riskReason: null };
  }
  return {
    riskState: 'safe',
    riskLabel: 'KIS 여유',
    riskReason: `${sixtySec.callPerSec.toFixed(1)}/s`,
  };
}

function buildKisRestProfilesPayload(
  runtimeState: KisRuntimeState,
): RuntimeKisRestProfilesPayload {
  if (
    runtimeState.status !== 'started'
    || runtimeState.runtime === undefined
    || runtimeState.runtime.restProfileRouter === undefined
  ) {
    return {
      configured: false,
      primaryProfileId: null,
      profileCount: 0,
      eligibleProfileCount: 0,
      endpointPolicies: [],
      profiles: [],
    };
  }
  return mapKisRestProfilesSnapshot(runtimeState.runtime.restProfileRouter.snapshot());
}

function mapKisRestProfilesSnapshot(
  snapshot: KisRestProfileRouterSnapshot,
): RuntimeKisRestProfilesPayload {
  return {
    configured: snapshot.configured,
    primaryProfileId: snapshot.primaryProfileId,
    profileCount: snapshot.profileCount,
    eligibleProfileCount: snapshot.eligibleProfileCount,
    endpointPolicies: snapshot.endpointPolicies.map((policy) => ({
      endpointClass: policy.endpointClass,
      selection: policy.selection,
      failoverEnabled: policy.failoverEnabled,
    })),
    profiles: snapshot.profiles.map((profile) => ({
      profileId: profile.profileId,
      label: profile.label,
      isPaper: profile.isPaper,
      enabled: profile.enabled,
      eligible: profile.eligible,
      ineligibleReason: profile.ineligibleReason,
      selectedCount: profile.selectedCount,
      successCount: profile.successCount,
      failureCount: profile.failureCount,
      failoverFromCount: profile.failoverFromCount,
      failoverToCount: profile.failoverToCount,
      lastSelectedAt: millisToIso(profile.lastSelectedAtMs),
      lastSuccessAt: millisToIso(profile.lastSuccessAtMs),
      lastFailureAt: millisToIso(profile.lastFailureAtMs),
      lastFailureKind: profile.lastFailureKind,
      lastFailureCode: profile.lastFailureCode,
      lastThrottleAt: millisToIso(profile.lastThrottleAtMs),
      governorState: profile.governorState,
      cooldownActive: profile.cooldownActive,
      activeEndpointClasses: profile.activeEndpointClasses,
      currentAllowedRps: profile.currentAllowedRps,
    })),
  };
}

function buildTossQuotePollingPayload(
  snapshot: TossQuotePollingSnapshot | undefined,
): RuntimeTossQuotePollingPayload {
  if (snapshot === undefined) {
    return {
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
    };
  }
  return {
    configured: true,
    running: snapshot.running,
    enabled: snapshot.enabled,
    source: snapshot.source,
    cycleCount: snapshot.cycleCount,
    lastCycleMs: snapshot.lastCycleMs,
    tickersInCycle: snapshot.tickersInCycle,
    requestedCount: snapshot.requestedCount,
    returnedCount: snapshot.returnedCount,
    missingCount: snapshot.missingCount,
    errorCount: snapshot.errorCount,
    consecutiveFailureCount: snapshot.consecutiveFailureCount,
    lastSuccessAt: snapshot.lastSuccessAt,
    lastFailureAt: snapshot.lastFailureAt,
    lastErrorCode: snapshot.lastErrorCode,
    lastMessage: snapshot.lastMessage,
    intervalMs: snapshot.intervalMs,
    batchSize: snapshot.batchSize,
    suppressingKisPolling:
      !shouldUseLegacyKisPollingFallback()
      || (snapshot.enabled && snapshot.consecutiveFailureCount < 2),
  };
}

function buildTossFastQuoteLanePayload(
  snapshot: TossFastQuoteLaneSnapshot | undefined,
): RuntimeTossFastQuoteLanePayload {
  if (snapshot === undefined) {
    return {
      configured: false,
      running: false,
      enabled: false,
      source: null,
      intervalMs: null,
      targetCap: null,
      hardCap: null,
      candidateCount: 0,
      requestedCount: 0,
      returnedCount: 0,
      acceptedCount: 0,
      droppedUnchangedCount: 0,
      droppedStaleCount: 0,
      droppedInvalidCount: 0,
      skippedInFlightCount: 0,
      failureCount: 0,
      consecutiveFailureCount: 0,
      backoffUntil: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastErrorCode: null,
      lastMessage: null,
    };
  }
  return {
    configured: true,
    running: snapshot.running,
    enabled: snapshot.enabled,
    source: snapshot.source,
    intervalMs: snapshot.intervalMs,
    targetCap: snapshot.targetCap,
    hardCap: snapshot.hardCap,
    candidateCount: snapshot.candidateCount,
    requestedCount: snapshot.requestedCount,
    returnedCount: snapshot.returnedCount,
    acceptedCount: snapshot.acceptedCount,
    droppedUnchangedCount: snapshot.droppedUnchangedCount,
    droppedStaleCount: snapshot.droppedStaleCount,
    droppedInvalidCount: snapshot.droppedInvalidCount,
    skippedInFlightCount: snapshot.skippedInFlightCount,
    failureCount: snapshot.failureCount,
    consecutiveFailureCount: snapshot.consecutiveFailureCount,
    backoffUntil: snapshot.backoffUntil,
    lastSuccessAt: snapshot.lastSuccessAt,
    lastFailureAt: snapshot.lastFailureAt,
    lastErrorCode: snapshot.lastErrorCode,
    lastMessage: snapshot.lastMessage,
  };
}

function buildKisLegacyRestPayload(
  runtimeState: KisRuntimeState,
  tossQuotePolling: TossQuotePollingSnapshot | undefined,
): RuntimeKisLegacyRestPayload {
  if (runtimeState.status !== 'started') {
    return {
      role: 'optional_fallback',
      accountOrderTruthSource: false,
      liveTradingTruthSource: false,
      realtimeRail: 'kis-ws-only',
      externalCallsWithoutCredentials: false,
      runtimeStatus: runtimeState.status,
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
    };
  }

  const pollingFallbackEnabled = shouldUseLegacyKisPollingFallback();
  const watchlistSuppressed =
    !pollingFallbackEnabled
    || (
    tossQuotePolling?.enabled === true
    && tossQuotePolling.running === true
    && tossQuotePolling.consecutiveFailureCount < 2
    );
  const watchlistFallbackReason = watchlistSuppressed
    ? pollingFallbackEnabled
      ? 'Toss quote refresh가 활성화되어 있어 watchlist REST 보조 경로는 억제됩니다.'
      : 'KIS watchlist REST 보조 경로는 기본 비활성입니다. KIS WS rail만 기본 realtime 보조 경로입니다.'
    : tossQuotePolling?.enabled === true && tossQuotePolling.consecutiveFailureCount >= 2
      ? 'Toss quote refresh가 반복 실패 중이라 KIS REST 보조 경로를 열어둡니다.'
      : 'Toss quote refresh가 비활성인 경우 사용합니다.';
  const quoteFallbackEnabled = shouldUseLegacyKisQuoteFallback();
  const quoteFallbackState = quoteFallbackEnabled ? 'available' : 'suppressed';
  const quoteFallbackMode = quoteFallbackEnabled ? 'explicit_opt_in' : 'suppressed_by_default';
  const quoteFallbackReason = quoteFallbackEnabled
    ? '명시적으로 켠 경우 Toss quote 실패 시 KIS foreground quote REST helper를 사용할 수 있습니다.'
    : 'KIS foreground quote REST helper는 기본 비활성입니다. Toss quote가 1차 시세 소스입니다.';
  const chartFallbackEnabled = shouldUseLegacyKisChartFallback();
  const chartFallbackState = chartFallbackEnabled ? 'available' : 'suppressed';
  const chartFallbackMode = chartFallbackEnabled ? 'explicit_opt_in' : 'suppressed_by_default';
  const chartFallbackReason = chartFallbackEnabled
    ? '명시적으로 켠 경우 Toss c-chart 실패 시 KIS chart REST helper를 사용할 수 있습니다.'
    : 'KIS chart REST helper는 기본 비활성입니다. Toss c-chart가 1차 차트 소스입니다.';
  const masterAutoRefreshEnabled = shouldAutoRefreshLegacyKisMaster();

  return {
    role: 'optional_fallback',
    accountOrderTruthSource: false,
    liveTradingTruthSource: false,
    realtimeRail: 'kis-ws-only',
    externalCallsWithoutCredentials: false,
    runtimeStatus: runtimeState.status,
    surfaces: [
      {
        id: 'foreground-quote-fallback',
        label: 'Foreground quote legacy REST helper',
        state: quoteFallbackState,
        mode: quoteFallbackMode,
        automatic: quoteFallbackEnabled,
        envGate: 'ARAON_KIS_QUOTE_FALLBACK_ENABLED',
        primaryProvider: 'toss-public',
        reason: quoteFallbackReason,
      },
      {
        id: 'watchlist-polling-fallback',
        label: 'Watchlist quote legacy REST helper',
        state: watchlistSuppressed ? 'suppressed' : 'available',
        mode: pollingFallbackEnabled ? 'conditional_fallback' : 'suppressed_by_default',
        automatic: !watchlistSuppressed,
        envGate: 'ARAON_KIS_POLLING_FALLBACK_ENABLED',
        primaryProvider: 'toss-public',
        reason: watchlistFallbackReason,
      },
      {
        id: 'daily-chart-fallback',
        label: 'Daily chart legacy REST helper',
        state: chartFallbackState,
        mode: chartFallbackMode,
        automatic: chartFallbackEnabled,
        envGate: 'ARAON_KIS_CHART_FALLBACK_ENABLED',
        primaryProvider: 'toss-public-c-chart',
        reason: chartFallbackReason,
      },
      {
        id: 'minute-chart-fallback',
        label: 'Minute chart legacy REST helper',
        state: chartFallbackState,
        mode: chartFallbackMode,
        automatic: chartFallbackEnabled,
        envGate: 'ARAON_KIS_CHART_FALLBACK_ENABLED',
        primaryProvider: 'toss-public-c-chart',
        reason: chartFallbackReason,
      },
      {
        id: 'master-metadata-refresh',
        label: 'Master metadata refresh',
        state: 'available',
        mode: masterAutoRefreshEnabled ? 'explicit_opt_in' : 'manual_only',
        automatic: masterAutoRefreshEnabled,
        envGate: 'ARAON_KIS_MASTER_AUTO_REFRESH',
        primaryProvider: 'local-cache+toss-search',
        reason: masterAutoRefreshEnabled
          ? '명시적으로 켠 경우 KIS master refresh를 자동 실행할 수 있습니다.'
          : '마스터 메타데이터는 로컬 캐시와 Toss 검색을 우선하며, KIS refresh는 수동 helper입니다.',
      },
      {
        id: 'kis-watchlist-import',
        label: 'KIS watchlist import',
        state: 'available',
        mode: 'manual_only',
        automatic: false,
        envGate: null,
        primaryProvider: 'toss-watchlist',
        reason: '관심종목 동기화는 Toss watchlist를 우선 사용합니다.',
      },
    ],
  };
}

function buildMarketDataProvidersPayload(
  providers: ReadonlyArray<Pick<MarketDataProvider, 'getHealth'>> | undefined,
  runtimeState: KisRuntimeState,
): MarketDataProviderHealth[] {
  return [
    ...((providers ?? []).map((provider) => sanitizeProviderHealth(provider.getHealth()))),
    buildKisLegacyProviderHealth(runtimeState),
  ];
}

function sanitizeProviderHealth(health: MarketDataProviderHealth): MarketDataProviderHealth {
  return {
    providerId: health.providerId,
    label: health.label,
    status: health.status,
    requiresAuth: health.requiresAuth,
    authenticated: health.authenticated,
    capabilities: [...health.capabilities],
    lastErrorCode: health.lastErrorCode,
    lastErrorAt: health.lastErrorAt,
    message: health.message,
  };
}

function buildKisLegacyProviderHealth(runtimeState: KisRuntimeState): MarketDataProviderHealth {
  const base = {
    providerId: 'kis-legacy' as const,
    label: 'KIS legacy REST helper',
    requiresAuth: true,
    capabilities: [
      'top-movers',
      'quote-batch',
      'trade-subscribe',
      'daily-candles',
      'stock-metadata',
    ] as const,
    lastErrorAt: null,
  };
  switch (runtimeState.status) {
    case 'started':
      return {
        ...base,
        status: 'ready',
        authenticated: true,
        lastErrorCode: null,
        message: 'KIS legacy REST helper가 준비되었습니다.',
      };
    case 'starting':
      return {
        ...base,
        status: 'degraded',
        authenticated: false,
        lastErrorCode: null,
        message: 'KIS legacy REST helper 시작 중입니다.',
      };
    case 'failed':
      return {
        ...base,
        status: 'degraded',
        authenticated: false,
        lastErrorCode: runtimeState.error.code,
        message: 'KIS legacy REST helper 시작에 실패했습니다.',
      };
    case 'unconfigured':
      return {
        ...base,
        status: 'unavailable',
        authenticated: false,
        lastErrorCode: null,
        message: 'KIS credentials가 없어 legacy REST 보조 경로는 꺼져 있습니다.',
      };
  }
}

function buildMarketTopMoversPayload(
  snapshot: MarketTopMoversServiceSnapshot | undefined,
): RuntimeMarketTopMoversPayload {
  if (snapshot === undefined) {
    return {
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
    };
  }
  return {
    configured: true,
    status: snapshot.status,
    source: snapshot.source,
    sourcePhase: snapshot.sourcePhase,
    sourceLabel: snapshot.sourceLabel,
    sourceReason: snapshot.sourceReason,
    frozen: snapshot.frozen,
    lastGoodAgeMs: snapshot.lastGoodAgeMs,
    partialReason: snapshot.partialReason,
    stopReason: snapshot.stopReason,
    rankingDiagnostics: snapshot.rankingDiagnostics,
    rankingRateLimited: snapshot.rankingRateLimited,
    lastFetchedAt: snapshot.lastFetchedAt,
    lastGeneratedAt: snapshot.lastGeneratedAt,
    cacheAgeMs: snapshot.cacheAgeMs,
    cacheTtlMs: snapshot.cacheTtlMs,
    staleAfterMs: snapshot.staleAfterMs,
    cooldownUntil: snapshot.cooldownUntil,
    cooldownActive: snapshot.cooldownActive,
    inflight: snapshot.inflight,
    lastMessage: snapshot.lastMessage,
    lastErrorCode: snapshot.lastErrorCode,
    coverage: snapshot.coverage,
  };
}

async function applyKisGovernorAimdControl(
  runtime: KisRuntime,
  input: z.infer<typeof kisGovernorAimdControlBodySchema>,
): Promise<KisGovernorAimdStateSnapshot> {
  if (runtime.governorAimd === undefined) {
    return defaultKisGovernorAimdState();
  }

  if (input.action === 'rollback') {
    await runtime.governorAimd.reset();
    runtime.outboundLimiter.setClassPolicyOverride?.('polling', null);
    return runtime.governorAimd.snapshot();
  }

  const nextState = buildControlledKisGovernorAimdState(
    runtime.governorAimd.snapshot(),
    input,
  );
  await runtime.governorAimd.save(nextState);
  if (nextState.enabled && nextState.mode === 'active') {
    runtime.outboundLimiter.setClassPolicyOverride?.('polling', {
      minStartGapMs: nextState.currentPollingMinStartGapMs,
      recoveryRatePerSec: nextState.currentPollingRecoveryRatePerSec,
    });
  } else {
    runtime.outboundLimiter.setClassPolicyOverride?.('polling', null);
  }
  return nextState;
}

function buildControlledKisGovernorAimdState(
  currentInput: KisGovernorAimdStateSnapshot,
  input: z.infer<typeof kisGovernorAimdControlBodySchema>,
): KisGovernorAimdStateSnapshot {
  const current = knownKisGovernorAimdState(currentInput);
  const requestedGap = Math.max(
    0,
    Math.trunc(input.pollingMinStartGapMs ?? current.currentPollingMinStartGapMs),
  );
  const requestedRecoveryRate = Math.max(
    0.1,
    input.pollingRecoveryRatePerSec ?? current.currentPollingRecoveryRatePerSec,
  );

  if (input.action === 'disable') {
    return {
      ...current,
      enabled: false,
      mode: 'observe_only',
      currentPollingMinStartGapMs: current.baselinePollingMinStartGapMs,
      currentPollingRecoveryRatePerSec: current.rollbackBaseline.pollingRecoveryRatePerSec,
      nextEvaluationAtMs: null,
      cleanRegularMarketWindowCount: 0,
      degradedWindowCount: 0,
      rollbackBaseline: { ...current.rollbackBaseline },
    };
  }

  return {
    ...current,
    enabled: true,
    mode: input.action === 'enable_active' ? 'active' : 'observe_only',
    currentPollingMinStartGapMs: requestedGap,
    currentPollingRecoveryRatePerSec: requestedRecoveryRate,
    nextEvaluationAtMs: null,
    cleanRegularMarketWindowCount: 0,
    degradedWindowCount: 0,
    rollbackBaseline: { ...current.rollbackBaseline },
  };
}

function knownKisGovernorAimdState(
  state: KisGovernorAimdStateSnapshot,
): KisGovernorAimdStateSnapshot {
  return {
    enabled: state.enabled,
    mode: state.mode,
    currentPollingMinStartGapMs: state.currentPollingMinStartGapMs,
    currentPollingRecoveryRatePerSec:
      state.currentPollingRecoveryRatePerSec
      ?? state.rollbackBaseline.pollingRecoveryRatePerSec,
    baselinePollingMinStartGapMs: state.baselinePollingMinStartGapMs,
    lastAdjustmentAtMs: state.lastAdjustmentAtMs,
    lastAdjustmentDirection: state.lastAdjustmentDirection,
    lastAdjustmentReason: state.lastAdjustmentReason,
    nextEvaluationAtMs: state.nextEvaluationAtMs,
    cleanRegularMarketWindowCount: state.cleanRegularMarketWindowCount,
    degradedWindowCount: state.degradedWindowCount,
    rollbackBaseline: { ...state.rollbackBaseline },
  };
}

function buildKisGovernorAimdPayload(
  state: KisGovernorAimdStateSnapshot | undefined,
  telemetry: KisGovernorTelemetrySnapshot | undefined,
  classification: KisGovernorAimdWindowClassification = 'mixed',
  pollingCycleCount?: number,
): RuntimeKisGovernorAimdPayload {
  const snapshot = state !== undefined
    ? knownKisGovernorAimdState(state)
    : defaultKisGovernorAimdState();
  const windowStartedAtMs = aimdObservationWindowStartedAtMs(snapshot);
  const observation =
    telemetry !== undefined && telemetry.recent.length > 0
      ? buildKisGovernorAimdObservation({
          state: snapshot,
          telemetry,
          ...(windowStartedAtMs !== undefined ? { windowStartedAtMs } : {}),
          classification,
          ...(pollingCycleCount !== undefined
            ? { polling: { cycleCount: pollingCycleCount } }
            : {}),
        })
      : null;
  return {
    enabled: snapshot.enabled,
    mode: snapshot.mode,
    currentPollingMinStartGapMs: snapshot.currentPollingMinStartGapMs,
    currentPollingRecoveryRatePerSec: snapshot.currentPollingRecoveryRatePerSec,
    baselinePollingMinStartGapMs: snapshot.baselinePollingMinStartGapMs,
    lastAdjustmentAt: millisToIso(snapshot.lastAdjustmentAtMs),
    lastAdjustmentDirection: snapshot.lastAdjustmentDirection,
    lastAdjustmentReason: snapshot.lastAdjustmentReason,
    nextEvaluationAt: millisToIso(snapshot.nextEvaluationAtMs),
    cleanRegularMarketWindowCount: snapshot.cleanRegularMarketWindowCount,
    degradedWindowCount: snapshot.degradedWindowCount,
    lastDecision: observation !== null
      ? buildKisGovernorAimdDecisionPayload(observation.evaluatedAtMs, observation.decision)
      : null,
    observationWindow: observation !== null
      ? buildKisGovernorAimdWindowPayload(observation.window)
      : null,
    rollbackBaseline: {
      pollingMinStartGapMs: snapshot.rollbackBaseline.pollingMinStartGapMs,
      pollingRecoveryRatePerSec: snapshot.rollbackBaseline.pollingRecoveryRatePerSec,
    },
  };
}

function aimdObservationWindowStartedAtMs(
  snapshot: KisGovernorAimdStateSnapshot,
): number | undefined {
  if (snapshot.nextEvaluationAtMs === null) return undefined;
  return Math.max(
    0,
    snapshot.nextEvaluationAtMs - KIS_GOVERNOR_AIMD_EVALUATION_INTERVAL_MS,
  );
}

function classifyAimdWindowFromMarketPhase(
  phase: MarketPhase | undefined,
): KisGovernorAimdWindowClassification {
  if (phase === 'open') return 'regular_market';
  if (phase === 'pre-open') return 'startup_warm';
  return 'mixed';
}

function buildKisGovernorAimdDecisionPayload(
  evaluatedAtMs: number,
  decision: KisGovernorAimdDecision,
): RuntimeKisGovernorAimdDecisionPayload {
  return {
    evaluatedAt: millisToIso(evaluatedAtMs),
    source: 'telemetry_snapshot',
    action: decision.action,
    reason: decision.reason,
    currentPollingMinStartGapMs: decision.currentPollingMinStartGapMs,
    proposedPollingMinStartGapMs: decision.proposedPollingMinStartGapMs,
    applyRuntimeChange: decision.applyRuntimeChange,
  };
}

function buildKisGovernorAimdWindowPayload(
  window: KisGovernorAimdWindow,
): RuntimeKisGovernorAimdWindowPayload {
  return {
    classification: window.classification,
    durationMs: window.durationMs,
    completedPollingCycles: window.completedPollingCycles,
    throttleCount: window.throttleCount,
    circuitBreakerCount: window.circuitBreakerCount,
    throttleImmediatelyAfterNormal: window.throttleImmediatelyAfterNormal,
    maxRecoveryAttemptCount: window.maxRecoveryAttemptCount,
    queueStuckAfterRecovery: window.queueStuckAfterRecovery,
    telemetryMalformed: window.telemetryMalformed,
    dataHealthDisagrees: window.dataHealthDisagrees,
    cleanRegularMarketWindowCount: window.cleanRegularMarketWindowCount,
  };
}

function buildKisGovernorTelemetryPayload(
  telemetry: KisGovernorTelemetrySnapshot | undefined,
): RuntimeKisOutboundLimiterPayload['telemetry'] {
  if (telemetry === undefined) {
    return {
      capacity: 0,
      eventCount: 0,
      oldestAt: null,
      newestAt: null,
      recent: [],
    };
  }
  const recent = telemetry.recent.map((event) => ({
    at: millisToIso(event.atMs),
    event: event.event,
    profileId: event.profileId,
    endpointClass: event.endpointClass,
    priorityClass: event.priorityClass,
    state: event.state,
    throttleCode: event.throttleCode,
    recoveryAttemptCount: event.recoveryAttemptCount,
    observedRecoveryMs: event.observedRecoveryMs,
    currentAllowedRps: event.currentAllowedRps,
    minStartGapMs: event.minStartGapMs,
    maxInFlight: event.maxInFlight,
  }));
  return {
    capacity: telemetry.capacity,
    eventCount: telemetry.eventCount,
    oldestAt: recent[0]?.at ?? null,
    newestAt: recent.at(-1)?.at ?? null,
    recent,
  };
}

function millisToIso(ms: number | null): string | null {
  return ms !== null && ms > 0 ? new Date(ms).toISOString() : null;
}

function buildLocalBackupPayload(
  opts: RuntimeRoutesOptions,
  now: Date,
): LocalBackupPayload {
  return {
    schemaVersion: 1,
    exportedAt: now.toISOString(),
    stocks: opts.stockRepo?.findAll() ?? [],
    favorites: opts.favoriteRepo?.findAll() ?? [],
  };
}

function canRestoreLocalBackup(opts: RuntimeRoutesOptions): boolean {
  const stockWritable =
    opts.stockRepo?.bulkUpsert !== undefined || opts.stockRepo?.upsert !== undefined;
  return (
    stockWritable
    && opts.favoriteRepo?.upsert !== undefined
  );
}

async function restoreLocalBackup(
  opts: RuntimeRoutesOptions,
  payload: LocalBackupPayload,
): Promise<LocalRestoreResult> {
  if (!canRestoreLocalBackup(opts)) {
    throw new Error('backup restore repositories are not writable');
  }
  if (opts.stockRepo?.bulkUpsert !== undefined) {
    await opts.stockRepo.bulkUpsert(payload.stocks);
  } else {
    for (const stock of payload.stocks) opts.stockRepo?.upsert?.(stock);
  }
  for (const favorite of payload.favorites) opts.favoriteRepo?.upsert?.(favorite);
  return {
    stocks: payload.stocks.length,
    favorites: payload.favorites.length,
  };
}

function summarizeSignalOutcomeDashboard(
  signals: readonly StockSignalEvent[],
  candleRepo: RuntimeRoutesOptions['candleRepo'],
): StockSignalOutcomeDashboard {
  const outcomes = signals.map((signal) => buildRuntimeSignalOutcomes(signal, candleRepo));
  const horizons: StockSignalOutcomeDashboard['horizons'] = (['5m', '15m', '30m'] as const).map((horizon) => {
    const bucket = outcomes.map((items) => items.find((item) => item.horizon === horizon)!);
    const ready = bucket.filter((item) => item.state === 'ready' && item.changePct !== null);
    const changes = ready.map((item) => item.changePct as number);
    return {
      horizon,
      total: bucket.length,
      ready: ready.length,
      pending: bucket.length - ready.length,
      averageChangePct:
        changes.length === 0
          ? null
          : roundPct(changes.reduce((sum, value) => sum + value, 0) / changes.length),
      bestChangePct: changes.length === 0 ? null : roundPct(Math.max(...changes)),
      worstChangePct: changes.length === 0 ? null : roundPct(Math.min(...changes)),
    };
  });
  const evaluatedSignals = outcomes.filter((items) =>
    items.some((item) => item.state === 'ready'),
  ).length;
  return {
    totalSignals: signals.length,
    evaluatedSignals,
    pendingSignals: signals.length - evaluatedSignals,
    horizons,
  };
}

function roundPct(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function buildRuntimeSignalOutcomes(
  signal: StockSignalEvent,
  candleRepo: RuntimeRoutesOptions['candleRepo'],
): StockSignalOutcome[] {
  return [
    buildRuntimeSignalOutcome(signal, candleRepo, '5m', 5),
    buildRuntimeSignalOutcome(signal, candleRepo, '15m', 15),
    buildRuntimeSignalOutcome(signal, candleRepo, '30m', 30),
  ];
}

function buildRuntimeSignalOutcome(
  signal: StockSignalEvent,
  candleRepo: RuntimeRoutesOptions['candleRepo'],
  horizon: StockSignalOutcome['horizon'],
  minutes: number,
): StockSignalOutcome {
  if (candleRepo?.findFirstCandleAtOrAfter === undefined || signal.signalPrice <= 0) {
    return { horizon, state: 'pending', price: null, changePct: null, observedAt: null };
  }
  const target = new Date(new Date(signal.signalAt).getTime() + minutes * 60_000);
  const candle = candleRepo.findFirstCandleAtOrAfter({
    ticker: signal.ticker,
    interval: '1m',
    at: target.toISOString(),
  });
  if (candle === null) {
    return { horizon, state: 'pending', price: null, changePct: null, observedAt: null };
  }
  return {
    horizon,
    state: 'ready',
    price: candle.close,
    changePct: (candle.close / signal.signalPrice - 1) * 100,
    observedAt: candle.bucketAt,
  };
}

function emptyBackgroundBackfill(): BackgroundBackfillSchedulerSnapshot {
  return {
    running: false,
    lastRunAt: null,
    lastFinishedAt: null,
    lastAttempted: 0,
    lastSucceeded: 0,
    lastFailed: 0,
    lastSkippedReason: null,
    noWorkCooldownCount: 0,
    nextNoWorkRetryAt: null,
    recent: [],
  };
}

async function isCredentialConfigured(
  credentialStore: CredentialStore,
): Promise<boolean> {
  try {
    return (await credentialStore.load()) !== null;
  } catch {
    return false;
  }
}

async function listCredentialProfiles(
  credentialStore: CredentialStore,
): Promise<KisCredentialProfileSummary[]> {
  try {
    return credentialStore.listCredentialProfiles !== undefined
      ? await credentialStore.listCredentialProfiles()
      : [];
  } catch {
    return [];
  }
}

function toPayload(
  configured: boolean,
  runtimeStatus: KisRuntimeState['status'],
  status: RealtimeOperatorStatus,
  runtimeError?: RuntimeRealtimeStatusPayload['runtimeError'],
  favorites: readonly Favorite[] = [],
  credentialProfiles: readonly KisCredentialProfileSummary[] = [],
): RuntimeRealtimeStatusPayload {
  const coverage = buildRealtimeCoverage(status, favorites, credentialProfiles);
  const readiness = evaluateNxtRolloutReadiness({
    status,
    verifiedMaxRuntimeCap: 40,
    cap10UiPathVerified: true,
    cap10UiHardLimitVerified: true,
    cap10UiHardLimitConditional: false,
    statusEndpointAvailable: true,
    statusPanelAvailable: true,
    rolloutRunbookUpdated: true,
  });
  return {
    configured,
    runtimeStatus,
    state: status.state,
    source: status.source,
    websocketEnabled: status.enabledGates.websocketEnabled,
    applyTicksToPriceStore: status.enabledGates.applyTicksToPriceStore,
    canApplyTicksToPriceStore: status.enabledGates.canApplyTicksToPriceStore,
    subscribedTickerCount: status.subscribedTickerCount,
    subscribedTickers: status.subscribedTickers,
    reconnectAttempts: status.reconnectAttempts,
    nextReconnectAt: status.nextReconnectAt,
    lastConnectedAt: status.lastConnectedAt,
    lastTickAt: status.lastTickAt,
    parsedTickCount: status.parsedTickCount,
    appliedTickCount: status.appliedTickCount,
    ignoredStaleTickCount: status.ignoredStaleTickCount,
    sessionLimitIgnoredCount: status.sessionLimitIgnoredCount,
    parseErrorCount: status.parseErrorCount,
    applyErrorCount: status.applyErrorCount,
    approvalKey: status.approvalKey,
    sessionRealtimeEnabled: status.session.sessionRealtimeEnabled,
    sessionApplyTicksToPriceStore:
      status.session.sessionApplyTicksToPriceStore,
    sessionCap: status.session.sessionCap,
    sessionSource: status.session.sessionSource,
    sessionEnabledAt: status.session.sessionEnabledAt,
    sessionTickers: status.session.sessionTickers,
    session: toSessionPayload(status.session, status),
    coverage,
    readiness: {
      ...readiness,
      cap20Preview: previewRealtimeCandidates({
        favorites,
        requestedCap: NXT_CAP20_PREVIEW_CAP,
      }),
    },
    ...(runtimeError !== undefined ? { runtimeError } : {}),
  };
}

function buildRealtimeCoverage(
  status: RealtimeOperatorStatus,
  favorites: readonly Favorite[],
  credentialProfiles: readonly KisCredentialProfileSummary[],
): RuntimeRealtimeCoveragePayload {
  const profiles =
    credentialProfiles.length > 0
      ? credentialProfiles.map((profile) => ({
          id: profile.id,
          label: profile.label,
          enabled: profile.enabled,
        }))
      : status.subscribedTickerCount > 0
        ? [{ id: 'primary', label: 'Primary KIS', enabled: true }]
        : [];
  const candidates = favorites.map((favorite) => favorite.ticker);
  const plan = planRealtimeSessionPool({
    profiles,
    candidates,
    perSessionCap: WS_MAX_SUBSCRIPTIONS,
  });
  const activeProfileIds = new Set(
    status.subscribedTickerCount > 0 ? ['primary'] : [],
  );
  return toCoveragePayload(plan, activeProfileIds);
}

function toCoveragePayload(
  plan: RealtimeSessionPoolPlan,
  activeProfileIds: ReadonlySet<string>,
): RuntimeRealtimeCoveragePayload {
  return {
    profileCount: plan.profileCount,
    enabledProfileCount: plan.enabledProfileCount,
    activeSessionCount: plan.sessions.filter((session) => activeProfileIds.has(session.profileId)).length,
    perSessionCap: plan.perSessionCap,
    totalCapacity: plan.totalCapacity,
    candidateCount: plan.candidateCount,
    assignedTickerCount: plan.assignedTickerCount,
    fallbackTickerCount: plan.fallbackTickerCount,
    sessions: plan.sessions.map((session) => ({
      profileId: session.profileId,
      label: session.label,
      cap: session.cap,
      assignedTickerCount: session.tickers.length,
      state: activeProfileIds.has(session.profileId) ? 'active' : 'planned',
    })),
  };
}

function countVolumeBaselineStatuses(prices: readonly Price[]): {
  total: number;
  ready: number;
  collecting: number;
  unavailable: number;
} {
  const counts: Record<VolumeBaselineStatus, number> = {
    ready: 0,
    collecting: 0,
    unavailable: 0,
  };
  for (const price of prices) {
    const status = price.volumeBaselineStatus ?? 'unavailable';
    counts[status] += 1;
  }
  return {
    total: prices.length,
    ready: counts.ready,
    collecting: counts.collecting,
    unavailable: counts.unavailable,
  };
}

function emptySignalGrowth(): StockSignalGrowthSummary {
  return {
    eventCount: 0,
    oldestSignalEventAt: null,
    newestSignalEventAt: null,
  };
}

function emptyNewsGrowth(): StockNewsGrowthSummary {
  return {
    itemCount: 0,
    staleItemCount: 0,
    oldestFetchedAt: null,
    newestFetchedAt: null,
    failedFetchCount: 0,
    lastFetchStatus: null,
    lastFetchErrorCode: null,
    lastFetchedAt: null,
  };
}

function emptyDisclosureGrowth(): StockDisclosureGrowthSummary {
  return {
    itemCount: 0,
    staleItemCount: 0,
    oldestFetchedAt: null,
    newestFetchedAt: null,
  };
}

function emptyMaintenance(): DataRetentionSnapshot {
  return {
    lastRunAt: null,
    candlePruneLastRunAt: null,
    candlePruneLastError: null,
  };
}

async function enforceSessionLimits(
  runtime: KisRuntime,
  kisWsSlotState?: KisWsSlotStateStore,
): Promise<void> {
  const session = runtime.sessionGate.snapshot();
  const stats = runtime.bridge.getStats();
  const reason = sessionLimitEndReason(session, {
    nowMs: Date.now(),
    parsedTickCount: stats.parsedTickCount,
    appliedTickCount: stats.appliedTickCount,
  });
  if (reason === null) return;

  clearSessionTimer(runtime);
  runtime.sessionGate.disable(reason);
  await runtime.bridge.stopSession();
  kisWsSlotState?.clear();
}

function scheduleSessionTimer(
  runtime: KisRuntime,
  session: RealtimeSessionState,
  kisWsSlotState?: KisWsSlotStateStore,
): void {
  clearSessionTimer(runtime);
  if (!session.sessionRealtimeEnabled || session.sessionExpiresAt === null) return;
  const delay = Math.max(0, Date.parse(session.sessionExpiresAt) - Date.now());
  const timer = setTimeout(() => {
    void enforceSessionLimits(runtime, kisWsSlotState);
  }, delay);
  timer.unref?.();
  sessionTimers.set(runtime, timer);
}

function clearSessionTimer(runtime: KisRuntime): void {
  const timer = sessionTimers.get(runtime);
  if (timer === undefined) return;
  clearTimeout(timer);
  sessionTimers.delete(runtime);
}

function toSessionPayload(
  session: RealtimeSessionState,
  status: RealtimeOperatorStatus,
): RuntimeRealtimeSessionPayload {
  const sessionParsedTickCount = Math.max(
    0,
    status.parsedTickCount - session.sessionStartParsedTickCount,
  );
  const sessionAppliedTickCount = Math.max(
    0,
    status.appliedTickCount - session.sessionStartAppliedTickCount,
  );
  const sessionLimitIgnoredCount = Math.max(
    0,
    status.sessionLimitIgnoredCount - session.sessionStartLimitIgnoredCount,
  );
  return {
    enabled: session.sessionRealtimeEnabled,
    applyEnabled: session.sessionApplyTicksToPriceStore,
    cap: session.sessionCap,
    source: session.sessionSource,
    enabledAt: session.sessionEnabledAt,
    tickers: session.sessionTickers,
    maxSessionMs: session.sessionMaxSessionMs,
    expiresAt: session.sessionExpiresAt,
    maxAppliedTicks: session.sessionMaxAppliedTicks,
    maxParsedTicks: session.sessionMaxParsedTicks,
    parsedTickCountAtSessionStart: session.sessionStartParsedTickCount,
    appliedTickCountAtSessionStart: session.sessionStartAppliedTickCount,
    sessionAppliedTickCount,
    sessionParsedTickCount,
    sessionLimitIgnoredCount,
    parsedTickDelta: sessionParsedTickCount,
    appliedTickDelta: sessionAppliedTickCount,
    endReason: session.sessionEndReason,
  };
}

function isAllowedSessionCap(cap: number): cap is SessionRealtimeCap {
  return SESSION_REALTIME_CAPS.includes(cap as SessionRealtimeCap);
}
