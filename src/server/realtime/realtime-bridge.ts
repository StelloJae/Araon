/**
 * Realtime bridge — wraps the Phase 1 `KisWsClient` and moves ticks into the
 * Phase 4b `PriceStore`.
 *
 * Contract:
 *   - `applyDiff()` stages subscribe/unsubscribe calls at
 *     `WS_SUBSCRIBE_INTERVAL_MS` intervals so a single diff does not flood
 *     the KIS socket.
 *   - On raw WS frame the injected `parseTick` converts the string into a
 *     typed discriminated union. NXT4a keeps application writes behind the
 *     explicit `applyTicksToPriceStore` guard so parser wiring can be tested
 *     without live state mutation.
 *   - On reconnect (the Phase 1 client re-emits `open`) the bridge progressively
 *     re-subscribes the current Tier 1 set, emitting `restore-progress` events
 *     (`{ current, total }`) so Phase 7 can render "연결 복원 중 (N/40)".
 *   - `disconnectAll()` removes every listener registered on the WS client and
 *     returns the bridge to a clean state — the hygiene contract also applies
 *     when the bridge subscribes to `priceStore` events (it does not today,
 *     but the infrastructure is kept symmetric for Phase 5a rollback R3).
 */

import { EventEmitter } from 'node:events';
import type { Price, PriceSource } from '@shared/types.js';
import {
  KIS_WS_TICK_TR_ID_INTEGRATED,
  WS_MAX_SUBSCRIPTIONS,
  WS_SUBSCRIBE_INTERVAL_MS,
} from '@shared/kis-constraints.js';
import { createChildLogger } from '@shared/logger.js';

import type {
  KisWsClient,
  WsConnectionState,
  WsSubscription,
} from '../kis/kis-ws-client.js';
import type { TierDiff } from './tier-manager.js';

const log = createChildLogger('realtime-bridge');

// === Parsed frame union =======================================================

/**
 * Discriminated union over what `parseTick` may produce for a single raw frame.
 * Non-tick frames (control, subscribe confirm, PINGPONG echo) are reported as
 * `ignore` so the bridge can log them at debug level without mis-handling.
 */
export type ParsedWsFrame =
  | { readonly kind: 'ticks'; readonly ticks: readonly RealtimeTick[] }
  | { readonly kind: 'tick'; readonly price: Price }
  | { readonly kind: 'ignore'; readonly reason: string }
  | { readonly kind: 'error'; readonly message: string };

export type WsTickParser = (raw: string) => ParsedWsFrame;

export interface RealtimeTick {
  readonly trId: string;
  readonly source: 'krx' | 'integrated' | 'nxt';
  readonly ticker: string;
  readonly price: number;
  readonly changeAbs: number;
  readonly changeRate: number;
  readonly volume: number;
  readonly tradeTime: string;
  readonly updatedAt: string;
  readonly isSnapshot: false;
}

// === Bridge events ============================================================

export interface RestoreProgress {
  readonly current: number;
  readonly total: number;
}

export interface RealtimeBridgeEvents {
  'restore-progress': [progress: RestoreProgress];
  'restore-complete': [total: number];
  'parse-error': [message: string];
  'apply-error': [message: string];
}

export interface RealtimeBridgeStats {
  readonly parsedTickCount: number;
  readonly appliedTickCount: number;
  readonly ignoredStaleTickCount: number;
  readonly sessionLimitIgnoredCount: number;
  readonly parseErrorCount: number;
  readonly applyErrorCount: number;
  readonly lastTickAt: string | null;
}

export type RealtimeApplyDisabledReason =
  | 'apply_disabled'
  | 'session_limit_reached';

/**
 * Public bridge surface. Extends EventEmitter via declaration-merging so
 * listeners get the typed overloads without falling back to `any`.
 */
export declare interface RealtimeBridge {
  on<E extends keyof RealtimeBridgeEvents>(
    event: E,
    listener: (...args: RealtimeBridgeEvents[E]) => void,
  ): this;
  off<E extends keyof RealtimeBridgeEvents>(
    event: E,
    listener: (...args: RealtimeBridgeEvents[E]) => void,
  ): this;
  once<E extends keyof RealtimeBridgeEvents>(
    event: E,
    listener: (...args: RealtimeBridgeEvents[E]) => void,
  ): this;
  emit<E extends keyof RealtimeBridgeEvents>(
    event: E,
    ...args: RealtimeBridgeEvents[E]
  ): boolean;
}

// === Dependencies =============================================================

