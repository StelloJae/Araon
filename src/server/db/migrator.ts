/**
 * File-based SQLite migrator.
 *
 * Migration files live in `migrations/` alongside this module. Each `.sql`
 * file contains an UP section and a DOWN section separated by `-- DOWN ---`.
 * The version number is derived from the numeric prefix of the filename
 * (e.g. `001-init.sql` → version 1).
 *
 * `schema_version` tracks which migrations have been applied. The migrator
 * always runs migrations in ascending version order.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { createChildLogger } from '@shared/logger.js';

const log = createChildLogger('migrator');

const ARAON_MIGRATIONS_DIR_ENV = 'ARAON_MIGRATIONS_DIR';

const DOWN_MARKER = '-- DOWN ---';

interface MigrationFile {
  version: number;
  name: string;
  upSql: string;
  downSql: string;
}

/** Parse all `*.sql` files in the migrations directory, sorted by version. */
function getMigrationsDir(): string {
  const envDir = process.env[ARAON_MIGRATIONS_DIR_ENV];
  if (envDir !== undefined && envDir.length > 0) {
    return envDir;
  }

  const sourceDir = join(process.cwd(), 'src', 'server', 'db', 'migrations');
  if (existsSync(sourceDir)) {
    return sourceDir;
  }

  return sourceDir;
}

function loadMigrationFiles(): MigrationFile[] {
  const migrationsDir = getMigrationsDir();
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  return files.map((filename) => {
    const match = filename.match(/^(\d+)/);
    if (match === undefined || match === null || match[1] === undefined) {
      throw new Error(`Migration filename must start with a numeric version: ${filename}`);
    }
    const version = parseInt(match[1], 10);
    const raw = readFileSync(join(migrationsDir, filename), 'utf-8');

    const markerIndex = raw.indexOf(DOWN_MARKER);
    if (markerIndex === -1) {
      throw new Error(`Migration ${filename} is missing the '${DOWN_MARKER}' separator`);
    }

    const upSql = raw.slice(0, markerIndex).trim();
    const downSql = raw.slice(markerIndex + DOWN_MARKER.length).trim();

    return { version, name: filename, upSql, downSql };
  });
}

/** Returns the highest version number currently recorded in schema_version. */
function currentVersion(db: Database.Database): number {
  const tableExists = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table' AND name='schema_version'`,
    )
    .get() as { cnt: number };

  if (tableExists.cnt === 0) return 0;

  const row = db.prepare(`SELECT MAX(version) AS v FROM schema_version`).get() as {
    v: number | null;
  };
  return row.v ?? 0;
}

/**
 * Applies all pending migrations in ascending version order.
 * Each migration runs inside its own transaction.
 */
export function migrateUp(db: Database.Database): void {
  const migrations = loadMigrationFiles();
  const current = currentVersion(db);

  const pending = migrations.filter((m) => m.version > current);
  if (pending.length === 0) {
    log.debug({ current }, 'schema is up to date, no migrations to run');
    return;
  }

  for (const migration of pending) {
    log.info({ version: migration.version, name: migration.name }, 'applying migration');

    db.transaction(() => {
      db.exec(migration.upSql);
      db.prepare(`INSERT INTO schema_version (version, applied_at) VALUES (?, ?)`).run(
        migration.version,
        new Date().toISOString(),
      );
    })();

    log.info({ version: migration.version }, 'migration applied');
  }
}

/**
 * Rolls back migrations down to (but not including) `targetVersion`.
 * Defaults to rolling back all migrations (targetVersion = 0).
 * Each migration runs inside its own transaction.
 */
export function migrateDown(db: Database.Database, targetVersion = 0): void {
  const migrations = loadMigrationFiles();
  const current = currentVersion(db);

  const toRollback = migrations
    .filter((m) => m.version <= current && m.version > targetVersion)
    .sort((a, b) => b.version - a.version);

  if (toRollback.length === 0) {
    log.debug({ current, targetVersion }, 'nothing to roll back');
    return;
  }

  for (const migration of toRollback) {
    log.info({ version: migration.version, name: migration.name }, 'rolling back migration');

    db.transaction(() => {
      // Delete the version record first while schema_version still exists,
      // then run the DOWN SQL which may drop schema_version itself.
      db.prepare(`DELETE FROM schema_version WHERE version = ?`).run(migration.version);
      db.exec(migration.downSql);
    })();

    log.info({ version: migration.version }, 'migration rolled back');
  }
}
