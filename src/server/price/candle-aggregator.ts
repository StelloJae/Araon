import { createChildLogger } from '@shared/logger.js';
import { isRealtimePriceSource } from '@shared/price-source.js';
import type { Price, PriceCandle, PriceCandleSource } from '@shared/types.js';
import type { PriceStore } from './price-store.js';
import {
  bucketAtForInterval,
  kstDateKey,
  sessionForTimestamp,
} from './candle-aggregation.js';

const log = createChildLogger('candle-aggregator');

const DEFAULT_FLUSH_INTERVAL_MS = 5_000;

export interface PriceCandleWriter {
  bulkUpsertCandles(candles: readonly PriceCandle[]): Promise<void>;
}

export interface CandleAggregator {
  recordPrice(price: Price): void;
  flushDirty(): Promise<void>;
  dirtyCount(): number;
}

export interface CandleRecorder {
  flushDirty(): Promise<void>;
  stop(): Promise<void>;
  getStats(): { recordErrorCount: number; flushErrorCount: number };
}

interface CandleAggregatorOptions {
  writer: PriceCandleWriter;
  now?: () => Date;
}

interface VolumeDelta {
  delta: number;
  partial: boolean;
}

interface LastCumulativeVolume {
  volume: number;
  observedAtMs: number;
}

export function createCandleAggregator(options: CandleAggregatorOptions): CandleAggregator {
  const now = options.now ?? (() => new Date());
  const candles = new Map<string, PriceCandle>();
  const dirtyKeys = new Set<string>();
  const lastCumulativeVolume = new Map<string, LastCumulativeVolume>();

  function candleTimestamp(price: Price): string {
    return price.tradeAt ?? price.updatedAt;
  }

  function volumeKey(price: Price): string {
    const timestamp = candleTimestamp(price);
    const session = sessionForTimestamp(timestamp);
    return `${price.ticker}:${kstDateKey(timestamp)}:${session}`;
  }

  function cumulativeDelta(price: Price): VolumeDelta {
    const key = volumeKey(price);
    const current = Math.max(0, Math.trunc(price.volume));
    const observedAtMs = Date.parse(candleTimestamp(price));
    const previous = lastCumulativeVolume.get(key);

    if (previous === undefined) {
      lastCumulativeVolume.set(key, { volume: current, observedAtMs });
      return { delta: 0, partial: true };
    }
    if (Number.isFinite(observedAtMs) && observedAtMs < previous.observedAtMs) {
      return { delta: 0, partial: true };
    }
    if (current < previous.volume) {
      lastCumulativeVolume.set(key, { volume: current, observedAtMs });
      return { delta: 0, partial: true };
    }
    lastCumulativeVolume.set(key, { volume: current, observedAtMs });
    return { delta: current - previous.volume, partial: false };
  }

  function candleKey(ticker: string, bucketAt: string): string {
    return `${ticker}:1m:${bucketAt}`;
  }

  function mergeSource(
    previous: PriceCandleSource | null,
    next: PriceCandleSource | null,
  ): PriceCandleSource | null {
    if (previous === null) return next;
    if (next === null) return previous;
    return previous === next ? previous : 'mixed';
  }

  function validPrice(price: Price): boolean {
    if (price.isSnapshot) return false;
    if (!isRealtimeCandleSource(price.source)) return false;
    if (!Number.isFinite(price.price) || price.price <= 0) return false;
    if (!Number.isFinite(price.volume) || price.volume < 0) return false;
    return !Number.isNaN(new Date(candleTimestamp(price)).getTime());
  }

  function recordPrice(price: Price): void {
    if (!validPrice(price)) return;

    const timestamp = candleTimestamp(price);
    const bucketAt = bucketAtForInterval(timestamp, '1m');
    const key = candleKey(price.ticker, bucketAt);
    const volume = cumulativeDelta(price);
    const source = price.source ?? null;
    const existing = candles.get(key);
    const updatedTimestamp = now().toISOString();

    if (existing === undefined) {
      candles.set(key, {
        ticker: price.ticker,
        interval: '1m',
        bucketAt,
        session: sessionForTimestamp(timestamp),
        open: price.price,
        high: price.price,
        low: price.price,
        close: price.price,
        volume: volume.delta,
        sampleCount: 1,
        source,
        isPartial: volume.partial,
        createdAt: updatedTimestamp,
        updatedAt: updatedTimestamp,
      });
    } else {
      candles.set(key, {
        ...existing,
        high: Math.max(existing.high, price.price),
        low: Math.min(existing.low, price.price),
        close: price.price,
        volume: existing.volume + volume.delta,
        sampleCount: existing.sampleCount + 1,
        source: mergeSource(existing.source, source),
        isPartial: existing.isPartial || volume.partial,
        updatedAt: updatedTimestamp,
      });
    }
    dirtyKeys.add(key);
  }

  async function flushDirty(): Promise<void> {
    if (dirtyKeys.size === 0) return;
    const pending = Array.from(dirtyKeys)
      .map((key) => candles.get(key))
      .filter((c): c is PriceCandle => c !== undefined)
      .sort((a, b) => a.bucketAt.localeCompare(b.bucketAt));
    await options.writer.bulkUpsertCandles(pending);
    dirtyKeys.clear();
  }

  return {
    recordPrice,
    flushDirty,
    dirtyCount: () => dirtyKeys.size,
  };
}

function isRealtimeCandleSource(source: Price['source']): boolean {
  return isRealtimePriceSource(source);
}

export interface CandleRecorderOptions {
  priceStore: PriceStore;
  aggregator: CandleAggregator;
  flushIntervalMs?: number;
  setIntervalFn?: (cb: () => Promise<void>, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
}

export function createCandleRecorder(options: CandleRecorderOptions): CandleRecorder {
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
        'candle flush failed',
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
        'candle record failed',
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
