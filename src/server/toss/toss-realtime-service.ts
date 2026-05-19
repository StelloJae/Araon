import {
  TossSseClient,
  TossSseReconnectSignal,
  type TossSseEvent,
} from './toss-sse-client.js';
import type { TossUserNotificationPayload } from '@shared/types.js';
import {
  normalizeAgentEventTicker,
  type AgentEventQueue,
} from '../agent/agent-event-queue.js';
import type { TossSessionStore } from './toss-session-store.js';
import {
  normalizeTossSseRefreshTicker,
  routeTossSseRefreshHints,
  type TossSseRefreshHint,
} from './toss-sse-refresh-router.js';

export type TossRealtimeState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'stopped'
  | 'failed';

export interface TossRealtimeStatus {
  readonly state: TossRealtimeState;
  readonly startedAt: string | null;
  readonly updatedAt: string | null;
  readonly stoppedAt: string | null;
  readonly eventCount: number;
  readonly priceRefreshEventCount: number;
  readonly userNotificationEventCount: number;
  readonly priceRefreshDispatchCount: number;
  readonly priceRefreshDispatchFailureCount: number;
  readonly refreshHintCount: number;
  readonly refreshHintDispatchCount: number;
  readonly refreshHintDispatchFailureCount: number;
  readonly refreshHints: ReadonlyArray<{ readonly resource: string; readonly count: number }>;
  readonly eventTypes: ReadonlyArray<{ readonly type: string; readonly count: number }>;
  readonly reconnectCount: number;
  readonly lastEventType: string | null;
  readonly lastStockCode: string | null;
  readonly lastEventAt: string | null;
  readonly lastPriceRefreshAt: string | null;
  readonly lastUserNotificationAt: string | null;
  readonly lastPriceRefreshDispatchAt: string | null;
  readonly lastRefreshHintAt: string | null;
  readonly lastRefreshHintResource: string | null;
  readonly lastRefreshHintTicker: string | null;
  readonly lastError: string | null;
  readonly thinNotificationOnly: boolean;
}

export interface TossRealtimeService {
  start(): Promise<TossRealtimeStatus>;
  stop(): Promise<TossRealtimeStatus>;
  status(): TossRealtimeStatus;
}

interface TossRealtimeServiceOptions {
  readonly sessionStore: TossSessionStore;
  readonly createClient?: (session: NonNullable<Awaited<ReturnType<TossSessionStore['load']>>>) => TossSseClient;
  readonly onPriceRefresh?: (event: TossRealtimePriceRefreshEvent) => Promise<void> | void;
  readonly onRefreshHint?: (hint: TossSseRefreshHint) => Promise<void> | void;
  readonly onUserNotification?: (notification: TossUserNotificationPayload) => Promise<void> | void;
  readonly agentEventQueue?: AgentEventQueue;
  readonly retryBaseMs?: number;
  readonly retryMaxMs?: number;
}

export interface TossRealtimePriceRefreshEvent {
  readonly stockCode: string;
  readonly receivedAt: string;
}

const DEFAULT_RETRY_BASE_MS = 2000;
const DEFAULT_RETRY_MAX_MS = 60_000;

export function createTossRealtimeService(
  options: TossRealtimeServiceOptions,
): TossRealtimeService {
  return new DefaultTossRealtimeService(options);
}

class DefaultTossRealtimeService implements TossRealtimeService {
  private readonly sessionStore: TossSessionStore;
  private readonly createClient: NonNullable<TossRealtimeServiceOptions['createClient']>;
  private readonly onPriceRefresh: TossRealtimeServiceOptions['onPriceRefresh'];
  private readonly onRefreshHint: TossRealtimeServiceOptions['onRefreshHint'];
  private readonly onUserNotification: TossRealtimeServiceOptions['onUserNotification'];
  private readonly agentEventQueue: TossRealtimeServiceOptions['agentEventQueue'];
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private statusSnapshot: TossRealtimeStatus = idleStatus();
  private readonly eventTypeCounts = new Map<string, number>();
  private readonly refreshHintCounts = new Map<string, number>();
  private activeController: AbortController | null = null;
  private activeJob: Promise<void> | null = null;

  constructor(options: TossRealtimeServiceOptions) {
    this.sessionStore = options.sessionStore;
    this.createClient = options.createClient ?? ((session) => new TossSseClient(session));
    this.onPriceRefresh = options.onPriceRefresh;
    this.onRefreshHint = options.onRefreshHint;
    this.onUserNotification = options.onUserNotification;
    this.agentEventQueue = options.agentEventQueue;
    this.retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
    this.retryMaxMs = options.retryMaxMs ?? DEFAULT_RETRY_MAX_MS;
  }

