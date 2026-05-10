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
  computeTiers,
  previewRealtimeCandidates,
  type RealtimeCandidatePreview,
} from '../realtime/tier-manager.js';
import {
  planRealtimeSessionPool,
  type RealtimeSessionPoolPlan,
} from '../realtime/realtime-session-pool.js';
import {
  createDisabledPhoneNotifier,
  type PhoneAlertInput,
  type PhoneNotifier,
} from '../notifications/phone-notifier.js';
import {
  createPhoneDeliveryLog,
  type PhoneDeliveryLog,
} from '../notifications/phone-delivery-log.js';

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
  phoneNotifier?: PhoneNotifier;
  phoneDeliveryLog?: PhoneDeliveryLog;
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

export interface RuntimeKisOutboundLimiterPayload {
  readonly configured: boolean;
  readonly currentState: string;
  readonly ratePerSec: number | null;
  readonly burst: number | null;
  readonly tokens: number | null;
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

const sessionEnableBodySchema = z.object({
  cap: z.number().int(),
  confirm: z.boolean(),
  maxSessionMs: z.number().int().optional(),
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
        kisOutboundLimiter: buildKisOutboundLimiterPayload(opts.runtimeRef.get()),
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

      const favorites = runtimeState.runtime.tierManager.listFavorites();
      const candidateTickers = computeTiers(favorites, [], parsed.data.cap)
        .realtimeTickers;
      if (candidateTickers.length === 0) {
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
        await runtimeState.runtime.bridge.applyDiff({
          subscribe: candidateTickers,
          unsubscribe: [],
        });
        scheduleSessionTimer(runtimeState.runtime, session);
      } catch (err: unknown) {
        clearSessionTimer(runtimeState.runtime);
        try {
          await runtimeState.runtime.bridge.stopSession();
        } catch {
          // Keep the reported error focused on the enable failure.
        }
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
    return reply.send({ success: true, data: result });
  });
}

function buildKisOutboundLimiterPayload(
  runtimeState: KisRuntimeState,
): RuntimeKisOutboundLimiterPayload {
  if (runtimeState.status !== 'started') {
    return {
      configured: false,
      currentState: 'unconfigured',
      ratePerSec: null,
      burst: null,
      tokens: null,
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
  const mostRestrictiveRps = profiles.length > 0
    ? Math.min(...profiles.map((profile) => profile.currentAllowedRps))
    : snapshot.ratePerSec;
  const circuitBreaker = profiles.find((profile) => profile.state === 'circuit_breaker');
  const active = profiles.find((profile) => profile.cooldownActive)
    ?? profiles.find((profile) => profile.state === 'recovering');
  return {
    configured: true,
    currentState: circuitBreaker?.state ?? active?.state ?? 'normal',
    ratePerSec: snapshot.ratePerSec,
    burst: snapshot.burst,
    tokens: snapshot.tokens,
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
    circuitBreakerUntil: circuitBreaker?.circuitBreakerUntil ?? null,
    recentThrottleCount: profiles.reduce((sum, profile) => sum + profile.recentThrottleCount, 0),
    recentSuccessCount: profiles.reduce((sum, profile) => sum + profile.recentSuccessCount, 0),
    profiles,
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

async function enforceSessionLimits(runtime: KisRuntime): Promise<void> {
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
}

function scheduleSessionTimer(
  runtime: KisRuntime,
  session: RealtimeSessionState,
): void {
  clearSessionTimer(runtime);
  if (!session.sessionRealtimeEnabled || session.sessionExpiresAt === null) return;
  const delay = Math.max(0, Date.parse(session.sessionExpiresAt) - Date.now());
  const timer = setTimeout(() => {
    void enforceSessionLimits(runtime);
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
