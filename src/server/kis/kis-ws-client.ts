/**
 * KIS OpenAPI realtime WebSocket client (transport + reconnect supervision).
 *
 * Narrow surface:
 *   - connect / disconnect (manual stop with optional reason)
 *   - subscribe / unsubscribe (stagger enforced via `WS_SUBSCRIBE_INTERVAL_MS`)
 *   - onMessage (raw frame observer)
 *   - server-side ping every `WS_PING_INTERVAL_MS`
 *   - getStatus (diagnostics — credential-safe)
 *
 * NXT0 safety guards:
 *   - Explicit reconnect delay schedule (`DEFAULT_RECONNECT_DELAYS_MS`) with
 *     bounded `maxReconnectAttempts`; exhausting the budget transitions to
 *     terminal `stopped` state with reason `max_reconnect_attempts`.
 *   - Bounded jitter (`jitterRatio`) so multiple instances don't synchronise.
 *   - `stableResetMs` grace period before clearing the attempt counter — a
 *     1-second flap-loop accumulates attempts and still hits the cap.
 *   - Stop-reason classification (`manual` / `max_reconnect_attempts` /
 *     `shutdown` / `auth_failure`).
 *   - Approval-key fetch failure transitions directly to `stopped` with
 *     `auth_failure` and does NOT enter the auto-retry loop.
 *   - `getStatus()` redacts approval keys / app secrets / tokens from
 *     `lastError.message` before exposing diagnostics.
 *
 * Tier logic — which tickers belong on the socket vs polling — lives in the
 * Phase 5a tier-manager. This client simply executes the subscribe/unsubscribe
 * commands it is told to.
 */

import {
  KIS_WS_HOST_LIVE,
  KIS_WS_HOST_PAPER,
  WS_PING_INTERVAL_MS,
  WS_SUBSCRIBE_INTERVAL_MS,
} from '@shared/kis-constraints.js';
import { createChildLogger } from '@shared/logger.js';

const log = createChildLogger('kis-ws');

/**
 * Lifecycle states for the KIS WS connection.
 *
 * `degraded` is a non-terminal state: the socket has dropped after a successful
 * connection and a reconnect timer is pending. `stopped` is terminal: no further
 * reconnects will happen until `connect()` is called again. `lastError` plus
 * `stopReason` (via `getStatus()`) explain why the client landed in `stopped`.
 */
export type WsConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'degraded'
  | 'stopped';

/**
 * Why the client transitioned to the terminal `stopped` state. Surfaces via
 * `getStatus()` so supervisors can decide whether to display a UI warning,
 * rotate credentials, or schedule a re-`connect()`.
 */
export type WsStopReason =
  | 'manual'
  | 'max_reconnect_attempts'
  | 'shutdown'
  | 'auth_failure';

/** Snapshot of WS connection diagnostics — credential-safe. */
export interface WsClientStatus {
  readonly state: WsConnectionState;
  readonly reconnectAttempts: number;
  readonly nextReconnectAt: string | null;
  readonly lastConnectedAt: string | null;
  readonly lastError: { readonly code: string; readonly message: string } | null;
  readonly stopReason: WsStopReason | null;
}

/** Default reconnect delay schedule: 1s → 2s → 5s → 10s → 30s. */
export const DEFAULT_RECONNECT_DELAYS_MS: readonly number[] = [
  1_000, 2_000, 5_000, 10_000, 30_000,
];

/** Default cap on consecutive reconnect attempts before transitioning to `stopped`. */
export const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;

/** Default ±ratio applied to each reconnect delay. 0.15 = ±15%. */
export const DEFAULT_JITTER_RATIO = 0.15;

/**
 * Default sustained-connection duration before resetting `reconnectAttempts`.
 * Without this guard a flap-loop where the socket opens then drops within a
 * second would reset the counter every cycle and never escalate to `stopped`.
 */
export const DEFAULT_STABLE_RESET_MS = 60_000;

export interface WsSubscription {
  trId: string;
  trKey: string;
}

export type WsMessageHandler = (raw: string) => void;

export interface WsSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(event: 'open', handler: () => void): void;
  addEventListener(
    event: 'message',
    handler: (e: { data: unknown }) => void,
  ): void;
  addEventListener(event: 'close', handler: () => void): void;
  addEventListener(
    event: 'error',
    handler: (e: unknown) => void,
  ): void;
}

export type WsFactory = (url: string) => WsSocketLike;

const defaultWsFactory: WsFactory = (url) =>
  new WebSocket(url) as unknown as WsSocketLike;

