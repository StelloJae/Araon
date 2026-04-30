/**
 * SQLite repositories for every domain entity plus the `chunkedInsert` utility.
 *
 * All repositories accept a `Database.Database` by injection — no global
 * singleton here. Callers obtain the connection from `getDb()` in `database.ts`.
 *
 * Naming convention: TypeScript uses camelCase; SQL columns use snake_case.
 * Each repository method handles the mapping inline.
 */

import type Database from 'better-sqlite3';
import type { Stock, Sector, Tag, Favorite, PriceSnapshot, Tier } from '@shared/types.js';
import { CHUNKED_INSERT_SIZE } from '@shared/constants.js';
import { createChildLogger } from '@shared/logger.js';

const log = createChildLogger('repositories');

// === chunkedInsert ============================================================

/**
 * Inserts `rows` using the provided prepared statement in chunks of `chunkSize`
 * rows per transaction. Between chunks it yields to the event loop via
 * `setImmediate` so that large bulk inserts do not block I/O callbacks.
 *
 * Each individual chunk must complete in ≤10 ms for ≤50 rows on modern
 * hardware — enforced by the Phase 2 benchmark acceptance criterion.
 *
 * @param db        The open SQLite connection.
 * @param stmt      A `db.prepare(...)` statement ready to receive one row.
 * @param rows      Array of row objects or tuples matching the statement.
 * @param chunkSize Number of rows per transaction (default `CHUNKED_INSERT_SIZE`).
 */
export function chunkedInsert<T>(
  db: Database.Database,
  stmt: Database.Statement,
  rows: readonly T[],
  chunkSize: number = CHUNKED_INSERT_SIZE,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let offset = 0;

    function insertNextChunk(): void {
      if (offset >= rows.length) {
        resolve();
        return;
      }

      const chunk = rows.slice(offset, offset + chunkSize);
      offset += chunkSize;

      try {
        db.transaction(() => {
          for (const row of chunk) {
            (stmt as Database.Statement<[Record<string, unknown>]>).run(row as Record<string, unknown>);
          }
        })();
      } catch (err: unknown) {
        reject(err);
        return;
      }

      setImmediate(insertNextChunk);
    }

    setImmediate(insertNextChunk);
  });
}

// === Row shapes (snake_case DB ↔ camelCase TS) ================================

interface StockRow {
  ticker: string;
  name: string;
  market: string;
  created_at: string | null;
}

interface SectorRow {
  id: string;
  name: string;
  order: number;
}

interface TagRow {
  id: string;
  name: string;
  color: string;
}

interface FavoriteRow {
  ticker: string;
  tier: string;
  added_at: string;
}

interface PriceSnapshotRow {
  ticker: string;
  price: number;
  change_rate: number;
  volume: number;
  snapshot_at: string;
}

interface MasterStockRow {
  ticker: string;
  name: string;
  market: string;
  standard_code: string | null;
  market_cap_tier: string | null;
  source: string;
  updated_at: string;
}

export interface MasterStockEntry {
  ticker: string;
  name: string;
  market: 'KOSPI' | 'KOSDAQ';
  standardCode: string | null;
  marketCapTier: string | null;
}

export interface MasterStockInput {
  ticker: string;
  name: string;
  market: 'KOSPI' | 'KOSDAQ';
  standardCode?: string | null;
  /** @deprecated kept for back-compat; new pipelines should set marketCapSize. */
  marketCapTier?: string | null;
  // === B1a classification block (optional — older callers can omit) ===
  securityGroupCode?: string | null;
  marketCapSize?: string | null;
  indexIndustryLarge?: string | null;
  indexIndustryMiddle?: string | null;
  indexIndustrySmall?: string | null;
  /** JSON-stringified KRX sector membership object. */
  krxSectorFlags?: string | null;
  listedAt?: string | null;
}

export interface MasterStockClassificationRow {
  market: 'KOSPI' | 'KOSDAQ';
  indexIndustryLarge: string | null;
  indexIndustryMiddle: string | null;
  indexIndustrySmall: string | null;
  krxSectorFlags: string | null;
}

// === Mapping helpers ==========================================================

function rowToStock(row: StockRow): Stock {
  return {
    ticker: row.ticker,
    name: row.name,
    market: row.market as Stock['market'],
  };
}

function rowToSector(row: SectorRow): Sector {
  return {
    id: row.id,
    name: row.name,
    order: row.order,
  };
}

function rowToTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
  };
}

function rowToFavorite(row: FavoriteRow): Favorite {
  return {
    ticker: row.ticker,
    tier: row.tier as Tier,
    addedAt: row.added_at,
  };
}

