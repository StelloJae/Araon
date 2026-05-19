import { createHash } from 'node:crypto';
import type { Favorite, Stock, StockDisclosureItem, StockNewsItem } from '@shared/types.js';
import type { AgentEvent, AgentEventQueue, AgentEventType } from './agent-event-queue.js';
import type { StockNewsFeedService } from '../news/news-feed-service.js';
import type { DartDisclosureService } from '../disclosures/dart-disclosure-service.js';
import { disclosureIdentityKeys } from '../disclosures/disclosure-identity.js';

export interface AgentEventMonitorStockService {
  list(): Stock[];
}

export interface AgentEventMonitorFavoriteRepo {
  findAll(): Favorite[];
}

export interface AgentEventMonitorDisclosureRepo {
  listByTicker(ticker: string, options?: number | { limit?: number; offset?: number }): StockDisclosureItem[];
}

export interface AgentEventMonitorTossSignalItem {
  readonly id: string;
  readonly ticker: string;
  readonly source: string;
  readonly title: string;
  readonly publishedAt: string | null;
  readonly firstSeenAt: string;
  readonly relevance: number | null;
  readonly confidence: number;
  readonly isNew?: boolean;
}

export interface AgentEventMonitorTossNewsItem {
  readonly id: string;
  readonly ticker: string;
  readonly source: string;
  readonly title: string;
  readonly publishedAt: string | null;
  readonly firstSeenAt: string;
  readonly relevance: number | null;
  readonly confidence: number;
  readonly isNew?: boolean;
}

export interface AgentEventMonitorTossSignalService {
  refresh(input: { ticker: string; name: string; now: Date }): Promise<readonly AgentEventMonitorTossSignalItem[]>;
}

export interface AgentEventMonitorTossNewsService {
  refresh(input: { ticker: string; name: string; now: Date }): Promise<readonly AgentEventMonitorTossNewsItem[]>;
}

export interface AgentEventMonitorOptions {
  readonly enabled?: boolean;
  readonly intervalMs?: number;
  readonly maxTickersPerCycle?: number;
  readonly providerCooldownMs?: number;
  readonly watchSources?: readonly AgentEventMonitorWatchSource[];
  readonly stockService: AgentEventMonitorStockService;
  readonly favoriteRepo: AgentEventMonitorFavoriteRepo;
  readonly newsFeedService: Pick<StockNewsFeedService, 'refresh'>;
  readonly disclosureRepo?: AgentEventMonitorDisclosureRepo;
  readonly dartDisclosureService?: DartDisclosureService;
  readonly tossNewsService?: AgentEventMonitorTossNewsService;
  readonly tossSignalService?: AgentEventMonitorTossSignalService;
  readonly tossSignalEndpointPath?: AgentEventMonitorTossSignalEndpointPath;
  readonly agentEventQueue: AgentEventQueue;
  readonly now?: () => Date;
  readonly nowMs?: () => number;
  readonly setIntervalFn?: typeof setInterval;
  readonly clearIntervalFn?: typeof clearInterval;
}

export interface AgentEventMonitorStatus {
  readonly enabled: boolean;
  readonly running: boolean;
  readonly intervalMs: number;
  readonly maxTickersPerCycle: number;
  readonly providerCooldownMs: number;
  readonly dispatchPolicy: AgentEventMonitorDispatchPolicy;
  readonly watchPolicy: AgentEventMonitorWatchPolicy;
  readonly providers: AgentEventMonitorProviders;
  readonly providerPolicies: AgentEventMonitorProviderPolicies;
  readonly providerStates: AgentEventMonitorProviderStates;
  readonly providerObservations: AgentEventMonitorProviderObservations;
  readonly tossSignalContract: AgentEventMonitorTossSignalContract;
  readonly cycleCount: number;
  readonly watchedTickers: readonly string[];
  readonly watchedCandidates: readonly AgentEventMonitorWatchCandidate[];
  readonly lastCycleAt: string | null;
  readonly lastCycleDurationMs: number | null;
  readonly lastSkippedRefreshes: number;
  readonly lastErrorCode: string | null;
}

export type AgentEventMonitorWatchSource = 'favorite' | 'agent_event' | 'tracked';

export interface AgentEventMonitorWatchPolicy {
  readonly sources: readonly AgentEventMonitorWatchSource[];
  readonly fullMarket: false;
}

export interface AgentEventMonitorDispatchPolicy {
  readonly mode: 'best_effort_after_first_seen';
  readonly targetFirstSeenToDispatchMs: {
    readonly min: number;
    readonly max: number;
  };
  readonly providerPublicationGuarantee: false;
  readonly autoPollingRequiresOptIn: true;
  readonly fullMarketPolling: false;
}

