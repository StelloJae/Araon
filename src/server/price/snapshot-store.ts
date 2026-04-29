/**
 * Snapshot store — bridges the in-memory `PriceStore` and the SQLite
 * `price_snapshots` table via `PriceSnapshotRepository`.
 *
 * Responsibilities:
 *  - `saveAll`       — persist all current prices as a new snapshot batch.
 *  - `loadLatest`    — read the most-recent snapshot per ticker from DB.
 *  - `startPeriodicSave` — schedule recurring saves and return a stop fn.
 */

import type { PriceSnapshot } from '@shared/types.js';
import { SNAPSHOT_INTERVAL_MS } from '@shared/constants.js';
import { createChildLogger } from '@shared/logger.js';
import { PriceSnapshotRepository } from '../db/repositories.js';
import type { PriceStore } from './price-store.js';

const log = createChildLogger('snapshot-store');

export class SnapshotStore {
  private readonly repo: PriceSnapshotRepository;

  constructor(repo: PriceSnapshotRepository) {
    this.repo = repo;
  }

  /**
   * Read all prices from `store`, convert to `PriceSnapshot[]`, and persist
   * using the repository's `bulkInsert` (which uses `chunkedInsert` internally,
   * keeping each chunk ≤10 ms with `setImmediate` separation between chunks).
   */
  async saveAll(store: PriceStore): Promise<void> {
    const prices = store.getAllPrices();
    if (prices.length === 0) {
      log.debug('saveAll: nothing to persist');
      return;
    }

    const snapshotAt = new Date().toISOString();
    const snapshots: PriceSnapshot[] = prices.map((p) => ({
      ticker: p.ticker,
      price: p.price,
      changeRate: p.changeRate,
      volume: p.volume,
      snapshotAt,
    }));

    log.debug({ count: snapshots.length }, 'saving price snapshot');
    await this.repo.bulkInsert(snapshots);
    log.debug({ count: snapshots.length }, 'price snapshot saved');
  }

  /**
   * Returns the most-recent `PriceSnapshot` per ticker from the DB.
   * Uses the `findLatestAll` method on the repository which runs a grouped
   * `MAX(snapshot_at)` sub-query — no in-memory reduce needed.
   */
  loadLatest(): Promise<PriceSnapshot[]> {
    const rows = this.repo.findLatestAll();
    log.debug({ count: rows.length }, 'loaded latest snapshots');
    return Promise.resolve(rows);
  }

  /**
   * Schedule `saveAll` every `intervalMs` milliseconds.
   * Returns a zero-argument stop function that cancels the interval.
   *
   * @param store      The live price store to snapshot.
   * @param intervalMs Cadence in ms. Defaults to `SNAPSHOT_INTERVAL_MS` (30 min).
   */
  startPeriodicSave(
    store: PriceStore,
    intervalMs: number = SNAPSHOT_INTERVAL_MS,
  ): () => void {
    const handle = setInterval(() => {
      this.saveAll(store).catch((err: unknown) => {
        log.error(
          { err: err instanceof Error ? err.message : String(err) },
          'periodic snapshot save failed',
        );
      });
    }, intervalMs);

    return () => {
      clearInterval(handle);
    };
  }
}