  async start(): Promise<TossRealtimeStatus> {
    if (this.activeJob !== null && this.activeController?.signal.aborted !== true) {
      return this.status();
    }
    const session = await this.sessionStore.load();
    if (session === null) {
      this.setStatus({
        state: 'failed',
        lastError: 'TOSS_SESSION_REQUIRED',
        stoppedAt: new Date().toISOString(),
      });
      return this.status();
    }
    const controller = new AbortController();
    this.activeController = controller;
    this.setStatus({
      state: 'connecting',
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      lastError: null,
    });
    this.activeJob = this.run(session, controller)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        this.setStatus({
          state: 'failed',
          lastError: 'TOSS_REALTIME_STREAM_FAILED',
          stoppedAt: new Date().toISOString(),
        });
      })
      .finally(() => {
        this.activeJob = null;
        this.activeController = null;
      });
    return this.status();
  }

  async stop(): Promise<TossRealtimeStatus> {
    this.activeController?.abort();
    if (this.activeJob !== null) await this.activeJob.catch(() => {});
    this.setStatus({
      state: 'stopped',
      stoppedAt: new Date().toISOString(),
    });
    return this.status();
  }

  status(): TossRealtimeStatus {
    return this.statusSnapshot;
  }

  private async run(
    session: NonNullable<Awaited<ReturnType<TossSessionStore['load']>>>,
    controller: AbortController,
  ): Promise<void> {
    let backoffMs = this.retryBaseMs;
    while (!controller.signal.aborted) {
      const client = this.createClient(session);
      this.setStatus({ state: 'connected', lastError: null });
      try {
        await client.listen(controller.signal, (event) => this.recordEvent(event));
        if (!controller.signal.aborted) {
          this.setStatus({ state: 'reconnecting' });
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        if (err instanceof TossSseReconnectSignal) {
          this.setStatus({
            state: 'reconnecting',
            reconnectCount: this.statusSnapshot.reconnectCount + 1,
            lastError: null,
          });
          backoffMs = this.retryBaseMs;
          continue;
        }
        this.setStatus({
          state: 'reconnecting',
          reconnectCount: this.statusSnapshot.reconnectCount + 1,
          lastError: 'TOSS_REALTIME_STREAM_FAILED',
        });
      }
      await sleep(backoffMs, controller.signal).catch(() => {});
      backoffMs = Math.min(backoffMs * 2, this.retryMaxMs);
    }
  }

  private recordEvent(event: TossSseEvent): void {
    const type = normalizeEventType(event.type);
    this.eventTypeCounts.set(type, (this.eventTypeCounts.get(type) ?? 0) + 1);
    const priceRefreshEventCount = type === 'price-refresh'
      ? this.statusSnapshot.priceRefreshEventCount + 1
      : this.statusSnapshot.priceRefreshEventCount;
    const userNotificationEventCount = type === 'web-push'
      ? this.statusSnapshot.userNotificationEventCount + 1
      : this.statusSnapshot.userNotificationEventCount;
    this.setStatus({
      eventCount: this.statusSnapshot.eventCount + 1,
      priceRefreshEventCount,
      userNotificationEventCount,
      eventTypes: eventTypeSnapshot(this.eventTypeCounts),
      lastEventType: type,
      lastStockCode: normalizeTossSseRefreshTicker(event.stockCode),
      lastEventAt: event.receivedAt,
      lastPriceRefreshAt: type === 'price-refresh'
        ? event.receivedAt
        : this.statusSnapshot.lastPriceRefreshAt,
      lastUserNotificationAt: type === 'web-push'
        ? event.receivedAt
        : this.statusSnapshot.lastUserNotificationAt,
      lastError: null,
    });
    this.routeRefreshHints(event);
    if (type === 'web-push') {
      void this.dispatchUserNotification(event);
    }
    if (type === 'price-refresh' && event.stockCode !== null) {
      this.enqueueMarketMovementAgentEvent(event);
      void this.dispatchPriceRefresh({
        stockCode: event.stockCode,
        receivedAt: event.receivedAt,
      });
    }
  }

  private routeRefreshHints(event: TossSseEvent): void {
    const hints = routeTossSseRefreshHints(event);
    for (const hint of hints) {
      this.refreshHintCounts.set(
        hint.resource,
        (this.refreshHintCounts.get(hint.resource) ?? 0) + 1,
      );
      this.setStatus({
        refreshHintCount: this.statusSnapshot.refreshHintCount + 1,
        refreshHints: resourceCountSnapshot(this.refreshHintCounts),
        lastRefreshHintAt: hint.receivedAt,
        lastRefreshHintResource: hint.resource,
        lastRefreshHintTicker: hint.ticker,
      });
      if (this.onRefreshHint !== undefined) {
        void this.dispatchRefreshHint(hint);
      }
    }
  }

  private enqueueMarketMovementAgentEvent(event: TossSseEvent): void {
    if (this.agentEventQueue === undefined || event.stockCode === null) return;
    try {
      const ticker = normalizeAgentEventTicker(event.stockCode);
      this.agentEventQueue.enqueue({
        type: 'market_movement_detected',
        ticker,
        source: 'toss-sse',
        publishedAt: null,
        firstSeenAt: event.receivedAt,
        relevance: 0.6,
        confidence: 0.65,
        reason: 'Toss SSE price-refresh thin notification',
        dedupeKey: `toss-sse:price-refresh:${ticker}:${event.receivedAt}`,
        payloadRef: null,
      });
    } catch {
      this.setStatus({ lastError: 'TOSS_AGENT_EVENT_ENQUEUE_FAILED' });
    }
  }

  private async dispatchPriceRefresh(event: TossRealtimePriceRefreshEvent): Promise<void> {
    this.setStatus({
      priceRefreshDispatchCount: this.statusSnapshot.priceRefreshDispatchCount + 1,
      lastPriceRefreshDispatchAt: event.receivedAt,
    });
    try {
      await this.onPriceRefresh?.(event);
    } catch {
      this.setStatus({
        priceRefreshDispatchFailureCount: this.statusSnapshot.priceRefreshDispatchFailureCount + 1,
        lastError: 'TOSS_PRICE_REFRESH_DISPATCH_FAILED',
      });
    }
  }

  private async dispatchRefreshHint(hint: TossSseRefreshHint): Promise<void> {
    this.setStatus({
      refreshHintDispatchCount: this.statusSnapshot.refreshHintDispatchCount + 1,
    });
    try {
      await this.onRefreshHint?.(hint);
    } catch {
      this.setStatus({
        refreshHintDispatchFailureCount: this.statusSnapshot.refreshHintDispatchFailureCount + 1,
        lastError: 'TOSS_REFRESH_HINT_DISPATCH_FAILED',
      });
    }
  }

  private async dispatchUserNotification(event: TossSseEvent): Promise<void> {
    const ticker = normalizeTossSseRefreshTicker(event.stockCode);
    const notification: TossUserNotificationPayload = {
      id: `toss-web-push:${ticker ?? 'unknown'}:${event.receivedAt}`,
      ticker,
      receivedAt: event.receivedAt,
      sourceType: 'web-push',
      reason: 'Toss SSE web-push notification received',
    };
    try {
      await this.onUserNotification?.(notification);
    } catch {
      this.setStatus({ lastError: 'TOSS_USER_NOTIFICATION_DISPATCH_FAILED' });
    }
  }

  private setStatus(update: Partial<Omit<TossRealtimeStatus, 'updatedAt'>>): void {
    this.statusSnapshot = {
      ...this.statusSnapshot,
      ...update,
      updatedAt: new Date().toISOString(),
    };
  }
}