export interface AgentEventMonitorProviders {
  readonly news: boolean;
  readonly tossNews: boolean;
  readonly tossSignal: boolean;
  readonly disclosure: boolean;
}

export interface AgentEventMonitorProviderPolicy {
  readonly enabled: boolean;
  readonly cooldownMs: number;
  readonly freshness: 'published_at_when_available';
  readonly firstSeen: 'araon_observed_at';
}

export interface AgentEventMonitorProviderPolicies {
  readonly news: AgentEventMonitorProviderPolicy;
  readonly tossNews: AgentEventMonitorProviderPolicy;
  readonly tossSignal: AgentEventMonitorProviderPolicy;
  readonly disclosure: AgentEventMonitorProviderPolicy;
}

export interface AgentEventMonitorProviderState {
  readonly enabled: boolean;
  readonly reason:
    | 'refresh-ready'
    | 'session-gated'
    | 'session-required'
    | 'request-body-template-configured'
    | 'request-body-template-missing'
    | 'dart-configured'
    | 'dart-not-configured'
    | 'disclosure-store-missing';
}

export interface AgentEventMonitorProviderStates {
  readonly news: AgentEventMonitorProviderState;
  readonly tossNews: AgentEventMonitorProviderState;
  readonly tossSignal: AgentEventMonitorProviderState;
  readonly disclosure: AgentEventMonitorProviderState;
}

export type AgentEventMonitorProviderObservationOutcome =
  | 'refreshed'
  | 'skipped_cooldown'
  | 'failed'
  | null;

export interface AgentEventMonitorProviderObservation {
  readonly lastAttemptedAt: string | null;
  readonly lastDurationMs: number | null;
  readonly lastOutcome: AgentEventMonitorProviderObservationOutcome;
  readonly lastInsertedEvents: number;
  readonly lastErrorCode: string | null;
}

export interface AgentEventMonitorProviderObservations {
  readonly news: AgentEventMonitorProviderObservation;
  readonly tossNews: AgentEventMonitorProviderObservation;
  readonly tossSignal: AgentEventMonitorProviderObservation;
  readonly disclosure: AgentEventMonitorProviderObservation;
}

export interface AgentEventMonitorTossSignalContract {
  readonly endpoint: {
    readonly method: 'POST';
    readonly host: 'wts-info-api.tossinvest.com';
    readonly path: AgentEventMonitorTossSignalEndpointPath;
  };
  readonly bodyContract: 'capture_required' | 'configured';
  readonly captureRequired: boolean;
  readonly externalCallsEnabled: boolean;
  readonly requestBodyTemplateSource: 'ARAON_TOSS_SIGNAL_REQUEST_BODY_TEMPLATE';
  readonly rawTemplateExposed: false;
  readonly shapeProbeCandidates: readonly AgentEventMonitorTossSignalShapeProbeCandidate[];
  readonly semanticPolicy: AgentEventMonitorTossSignalSemanticPolicy;
  readonly captureGuidance: AgentEventMonitorTossSignalCaptureGuidance;
  readonly reference: 'tossinvest-cli rpc-catalog';
}

export type AgentEventMonitorTossSignalEndpointPath =
  | '/api/v2/dashboard/wts/overview/signals'
  | '/api/v1/dashboard/intelligences/all';

export interface AgentEventMonitorTossSignalShapeProbeCandidate {
  readonly method: 'GET';
  readonly host:
    | 'wts-info-api.tossinvest.com'
    | 'wts-cert-api.tossinvest.com';
  readonly path: '/api/v1/trading/analysis/productCode/{productCode}';
  readonly purpose: 'shape_probe_only';
  readonly rawPayloadExposed: false;
  readonly rawSessionExposed: false;
}

export interface AgentEventMonitorTossSignalSemanticPolicy {
  readonly emptyResponse: 'supported_empty_not_actionable';
  readonly eventEmission: 'non_empty_items_only';
  readonly agentEventType: 'toss_signal_detected';
  readonly rawPayloadExposed: false;
}

export interface AgentEventMonitorTossSignalCaptureGuidance {
  readonly required: boolean;
  readonly requiresUserLoginForCapture: boolean;
  readonly requiresDevToolsForCapture: boolean;
  readonly rawTemplateExposed: false;
  readonly nextAction: 'user-assisted-capture-required' | 'configured';
}

export interface AgentEventMonitorWatchCandidate {
  readonly ticker: string;
  readonly name: string;
  readonly source: 'favorite' | 'agent_event' | 'tracked';
  readonly reason: string;
}

