/**
 * App-wide operational constants.
 *
 * KIS-specific numbers live in `kis-constraints.ts` — do NOT mix them here.
 * This file covers ports, DB paths, integrated KRX+NXT market-hour anchors,
 * and memory/SSE budgets used by the server runtime.
 */

// === Process / network ====================================================

/** Fastify HTTP port. */
export const SERVER_PORT = 3000;

// === Storage ==============================================================

/** Relative path to the SQLite database file from the process CWD. */
export const DB_PATH = 'data/watchlist.db';

/**
 * How often to run `PRAGMA wal_checkpoint(TRUNCATE)`.
 * 30 minutes balances WAL file growth against checkpoint cost.
 */
export const DB_WAL_CHECKPOINT_INTERVAL_MS = 30 * 60_000;

// === Integrated KRX+NXT market hours (KST) =================================
// Plain 'HH:MM' strings parsed by the scheduler against a KST clock.

export const MARKET_OPEN_KST = '08:00';
export const MARKET_CLOSE_KST = '20:00';
export const WARMUP_KST = '07:55';
export const SHUTDOWN_AFTER_CLOSE_KST = '20:05';

// === Memory budgets =======================================================
// Enforced by the Phase 10 healthcheck; exceeding these triggers a warning
// and, eventually, a managed restart.

export const MEMORY_BUDGET_RSS_MB = 200;
export const MEMORY_BUDGET_HEAP_MB = 100;

// === Snapshots & SSE ======================================================

/** Warm-snapshot persistence cadence (every 30 minutes during market hours). */
export const SNAPSHOT_INTERVAL_MS = 30 * 60_000;

/** SSE comment-line keepalive interval to defeat proxy idle timeouts. */
export const SSE_HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Minimum gap between successive SSE `price-update` emissions per ticker.
 * Drops intra-window ticks to keep SSE emission bounded.
 */
export const SSE_THROTTLE_MS = 100;

// === DB write tuning ======================================================

/**
 * Rows per chunk in `chunkedInsert` — keeps each transaction under ~10ms on
 * better-sqlite3 so the event loop stays responsive.
 */
export const CHUNKED_INSERT_SIZE = 50;