function rowToSnapshot(row: PriceSnapshotRow): PriceSnapshot {
  return {
    ticker: row.ticker,
    price: row.price,
    changeRate: row.change_rate,
    volume: row.volume,
    snapshotAt: row.snapshot_at,
  };
}

// === StockRepository ==========================================================

export class StockRepository {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  findAll(): Stock[] {
    const rows = this.db
      .prepare<[], StockRow>('SELECT ticker, name, market, created_at FROM stocks ORDER BY ticker')
      .all();
    return rows.map(rowToStock);
  }

  findByTicker(ticker: string): Stock | null {
    const row = this.db
      .prepare<[string], StockRow>(
        'SELECT ticker, name, market, created_at FROM stocks WHERE ticker = ?',
      )
      .get(ticker);
    return row !== undefined ? rowToStock(row) : null;
  }

  upsert(stock: Stock): void {
    this.db
      .prepare(
        `INSERT INTO stocks (ticker, name, market, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(ticker) DO UPDATE SET name = excluded.name, market = excluded.market`,
      )
      .run(stock.ticker, stock.name, stock.market, new Date().toISOString());
  }

  delete(ticker: string): void {
    this.db.prepare('DELETE FROM stocks WHERE ticker = ?').run(ticker);
  }

  /**
   * Bulk-upsert `stocks` using `chunkedInsert`. Returns a promise that resolves
   * when all rows have been written.
   */
  bulkUpsert(stocks: readonly Stock[]): Promise<void> {
    const stmt = this.db.prepare(
      `INSERT INTO stocks (ticker, name, market, created_at)
       VALUES (@ticker, @name, @market, @created_at)
       ON CONFLICT(ticker) DO UPDATE SET name = excluded.name, market = excluded.market`,
    );

    const rows = stocks.map((s) => ({
      ticker: s.ticker,
      name: s.name,
      market: s.market,
      created_at: new Date().toISOString(),
    }));

    log.debug({ count: rows.length }, 'bulk-upsert stocks');
    return chunkedInsert(this.db, stmt, rows);
  }
}

// === SectorRepository =========================================================

export class SectorRepository {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  findAll(): Sector[] {
    const rows = this.db
      .prepare<[], SectorRow>('SELECT id, name, "order" FROM sectors ORDER BY "order"')
      .all();
    return rows.map(rowToSector);
  }

  findById(id: string): Sector | null {
    const row = this.db
      .prepare<[string], SectorRow>('SELECT id, name, "order" FROM sectors WHERE id = ?')
      .get(id);
    return row !== undefined ? rowToSector(row) : null;
  }

  upsert(sector: Sector): void {
    this.db
      .prepare(
        `INSERT INTO sectors (id, name, "order")
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, "order" = excluded."order"`,
      )
      .run(sector.id, sector.name, sector.order);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM sectors WHERE id = ?').run(id);
  }
}

// === TagRepository ============================================================

export class TagRepository {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  findAll(): Tag[] {
    const rows = this.db.prepare<[], TagRow>('SELECT id, name, color FROM tags').all();
    return rows.map(rowToTag);
  }

  findById(id: string): Tag | null {
    const row = this.db
      .prepare<[string], TagRow>('SELECT id, name, color FROM tags WHERE id = ?')
      .get(id);
    return row !== undefined ? rowToTag(row) : null;
  }

  create(tag: Tag): void {
    this.db
      .prepare('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)')
      .run(tag.id, tag.name, tag.color);
  }