/**
 * Minimal write-only shape from the Phase 4b `PriceStore`. The full store also
 * emits events; the bridge only writes.
 */
export interface PriceStoreWriter {
  setPrice(price: Price): void;
  getPrice(ticker: string): Price | undefined;
}

export interface RealtimeBridgeOptions {
  wsClient: KisWsClient;
  priceStore: PriceStoreWriter;
  parseTick: WsTickParser;
  /** TR identifier used for 체결 (tick) subscriptions. Defaults to integrated `H0UNCNT0`. */
  trId?: string;
  /** Inter-subscribe stagger; defaults to `WS_SUBSCRIBE_INTERVAL_MS`. */
  subscribeIntervalMs?: number;
  /** Injected `setTimeout` for deterministic tests. */
  setTimeoutFn?: (cb: () => void, ms: number) => unknown;
  /**
   * NXT4a safety gate. Defaults to false so WS parser wiring cannot mutate
   * app price state until a caller opts into the apply path explicitly.
   */
  applyTicksToPriceStore?: boolean;
  /**
   * NXT5c runtime gate. When provided, this dynamic predicate decides whether
   * parsed ticks may write to PriceStore. It lets runtime settings require
   * websocketEnabled AND applyTicksToPriceStore without rebuilding the bridge.
   */
  canApplyTicksToPriceStore?: (
    ticker?: string,
    stats?: RealtimeBridgeStats,
  ) => boolean;
  /**
   * Optional richer guard used by NXT7e session limits. Returning
   * `session_limit_reached` lets the bridge count ticks ignored after a hard
   * session limit without mixing them with stale-price ignores.
   */
  getApplyDisabledReason?: (
    ticker: string,
    stats: RealtimeBridgeStats,
  ) => RealtimeApplyDisabledReason | null;
  /** Called after a successful price apply so session gates can close at exact limits. */
  onPriceApplied?: (price: Price, stats: RealtimeBridgeStats) => void;
}

const DEFAULT_TR_ID = KIS_WS_TICK_TR_ID_INTEGRATED;

// === Implementation ===========================================================

export class RealtimeBridge extends EventEmitter {
  private readonly wsClient: KisWsClient;
  private readonly priceStore: PriceStoreWriter;
  private readonly parseTick: WsTickParser;
  private readonly trId: string;
  private readonly subscribeIntervalMs: number;
  private readonly applyTicksToPriceStore: boolean;
  private readonly canApplyTicksToPriceStore: (
    ticker?: string,
    stats?: RealtimeBridgeStats,
  ) => boolean;
  private readonly getApplyDisabledReason:
    | ((
        ticker: string,
        stats: RealtimeBridgeStats,
      ) => RealtimeApplyDisabledReason | null)
    | undefined;
  private readonly onPriceApplied:
    | ((price: Price, stats: RealtimeBridgeStats) => void)
    | undefined;
  private readonly scheduleTimeout: (
    cb: () => void,
    ms: number,
  ) => unknown;

  private readonly tier1: Set<string> = new Set();
  private readonly listenerDisposers: Array<() => void> = [];

  private restoring = false;
  private connectionSeen = false;
  private parsedTickCount = 0;
  private appliedTickCount = 0;
  private ignoredStaleTickCount = 0;
  private sessionLimitIgnoredCount = 0;
  private parseErrorCount = 0;
  private applyErrorCount = 0;
  private lastTickAt: string | null = null;

  constructor(options: RealtimeBridgeOptions) {
    super();
    this.wsClient = options.wsClient;
    this.priceStore = options.priceStore;
    this.parseTick = options.parseTick;
    this.trId = options.trId ?? DEFAULT_TR_ID;
    this.subscribeIntervalMs =
      options.subscribeIntervalMs ?? WS_SUBSCRIBE_INTERVAL_MS;
    this.applyTicksToPriceStore = options.applyTicksToPriceStore ?? false;
    this.canApplyTicksToPriceStore =
      options.canApplyTicksToPriceStore ??
      ((): boolean => this.applyTicksToPriceStore);
    this.getApplyDisabledReason = options.getApplyDisabledReason;
    this.onPriceApplied = options.onPriceApplied;
    const userSetTimeout = options.setTimeoutFn;
    this.scheduleTimeout =
      userSetTimeout !== undefined
        ? userSetTimeout
        : (cb: () => void, ms: number): unknown => setTimeout(cb, ms);

    const offMessage = this.wsClient.onMessage((raw) => {
      this.handleMessage(raw);
    });
    this.listenerDisposers.push(offMessage);
  }

