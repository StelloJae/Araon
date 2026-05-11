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
  readonly reconnectCount: number;
  readonly lastEventType: string | null;
  readonly lastStockCode: string | null;
  readonly lastEventAt: string | null;
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
  readonly retryBaseMs?: number;
  readonly retryMaxMs?: number;
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
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private statusSnapshot: TossRealtimeStatus = idleStatus();
  private activeController: AbortController | null = null;
  private activeJob: Promise<void> | null = null;

  constructor(options: TossRealtimeServiceOptions) {
    this.sessionStore = options.sessionStore;
    this.createClient = options.createClient ?? ((session) => new TossSseClient(session));
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
    this.setStatus({
      eventCount: this.statusSnapshot.eventCount + 1,
      lastEventType: event.type,
      lastStockCode: event.stockCode,
      lastEventAt: event.receivedAt,
      lastError: null,
    });
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
    reconnectCount: 0,
    lastEventType: null,
    lastStockCode: null,
    lastEventAt: null,
    lastError: null,
    thinNotificationOnly: true,
  };
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