export interface AgentEventMonitorRunResult {
  readonly state: 'disabled' | 'completed';
  readonly reason: string;
  readonly tickers: string[];
  readonly refreshedNews: number;
  readonly refreshedTossNews: number;
  readonly refreshedTossSignals: number;
  readonly refreshedDisclosures: number;
  readonly skippedRefreshes: number;
  readonly insertedEvents: number;
}

export interface AgentEventMonitor {
  status(): AgentEventMonitorStatus;
  runOnce(reason: string): Promise<AgentEventMonitorRunResult>;
  start(): void;
  stop(): void;
}

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_MAX_TICKERS_PER_CYCLE = 5;
const DEFAULT_PROVIDER_COOLDOWN_MS = 10_000;
const DEFAULT_WATCH_SOURCES: readonly AgentEventMonitorWatchSource[] = [
  'favorite',
  'agent_event',
  'tracked',
];
const AGENT_EVENT_WATCH_TTL_MS = 10 * 60_000;
const DISPATCH_POLICY: AgentEventMonitorDispatchPolicy = {
  mode: 'best_effort_after_first_seen',
  targetFirstSeenToDispatchMs: {
    min: 10_000,
    max: 30_000,
  },
  providerPublicationGuarantee: false,
  autoPollingRequiresOptIn: true,
  fullMarketPolling: false,
};
const TOSS_SIGNAL_ENDPOINT: AgentEventMonitorTossSignalContract['endpoint'] = {
  method: 'POST',
  host: 'wts-info-api.tossinvest.com',
  path: '/api/v2/dashboard/wts/overview/signals',
};
const TOSS_SIGNAL_SHAPE_PROBE_CANDIDATES: readonly AgentEventMonitorTossSignalShapeProbeCandidate[] = [
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
];

