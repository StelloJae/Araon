import type Database from 'better-sqlite3';

import type { TossSseRefreshExecutionResult } from './toss-sse-refresh-executor.js';
import type { TossSseRefreshHint, TossSseRefreshResource } from './toss-sse-refresh-router.js';

export type TossSseRefreshRecordedResult = TossSseRefreshExecutionResult | 'failed';

export interface TossSseRefreshResultEntry {
  readonly id: string;
  readonly resource: TossSseRefreshResource;
  readonly ticker: string | null;
  readonly sourceType: string;
  readonly receivedAt: string;
  readonly result: TossSseRefreshRecordedResult;
  readonly reason: string;
  readonly recordedAt: string;
  readonly error: string | null;
}

export interface TossSseRefreshResultSnapshot {
  readonly items: readonly TossSseRefreshResultEntry[];
  readonly returnedCount: number;
}

export interface TossSseRefreshResultStore {
  record(
    hint: TossSseRefreshHint,
    result: TossSseRefreshRecordedResult,
    error?: string | null,
  ): TossSseRefreshResultEntry;
  snapshot(limit?: number): TossSseRefreshResultSnapshot;
}

export interface TossSseRefreshResultStoreOptions {
  readonly capacity?: number;
  readonly db?: Database.Database;
  readonly now?: () => string;
}

const DEFAULT_CAPACITY = 50;

interface TossSseRefreshResultRow {
  id: string;
  resource: TossSseRefreshResource;
  ticker: string | null;
  source_type: string;
  received_at: string;
  result: TossSseRefreshRecordedResult;
  reason: string;
  recorded_at: string;
  error: string | null;
}

export function createTossSseRefreshResultStore(
  options: TossSseRefreshResultStoreOptions = {},
): TossSseRefreshResultStore {
  const capacity = Math.max(1, Math.floor(options.capacity ?? DEFAULT_CAPACITY));
  const db = options.db ?? null;
  const now = options.now ?? (() => new Date().toISOString());
  const entries: TossSseRefreshResultEntry[] = [];
  let nextId = db === null ? 1 : resolveNextSqliteId(db);

  function record(
    hint: TossSseRefreshHint,
    result: TossSseRefreshRecordedResult,
    error: string | null = null,
  ): TossSseRefreshResultEntry {
    const entry: TossSseRefreshResultEntry = {
      id: `refresh-result-${nextId++}`,
      resource: hint.resource,
      ticker: hint.ticker,
      sourceType: hint.sourceType,
      receivedAt: hint.receivedAt,
      result,
      reason: hint.reason,
      recordedAt: now(),
      error: sanitizeError(error),
    };
    if (db !== null) {
      insertSqliteEntry(db, entry);
      pruneSqliteEntries(db, capacity);
      return entry;
    }
    entries.unshift(entry);
    if (entries.length > capacity) {
      entries.length = capacity;
    }
    return entry;
  }

  function snapshot(limit = capacity): TossSseRefreshResultSnapshot {
    const normalizedLimit = Math.max(0, Math.min(capacity, Math.floor(limit)));
    if (db !== null) {
      const items = selectSqliteEntries(db, normalizedLimit);
      return {
        items,
        returnedCount: items.length,
      };
    }
    const items = entries.slice(0, normalizedLimit);
    return {
      items,
      returnedCount: items.length,
    };
  }

  return { record, snapshot };
}

function resolveNextSqliteId(db: Database.Database): number {
  const rows = db
    .prepare<[], { id: string }>(
      `SELECT id FROM toss_sse_refresh_results WHERE id LIKE 'refresh-result-%'`,
    )
    .all();
  let max = 0;
  for (const row of rows) {
    const match = row.id.match(/^refresh-result-(\d+)$/);
    const suffix = match?.[1];
    if (suffix === undefined) continue;
    const numeric = Number.parseInt(suffix, 10);
    if (Number.isFinite(numeric) && numeric > max) {
      max = numeric;
    }
  }
  return max + 1;
}

function insertSqliteEntry(
  db: Database.Database,
  entry: TossSseRefreshResultEntry,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO toss_sse_refresh_results (
       id, resource, ticker, source_type, received_at, result, reason,
       recorded_at, error
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.id,
    entry.resource,
    entry.ticker,
    entry.sourceType,
    entry.receivedAt,
    entry.result,
    entry.reason,
    entry.recordedAt,
    entry.error,
  );
}

function pruneSqliteEntries(db: Database.Database, capacity: number): void {
  db.prepare(
    `DELETE FROM toss_sse_refresh_results
     WHERE id NOT IN (
       SELECT id
       FROM toss_sse_refresh_results
       ORDER BY recorded_at DESC, id DESC
       LIMIT ?
     )`,
  ).run(capacity);
}

function selectSqliteEntries(
  db: Database.Database,
  limit: number,
): TossSseRefreshResultEntry[] {
  const rows = db
    .prepare<[number], TossSseRefreshResultRow>(
      `SELECT id, resource, ticker, source_type, received_at, result, reason,
              recorded_at, error
       FROM toss_sse_refresh_results
       ORDER BY recorded_at DESC, id DESC
       LIMIT ?`,
    )
    .all(limit);
  return rows.map(rowToEntry);
}

function rowToEntry(row: TossSseRefreshResultRow): TossSseRefreshResultEntry {
  return {
    id: row.id,
    resource: row.resource,
    ticker: row.ticker,
    sourceType: row.source_type,
    receivedAt: row.received_at,
    result: row.result,
    reason: row.reason,
    recordedAt: row.recorded_at,
    error: row.error,
  };
}

function sanitizeError(value: string | null): string | null {
  if (value === null) return null;
  return 'TOSS_SSE_REFRESH_FAILED';
}
