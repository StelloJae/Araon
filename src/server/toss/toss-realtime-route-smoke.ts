import type { TossRealtimeState } from './toss-realtime-service.js';
import type { TossSseRefreshRecordedResult } from './toss-sse-refresh-result-store.js';
import type { TossSseRefreshResource } from './toss-sse-refresh-router.js';

export interface TossRealtimeRouteStatus {
  readonly state: TossRealtimeState;
  readonly eventCount: number;
  readonly priceRefreshEventCount: number;
  readonly userNotificationEventCount: number;
  readonly refreshHintCount: number;
  readonly refreshHintDispatchCount: number;
  readonly refreshHintDispatchFailureCount: number;
  readonly refreshHints: ReadonlyArray<{ readonly resource: string; readonly count: number }>;
  readonly eventTypes: ReadonlyArray<{ readonly type: string; readonly count: number }>;
  readonly reconnectCount: number;
  readonly lastEventType: string | null;
  readonly lastStockCode: string | null;
  readonly lastRefreshHintResource: string | null;
  readonly lastRefreshHintTicker: string | null;
  readonly lastError: string | null;
  readonly thinNotificationOnly: boolean;
}

export interface TossRealtimeRouteRefreshResults {
  readonly returnedCount: number;
  readonly items: readonly TossRealtimeRouteRefreshResultItem[];
}

export interface TossRealtimeRouteRefreshResultItem {
  readonly id?: string;
  readonly resource: TossSseRefreshResource | string;
  readonly ticker: string | null;
  readonly result: TossSseRefreshRecordedResult | string;
  readonly error: string | null;
}

export interface TossRealtimeRouteSmokeOptions {
  readonly getStatus: () => Promise<TossRealtimeRouteStatus>;
  readonly getRefreshResults: () => Promise<TossRealtimeRouteRefreshResults>;
  readonly startRealtime?: () => Promise<TossRealtimeRouteStatus>;
  readonly startIfIdle?: boolean;
  readonly durationMs?: number;
  readonly intervalMs?: number;
  readonly now?: () => Date;
  readonly sleep?: (durationMs: number) => Promise<void>;
}

export interface TossRealtimeRouteSmokeReport {
  readonly provider: 'toss-app-realtime-routes';
  readonly generatedAt: string;
  readonly outcome:
    | 'refresh_observed'
    | 'event_observed_without_refresh'
    | 'connected_no_event'
    | 'not_running'
    | 'session_required'
    | 'failed';
  readonly errorCode: 'TOSS_REALTIME_ROUTE_SMOKE_FAILED' | null;
  readonly startedRealtime: boolean;
  readonly durationMs: number;
  readonly intervalMs: number;
  readonly sampleCount: number;
  readonly final: TossRealtimeRouteSmokeFinalStatus;
}

export interface TossRealtimeRouteSmokeFinalStatus {
  readonly state: TossRealtimeState | 'unknown';
  readonly eventCount: number;
  readonly priceRefreshEventCount: number;
  readonly userNotificationEventCount: number;
  readonly refreshHintCount: number;
  readonly refreshHintDispatchCount: number;
  readonly refreshHintDispatchFailureCount: number;
  readonly refreshResultCount: number;
  readonly reconnectCount: number;
  readonly eventTypes: ReadonlyArray<{ readonly type: string; readonly count: number }>;
  readonly refreshHints: ReadonlyArray<{ readonly resource: string; readonly count: number }>;
  readonly lastEventType: string | null;
  readonly lastRefreshHintResource: string | null;
  readonly lastError: string | null;
  readonly latestRefreshResult: TossRealtimeRouteSmokeRefreshResult | null;
  readonly thinNotificationOnly: boolean;
}

export interface TossRealtimeRouteSmokeRefreshResult {
  readonly resource: string;
  readonly tickerPresent: boolean;
  readonly result: string;
  readonly error: string | null;
}

const DEFAULT_DURATION_MS = 60_000;
const DEFAULT_INTERVAL_MS = 5_000;

