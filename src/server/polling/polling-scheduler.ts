/**
 * REST polling scheduler.
 *
 * Iterates every stock in the repository and refreshes its price through the
 * injected KIS REST client at a rate gated by the `RateLimiter`. Tier-agnostic
 * by design — the scheduler does NOT filter on `favorites.tier`, so a Phase 5a
 * rollback that leaves `tier='realtime'` rows behind still receives updates
 * via polling (plan §5a R3 "rollback patch").
 *
 * The `priceStore` dependency is a minimal write-only shape so this file can
 * be authored before Phase 4b exists; the real store will be injected at
 * bootstrap.
 */

import { createChildLogger } from '@shared/logger.js';
import type { Price, Stock } from '@shared/types.js';

import type { RateLimiter } from './rate-limiter.js';
import type { SettingsStore } from '../settings-store.js';

const log = createChildLogger('polling-scheduler');

export interface PriceStoreLike {
  setPrice(price: Price): void;
}

export interface StockRepoLike {
  findAll(): Stock[];
}

export interface PollingRestClient {
  /**
   * Fetch the latest price for `ticker`. Implementation lives in Phase 5a
   * (real KIS 시세 endpoint); the scheduler only needs a callable contract.
   */
  fetchPrice(ticker: string): Promise<Price>;
}

export interface PollingSchedulerStatus {
  running: boolean;
  cycleCount: number;
  lastCycleMs: number;
  tickersInCycle: number;
  errorCount: number;
  throttledCount: number;
  /** 95th percentile per-request latency across the last cycle (ms). */
  lastCycleP95Ms: number;
}

export interface PollingScheduler {
  start(): void;
  stop(): Promise<void>;
  getStatus(): PollingSchedulerStatus;
}

export interface PollingSchedulerDeps {
  restClient: PollingRestClient;
  stockRepo: StockRepoLike;
  priceStore: PriceStoreLike;
  rateLimiter: RateLimiter;
  settings: SettingsStore;
  /** Injected `setImmediate` for tests. Defaults to global. */
  setImmediateFn?: (cb: () => void) => unknown;
  /** Injected `setTimeout` for tests. Defaults to global. */
  setTimeoutFn?: (cb: () => void, ms: number) => unknown;
  /** Injected clock for benchmarks. Defaults to `Date.now`. */
  now?: () => number;
}

