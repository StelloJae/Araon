import type { TossRealtimeService, TossRealtimeStatus } from './toss-realtime-service.js';
import type { TossSessionSummary } from './toss-session-store.js';

export interface TossRealtimeSmokeOptions {
  readonly sessionStatus: () => Promise<TossSessionSummary>;
  readonly realtimeService: Pick<TossRealtimeService, 'start' | 'stop' | 'status'>;
  readonly durationMs?: number;
  readonly now?: () => Date;
  readonly sleep?: (durationMs: number) => Promise<void>;
}

export interface TossRealtimeSmokeSessionSummary {
  readonly configured: boolean;
  readonly state: TossSessionSummary['state'];
  readonly persistent: boolean;
  readonly effectiveExpiresAt: string | null;
  readonly expiresInMs: number | null;
}

export interface TossRealtimeSmokeStatus {
  readonly started: boolean;
  readonly state: TossRealtimeStatus['state'];
  readonly eventCount: number;
  readonly priceRefreshEventCount: number;
  readonly userNotificationEventCount: number;
  readonly refreshHintCount: number;
  readonly reconnectCount: number;
  readonly eventTypes: TossRealtimeStatus['eventTypes'];
  readonly refreshHints: TossRealtimeStatus['refreshHints'];
  readonly lastEventType: string | null;
  readonly lastStockCode: string | null;
  readonly lastRefreshHintResource: string | null;
  readonly lastRefreshHintTicker: string | null;
  readonly lastError: string | null;
  readonly thinNotificationOnly: boolean;
  readonly errorCode?: 'TOSS_SESSION_REQUIRED' | 'TOSS_REALTIME_SMOKE_FAILED';
}

export interface TossRealtimeSmokeReport {
  readonly provider: 'toss';
  readonly generatedAt: string;
  readonly outcome: 'ok' | 'partial' | 'session_required' | 'failed';
  readonly durationMs: number;
  readonly session: TossRealtimeSmokeSessionSummary;
  readonly realtime: TossRealtimeSmokeStatus;
}

const DEFAULT_DURATION_MS = 30_000;

export async function runTossRealtimeSmoke(
  options: TossRealtimeSmokeOptions,
): Promise<TossRealtimeSmokeReport> {
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? delay;
  const durationMs = normalizeDurationMs(options.durationMs);
  const session = await options.sessionStatus();
  const generatedAt = now().toISOString();
  const sessionSummary = summarizeSession(session);

  if (!session.configured) {
    return {
      provider: 'toss',
      generatedAt,
      outcome: 'session_required',
      durationMs,
      session: sessionSummary,
      realtime: sessionRequiredRealtimeStatus(),
    };
  }

  let started = false;
  let report: TossRealtimeSmokeReport;
  try {
    await options.realtimeService.start();
    started = true;
    await sleep(durationMs);
    const status = options.realtimeService.status();
    report = {
      provider: 'toss',
      generatedAt,
      outcome: status.lastError === null ? 'ok' : 'partial',
      durationMs,
      session: sessionSummary,
      realtime: summarizeRealtimeStatus(status, true),
    };
  } catch {
    report = {
      provider: 'toss',
      generatedAt,
      outcome: 'failed',
      durationMs,
      session: sessionSummary,
      realtime: failedRealtimeStatus(),
    };
  }

  if (started) {
    await options.realtimeService.stop().catch(() => {});
  }
  return report;
}

function summarizeSession(session: TossSessionSummary): TossRealtimeSmokeSessionSummary {
  return {
    configured: session.configured,
    state: session.state,
    persistent: session.persistent,
    effectiveExpiresAt: session.effectiveExpiresAt,
    expiresInMs: session.expiresInMs,
  };
}

function summarizeRealtimeStatus(
  status: TossRealtimeStatus,
  started: boolean,
): TossRealtimeSmokeStatus {
  return {
    started,
    state: status.state,
    eventCount: status.eventCount,
    priceRefreshEventCount: status.priceRefreshEventCount,
    userNotificationEventCount: status.userNotificationEventCount,
    refreshHintCount: status.refreshHintCount,
    reconnectCount: status.reconnectCount,
    eventTypes: status.eventTypes,
    refreshHints: status.refreshHints,
    lastEventType: status.lastEventType,
    lastStockCode: status.lastStockCode,
    lastRefreshHintResource: status.lastRefreshHintResource,
    lastRefreshHintTicker: status.lastRefreshHintTicker,
    lastError: status.lastError,
    thinNotificationOnly: status.thinNotificationOnly,
  };
}

function sessionRequiredRealtimeStatus(): TossRealtimeSmokeStatus {
  return {
    started: false,
    state: 'idle',
    eventCount: 0,
    priceRefreshEventCount: 0,
    userNotificationEventCount: 0,
    refreshHintCount: 0,
    reconnectCount: 0,
    eventTypes: [],
    refreshHints: [],
    lastEventType: null,
    lastStockCode: null,
    lastRefreshHintResource: null,
    lastRefreshHintTicker: null,
    lastError: null,
    thinNotificationOnly: true,
    errorCode: 'TOSS_SESSION_REQUIRED',
  };
}

function failedRealtimeStatus(): TossRealtimeSmokeStatus {
  return {
    started: false,
    state: 'failed',
    eventCount: 0,
    priceRefreshEventCount: 0,
    userNotificationEventCount: 0,
    refreshHintCount: 0,
    reconnectCount: 0,
    eventTypes: [],
    refreshHints: [],
    lastEventType: null,
    lastStockCode: null,
    lastRefreshHintResource: null,
    lastRefreshHintTicker: null,
    lastError: 'TOSS_REALTIME_SMOKE_FAILED',
    thinNotificationOnly: true,
    errorCode: 'TOSS_REALTIME_SMOKE_FAILED',
  };
}

function normalizeDurationMs(durationMs: number | undefined): number {
  if (durationMs === undefined) return DEFAULT_DURATION_MS;
  if (!Number.isFinite(durationMs)) return DEFAULT_DURATION_MS;
  return Math.max(0, Math.trunc(durationMs));
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