export interface KisWsClientOptions {
  isPaper: boolean;
  /**
   * Approval key must be obtained via the KIS `/oauth2/Approval` REST call
   * before opening the WS. A throw from this callback is classified as
   * `auth_failure` and the client transitions to `stopped` without retry.
   */
  getApprovalKey: () => Promise<string>;
  wsFactory?: WsFactory;
  pingIntervalMs?: number;
  subscribeIntervalMs?: number;
  /** Per-attempt reconnect delays in ms. Defaults to `DEFAULT_RECONNECT_DELAYS_MS`. */
  reconnectDelaysMs?: readonly number[];
  /** After this many failed reconnects, transition to `stopped`. */
  maxReconnectAttempts?: number;
  /** Random ±ratio applied to each scheduled delay. 0 disables jitter. */
  jitterRatio?: number;
  /** Reset attempt counter only after the connection holds this long. */
  stableResetMs?: number;
  /** Injectable RNG for jitter (test determinism). Defaults to Math.random. */
  random?: () => number;
}

export interface KisWsClient {
  connect(): Promise<void>;
  /**
   * Manually stop the client. Cancels pending reconnects, clears active
   * subscriptions, and transitions to terminal `stopped` state with the given
   * reason (default `manual`). Idempotent.
   */
  disconnect(reason?: WsStopReason): Promise<void>;
  subscribe(sub: WsSubscription): Promise<void>;
  unsubscribe(sub: WsSubscription): Promise<void>;
  onMessage(handler: WsMessageHandler): () => void;
  state(): WsConnectionState;
  activeSubscriptions(): ReadonlyArray<WsSubscription>;
  getStatus(): WsClientStatus;
}

function subKey(sub: WsSubscription): string {
  return `${sub.trId}:${sub.trKey}`;
}

function buildControlFrame(
  approvalKey: string,
  action: '1' | '2',
  sub: WsSubscription,
): string {
  return JSON.stringify({
    header: {
      approval_key: approvalKey,
      custtype: 'P',
      tr_type: action,
      'content-type': 'utf-8',
    },
    body: {
      input: {
        tr_id: sub.trId,
        tr_key: sub.trKey,
      },
    },
  });
}

/**
 * Strip credential-bearing substrings from an error message before recording
 * it on `lastError` / surfacing via `getStatus()`. Patterns target query
 * params and bearer tokens that may appear in upstream error text.
 */
