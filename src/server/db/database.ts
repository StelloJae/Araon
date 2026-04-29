/**
 * Single-connection SQLite factory with WAL mode and tuned PRAGMAs.
 *
 * Call `getDb()` to obtain the shared connection; call `closeDb()` at shutdown.
 * The checkpoint timer is managed externally via `runCheckpoint()` so callers
 * can wire it to `DB_WAL_CHECKPOINT_INTERVAL_MS` without coupling this module
 * to a setInterval lifecycle.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { createChildLogger } from '@shared/logger.js';
import { resolveDataPath } from '../runtime-paths.js';

const log = createChildLogger('db');

let _db: Database.Database | null = null;
let _dbPath: string | null = null;

export function getDbPath(): string {
  return _dbPath ?? resolveDataPath('watchlist.db');
}

/**
 * Returns (or lazily opens) the single shared SQLite connection.
 * Safe to call multiple times — always returns the same instance.
 */
export function getDb(): Database.Database {
  if (_db !== null) {
    return _db;
  }

  const path = getDbPath();
  mkdirSync(dirname(path), { recursive: true });

  log.info({ path }, 'opening SQLite database');
  _dbPath = path;
  _db = new Database(path);

  _db.pragma('journal_mode = WAL');
  _db.pragma('busy_timeout = 5000');
  _db.pragma('foreign_keys = ON');
  _db.pragma('synchronous = NORMAL');

  log.debug('SQLite PRAGMAs applied (WAL, busy_timeout=5000, foreign_keys=ON, synchronous=NORMAL)');

  return _db;
}

/**
 * Closes the shared connection if it is open.
 * Should be called during graceful shutdown.
 */
export function closeDb(): void {
  if (_db === null) return;

  log.info('closing SQLite database');
  _db.close();
  _db = null;
  _dbPath = null;
}

/**
 * Runs `PRAGMA wal_checkpoint(TRUNCATE)` to reclaim WAL file space.
 * Intended to be called on the `DB_WAL_CHECKPOINT_INTERVAL_MS` schedule.
 */
export function runCheckpoint(): void {
  const db = getDb();
  db.pragma('wal_checkpoint(TRUNCATE)');
  log.debug('WAL checkpoint (TRUNCATE) completed');
}