function idleStatus(): TossRealtimeStatus {
  return {
    state: 'idle',
    startedAt: null,
    updatedAt: null,
    stoppedAt: null,
    eventCount: 0,
    priceRefreshEventCount: 0,
    userNotificationEventCount: 0,
    priceRefreshDispatchCount: 0,
    priceRefreshDispatchFailureCount: 0,
    refreshHintCount: 0,
    refreshHintDispatchCount: 0,
    refreshHintDispatchFailureCount: 0,
    refreshHints: [],
    eventTypes: [],
    reconnectCount: 0,
    lastEventType: null,
    lastStockCode: null,
    lastEventAt: null,
    lastPriceRefreshAt: null,
    lastUserNotificationAt: null,
    lastPriceRefreshDispatchAt: null,
    lastRefreshHintAt: null,
    lastRefreshHintResource: null,
    lastRefreshHintTicker: null,
    lastError: null,
    thinNotificationOnly: true,
  };
}

function normalizeEventType(type: string): string {
  const trimmed = type.trim();
  if (trimmed.length === 0) return 'unknown';
  return trimmed.replace(/[^\w.-]/g, '_').slice(0, 64);
}

function eventTypeSnapshot(
  counts: ReadonlyMap<string, number>,
): ReadonlyArray<{ readonly type: string; readonly count: number }> {
  return [...counts.entries()]
    .sort(([leftType, leftCount], [rightType, rightCount]) => {
      if (rightCount !== leftCount) return rightCount - leftCount;
      return leftType.localeCompare(rightType);
    })
    .slice(0, 12)
    .map(([type, count]) => ({ type, count }));
}

function resourceCountSnapshot(
  counts: ReadonlyMap<string, number>,
): ReadonlyArray<{ readonly resource: string; readonly count: number }> {
  return [...counts.entries()]
    .sort(([leftResource, leftCount], [rightResource, rightCount]) => {
      if (rightCount !== leftCount) return rightCount - leftCount;
      return leftResource.localeCompare(rightResource);
    })
    .map(([resource, count]) => ({ resource, count }));
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Toss realtime stopped'));
    }, { once: true });
  });
}
