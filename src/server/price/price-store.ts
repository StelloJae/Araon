/**
 * In-memory price store.
 *
 * Holds the most-recent `Price` per ticker in a `Map` and emits a
 * `'price-update'` event on every write. Phase 6 SSE consumes these events
 * to push live ticks to connected clients.
 *
 * Satisfies `PriceStoreLike` from `polling-scheduler.ts` — the scheduler
 * calls `setPrice(p)` directly without any adapter.
 */

import { EventEmitter } from 'node:events';
import type { Price } from '@shared/types.js';

// ---------------------------------------------------------------------------
// Typed EventEmitter overload
// ---------------------------------------------------------------------------

interface PriceStoreEvents {
  'price-update': [price: Price];
}

export interface PriceStoreOptions {
  enrichPrice?: (price: Price) => Price;
}

// Extend EventEmitter with a typed interface so callers get narrowed event
// signatures without falling back to `any`.
export declare interface PriceStore {
  on(event: 'price-update', listener: (price: Price) => void): this;
  off(event: 'price-update', listener: (price: Price) => void): this;
  once(event: 'price-update', listener: (price: Price) => void): this;
  emit(event: 'price-update', price: Price): boolean;
}

// ---------------------------------------------------------------------------
// PriceStore
// ---------------------------------------------------------------------------

export class PriceStore extends EventEmitter {
  private readonly _prices = new Map<string, Price>();
  private readonly enrichPrice: (price: Price) => Price;

  constructor(options: PriceStoreOptions = {}) {
    super();
    this.enrichPrice = options.enrichPrice ?? ((price) => price);
  }

  /**
   * Store the price and emit `'price-update'`.
   * Signature matches `PriceStoreLike.setPrice` from `polling-scheduler.ts`.
   */
  setPrice(price: Price): void {
    const enriched = this.enrichPrice(price);
    const merged = carryForwardPriceDetails(
      this._prices.get(enriched.ticker),
      enriched,
    );
    this._prices.set(merged.ticker, merged);
    this.emit('price-update', merged);
  }

  getPrice(ticker: string): Price | undefined {
    return this._prices.get(ticker);
  }

  /** Returns a defensive snapshot array — mutating it does not affect the store. */
  getAllPrices(): Price[] {
    return Array.from(this._prices.values());
  }

  size(): number {
    return this._prices.size;
  }

  /** Remove all entries — intended for tests. */
  clear(): void {
    this._prices.clear();
  }
}

const PRICE_DETAIL_KEYS = [
  'accumulatedTradeValue',
  'openPrice',
  'highPrice',
  'lowPrice',
  'marketCapKrw',
  'per',
  'pbr',
  'foreignOwnershipRate',
  'week52High',
  'week52Low',
  'dividendYield',
] as const satisfies ReadonlyArray<keyof Price>;

function carryForwardPriceDetails(previous: Price | undefined, next: Price): Price {
  if (previous === undefined) return next;
  let merged: Price = next;
  for (const key of PRICE_DETAIL_KEYS) {
    if (key in next) continue;
    const value = previous[key];
    if (value === undefined) continue;
    merged = { ...merged, [key]: value };
  }
  return merged;
}

// Unused variable kept only to make the typed events interface resolvable at
// the module level — TypeScript merges the class declaration with the interface
// above, which is the standard declaration-merging pattern for typed EventEmitter.
void (0 as unknown as PriceStoreEvents);