export async function runTossRealtimeRouteSmoke(
  options: TossRealtimeRouteSmokeOptions,
): Promise<TossRealtimeRouteSmokeReport> {
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? delay;
  const durationMs = normalizeNonnegativeMs(options.durationMs, DEFAULT_DURATION_MS);
  const intervalMs = Math.max(100, normalizeNonnegativeMs(options.intervalMs, DEFAULT_INTERVAL_MS));
  const generatedAt = now().toISOString();
  let startedRealtime = false;

  try {
    let currentStatus = await options.getStatus();
    if (isSessionRequired(currentStatus)) {
      return report({
        generatedAt,
        outcome: 'session_required',
        durationMs,
        intervalMs,
        sampleCount: 1,
        startedRealtime,
        status: currentStatus,
        refreshResults: emptyRefreshResults(),
      });
    }

    if (options.startIfIdle === true && isInactiveState(currentStatus.state)) {
      currentStatus = await options.startRealtime?.() ?? currentStatus;
      startedRealtime = true;
      if (isSessionRequired(currentStatus)) {
        return report({
          generatedAt,
          outcome: 'session_required',
          durationMs,
          intervalMs,
          sampleCount: 1,
          startedRealtime,
          status: currentStatus,
          refreshResults: emptyRefreshResults(),
        });
      }
    }

    const baselineStatus = currentStatus;
    const baselineRefreshResults = await options.getRefreshResults();
    const baselineRefreshResultKeys = new Set(
      baselineRefreshResults.items.map(refreshResultKey),
    );
    const maxSamples = Math.max(1, Math.floor(durationMs / intervalMs) + 1);
    let refreshResults = newRefreshResults(
      baselineRefreshResults,
      baselineRefreshResultKeys,
    );
    for (let sample = 1; sample <= maxSamples; sample += 1) {
      const statusDelta = statusCounterDelta(baselineStatus, currentStatus);
      const outcome = classify(currentStatus, statusDelta, refreshResults);
      if (outcome === 'refresh_observed' || outcome === 'event_observed_without_refresh') {
        return report({
          generatedAt,
          outcome,
          durationMs,
          intervalMs,
          sampleCount: sample,
          startedRealtime,
          status: currentStatus,
          refreshResults,
        });
      }
      if (sample >= maxSamples) {
        return report({
          generatedAt,
          outcome,
          durationMs,
          intervalMs,
          sampleCount: sample,
          startedRealtime,
          status: currentStatus,
          refreshResults,
        });
      }
      await sleep(intervalMs);
      currentStatus = await options.getStatus();
      refreshResults = newRefreshResults(
        await options.getRefreshResults(),
        baselineRefreshResultKeys,
      );
    }

    return report({
      generatedAt,
      outcome: 'not_running',
      durationMs,
      intervalMs,
      sampleCount: maxSamples,
      startedRealtime,
      status: currentStatus,
      refreshResults,
    });
  } catch {
    return report({
      generatedAt,
      outcome: 'failed',
      errorCode: 'TOSS_REALTIME_ROUTE_SMOKE_FAILED',
      durationMs,
      intervalMs,
      sampleCount: 0,
      startedRealtime,
      status: null,
      refreshResults: emptyRefreshResults(),
    });
  }
}

function classify(
  status: TossRealtimeRouteStatus,
  statusDelta: TossRealtimeRouteStatusCounterDelta,
  refreshResults: TossRealtimeRouteRefreshResults,
): TossRealtimeRouteSmokeReport['outcome'] {
  if (isSessionRequired(status)) return 'session_required';
  if (refreshResults.items.some((item) => item.result === 'refreshed')) {
    return 'refresh_observed';
  }
  if (status.lastError !== null) return 'failed';
  if (
    statusDelta.eventCount > 0
    || statusDelta.refreshHintCount > 0
    || refreshResults.returnedCount > 0
  ) {
    return 'event_observed_without_refresh';
  }
  if (status.state === 'connected' || status.state === 'reconnecting' || status.state === 'connecting') {
    return 'connected_no_event';
  }
  return 'not_running';
}

interface TossRealtimeRouteStatusCounterDelta {
  readonly eventCount: number;
  readonly refreshHintCount: number;
}