export function createAgentEventMonitor(options: AgentEventMonitorOptions): AgentEventMonitor {
  const enabled = options.enabled === true;
  const intervalMs = clampInt(options.intervalMs ?? DEFAULT_INTERVAL_MS, 10_000, 10 * 60_000);
  const maxTickersPerCycle = clampInt(
    options.maxTickersPerCycle ?? DEFAULT_MAX_TICKERS_PER_CYCLE,
    1,
    50,
  );
  const providerCooldownMs = clampInt(
    options.providerCooldownMs ?? DEFAULT_PROVIDER_COOLDOWN_MS,
    0,
    10 * 60_000,
  );
  const watchPolicy: AgentEventMonitorWatchPolicy = {
    sources: normalizeWatchSources(options.watchSources),
    fullMarket: false,
  };
  const now = options.now ?? (() => new Date());
  const nowMs = options.nowMs ?? (() => Date.now());
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  const lastProviderRefreshByKey = new Map<string, number>();
  let providerObservations = emptyProviderObservations();
  let timer: ReturnType<typeof setInterval> | null = null;
  let runningCycle = false;
  let cycleCount = 0;
  let lastCycleAt: string | null = null;
  let lastCycleDurationMs: number | null = null;
  let lastSkippedRefreshes = 0;
  let lastErrorCode: string | null = null;

  function watchedCandidates(): AgentEventMonitorWatchCandidate[] {
    const currentNow = now();
    return selectWatchScope({
      stocks: options.stockService.list(),
      favorites: options.favoriteRepo.findAll(),
      agentEvents: options.agentEventQueue.snapshot(50),
      maxTickers: maxTickersPerCycle,
      nowMs: currentNow.getTime(),
      watchSources: watchPolicy.sources,
    });
  }

  function status(): AgentEventMonitorStatus {
    const candidates = watchedCandidates();
    const providerStates = buildProviderStates(options);
    return {
      enabled,
      running: timer !== null,
      intervalMs,
      maxTickersPerCycle,
      providerCooldownMs,
      dispatchPolicy: DISPATCH_POLICY,
      watchPolicy,
      providers: {
        news: providerStates.news.enabled,
        tossNews: providerStates.tossNews.enabled,
        tossSignal: providerStates.tossSignal.enabled,
        disclosure: providerStates.disclosure.enabled,
      },
      providerPolicies: buildProviderPolicies(providerStates, providerCooldownMs),
      providerStates,
      providerObservations: providerObservationSnapshot(providerObservations),
      tossSignalContract: buildTossSignalContract(
        providerStates.tossSignal.enabled,
        options.tossSignalEndpointPath,
      ),
      cycleCount,
      watchedTickers: candidates.map((candidate) => candidate.ticker),
      watchedCandidates: candidates,
      lastCycleAt,
      lastCycleDurationMs,
      lastSkippedRefreshes,
      lastErrorCode,
    };
  }

  async function runOnce(reason: string): Promise<AgentEventMonitorRunResult> {
    if (!enabled) {
      return {
        state: 'disabled',
        reason,
        tickers: [],
        refreshedNews: 0,
        refreshedTossNews: 0,
        refreshedTossSignals: 0,
        refreshedDisclosures: 0,
        skippedRefreshes: 0,
        insertedEvents: 0,
      };
    }
    if (runningCycle) {
      return {
        state: 'completed',
        reason,
        tickers: [],
        refreshedNews: 0,
        refreshedTossNews: 0,
        refreshedTossSignals: 0,
        refreshedDisclosures: 0,
        skippedRefreshes: 0,
        insertedEvents: 0,
      };
    }

    runningCycle = true;
    const startedMs = nowMs();
    const cycleNow = now();
    const cycleNowIso = cycleNow.toISOString();
    const cycleNowMs = cycleNow.getTime();
    const candidates = selectWatchScope({
      stocks: options.stockService.list(),
      favorites: options.favoriteRepo.findAll(),
      agentEvents: options.agentEventQueue.snapshot(50),
      maxTickers: maxTickersPerCycle,
      nowMs: cycleNowMs,
      watchSources: watchPolicy.sources,
    });
    let refreshedNews = 0;
    let refreshedTossNews = 0;
    let refreshedTossSignals = 0;
    let refreshedDisclosures = 0;
    let skippedRefreshes = 0;
    let insertedEvents = 0;

    try {
      for (const candidate of candidates) {
        if (
          claimProviderRefresh(
            lastProviderRefreshByKey,
            'news',
            candidate.ticker,
            cycleNowMs,
            providerCooldownMs,
          )
        ) {
          const providerStartedMs = nowMs();
          let news: readonly StockNewsItem[];
          try {
            news = await options.newsFeedService.refresh({
              ticker: candidate.ticker,
              name: candidate.name,
              now: cycleNow,
            });
          } catch (err: unknown) {
            recordProviderObservation(providerObservations, 'news', {
              lastAttemptedAt: cycleNowIso,
              lastDurationMs: nowMs() - providerStartedMs,
              lastOutcome: 'failed',
              lastInsertedEvents: 0,
              lastErrorCode: sanitizeMonitorError(err),
            });
            throw err;
          }
          refreshedNews += 1;
          const inserted = enqueueNews(options.agentEventQueue, news);
          insertedEvents += inserted;
          recordProviderObservation(providerObservations, 'news', {
            lastAttemptedAt: cycleNowIso,
            lastDurationMs: nowMs() - providerStartedMs,
            lastOutcome: 'refreshed',
            lastInsertedEvents: inserted,
            lastErrorCode: null,
          });
        } else {
          skippedRefreshes += 1;
          recordProviderObservation(providerObservations, 'news', {
            lastAttemptedAt: cycleNowIso,
            lastDurationMs: null,
            lastOutcome: 'skipped_cooldown',
            lastInsertedEvents: 0,
            lastErrorCode: null,
          });
        }

        if (options.tossNewsService !== undefined) {
          if (
            claimProviderRefresh(
              lastProviderRefreshByKey,
              'toss-news',
              candidate.ticker,
              cycleNowMs,
              providerCooldownMs,
            )
          ) {
            const providerStartedMs = nowMs();
            let tossNews: readonly AgentEventMonitorTossNewsItem[];
            try {
              tossNews = await options.tossNewsService.refresh({
                ticker: candidate.ticker,
                name: candidate.name,
                now: cycleNow,
              });
            } catch (err: unknown) {
              recordProviderObservation(providerObservations, 'tossNews', {
                lastAttemptedAt: cycleNowIso,
                lastDurationMs: nowMs() - providerStartedMs,
                lastOutcome: 'failed',
                lastInsertedEvents: 0,
                lastErrorCode: sanitizeMonitorError(err),
              });
              throw err;
            }
            refreshedTossNews += 1;
            const inserted = enqueueTossNews(options.agentEventQueue, tossNews);
            insertedEvents += inserted;
            recordProviderObservation(providerObservations, 'tossNews', {
              lastAttemptedAt: cycleNowIso,
              lastDurationMs: nowMs() - providerStartedMs,
              lastOutcome: 'refreshed',
              lastInsertedEvents: inserted,
              lastErrorCode: null,
            });
          } else {
            skippedRefreshes += 1;
            recordProviderObservation(providerObservations, 'tossNews', {
              lastAttemptedAt: cycleNowIso,
              lastDurationMs: null,
              lastOutcome: 'skipped_cooldown',
              lastInsertedEvents: 0,
              lastErrorCode: null,
            });
          }
        }

        if (options.tossSignalService !== undefined) {
          if (
            claimProviderRefresh(
              lastProviderRefreshByKey,
              'toss-signal',
              candidate.ticker,
              cycleNowMs,
              providerCooldownMs,
            )
          ) {
            const providerStartedMs = nowMs();
            let tossSignals: readonly AgentEventMonitorTossSignalItem[];
            try {
              tossSignals = await options.tossSignalService.refresh({
                ticker: candidate.ticker,
                name: candidate.name,
                now: cycleNow,
              });
            } catch (err: unknown) {
              recordProviderObservation(providerObservations, 'tossSignal', {
                lastAttemptedAt: cycleNowIso,
                lastDurationMs: nowMs() - providerStartedMs,
                lastOutcome: 'failed',
                lastInsertedEvents: 0,
                lastErrorCode: sanitizeMonitorError(err),
              });
              throw err;
            }
            refreshedTossSignals += 1;
            const inserted = enqueueTossSignals(options.agentEventQueue, tossSignals);
            insertedEvents += inserted;
            recordProviderObservation(providerObservations, 'tossSignal', {
              lastAttemptedAt: cycleNowIso,
              lastDurationMs: nowMs() - providerStartedMs,
              lastOutcome: 'refreshed',
              lastInsertedEvents: inserted,
              lastErrorCode: null,
            });
          } else {
            skippedRefreshes += 1;
            recordProviderObservation(providerObservations, 'tossSignal', {
              lastAttemptedAt: cycleNowIso,
              lastDurationMs: null,
              lastOutcome: 'skipped_cooldown',
              lastInsertedEvents: 0,
              lastErrorCode: null,
            });
          }
        }

        if (
          options.disclosureRepo !== undefined &&
          options.dartDisclosureService?.isConfigured() === true
        ) {
          if (
            claimProviderRefresh(
              lastProviderRefreshByKey,
              'disclosure',
              candidate.ticker,
              cycleNowMs,
              providerCooldownMs,
            )
          ) {
            const existingDisclosureKeys = new Set(
              options.disclosureRepo
                .listByTicker(candidate.ticker, 100)
                .flatMap((item) => disclosureIdentityKeys(item)),
            );
            const providerStartedMs = nowMs();
            let disclosures: readonly StockDisclosureItem[];
            try {
              disclosures = await options.dartDisclosureService.refreshTicker({
                ticker: candidate.ticker,
                now: cycleNow,
              });
            } catch (err: unknown) {
              recordProviderObservation(providerObservations, 'disclosure', {
                lastAttemptedAt: cycleNowIso,
                lastDurationMs: nowMs() - providerStartedMs,
                lastOutcome: 'failed',
                lastInsertedEvents: 0,
                lastErrorCode: sanitizeMonitorError(err),
              });
              throw err;
            }
            refreshedDisclosures += 1;
            const inserted = enqueueDisclosures(
              options.agentEventQueue,
              disclosures,
              existingDisclosureKeys,
            );
            insertedEvents += inserted;
            recordProviderObservation(providerObservations, 'disclosure', {
              lastAttemptedAt: cycleNowIso,
              lastDurationMs: nowMs() - providerStartedMs,
              lastOutcome: 'refreshed',
              lastInsertedEvents: inserted,
              lastErrorCode: null,
            });
          } else {
            skippedRefreshes += 1;
            recordProviderObservation(providerObservations, 'disclosure', {
              lastAttemptedAt: cycleNowIso,
              lastDurationMs: null,
              lastOutcome: 'skipped_cooldown',
              lastInsertedEvents: 0,
              lastErrorCode: null,
            });
          }
        }
      }
      cycleCount += 1;
      lastCycleAt = cycleNowIso;
      lastCycleDurationMs = Math.max(0, nowMs() - startedMs);
      lastSkippedRefreshes = skippedRefreshes;
      lastErrorCode = null;
      return {
        state: 'completed',
        reason,
        tickers: candidates.map((candidate) => candidate.ticker),
        refreshedNews,
        refreshedTossNews,
        refreshedTossSignals,
        refreshedDisclosures,
        skippedRefreshes,
        insertedEvents,
      };
    } catch (err: unknown) {
      lastErrorCode = sanitizeMonitorError(err);
      throw err;
    } finally {
      runningCycle = false;
    }
  }

  function start(): void {
    if (!enabled || timer !== null) return;
    timer = setIntervalFn(() => {
      void runOnce('interval').catch(() => undefined);
    }, intervalMs);
    timer.unref?.();
  }

  function stop(): void {
    if (timer === null) return;
    clearIntervalFn(timer);
    timer = null;
  }

  return { status, runOnce, start, stop };
}