export function createPollingScheduler(
  deps: PollingSchedulerDeps,
): PollingScheduler {
  const scheduleImmediate =
    deps.setImmediateFn ??
    ((cb: () => void): unknown => setImmediate(cb));
  const scheduleTimeout =
    deps.setTimeoutFn ??
    ((cb: () => void, ms: number): unknown => setTimeout(cb, ms));
  const now = deps.now ?? ((): number => Date.now());

  let running = false;
  let loopPromise: Promise<void> | null = null;
  let cycleCount = 0;
  let lastCycleMs = 0;
  let tickersInCycle = 0;
  let errorCount = 0;
  let throttledCount = 0;
  let lastCycleP95Ms = 0;
  let cycleInFlight = false;
  let wakeWaiter: (() => void) | null = null;

  // Per-cycle latency samples used to compute p95. Reset per cycle.
  let latencySamples: number[] = [];

  // Shared start pacer: queue of acquire() calls, each spaced by
  // (pollingMinStartGapMs + jitter) from the prior one. Prevents concurrent
  // workers from starting requests simultaneously even when the token-bucket
  // rate limiter would allow it — which is the actual trigger for KIS's
  // sliding-window throttle rejections.
  let pacerTail: Promise<void> = Promise.resolve();
  let lastStartAtMs = 0;

  async function pacerWait(): Promise<void> {
    const settings = deps.settings.snapshot();
    const gap = settings.pollingMinStartGapMs ?? 0;
    const jitterSpan = settings.pollingStartJitterMs ?? 0;

    // Fast path: when pacing is disabled, skip the microtask chain entirely
    // so tests with fake timers don't drown in queued microtasks.
    if (gap === 0 && jitterSpan === 0) return;

    const step = async (): Promise<void> => {
      const jitter = jitterSpan > 0
        ? (Math.random() * jitterSpan) - jitterSpan / 2
        : 0;
      const target = lastStartAtMs + gap + jitter;
      const waitMs = Math.max(0, target - now());
      if (waitMs > 0) {
        await new Promise<void>((resolve) => {
          scheduleTimeout(resolve, waitMs);
        });
      }
      lastStartAtMs = now();
    };
    const next = pacerTail.then(step);
    pacerTail = next.catch(() => undefined);
    return next;
  }

  function isThrottleError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /초당 거래건수를 초과|EGW00201|rate.*limit/i.test(msg);
  }

  function p95(samples: readonly number[]): number {
    if (samples.length === 0) return 0;
    const sorted = [...samples].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
    return Math.round(sorted[Math.max(0, idx)] ?? 0);
  }

  async function pollTicker(ticker: string): Promise<void> {
    await pacerWait();
    await deps.rateLimiter.acquire();
    const startedAt = now();
    try {
      const price = await deps.restClient.fetchPrice(ticker);
      deps.priceStore.setPrice(price);
      latencySamples.push(now() - startedAt);
    } catch (err: unknown) {
      errorCount += 1;
      latencySamples.push(now() - startedAt);
      const throttled = isThrottleError(err);
      if (throttled) throttledCount += 1;
      log.warn(
        {
          ticker,
          throttled,
          err: err instanceof Error ? err.message : String(err),
        },
        'polling fetch failed — skipping ticker',
      );
    }
  }

  async function runCycle(): Promise<void> {
    cycleInFlight = true;
    const cycleStartedAt = now();
    const stocks = deps.stockRepo.findAll();
    tickersInCycle = stocks.length;
    if (stocks.length === 0) {
      lastCycleMs = now() - cycleStartedAt;
      cycleCount += 1;
      cycleInFlight = false;
      return;
    }

    // Bounded-concurrency worker pool.
    // Rate limiter gates total rps; this controls in-flight count so we
    // parallelise RTT-bound requests without stampeding KIS. Workers pull
    // from a shared index queue; each completes when the queue drains.
    const maxInFlight = Math.min(
      deps.settings.snapshot().pollingMaxInFlight,
      stocks.length,
    );
    let nextIndex = 0;
    const errorsBefore = errorCount;

    async function worker(): Promise<void> {
      while (running) {
        const i = nextIndex;
        nextIndex += 1;
        if (i >= stocks.length) {
          return;
        }
        // pollTicker swallows its own errors and bumps errorCount, so each
        // ticker failure is isolated from the others.
        await pollTicker(stocks[i]!.ticker);
      }
    }

    // Reset per-cycle samples before workers start writing.
    latencySamples = [];
    const throttledBefore = throttledCount;

    const workers = Array.from({ length: maxInFlight }, () => worker());
    await Promise.allSettled(workers);

    lastCycleMs = now() - cycleStartedAt;
    cycleCount += 1;
    const failures = errorCount - errorsBefore;
    const cycleThrottled = throttledCount - throttledBefore;
    const succeeded = tickersInCycle - failures;
    const effectiveRps = lastCycleMs > 0
      ? Number(((tickersInCycle * 1000) / lastCycleMs).toFixed(2))
      : 0;
    lastCycleP95Ms = p95(latencySamples);
    log.debug(
      {
        cycleCount,
        lastCycleMs,
        lastCycleP95Ms,
        tickersInCycle,
        succeeded,
        failures,
        cycleThrottled,
        effectiveRps,
        maxInFlight,
        errorCount,
        throttledCount,
      },
      'polling cycle complete',
    );
    cycleInFlight = false;
  }

  function yieldEventLoop(): Promise<void> {
    return new Promise<void>((resolve) => {
      scheduleImmediate(resolve);
    });
  }

  function wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;
      const settle = (): void => {
        if (settled) return;
        settled = true;
        wakeWaiter = null;
        resolve();
      };
      wakeWaiter = settle;
      scheduleTimeout(settle, ms);
    });
  }

  async function loop(): Promise<void> {
    while (running) {
      try {
        await runCycle();
      } catch (err: unknown) {
        errorCount += 1;
        log.error(
          { err: err instanceof Error ? err.message : String(err) },
          'polling cycle threw — continuing',
        );
        cycleInFlight = false;
      }
      if (!running) {
        break;
      }
      await yieldEventLoop();
      const delayMs = deps.settings.snapshot().pollingCycleDelayMs;
      if (delayMs > 0) {
        await wait(delayMs);
      }
    }
  }

  function start(): void {
    if (running) {
      return;
    }
    running = true;
    loopPromise = loop();
  }

  async function stop(): Promise<void> {
    if (!running) {
      if (loopPromise !== null) {
        await loopPromise;
        loopPromise = null;
      }
      return;
    }
    running = false;
    if (wakeWaiter !== null) {
      wakeWaiter();
    }
    const pending = loopPromise;
    loopPromise = null;
    if (pending !== null) {
      await pending;
    }
  }

  function getStatus(): PollingSchedulerStatus {
    return {
      running,
      cycleCount,
      lastCycleMs,
      tickersInCycle,
      errorCount,
      throttledCount,
      lastCycleP95Ms,
    };
  }

  return { start, stop, getStatus };
}