function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/approval[_-]?key[=:]\s*[^\s&"',}]+/gi, 'approval_key=[REDACTED]')
    .replace(/appkey[=:]\s*[^\s&"',}]+/gi, 'appkey=[REDACTED]')
    .replace(/appsecret[=:]\s*[^\s&"',}]+/gi, 'appsecret=[REDACTED]')
    .replace(/secretkey[=:]\s*[^\s&"',}]+/gi, 'secretkey=[REDACTED]')
    .replace(/access[_-]?token[=:]\s*[^\s&"',}]+/gi, 'access_token=[REDACTED]')
    .replace(/bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]');
}

function toErrorRecord(err: unknown): { code: string; message: string } {
  if (err instanceof Error) {
    const codeFromError =
      'code' in err && typeof (err as { code?: unknown }).code === 'string'
        ? (err as { code: string }).code
        : 'WS_ERROR';
    return { code: codeFromError, message: sanitizeErrorMessage(err.message) };
  }
  return { code: 'WS_ERROR', message: sanitizeErrorMessage(String(err)) };
}

export function createKisWsClient(
  options: KisWsClientOptions,
): KisWsClient {
  const host = options.isPaper ? KIS_WS_HOST_PAPER : KIS_WS_HOST_LIVE;
  const factory = options.wsFactory ?? defaultWsFactory;
  const pingMs = options.pingIntervalMs ?? WS_PING_INTERVAL_MS;
  const subStaggerMs =
    options.subscribeIntervalMs ?? WS_SUBSCRIBE_INTERVAL_MS;
  const reconnectDelaysMs =
    options.reconnectDelaysMs ?? DEFAULT_RECONNECT_DELAYS_MS;
  const maxReconnectAttempts =
    options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
  const jitterRatio = Math.max(
    0,
    Math.min(1, options.jitterRatio ?? DEFAULT_JITTER_RATIO),
  );
  const stableResetMs = options.stableResetMs ?? DEFAULT_STABLE_RESET_MS;
  const random = options.random ?? Math.random;

  const subscriptions = new Map<string, WsSubscription>();
  const handlers = new Set<WsMessageHandler>();

  let socket: WsSocketLike | null = null;
  let approvalKey: string | null = null;
  let state: WsConnectionState = 'idle';
  let lastSentAtMs = 0;
  let reconnectAttempts = 0;
  let pingTimer: NodeJS.Timeout | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let stableResetTimer: NodeJS.Timeout | null = null;
  let openPromise: Promise<void> | null = null;

  // Diagnostic state — surfaced via getStatus().
  let lastConnectedAt: string | null = null;
  let nextReconnectAt: string | null = null;
  let lastError: { code: string; message: string } | null = null;
  let stopReason: WsStopReason | null = null;

  function clearPing(): void {
    if (pingTimer !== null) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    nextReconnectAt = null;
  }

  function clearStableResetTimer(): void {
    if (stableResetTimer !== null) {
      clearTimeout(stableResetTimer);
      stableResetTimer = null;
    }
  }

  function schedulePing(): void {
    clearPing();
    pingTimer = setInterval(() => {
      if (socket !== null && socket.readyState === 1 /* OPEN */) {
        try {
          socket.send(JSON.stringify({ header: { tr_id: 'PINGPONG' } }));
        } catch (err: unknown) {
          log.warn(
            { err: err instanceof Error ? err.message : String(err) },
            'ws ping send failed',
          );
        }
      }
    }, pingMs);
  }

  function transitionToStopped(
    reason: WsStopReason,
    error?: { code: string; message: string },
  ): void {
    if (state === 'stopped' && stopReason !== null) {
      // Already stopped — preserve original reason; only update lastError.
      if (error !== undefined) lastError = error;
      return;
    }
    state = 'stopped';
    stopReason = reason;
    if (error !== undefined) lastError = error;
    clearReconnectTimer();
    clearStableResetTimer();
    clearPing();
    log.warn(
      { reason, attempts: reconnectAttempts },
      'KIS WS transitioned to stopped',
    );
  }

  function computeDelay(attemptIndex: number): number {
    const base =
      reconnectDelaysMs[
        Math.min(attemptIndex, reconnectDelaysMs.length - 1)
      ] ?? 0;
    if (jitterRatio === 0) return base;
    const swing = (random() * 2 - 1) * jitterRatio * base;
    return Math.max(0, Math.round(base + swing));
  }

  async function waitForSubscribeSlot(): Promise<void> {
    const sinceLast = Date.now() - lastSentAtMs;
    if (sinceLast < subStaggerMs) {
      await new Promise<void>((resolvePromise) => {
        setTimeout(resolvePromise, subStaggerMs - sinceLast);
      });
    }
    lastSentAtMs = Date.now();
  }

  async function sendControl(
    action: '1' | '2',
    sub: WsSubscription,
  ): Promise<void> {
    if (socket === null || socket.readyState !== 1 /* OPEN */) {
      throw new Error('KIS WS is not open');
    }
    if (approvalKey === null) {
      throw new Error('approval key missing — call connect() first');
    }
    await waitForSubscribeSlot();
    socket.send(buildControlFrame(approvalKey, action, sub));
  }

  async function replayAllSubscriptions(): Promise<void> {
    for (const sub of subscriptions.values()) {
      try {
        await sendControl('1', sub);
      } catch (err: unknown) {
        log.warn(
          {
            err: err instanceof Error ? err.message : String(err),
            sub,
          },
          'ws replay subscribe failed',
        );
      }
    }
  }

  function considerScheduleReconnect(): void {
    if (stopReason !== null) return;
    if (reconnectAttempts >= maxReconnectAttempts) {
      transitionToStopped('max_reconnect_attempts');
      return;
    }
    state = 'degraded';
    const attemptIndex = reconnectAttempts;
    const delay = computeDelay(attemptIndex);
    reconnectAttempts += 1;
    const fireAt = Date.now() + delay;
    nextReconnectAt = new Date(fireAt).toISOString();
    log.warn(
      { delay, attempt: reconnectAttempts, max: maxReconnectAttempts },
      'scheduling KIS WS reconnect',
    );

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      nextReconnectAt = null;
      if (stopReason !== null) return;
      connectInternal().catch((err: unknown) => {
        lastError = toErrorRecord(err);
        // auth_failure already transitioned to stopped inside connectInternal.
        if (stopReason !== null) return;
        considerScheduleReconnect();
      });
    }, delay);
  }

  function dispatchMessage(raw: string): void {
    for (const handler of handlers) {
      try {
        handler(raw);
      } catch (err: unknown) {
        log.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'ws message handler threw',
        );
      }
    }
  }

  async function connectInternal(): Promise<void> {
    let key: string;
    try {
      key = await options.getApprovalKey();
    } catch (err: unknown) {
      const record = toErrorRecord(err);
      transitionToStopped('auth_failure', record);
      throw err;
    }
    if (stopReason !== null) {
      throw new Error('connect aborted: client stopped');
    }
    approvalKey = key;
    state = 'connecting';
    const url = host;
    const ws = factory(url);
    socket = ws;

    await new Promise<void>((resolvePromise, rejectPromise) => {
      let settled = false;
      ws.addEventListener('open', () => {
        if (settled) return;
        settled = true;
        if (stopReason !== null) {
          // disconnect() was invoked between socket creation and open event.
          try {
            ws.close();
          } catch {
            /* swallow — we're already terminal */
          }
          rejectPromise(new Error('connect aborted: client stopped'));
          return;
        }
        state = 'connected';
        lastConnectedAt = new Date().toISOString();
        nextReconnectAt = null;
        clearStableResetTimer();
        // Schedule the attempt-counter reset only after the connection holds
        // for `stableResetMs`. A flap-loop close fires before this and leaves
        // attempts intact, so the cap still trips eventually.
        stableResetTimer = setTimeout(() => {
          stableResetTimer = null;
          if (state === 'connected') {
            reconnectAttempts = 0;
          }
        }, stableResetMs);
        schedulePing();
        log.info({ host, isPaper: options.isPaper }, 'KIS WS connected');
        resolvePromise();
      });
      ws.addEventListener('message', (e) => {
        const data = e.data;
        const text =
          typeof data === 'string'
            ? data
            : data instanceof Buffer
              ? data.toString('utf8')
              : data instanceof ArrayBuffer
                ? Buffer.from(data).toString('utf8')
                : String(data);
        dispatchMessage(text);
      });
      ws.addEventListener('error', (errEvent) => {
        const errMsg =
          typeof errEvent === 'object' &&
          errEvent !== null &&
          'message' in errEvent
            ? String((errEvent as { message?: unknown }).message)
            : String(errEvent);
        const sanitized = sanitizeErrorMessage(errMsg);
        log.error({ err: sanitized }, 'KIS WS error');
        lastError = { code: 'WS_ERROR', message: sanitized };
        if (!settled) {
          settled = true;
          rejectPromise(new Error(sanitized));
        }
      });
      ws.addEventListener('close', () => {
        clearPing();
        clearStableResetTimer();
        const wasConnected = state === 'connected';
        if (!settled) {
          settled = true;
          rejectPromise(new Error('KIS WS closed before open'));
          return;
        }
        if (wasConnected && stopReason === null) {
          log.warn('KIS WS closed — will reconnect');
          considerScheduleReconnect();
        }
      });
    });

    if (subscriptions.size > 0) {
      await replayAllSubscriptions();
    }
  }

  return {
    async connect(): Promise<void> {
      if (state === 'connected') return;
      if (openPromise !== null) {
        return openPromise;
      }
      // Reset on user-initiated re-connect after a stopped state.
      if (stopReason !== null) {
        stopReason = null;
        reconnectAttempts = 0;
        lastError = null;
      }
      const pending = (async () => {
        try {
          await connectInternal();
        } catch (err: unknown) {
          // Initial connect failure: do NOT auto-retry. Surface to caller and
          // leave state navigable for a manual retry. If `auth_failure` already
          // transitioned to `stopped`, leave it.
          if (stopReason === null) {
            state = 'idle';
          }
          throw err;
        }
      })().finally(() => {
        openPromise = null;
      });
      openPromise = pending;
      return pending;
    },

    async disconnect(reason: WsStopReason = 'manual'): Promise<void> {
      transitionToStopped(reason);
      if (socket !== null) {
        try {
          socket.close();
        } catch (err: unknown) {
          log.warn(
            { err: err instanceof Error ? err.message : String(err) },
            'ws close threw',
          );
        }
      }
      socket = null;
      approvalKey = null;
      subscriptions.clear();
      log.info({ reason }, 'KIS WS disconnected');
    },

    async subscribe(sub: WsSubscription): Promise<void> {
      subscriptions.set(subKey(sub), sub);
      if (state === 'connected') {
        await sendControl('1', sub);
      }
    },

    async unsubscribe(sub: WsSubscription): Promise<void> {
      const key = subKey(sub);
      if (!subscriptions.has(key)) return;
      subscriptions.delete(key);
      if (state === 'connected') {
        await sendControl('2', sub);
      }
    },

    onMessage(handler: WsMessageHandler): () => void {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },

    state(): WsConnectionState {
      return state;
    },

    activeSubscriptions(): ReadonlyArray<WsSubscription> {
      return Array.from(subscriptions.values());
    },

    getStatus(): WsClientStatus {
      return {
        state,
        reconnectAttempts,
        nextReconnectAt,
        lastConnectedAt,
        lastError,
        stopReason,
      };
    },
  };
}