  /** Returns the current Tier 1 ticker set (defensive copy). */
  getRealtimeTickers(): readonly string[] {
    return Array.from(this.tier1);
  }

  /**
   * Apply a tier diff: subscribe + unsubscribe the deltas, each spaced by
   * `subscribeIntervalMs`. The KIS WS client also enforces the stagger
   * internally, so the two layers are defense-in-depth.
   */
  async applyDiff(diff: TierDiff): Promise<void> {
    if (this.tier1.size + diff.subscribe.length - diff.unsubscribe.length > WS_MAX_SUBSCRIPTIONS) {
      log.warn(
        {
          size: this.tier1.size,
          subscribe: diff.subscribe.length,
          unsubscribe: diff.unsubscribe.length,
        },
        'applyDiff would exceed WS cap — applying anyway, callers must gate',
      );
    }

    for (const ticker of diff.unsubscribe) {
      try {
        await this.wsClient.unsubscribe(this.toSub(ticker));
        this.tier1.delete(ticker);
      } catch (err: unknown) {
        log.warn(
          {
            ticker,
            err: err instanceof Error ? err.message : String(err),
          },
          'ws unsubscribe failed',
        );
      }
    }

    for (const ticker of diff.subscribe) {
      try {
        await this.wsClient.subscribe(this.toSub(ticker));
        this.tier1.add(ticker);
      } catch (err: unknown) {
        log.warn(
          {
            ticker,
            err: err instanceof Error ? err.message : String(err),
          },
          'ws subscribe failed',
        );
      }
    }
  }

  /**
   * Connect the WS and subscribe any currently-tracked Tier 1 tickers.
   * Re-connect re-subscriptions come in automatically through
   * `onReconnect()` — this method is for first-boot warm-up.
   */
  async connect(): Promise<void> {
    await this.wsClient.connect();
    this.connectionSeen = true;
    await this.progressiveResubscribe();
  }

  /**
   * Hook meant to be wired at bootstrap: whenever the WS client transitions
   * back to `open` after a drop, progressively re-subscribe the Tier 1 set.
   *
   * The Phase 1 client does not emit a first-class `open` event; callers who
   * need custom polling around `state()` should invoke `progressiveResubscribe()`
   * directly. Exposed for completeness and for tests.
   */
  async onReconnect(): Promise<void> {
    await this.progressiveResubscribe();
  }

  /**
   * Subscribe every current Tier 1 ticker one at a time with the configured
   * stagger, emitting `restore-progress` after each success and
   * `restore-complete` at the end.
   */
  async progressiveResubscribe(): Promise<void> {
    if (this.restoring) return;
    this.restoring = true;
    const tickers = Array.from(this.tier1);
    const total = tickers.length;
    let current = 0;
    try {
      for (const ticker of tickers) {
        try {
          await this.wsClient.subscribe(this.toSub(ticker));
          current += 1;
          this.emit('restore-progress', { current, total });
        } catch (err: unknown) {
          log.warn(
            {
              ticker,
              err: err instanceof Error ? err.message : String(err),
            },
            'ws re-subscribe failed',
          );
        }
        await this.wait(this.subscribeIntervalMs);
      }
      this.emit('restore-complete', total);
    } finally {
      this.restoring = false;
    }
  }