  update(tag: Tag): void {
    this.db
      .prepare('UPDATE tags SET name = ?, color = ? WHERE id = ?')
      .run(tag.name, tag.color, tag.id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  }

  /** Returns all tag IDs attached to `ticker`. */
  findTagsForTicker(ticker: string): Tag[] {
    const rows = this.db
      .prepare<[string], TagRow>(
        `SELECT t.id, t.name, t.color
         FROM tags t
         JOIN stock_tags st ON st.tag_id = t.id
         WHERE st.ticker = ?`,
      )
      .all(ticker);
    return rows.map(rowToTag);
  }

  attachToStock(ticker: string, tagId: string): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO stock_tags (ticker, tag_id) VALUES (?, ?)`,
      )
      .run(ticker, tagId);
  }

  detachFromStock(ticker: string, tagId: string): void {
    this.db
      .prepare('DELETE FROM stock_tags WHERE ticker = ? AND tag_id = ?')
      .run(ticker, tagId);
  }
}

// === FavoriteRepository =======================================================

export class FavoriteRepository {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  findAll(): Favorite[] {
    const rows = this.db
      .prepare<[], FavoriteRow>(
        'SELECT ticker, tier, added_at FROM favorites ORDER BY added_at',
      )
      .all();
    return rows.map(rowToFavorite);
  }

  findByTicker(ticker: string): Favorite | null {
    const row = this.db
      .prepare<[string], FavoriteRow>(
        'SELECT ticker, tier, added_at FROM favorites WHERE ticker = ?',
      )
      .get(ticker);
    return row !== undefined ? rowToFavorite(row) : null;
  }

  findByTier(tier: Tier): Favorite[] {
    const rows = this.db
      .prepare<[string], FavoriteRow>(
        'SELECT ticker, tier, added_at FROM favorites WHERE tier = ? ORDER BY added_at',
      )
      .all(tier);
    return rows.map(rowToFavorite);
  }

  upsert(favorite: Favorite): void {
    this.db
      .prepare(
        `INSERT INTO favorites (ticker, tier, added_at)
         VALUES (?, ?, ?)
         ON CONFLICT(ticker) DO UPDATE SET tier = excluded.tier`,
      )
      .run(favorite.ticker, favorite.tier, favorite.addedAt);
  }

  delete(ticker: string): void {
    this.db.prepare('DELETE FROM favorites WHERE ticker = ?').run(ticker);
  }
}

// === PriceSnapshotRepository ==================================================

/**
 * Master KRX universe — the searchable but un-tracked catalog. Mutated only
 * by the master refresh service via `swapAll` in a single transaction.
 */
export class MasterStockRepository {
  constructor(private readonly db: Database.Database) {}

  count(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS cnt FROM master_stocks')
      .get() as { cnt: number };
    return row.cnt;
  }

  findAll(): MasterStockEntry[] {
    const rows = this.db
      .prepare(
        'SELECT ticker, name, market, standard_code, market_cap_tier, source, updated_at FROM master_stocks ORDER BY ticker',
      )
      .all() as MasterStockRow[];
    return rows.map((r) => ({
      ticker: r.ticker,
      name: r.name,
      market: r.market as 'KOSPI' | 'KOSDAQ',
      standardCode: r.standard_code,
      marketCapTier: r.market_cap_tier,
    }));
  }

  findOne(ticker: string): MasterStockEntry | null {
    const row = this.db
      .prepare(
        'SELECT ticker, name, market, standard_code, market_cap_tier, source, updated_at FROM master_stocks WHERE ticker = ?',
      )
      .get(ticker) as MasterStockRow | undefined;
    if (row === undefined) return null;
    return {
      ticker: row.ticker,
      name: row.name,
      market: row.market as 'KOSPI' | 'KOSDAQ',
      standardCode: row.standard_code,
      marketCapTier: row.market_cap_tier,
    };
  }

  /**
   * Read raw KIS classification columns for the given tickers. Missing
   * tickers are absent from the returned map.
   */
  findClassificationByTickers(
    tickers: ReadonlyArray<string>,
  ): Map<string, MasterStockClassificationRow> {
    const out = new Map<string, MasterStockClassificationRow>();
    if (tickers.length === 0) return out;
    const placeholders = tickers.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT
           ticker, market, index_industry_large, index_industry_middle,
           index_industry_small, krx_sector_flags
         FROM master_stocks
         WHERE ticker IN (${placeholders})`,
      )
      .all(...tickers) as Array<{
        ticker: string;
        market: string;
        index_industry_large: string | null;
        index_industry_middle: string | null;
        index_industry_small: string | null;
        krx_sector_flags: string | null;
      }>;
    for (const r of rows) {
      if (r.market !== 'KOSPI' && r.market !== 'KOSDAQ') continue;
      out.set(r.ticker, {
        market: r.market,
        indexIndustryLarge: r.index_industry_large,
        indexIndustryMiddle: r.index_industry_middle,
        indexIndustrySmall: r.index_industry_small,
        krxSectorFlags: r.krx_sector_flags,
      });
    }
    return out;
  }

  /**
   * Read raw `krx_sector_flags` JSON for the given tickers (legacy B1b
   * metadata mapping). Returns `null` for tickers absent from master_stocks
   * OR with a NULL flags column.
   */
  findKrxSectorFlagsByTickers(
    tickers: ReadonlyArray<string>,
  ): Map<string, string | null> {
    const out = new Map<string, string | null>();
    if (tickers.length === 0) return out;
    const placeholders = tickers.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT ticker, krx_sector_flags FROM master_stocks WHERE ticker IN (${placeholders})`,
      )
      .all(...tickers) as Array<{ ticker: string; krx_sector_flags: string | null }>;
    for (const r of rows) {
      out.set(r.ticker, r.krx_sector_flags);
    }
    return out;
  }

  /**
   * Atomic full replace. Uses a single transaction so a mid-swap failure
   * leaves the previous catalog intact. The caller is expected to have
   * already validated input length (`fetched.length > 0`) so we never wipe
   * to an empty table by accident.
   */
  swapAll(items: ReadonlyArray<MasterStockInput>, source: string): void {
    if (items.length === 0) {
      throw new Error('refusing to swap master_stocks to an empty set');
    }
    const updatedAt = new Date().toISOString();
    const insert = this.db.prepare(
      `INSERT INTO master_stocks (
        ticker, name, market, standard_code, market_cap_tier,
        security_group_code, market_cap_size,
        index_industry_large, index_industry_middle, index_industry_small,
        krx_sector_flags, listed_at,
        source, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const txn = this.db.transaction((rows: ReadonlyArray<MasterStockInput>) => {
      this.db.exec('DELETE FROM master_stocks');
      for (const r of rows) {
        insert.run(
          r.ticker,
          r.name,
          r.market,
          r.standardCode ?? null,
          r.marketCapTier ?? null,
          r.securityGroupCode ?? null,
          r.marketCapSize ?? null,
          r.indexIndustryLarge ?? null,
          r.indexIndustryMiddle ?? null,
          r.indexIndustrySmall ?? null,
          r.krxSectorFlags ?? null,
          r.listedAt ?? null,
          source,
          updatedAt,
        );
      }
    });
    txn(items);
  }
}