function statusCounterDelta(
  baseline: TossRealtimeRouteStatus,
  current: TossRealtimeRouteStatus,
): TossRealtimeRouteStatusCounterDelta {
  return {
    eventCount: Math.max(0, current.eventCount - baseline.eventCount),
    refreshHintCount: Math.max(0, current.refreshHintCount - baseline.refreshHintCount),
  };
}

function newRefreshResults(
  snapshot: TossRealtimeRouteRefreshResults,
  baselineKeys: ReadonlySet<string>,
): TossRealtimeRouteRefreshResults {
  const items = snapshot.items.filter((item) => !baselineKeys.has(refreshResultKey(item)));
  return {
    items,
    returnedCount: items.length,
  };
}

function refreshResultKey(item: TossRealtimeRouteRefreshResultItem): string {
  if (item.id !== undefined && item.id.trim().length > 0) return `id:${item.id}`;
  return [
    'fallback',
    item.resource,
    item.ticker ?? '',
    item.result,
    item.error ?? '',
  ].join(':');
}

function isSessionRequired(status: TossRealtimeRouteStatus): boolean {
  return status.lastError === 'TOSS_SESSION_REQUIRED';
}

function isInactiveState(state: TossRealtimeState): boolean {
  return state === 'idle' || state === 'stopped' || state === 'failed';
}

function report(input: {
  readonly generatedAt: string;
  readonly outcome: TossRealtimeRouteSmokeReport['outcome'];
  readonly errorCode?: TossRealtimeRouteSmokeReport['errorCode'];
  readonly durationMs: number;
  readonly intervalMs: number;
  readonly sampleCount: number;
  readonly startedRealtime: boolean;
  readonly status: TossRealtimeRouteStatus | null;
  readonly refreshResults: TossRealtimeRouteRefreshResults;
}): TossRealtimeRouteSmokeReport {
  return {
    provider: 'toss-app-realtime-routes',
    generatedAt: input.generatedAt,
    outcome: input.outcome,
    errorCode: input.errorCode ?? null,
    startedRealtime: input.startedRealtime,
    durationMs: input.durationMs,
    intervalMs: input.intervalMs,
    sampleCount: input.sampleCount,
    final: summarizeFinal(input.status, input.refreshResults),
  };
}

function summarizeFinal(
  status: TossRealtimeRouteStatus | null,
  refreshResults: TossRealtimeRouteRefreshResults,
): TossRealtimeRouteSmokeFinalStatus {
  const latestRefresh = refreshResults.items[0] ?? null;
  return {
    state: status?.state ?? 'unknown',
    eventCount: status?.eventCount ?? 0,
    priceRefreshEventCount: status?.priceRefreshEventCount ?? 0,
    userNotificationEventCount: status?.userNotificationEventCount ?? 0,
    refreshHintCount: status?.refreshHintCount ?? 0,
    refreshHintDispatchCount: status?.refreshHintDispatchCount ?? 0,
    refreshHintDispatchFailureCount: status?.refreshHintDispatchFailureCount ?? 0,
    refreshResultCount: refreshResults.returnedCount,
    reconnectCount: status?.reconnectCount ?? 0,
    eventTypes: status?.eventTypes ?? [],
    refreshHints: status?.refreshHints ?? [],
    lastEventType: status?.lastEventType ?? null,
    lastRefreshHintResource: status?.lastRefreshHintResource ?? null,
    lastError: safeError(status?.lastError ?? null),
    latestRefreshResult: latestRefresh === null
      ? null
      : {
          resource: latestRefresh.resource,
          tickerPresent: latestRefresh.ticker !== null,
          result: latestRefresh.result,
          error: safeError(latestRefresh.error),
        },
    thinNotificationOnly: status?.thinNotificationOnly ?? true,
  };
}

function emptyRefreshResults(): TossRealtimeRouteRefreshResults {
  return {
    returnedCount: 0,
    items: [],
  };
}

function safeError(value: string | null): string | null {
  if (value === null) return null;
  if (/^[A-Z][A-Z0-9_]{1,79}$/.test(value)) return value;
  return 'TOSS_REALTIME_ROUTE_ERROR';
}

function normalizeNonnegativeMs(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.trunc(value));
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
