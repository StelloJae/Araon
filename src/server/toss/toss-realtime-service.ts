import {
  TossSseClient,
  TossSseReconnectSignal,
  type TossSseEvent,
} from './toss-sse-client.js';
import type { TossSessionStore } from './toss-session-store.js';

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
  readonly priceRefreshDispatchCount: number;
  readonly priceRefreshDispatchFailureCount: number;
  readonly eventTypes: ReadonlyArray<{ readonly type: string; readonly count: number }>;
  readonly reconnectCount: number;
  readonly lastEventType: string | null;
  readonly lastStockCode: string | null;
  readonly lastEventAt: string | null;
  readonly lastPriceRefreshAt: string | null;
  readonly lastPriceRefreshDispatchAt: string | null;
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
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private statusSnapshot: TossRealtimeStatus = idleStatus();
  private readonly eventTypeCounts = new Map<string, number>();
  private activeController: AbortController | null = null;
  private activeJob: Promise<void> | null = null;

  constructor(options: TossRealtimeServiceOptions) {
    this.sessionStore = options.sessionStore;
    this.createClient = options.createClient ?? ((session) => new TossSseClient(session));
    this.onPriceRefresh = options.onPriceRefresh;
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
        lastError: 'No active Toss session',
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
          lastError: safeErrorMessage(err),
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
          lastError: safeErrorMessage(err),
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
    this.setStatus({
      eventCount: this.statusSnapshot.eventCount + 1,
      priceRefreshEventCount,
      eventTypes: eventTypeSnapshot(this.eventTypeCounts),
      lastEventType: type,
      lastStockCode: event.stockCode,
      lastEventAt: event.receivedAt,
      lastPriceRefreshAt: type === 'price-refresh'
        ? event.receivedAt
        : this.statusSnapshot.lastPriceRefreshAt,
      lastError: null,
    });
    if (type === 'price-refresh' && event.stockCode !== null) {
      void this.dispatchPriceRefresh({
        stockCode: event.stockCode,
        receivedAt: event.receivedAt,
      });
    }
  }

  private async dispatchPriceRefresh(event: TossRealtimePriceRefreshEvent): Promise<void> {
    this.setStatus({
      priceRefreshDispatchCount: this.statusSnapshot.priceRefreshDispatchCount + 1,
      lastPriceRefreshDispatchAt: event.receivedAt,
    });
    try {
      await this.onPriceRefresh?.(event);
    } catch (err: unknown) {
      this.setStatus({
        priceRefreshDispatchFailureCount: this.statusSnapshot.priceRefreshDispatchFailureCount + 1,
        lastError: safeErrorMessage(err),
      });
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
    priceRefreshDispatchCount: 0,
    priceRefreshDispatchFailureCount: 0,
    eventTypes: [],
    reconnectCount: 0,
    lastEventType: null,
    lastStockCode: null,
    lastEventAt: null,
    lastPriceRefreshAt: null,
    lastPriceRefreshDispatchAt: null,
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

function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Toss realtime stream failed';
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
