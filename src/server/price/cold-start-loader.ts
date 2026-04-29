/**
 * Cold-start initializer.
 *
 * On server start, before any live ticks arrive, this module loads the most
 * recent persisted snapshot into the in-memory `PriceStore` so SSE consumers
 * can receive "last known" prices immediately.
 *
 * Each loaded price is flagged `isSnapshot: true` so consumers can identify
 * warm snapshot values. The caller is responsible for flipping
 * individual entries to `isSnapshot: false` as fresh ticks arrive.
 *
 * Returns `marketStatus: 'snapshot'` — the caller (Phase 5b) decides when to
 * transition to `'open'` or `'closed'` based on KRX market hours.
 */

import type { MarketStatus, Price } from '@shared/types.js';
import { createChildLogger } from '@shared/logger.js';
import type { PriceStore } from './price-store.js';
import type { SnapshotStore } from './snapshot-store.js';

const log = createChildLogger('cold-start-loader');

export interface ColdStartResult {
  loaded: number;
  marketStatus: MarketStatus;
}

/**
 * Load the latest snapshot from `snapshotStore`, populate `store` with each
 * entry marked `isSnapshot: true`, and return the count of loaded prices plus
 * the initial market status flag.
 */
export async function primeStoreFromSnapshot(
  store: PriceStore,
  snapshotStore: SnapshotStore,
): Promise<ColdStartResult> {
  const snapshots = await snapshotStore.loadLatest();

  for (const snap of snapshots) {
    const price: Price = {
      ticker: snap.ticker,
      price: snap.price,
      changeRate: snap.changeRate,
      volume: snap.volume,
      updatedAt: snap.snapshotAt,
      isSnapshot: true,
    };
    store.setPrice(price);
  }

  log.info({ loaded: snapshots.length }, 'cold-start store primed from snapshot');

  return {
    loaded: snapshots.length,
    marketStatus: 'snapshot',
  };
}
