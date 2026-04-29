/**
 * Graceful shutdown — registers SIGTERM/SIGINT handlers that tear down all
 * resources in a well-defined order before exiting:
 *
 *   (1) SSE close       — notify and remove all SSE clients
 *   (2) WS disconnect   — drop KIS WebSocket connections
 *   (3) Snapshot save   — flush in-memory prices to SQLite
 *   (4) WAL checkpoint  — PRAGMA wal_checkpoint(TRUNCATE)
 *   (5) process.exit    — 0 on clean, 1 if any step errored
 *
 * Each step is wrapped in try/catch so a failing step does not block later
 * steps. A hard timeout forces process.exit(1) if the sequence takes longer
 * than `timeoutMs` (default 10 000 ms).
 *
 * Returns an `unregister()` function so tests can tear down the handler.
 */

import { createChildLogger } from '@shared/logger.js';
import type { PriceStore } from '../price/price-store.js';

const log = createChildLogger('graceful-shutdown');

// === Structural interfaces ====================================================

/** Minimal SSE manager surface. Phase 6 will supply the real implementation. */
export interface SseManager {
  closeAll(): Promise<void>;
}

/** Minimal WS bridge surface. */
export interface WsBridge {
  disconnectAll(): Promise<void>;
}

/** Minimal snapshot store surface. */
export interface SnapshotSaver {
  saveAll(store: PriceStore): Promise<void>;
}

// === Deps =====================================================================

export interface GracefulShutdownDeps {
  /**
   * SSE manager. Optional — if not yet wired (Phase 6 hasn't landed) pass
   * `undefined` and the SSE step is skipped with a log message.
   */
  sse?: SseManager | undefined;
  ws: WsBridge;
  snapshot: SnapshotSaver;
  store: PriceStore;
  /** Calls `db.runCheckpoint()`. */
  checkpoint: () => void;
  /** Signals to intercept. Defaults to `['SIGTERM', 'SIGINT']`. */
  signals?: NodeJS.Signals[];
  /** Hard-timeout before forced exit. Defaults to 10_000 ms. */
  timeoutMs?: number;
}

// === Result ===================================================================

export interface GracefulShutdownHandle {
  /** Remove all registered signal listeners. Call in tests after each case. */
  unregister(): void;
  /**
   * Directly invoke the shutdown sequence and return its promise.
   * Exposed so tests can await completion without relying on signal emission.
   */
  triggerShutdown(): Promise<void>;
}

// === Implementation ===========================================================

export function registerGracefulShutdown(deps: GracefulShutdownDeps): GracefulShutdownHandle {
  const {
    sse,
    ws,
    snapshot,
    store,
    checkpoint,
    signals = ['SIGTERM', 'SIGINT'],
    timeoutMs = 10_000,
  } = deps;

  let shutdownInProgress = false;

  async function runShutdown(): Promise<void> {
    if (shutdownInProgress) return;
    shutdownInProgress = true;

    log.info('graceful shutdown initiated');

    let errorCount = 0;

    // Hard timeout: force-exit if the sequence hangs.
    const hardTimer = setTimeout(() => {
      log.error({ timeoutMs }, 'graceful shutdown timed out — forcing exit(1)');
      process.exit(1);
    }, timeoutMs);

    // Step 1: SSE close
    if (sse === undefined) {
      log.info('SSE manager not wired (Phase 6 pending) — skipping SSE close step');
    } else {
      try {
        await sse.closeAll();
        log.debug('SSE clients closed');
      } catch (err: unknown) {
        errorCount += 1;
        log.error(
          { err: err instanceof Error ? err.message : String(err) },
          'SSE closeAll failed — continuing shutdown',
        );
      }
    }

    // Step 2: WS disconnect
    try {
      await ws.disconnectAll();
      log.debug('WS disconnected');
    } catch (err: unknown) {
      errorCount += 1;
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        'WS disconnectAll failed — continuing shutdown',
      );
    }

    // Step 3: Snapshot save
    try {
      await snapshot.saveAll(store);
      log.debug('price snapshot saved');
    } catch (err: unknown) {
      errorCount += 1;
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        'snapshot saveAll failed — continuing shutdown',
      );
    }

    // Step 4: WAL checkpoint
    try {
      checkpoint();
      log.debug('WAL checkpoint completed');
    } catch (err: unknown) {
      errorCount += 1;
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        'WAL checkpoint failed — continuing shutdown',
      );
    }

    clearTimeout(hardTimer);

    // Step 5: exit
    const code = errorCount > 0 ? 1 : 0;
    log.info({ code, errorCount }, 'shutdown complete — exiting');
    process.exit(code);
  }

  function handler(): void {
    void runShutdown();
  }

  for (const sig of signals) {
    process.on(sig, handler);
  }

  function unregister(): void {
    for (const sig of signals) {
      process.off(sig, handler);
    }
  }

  return { unregister, triggerShutdown: runShutdown };
}