type AgentEventMonitorProviderObservationKey = keyof AgentEventMonitorProviderObservations;

type MutableProviderObservations = {
  [K in AgentEventMonitorProviderObservationKey]: AgentEventMonitorProviderObservation;
};

function emptyProviderObservations(): MutableProviderObservations {
  return {
    news: emptyProviderObservation(),
    tossNews: emptyProviderObservation(),
    tossSignal: emptyProviderObservation(),
    disclosure: emptyProviderObservation(),
  };
}

function emptyProviderObservation(): AgentEventMonitorProviderObservation {
  return {
    lastAttemptedAt: null,
    lastDurationMs: null,
    lastOutcome: null,
    lastInsertedEvents: 0,
    lastErrorCode: null,
  };
}

function providerObservationSnapshot(
  observations: AgentEventMonitorProviderObservations,
): AgentEventMonitorProviderObservations {
  return {
    news: { ...observations.news },
    tossNews: { ...observations.tossNews },
    tossSignal: { ...observations.tossSignal },
    disclosure: { ...observations.disclosure },
  };
}

function recordProviderObservation(
  observations: MutableProviderObservations,
  provider: AgentEventMonitorProviderObservationKey,
  observation: AgentEventMonitorProviderObservation,
): void {
  observations[provider] = {
    lastAttemptedAt: observation.lastAttemptedAt,
    lastDurationMs: normalizeDurationMs(observation.lastDurationMs),
    lastOutcome: observation.lastOutcome,
    lastInsertedEvents: Math.max(0, Math.trunc(observation.lastInsertedEvents)),
    lastErrorCode: observation.lastErrorCode,
  };
}