/**
 * Free-form metadata for the master refresh pipeline. Kept separate from the
 * row table so a refresh failure can record the error without touching
 * existing master_stocks data.
 */
export class MasterStockMetaRepository {
  constructor(private readonly db: Database.Database) {}

  get(key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM master_stock_meta WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  set(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO master_stock_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value);
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM master_stock_meta WHERE key = ?').run(key);
  }
}

export class PriceSnapshotRepository {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  findLatest(ticker: string): PriceSnapshot | null {
    const row = this.db
      .prepare<[string], PriceSnapshotRow>(
        `SELECT ticker, price, change_rate, volume, snapshot_at
         FROM price_snapshots
         WHERE ticker = ?
         ORDER BY snapshot_at DESC
         LIMIT 1`,
      )
      .get(ticker);
    return row !== undefined ? rowToSnapshot(row) : null;
  }

  findLatestAll(): PriceSnapshot[] {
    const rows = this.db
      .prepare<[], PriceSnapshotRow>(
        `SELECT ps.ticker, ps.price, ps.change_rate, ps.volume, ps.snapshot_at
         FROM price_snapshots ps
         INNER JOIN (
           SELECT ticker, MAX(snapshot_at) AS max_at
           FROM price_snapshots
           GROUP BY ticker
         ) latest ON ps.ticker = latest.ticker AND ps.snapshot_at = latest.max_at`,
      )
      .all();
    return rows.map(rowToSnapshot);
  }

  insert(snapshot: PriceSnapshot): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO price_snapshots (ticker, price, change_rate, volume, snapshot_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        snapshot.ticker,
        snapshot.price,
        snapshot.changeRate,
        snapshot.volume,
        snapshot.snapshotAt,
      );
  }

  /**
   * Bulk-insert snapshots using `chunkedInsert`.
   * Uses INSERT OR REPLACE so re-inserting the same (ticker, snapshot_at) is safe.
   */
  bulkInsert(snapshots: readonly PriceSnapshot[]): Promise<void> {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO price_snapshots (ticker, price, change_rate, volume, snapshot_at)
       VALUES (@ticker, @price, @change_rate, @volume, @snapshot_at)`,
    );

    const rows = snapshots.map((s) => ({
      ticker: s.ticker,
      price: s.price,
      change_rate: s.changeRate,
      volume: s.volume,
      snapshot_at: s.snapshotAt,
    }));

    log.debug({ count: rows.length }, 'bulk-insert price_snapshots');
    return chunkedInsert(this.db, stmt, rows);
  }

  /** Deletes all snapshots older than `cutoffIso` (ISO-8601 string). */
  deleteOlderThan(cutoffIso: string): number {
    const result = this.db
      .prepare('DELETE FROM price_snapshots WHERE snapshot_at < ?')
      .run(cutoffIso);
    return result.changes;
  }
}
