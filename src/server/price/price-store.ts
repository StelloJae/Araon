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

  /**
   * Store the price and emit `'price-update'`.
   * Signature matches `PriceStoreLike.setPrice` from `polling-scheduler.ts`.
   */
  setPrice(price: Price): void {
    this._prices.set(price.ticker, price);
    this.emit('price-update', price);
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

// Unused variable kept only to make the typed events interface resolvable at
// the module level — TypeScript merges the class declaration with the interface
// above, which is the standard declaration-merging pattern for typed EventEmitter.
void (0 as unknown as PriceStoreEvents);