function normalizeDurationMs(durationMs: number | null): number | null {
  if (durationMs === null || !Number.isFinite(durationMs)) return null;
  return Math.max(0, Math.trunc(durationMs));
}

function buildProviderStates(
  options: Pick<
    AgentEventMonitorOptions,
    'tossNewsService' | 'tossSignalService' | 'disclosureRepo' | 'dartDisclosureService'
  >,
): AgentEventMonitorProviderStates {
  return {
    news: {
      enabled: true,
      reason: 'refresh-ready',
    },
    tossNews: options.tossNewsService === undefined
      ? {
          enabled: false,
          reason: 'session-required',
        }
      : {
          enabled: true,
          reason: 'session-gated',
        },
    tossSignal: options.tossSignalService === undefined
      ? {
          enabled: false,
          reason: 'request-body-template-missing',
        }
      : {
          enabled: true,
          reason: 'request-body-template-configured',
        },
    disclosure: disclosureProviderState(options),
  };
}

function disclosureProviderState(
  options: Pick<AgentEventMonitorOptions, 'disclosureRepo' | 'dartDisclosureService'>,
): AgentEventMonitorProviderState {
  if (options.disclosureRepo === undefined) {
    return {
      enabled: false,
      reason: 'disclosure-store-missing',
    };
  }
  if (options.dartDisclosureService?.isConfigured() !== true) {
    return {
      enabled: false,
      reason: 'dart-not-configured',
    };
  }
  return {
    enabled: true,
    reason: 'dart-configured',
  };
}

function buildProviderPolicies(
  states: AgentEventMonitorProviderStates,
  cooldownMs: number,
): AgentEventMonitorProviderPolicies {
  return {
    news: providerPolicy(states.news.enabled, cooldownMs),
    tossNews: providerPolicy(states.tossNews.enabled, cooldownMs),
    tossSignal: providerPolicy(states.tossSignal.enabled, cooldownMs),
    disclosure: providerPolicy(states.disclosure.enabled, cooldownMs),
  };
}

function buildTossSignalContract(
  enabled: boolean,
  endpointPath: AgentEventMonitorTossSignalEndpointPath | undefined,
): AgentEventMonitorTossSignalContract {
  return {
    endpoint: {
      ...TOSS_SIGNAL_ENDPOINT,
      path: endpointPath ?? TOSS_SIGNAL_ENDPOINT.path,
    },
    bodyContract: enabled ? 'configured' : 'capture_required',
    captureRequired: !enabled,
    externalCallsEnabled: enabled,
    requestBodyTemplateSource: 'ARAON_TOSS_SIGNAL_REQUEST_BODY_TEMPLATE',
    rawTemplateExposed: false,
    shapeProbeCandidates: TOSS_SIGNAL_SHAPE_PROBE_CANDIDATES,
    semanticPolicy: {
      emptyResponse: 'supported_empty_not_actionable',
      eventEmission: 'non_empty_items_only',
      agentEventType: 'toss_signal_detected',
      rawPayloadExposed: false,
    },
    captureGuidance: {
      required: !enabled,
      requiresUserLoginForCapture: !enabled,
      requiresDevToolsForCapture: !enabled,
      rawTemplateExposed: false,
      nextAction: enabled ? 'configured' : 'user-assisted-capture-required',
    },
    reference: 'tossinvest-cli rpc-catalog',
  };
}

