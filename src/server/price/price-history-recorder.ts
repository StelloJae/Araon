import { createChildLogger } from '@shared/logger.js';
import {
  isRealtimePriceSource,
  PRICE_HISTORY_FALLBACK_SUPPRESS_MS,
} from '@shared/price-source.js';
import type {
  Price,
  PriceCandleSource,
  PriceHistoryPoint,
} from '@shared/types.js';
import type { PriceStore } from './price-store.js';

const log = createChildLogger('price-history-recorder');

export const PRICE_HISTORY_POINT_BUCKET_MS = 5_000;
export const PRICE_HISTORY_RETENTION_HOURS = 48;

const DEFAULT_FLUSH_INTERVAL_MS = 5_000;

export interface PriceHistoryPointWriter {
  bulkUpsertPoints(points: readonly PriceHistoryPoint[]): Promise<void>;
}

export interface PriceHistoryAggregator {
  recordPrice(price: Price): void;
  flushDirty(): Promise<void>;
  dirtyCount(): number;
}

export interface PriceHistoryRecorder {
  flushDirty(): Promise<void>;
  stop(): Promise<void>;
  getStats(): { recordErrorCount: number; flushErrorCount: number };
}

interface PriceHistoryAggregatorOptions {
  writer: PriceHistoryPointWriter;
  now?: () => Date;
}

export function createPriceHistoryAggregator(
  options: PriceHistoryAggregatorOptions,
): PriceHistoryAggregator {
  const now = options.now ?? (() => new Date());
  const points = new Map<string, PriceHistoryPoint>();
  const dirtyKeys = new Set<string>();
  const lastRealtimePointMsByTicker = new Map<string, number>();

  function recordPrice(price: Price): void {
    if (!validPrice(price)) return;

    const timestamp = pointTimestamp(price);
    const timestampMs = new Date(timestamp).getTime();
    const bucketAt = bucketAtForPoint(timestamp);
    const key = `${price.ticker}:${bucketAt}`;
    const existing = points.get(key);
    const nowIso = now().toISOString();
    const source = price.source ?? null;
    const realtime = isRealtimePriceSource(source);

    if (realtime) {
      lastRealtimePointMsByTicker.set(price.ticker, timestampMs);
    } else if (
      existing === undefined &&
      isNearbyRestFallback(price.ticker, timestampMs, lastRealtimePointMsByTicker)
    ) {
      return;
    }

    if (existing === undefined) {
      points.set(key, {
        ticker: price.ticker,
        bucketAt,
        price: price.price,
        changeRate: price.changeRate,
        sampleCount: 1,
        source,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    } else {
      const replaceValue = shouldReplacePoint(existing.source, source);
      points.set(key, {
        ...existing,
        price: replaceValue ? price.price : existing.price,
        changeRate: replaceValue ? price.changeRate : existing.changeRate,
        sampleCount: existing.sampleCount + 1,
        source: replaceValue ? preferredSource(existing.source, source) : existing.source,
        updatedAt: nowIso,
      });
    }
    dirtyKeys.add(key);
  }

  async function flushDirty(): Promise<void> {
    if (dirtyKeys.size === 0) return;
    const pending = Array.from(dirtyKeys)
      .map((key) => points.get(key))
      .filter((point): point is PriceHistoryPoint => point !== undefined)
      .sort((a, b) => a.bucketAt.localeCompare(b.bucketAt));
    await options.writer.bulkUpsertPoints(pending);
    dirtyKeys.clear();
  }

  return {
    recordPrice,
    flushDirty,
    dirtyCount: () => dirtyKeys.size,
  };
}

function pointTimestamp(price: Price): string {
  return price.tradeAt ?? price.updatedAt;
}

function validPrice(price: Price): boolean {
  if (price.isSnapshot) return false;
  if (!Number.isFinite(price.price) || price.price <= 0) return false;
  return !Number.isNaN(new Date(pointTimestamp(price)).getTime());
}

function bucketAtForPoint(timestamp: string): string {
  const ms = new Date(timestamp).getTime();
  const bucketMs =
    Math.floor(ms / PRICE_HISTORY_POINT_BUCKET_MS) * PRICE_HISTORY_POINT_BUCKET_MS;
  return new Date(bucketMs).toISOString();
}

function shouldReplacePoint(
  previous: PriceCandleSource | null,
  next: PriceCandleSource | null,
): boolean {
  if (isRealtimePriceSource(previous) && !isRealtimePriceSource(next)) return false;
  if (!isRealtimePriceSource(previous) && isRealtimePriceSource(next)) return true;
  if (previous !== null && next === null) return false;
  return true;
}

function preferredSource(
  previous: PriceCandleSource | null,
  next: PriceCandleSource | null,
): PriceCandleSource | null {
  return next ?? previous;
}

function isNearbyRestFallback(
  ticker: string,
  timestampMs: number,
  lastRealtimePointMsByTicker: ReadonlyMap<string, number>,
): boolean {
  const lastRealtimeMs = lastRealtimePointMsByTicker.get(ticker);
  return (
    lastRealtimeMs !== undefined &&
    timestampMs >= lastRealtimeMs &&
    timestampMs - lastRealtimeMs <= PRICE_HISTORY_FALLBACK_SUPPRESS_MS
  );
}

export interface PriceHistoryRecorderOptions {
  priceStore: PriceStore;
  aggregator: PriceHistoryAggregator;
  flushIntervalMs?: number;
  setIntervalFn?: (cb: () => Promise<void>, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
}

export function createPriceHistoryRecorder(
  options: PriceHistoryRecorderOptions,
): PriceHistoryRecorder {
  let recordErrorCount = 0;
  let flushErrorCount = 0;
  let stopped = false;

  const flush = async (): Promise<void> => {
    try {
      await options.aggregator.flushDirty();
    } catch (err: unknown) {
      flushErrorCount += 1;
      log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'price history flush failed',
      );
    }
  };

  const onPriceUpdate = (price: Price): void => {
    try {
      options.aggregator.recordPrice(price);
    } catch (err: unknown) {
      recordErrorCount += 1;
      log.warn(
        { ticker: price.ticker, err: err instanceof Error ? err.message : String(err) },
        'price history record failed',
      );
    }
  };

  options.priceStore.on('price-update', onPriceUpdate);

  const setIntervalFn =
    options.setIntervalFn ?? ((cb, ms): unknown => setInterval(() => { void cb(); }, ms));
  const clearIntervalFn =
    options.clearIntervalFn ?? ((handle: unknown): void => clearInterval(handle as ReturnType<typeof setInterval>));
  const intervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  const handle = setIntervalFn(flush, intervalMs);
  if (typeof handle === 'object' && handle !== null && 'unref' in handle) {
    const unref = (handle as { unref?: () => void }).unref;
    if (typeof unref === 'function') unref.call(handle);
  }

  async function stop(): Promise<void> {
    if (stopped) return;
    stopped = true;
    options.priceStore.off('price-update', onPriceUpdate);
    clearIntervalFn(handle);
    await flush();
  }

  return {
    flushDirty: flush,
    stop,
    getStats: () => ({ recordErrorCount, flushErrorCount }),
  };
}