  /**
   * Drop every subscription and detach all listeners. Used for graceful
   * shutdown and for the Phase 5a rollback R3 stage 1 procedure.
   */
  async disconnectAll(): Promise<void> {
    for (const dispose of this.listenerDisposers) {
      try {
        dispose();
      } catch (err: unknown) {
        log.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'bridge listener disposer threw',
        );
      }
    }
    this.listenerDisposers.length = 0;
    this.removeAllListeners();
    await this.stopSession();
  }

  /**
   * Stop the current realtime session while keeping bridge listeners attached
   * so a later session-enable can reuse the same runtime bridge.
   */
  async stopSession(): Promise<void> {
    try {
      await this.wsClient.disconnect();
    } catch (err: unknown) {
      log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'wsClient.disconnect threw',
      );
    }
    this.restoring = false;
    this.tier1.clear();
  }

  /** Exposed so supervisors can decide whether to trigger a re-subscribe. */
  wsState(): WsConnectionState {
    return this.wsClient.state();
  }

  /** Read-only: whether a connect() has been performed since construction. */
  hasConnected(): boolean {
    return this.connectionSeen;
  }

  /** Credential-free counters for NXT5c operator status surfaces. */
  getStats(): RealtimeBridgeStats {
    return {
      parsedTickCount: this.parsedTickCount,
      appliedTickCount: this.appliedTickCount,
      ignoredStaleTickCount: this.ignoredStaleTickCount,
      sessionLimitIgnoredCount: this.sessionLimitIgnoredCount,
      parseErrorCount: this.parseErrorCount,
      applyErrorCount: this.applyErrorCount,
      lastTickAt: this.lastTickAt,
    };
  }

  private toSub(ticker: string): WsSubscription {
    return { trId: this.trId, trKey: ticker };
  }

  private handleMessage(raw: string): void {
    let parsed: ParsedWsFrame;
    try {
      parsed = this.parseTick(raw);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn({ err: message }, 'parseTick threw');
      this.parseErrorCount += 1;
      this.emit('parse-error', message);
      return;
    }

    switch (parsed.kind) {
      case 'ticks':
        this.handleTicks(parsed.ticks);
        return;
      case 'tick':
        this.parsedTickCount += 1;
        this.recordLastTickAt(parsed.price.updatedAt);
        this.applyPrice(parsed.price);
        return;
      case 'ignore':
        log.debug({ reason: parsed.reason }, 'ws frame ignored');
        return;
      case 'error':
        log.warn({ message: parsed.message }, 'ws frame parse error');
        this.parseErrorCount += 1;
        this.emit('parse-error', parsed.message);
        return;
    }
  }

  private handleTicks(ticks: readonly RealtimeTick[]): void {
    for (const tick of ticks) {
      this.parsedTickCount += 1;
      this.recordLastTickAt(tick.updatedAt);
      this.applyPrice(mapRealtimeTickToPrice(tick));
    }
  }

  private applyPrice(price: Price): void {
    const disabledReason = this.applyDisabledReason(price.ticker);
    if (disabledReason !== null) {
      if (disabledReason === 'session_limit_reached') {
        this.sessionLimitIgnoredCount += 1;
      }
      log.debug(
        { ticker: price.ticker, reason: disabledReason },
        'ws price parsed but apply guard is disabled',
      );
      return;
    }

    const current = this.priceStore.getPrice(price.ticker);
    if (current !== undefined && !isNewerPrice(price, current)) {
      log.debug(
        {
          ticker: price.ticker,
          currentUpdatedAt: current.updatedAt,
          nextUpdatedAt: price.updatedAt,
        },
        'stale ws price ignored',
      );
      this.ignoredStaleTickCount += 1;
      return;
    }

    try {
      this.priceStore.setPrice(price);
      this.appliedTickCount += 1;
      this.onPriceApplied?.(price, this.getStats());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn({ ticker: price.ticker, err: message }, 'ws price apply failed');
      this.applyErrorCount += 1;
      this.emit('apply-error', message);
    }
  }

  private applyDisabledReason(ticker: string): RealtimeApplyDisabledReason | null {
    const stats = this.getStats();
    const richerReason = this.getApplyDisabledReason?.(ticker, stats);
    if (richerReason !== undefined) return richerReason;
    return this.canApplyTicksToPriceStore(ticker, stats)
      ? null
      : 'apply_disabled';
  }

  private recordLastTickAt(updatedAt: string | null): void {
    if (updatedAt === null) return;
    this.lastTickAt = updatedAt;
  }

  private wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.scheduleTimeout(resolve, ms);
    });
  }
}

function mapRealtimeTickToPrice(tick: RealtimeTick): Price {
  return {
    ticker: tick.ticker,
    price: tick.price,
    changeRate: tick.changeRate,
    changeAbs: tick.changeAbs,
    volume: tick.volume,
    updatedAt: tick.updatedAt,
    isSnapshot: false,
    source: mapTickSource(tick.source),
  };
}

function mapTickSource(source: RealtimeTick['source']): PriceSource {
  switch (source) {
    case 'krx':
      return 'ws-krx';
    case 'integrated':
      return 'ws-integrated';
    case 'nxt':
      return 'ws-nxt';
  }
}

function isNewerPrice(next: Price, current: Price): boolean {
  const nextMs = Date.parse(next.updatedAt);
  const currentMs = Date.parse(current.updatedAt);
  if (!Number.isFinite(nextMs) || !Number.isFinite(currentMs)) return true;
  return nextMs > currentMs;
}

/**
 * Factory mirrors the other Phase 4/5 modules so callers can inject
 * dependencies without invoking `new`.
 */
export function createRealtimeBridge(
  options: RealtimeBridgeOptions,
): RealtimeBridge {
  return new RealtimeBridge(options);
}