function providerPolicy(enabled: boolean, cooldownMs: number): AgentEventMonitorProviderPolicy {
  return {
    enabled,
    cooldownMs,
    freshness: 'published_at_when_available',
    firstSeen: 'araon_observed_at',
  };
}

interface WatchScopeInput {
  stocks: readonly Stock[];
  favorites: readonly Favorite[];
  agentEvents: readonly AgentEvent[];
  maxTickers: number;
  nowMs: number;
  watchSources: readonly AgentEventMonitorWatchSource[];
}

interface WatchCandidate {
  ticker: string;
  name: string;
  source: 'favorite' | 'agent_event' | 'tracked';
  reason: string;
}

function selectWatchScope(input: WatchScopeInput): WatchCandidate[] {
  const stocksByTicker = new Map(input.stocks.map((stock) => [stock.ticker, stock]));
  const selected = new Map<string, WatchCandidate>();
  const favorites = [...input.favorites].sort((a, b) => a.addedAt.localeCompare(b.addedAt));

  if (input.watchSources.includes('favorite')) {
    for (const favorite of favorites) {
      const stock = stocksByTicker.get(favorite.ticker);
      if (stock === undefined) continue;
      selected.set(stock.ticker, {
        ticker: stock.ticker,
        name: stock.name,
        source: 'favorite',
        reason: '사용자 관심종목',
      });
      if (selected.size >= input.maxTickers) return [...selected.values()];
    }
  }

  if (input.watchSources.includes('agent_event')) {
    for (const candidate of agentEventWatchCandidates(input.agentEvents, stocksByTicker, input.nowMs)) {
      if (selected.has(candidate.ticker)) continue;
      selected.set(candidate.ticker, candidate);
      if (selected.size >= input.maxTickers) return [...selected.values()];
    }
  }

  if (input.watchSources.includes('tracked')) {
    for (const stock of input.stocks) {
      if (selected.has(stock.ticker)) continue;
      selected.set(stock.ticker, {
        ticker: stock.ticker,
        name: stock.name,
        source: 'tracked',
        reason: '추적 종목 보조 후보',
      });
      if (selected.size >= input.maxTickers) return [...selected.values()];
    }
  }
  return [...selected.values()];
}

export function normalizeAgentEventMonitorWatchSources(
  value: string | undefined,
): readonly AgentEventMonitorWatchSource[] | undefined {
  if (value === undefined || value.trim().length === 0) return undefined;
  return normalizeWatchSources(
    value
      .split(',')
      .map((source) => source.trim())
      .filter((source) => source.length > 0),
  );
}

function normalizeWatchSources(
  sources: readonly string[] | undefined,
): readonly AgentEventMonitorWatchSource[] {
  if (sources === undefined || sources.length === 0) return DEFAULT_WATCH_SOURCES;
  const normalized: AgentEventMonitorWatchSource[] = [];
  for (const source of sources) {
    if (!isWatchSource(source)) continue;
    if (normalized.includes(source)) continue;
    normalized.push(source);
  }
  return normalized.length > 0 ? normalized : DEFAULT_WATCH_SOURCES;
}

function isWatchSource(value: string): value is AgentEventMonitorWatchSource {
  return value === 'favorite' || value === 'agent_event' || value === 'tracked';
}

function agentEventWatchCandidates(
  events: readonly AgentEvent[],
  stocksByTicker: ReadonlyMap<string, Stock>,
  nowMs: number,
): WatchCandidate[] {
  if (!Number.isFinite(nowMs)) return [];
  const selected = new Map<string, WatchCandidate>();
  for (const event of events) {
    const ticker = normalizeKrTicker(event.ticker);
    if (ticker === null || selected.has(ticker)) continue;
    const firstSeenMs = Date.parse(event.firstSeenAt);
    if (!Number.isFinite(firstSeenMs)) continue;
    if (nowMs - firstSeenMs > AGENT_EVENT_WATCH_TTL_MS) continue;
    const stock = stocksByTicker.get(ticker);
    selected.set(ticker, {
      ticker,
      name: stock?.name ?? ticker,
      source: 'agent_event',
      reason: `최근 agent event: ${agentEventWatchReason(event.type)}`,
    });
  }
  return [...selected.values()];
}

function agentEventWatchReason(type: AgentEventType): string {
  switch (type) {
    case 'news_detected':
      return '뉴스';
    case 'disclosure_detected':
      return '공시';
    case 'toss_signal_detected':
      return 'Toss 시그널';
    case 'market_movement_detected':
      return '시장 움직임';
    default:
      return 'agent event';
  }
}

