/**
 * SSE connection manager.
 *
 * `createSseManager` wires the PriceStore event feed to a set of SSE clients.
 * On every new connection a full snapshot is pushed immediately. Price updates
 * are batched within a `throttleMs` window; only the latest value per ticker
 * survives the window. Heartbeats are sent independently per client at
 * `heartbeatIntervalMs`.
 *
 * Implements the `SseManager` structural interface from `graceful-shutdown.ts`
 * so Phase 5b can call `closeAll()` during process termination.
 */

import { createChildLogger } from '@shared/logger.js';
import type { Price, MarketStatus, PriceUpdateEvent, SnapshotEvent, HeartbeatEvent, ServerErrorEvent } from '@shared/types.js';
import type { PriceStore } from '../price/price-store.js';
import { serializeEvent, nextSequenceId } from './sse-serializer.js';
import { SSE_HEARTBEAT_INTERVAL_MS, SSE_THROTTLE_MS } from '@shared/constants.js';

const log = createChildLogger('sse-manager');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SseManagerDeps {
  priceStore: PriceStore;
  getInitialSnapshot: () => Price[];
  getMarketStatus: () => MarketStatus;
  heartbeatIntervalMs?: number;
  throttleMs?: number;
}

export interface SseManagerHandle {
  /**
   * Register a new SSE client.
   *
   * Immediately sends a full `SnapshotEvent`, then forwards throttled
   * `PriceUpdateEvent`s and periodic `HeartbeatEvent`s.
   *
   * Returns a `detach` function that tears down all state for this client.
   */
  attachClient(write: (frame: string) => void, close: () => void): () => void;
  /** Detach all clients and release the `'price-update'` listener. */
  closeAll(): Promise<void>;
  /** Push a `ServerErrorEvent` to every connected client. */
  broadcastError(code: string, message: string, retryable: boolean): void;
  /** Number of currently attached clients (for metrics / tests). */
  getClientCount(): number;
}

// ---------------------------------------------------------------------------
// Internal client state
// ---------------------------------------------------------------------------

interface Client {
  write: (frame: string) => void;
  close: () => void;
  /** Ticker → latest price accumulated in the current throttle window. */
  pendingUpdates: Map<string, Price>;
  throttleTimer: ReturnType<typeof setTimeout> | null;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSseManager(deps: SseManagerDeps): SseManagerHandle {
  const {
    priceStore,
    getInitialSnapshot,
    getMarketStatus,
    heartbeatIntervalMs = SSE_HEARTBEAT_INTERVAL_MS,
    throttleMs = SSE_THROTTLE_MS,
  } = deps;

  const clients = new Map<symbol, Client>();

  // ------------------------------------------------------------------
  // PriceStore listener — enqueue updates for every connected client
  // ------------------------------------------------------------------

  function onPriceUpdate(price: Price): void {
    for (const client of clients.values()) {
      client.pendingUpdates.set(price.ticker, price);

      if (client.throttleTimer === null) {
        client.throttleTimer = setTimeout(() => {
          flushUpdates(client);
        }, throttleMs);
      }
    }
  }

  priceStore.on('price-update', onPriceUpdate);

  // ------------------------------------------------------------------
  // Flush one client's throttle window
  // ------------------------------------------------------------------

  function flushUpdates(client: Client): void {
    client.throttleTimer = null;
    if (client.pendingUpdates.size === 0) return;

    for (const price of client.pendingUpdates.values()) {
      const ev: PriceUpdateEvent = {
        type: 'price-update',
        id: nextSequenceId(),
        price,
      };
      client.write(serializeEvent(ev));
    }
    client.pendingUpdates.clear();
  }

  // ------------------------------------------------------------------
  // attachClient
  // ------------------------------------------------------------------

  function attachClient(write: (frame: string) => void, close: () => void): () => void {
    const key = Symbol('client');

    const client: Client = {
      write,
      close,
      pendingUpdates: new Map(),
      throttleTimer: null,
      heartbeatTimer: null,
    };

    clients.set(key, client);
    log.debug({ clientCount: clients.size }, 'SSE client attached');

    // Immediate full snapshot
    const snapshotEv: SnapshotEvent = {
      type: 'snapshot',
      id: nextSequenceId(),
      prices: getInitialSnapshot(),
      marketStatus: getMarketStatus(),
    };
    write(serializeEvent(snapshotEv));

    // Per-client heartbeat
    client.heartbeatTimer = setInterval(() => {
      const hbEv: HeartbeatEvent = {
        type: 'heartbeat',
        id: nextSequenceId(),
      };
      write(serializeEvent(hbEv));
    }, heartbeatIntervalMs);

    function detach(): void {
      const c = clients.get(key);
      if (c === undefined) return;

      if (c.throttleTimer !== null) {
        clearTimeout(c.throttleTimer);
        c.throttleTimer = null;
      }
      if (c.heartbeatTimer !== null) {
        clearInterval(c.heartbeatTimer);
        c.heartbeatTimer = null;
      }

      clients.delete(key);
      log.debug({ clientCount: clients.size }, 'SSE client detached');
    }

    return detach;
  }

  // ------------------------------------------------------------------
  // closeAll
  // ------------------------------------------------------------------

  async function closeAll(): Promise<void> {
    priceStore.off('price-update', onPriceUpdate);

    for (const client of clients.values()) {
      if (client.throttleTimer !== null) {
        clearTimeout(client.throttleTimer);
        client.throttleTimer = null;
      }
      if (client.heartbeatTimer !== null) {
        clearInterval(client.heartbeatTimer);
        client.heartbeatTimer = null;
      }
      try {
        client.close();
      } catch (err: unknown) {
        log.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'error closing SSE client during closeAll',
        );
      }
    }

    clients.clear();
    log.info('all SSE clients closed');
  }

  // ------------------------------------------------------------------
  // broadcastError
  // ------------------------------------------------------------------

  function broadcastError(code: string, message: string, retryable: boolean): void {
    const ev: ServerErrorEvent = {
      type: 'error',
      id: nextSequenceId(),
      code,
      message,
      retryable,
    };
    const frame = serializeEvent(ev);
    for (const client of clients.values()) {
      client.write(frame);
    }
  }

  // ------------------------------------------------------------------
  // getClientCount
  // ------------------------------------------------------------------

  function getClientCount(): number {
    return clients.size;
  }

  return { attachClient, closeAll, broadcastError, getClientCount };
}