function normalizeKrTicker(value: string): string | null {
  const trimmed = value.trim().toUpperCase();
  const ticker = trimmed.startsWith('A') ? trimmed.slice(1) : trimmed;
  return /^\d{6}$/.test(ticker) ? ticker : null;
}

function claimProviderRefresh(
  lastRefreshByKey: Map<string, number>,
  provider: string,
  ticker: string,
  nowMs: number,
  cooldownMs: number,
): boolean {
  const key = `${provider}:${ticker}`;
  const lastMs = lastRefreshByKey.get(key);
  if (lastMs !== undefined && nowMs - lastMs < cooldownMs) return false;
  lastRefreshByKey.set(key, nowMs);
  return true;
}

function enqueueNews(queue: AgentEventQueue, items: readonly StockNewsItem[]): number {
  let inserted = 0;
  for (const item of items) {
    if (item.isNew !== true) continue;
    const result = queue.enqueue({
      type: 'news_detected',
      ticker: item.ticker,
      source: item.source,
      publishedAt: item.publishedAt,
      firstSeenAt: item.fetchedAt,
      relevance: 0.7,
      confidence: 0.72,
      reason: `New stock news detected: ${item.title}`,
      dedupeKey: `news:${item.source}:${item.id}`,
      payloadRef: `stock-news:${item.id}`,
    });
    if (result.inserted) inserted += 1;
  }
  return inserted;
}

function enqueueTossNews(
  queue: AgentEventQueue,
  items: readonly AgentEventMonitorTossNewsItem[],
): number {
  let inserted = 0;
  for (const item of items) {
    if (item.isNew !== true) continue;
    const result = queue.enqueue({
      type: 'news_detected',
      ticker: item.ticker,
      source: item.source,
      publishedAt: item.publishedAt,
      firstSeenAt: item.firstSeenAt,
      relevance: item.relevance,
      confidence: item.confidence,
      reason: `Toss news detected: ${item.title}`,
      dedupeKey: `news:${item.source}:${stableDedupeToken(item.id)}`,
      payloadRef: null,
    });
    if (result.inserted) inserted += 1;
  }
  return inserted;
}

function enqueueTossSignals(
  queue: AgentEventQueue,
  items: readonly AgentEventMonitorTossSignalItem[],
): number {
  let inserted = 0;
  for (const item of items) {
    if (item.isNew !== true) continue;
    const result = queue.enqueue({
      type: 'toss_signal_detected',
      ticker: item.ticker,
      source: item.source,
      publishedAt: item.publishedAt,
      firstSeenAt: item.firstSeenAt,
      relevance: item.relevance,
      confidence: item.confidence,
      reason: `Toss signal detected: ${item.title}`,
      dedupeKey: `toss-signal:${item.source}:${stableDedupeToken(item.id)}`,
      payloadRef: null,
    });
    if (result.inserted) inserted += 1;
  }
  return inserted;
}

function stableDedupeToken(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function enqueueDisclosures(
  queue: AgentEventQueue,
  items: readonly StockDisclosureItem[],
  existingKeys: ReadonlySet<string>,
): number {
  let inserted = 0;
  for (const item of items) {
    if (item.kind !== 'filing' || disclosureIdentityKeys(item).some((key) => existingKeys.has(key))) continue;
    const result = queue.enqueue({
      type: 'disclosure_detected',
      ticker: item.ticker,
      source: item.source,
      publishedAt: item.publishedAt,
      firstSeenAt: item.fetchedAt,
      relevance: 0.85,
      confidence: 0.9,
      reason: `New DART filing detected: ${item.title}`,
      dedupeKey: `disclosure:${item.source}:${item.id}`,
      payloadRef: `stock-disclosure:${item.id}`,
    });
    if (result.inserted) inserted += 1;
  }
  return inserted;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const integer = Math.trunc(value);
  if (integer < min) return min;
  if (integer > max) return max;
  return integer;
}

function sanitizeMonitorError(err: unknown): string {
  if (err instanceof Error && err.message.trim().length > 0) {
    const message = err.message.toLowerCase();
    if (message.includes('toss news')) return 'TOSS_NEWS_REQUEST_FAILED';
    if (message.includes('toss signal')) return 'TOSS_SIGNAL_REQUEST_FAILED';
    if (message.includes('dart')) return 'DART_DISCLOSURE_REQUEST_FAILED';
    if (message.includes('news') || message.includes('naver')) return 'NEWS_REFRESH_FAILED';
  }
  return 'AGENT_EVENT_MONITOR_FAILED';
}
