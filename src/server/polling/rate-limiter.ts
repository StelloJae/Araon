/**
 * Token-bucket rate limiter for KIS REST calls.
 *
 * The bucket holds up to `burst` tokens and refills continuously at
 * `ratePerSec` tokens/second. `acquire()` blocks until a token is available;
 * `tryAcquire()` is non-blocking and returns false on empty. Failures of
 * `tryAcquire()` increment the breach counter — used by Phase 4a tests to
 * assert that the polling scheduler never deliberately exceeds the KIS rate
 * limit.
 *
 * All rate-limit numbers are sourced from `kis-constraints.ts` via the caller;
 * no KIS magic number lives in this file.
 */

import { createChildLogger } from '@shared/logger.js';

const log = createChildLogger('rate-limiter');

export interface RateLimiterOptions {
  /** Refill rate in tokens per second. Must be > 0. */
  ratePerSec: number;
  /** Maximum tokens held in the bucket (burst capacity). Must be ≥ 1. */
  burst: number;
  /** Injected clock for tests. Defaults to `Date.now`. */
  now?: () => number;
  /** Injected `setTimeout` for tests (fake-timer compatible). Defaults to global. */
  setTimeoutFn?: (cb: () => void, ms: number) => unknown;
}

export interface RateLimiter {
  /** Await a token. Resolves once one is available; never rejects. */
  acquire(): Promise<void>;
  /** Return true + consume a token if one is available; otherwise return false. */
  tryAcquire(): boolean;
  /** Number of times `tryAcquire()` has returned false since last `reset()`. */
  getBreachCount(): number;
  /** Refill the bucket to `burst` and clear the breach counter. */
  reset(): void;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  if (options.ratePerSec <= 0) {
    throw new Error('ratePerSec must be > 0');
  }
  if (options.burst < 1) {
    throw new Error('burst must be >= 1');
  }

  const now = options.now ?? ((): number => Date.now());
  const scheduleTimeout =
    options.setTimeoutFn ??
    ((cb: () => void, ms: number): unknown => setTimeout(cb, ms));

  const ratePerSec = options.ratePerSec;
  const burst = options.burst;

  let tokens = burst;
  let lastRefillMs = now();
  let breachCount = 0;

  function refill(): void {
    const current = now();
    const elapsedMs = current - lastRefillMs;
    if (elapsedMs <= 0) {
      return;
    }
    const added = (elapsedMs / 1000) * ratePerSec;
    tokens = Math.min(burst, tokens + added);
    lastRefillMs = current;
  }

  function tryAcquire(): boolean {
    refill();
    if (tokens >= 1) {
      tokens -= 1;
      return true;
    }
    breachCount += 1;
    log.warn(
      { tokens, ratePerSec, burst, breachCount },
      'rate-limiter tryAcquire denied (bucket empty)',
    );
    return false;
  }

  function acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      function attempt(): void {
        refill();
        if (tokens >= 1) {
          tokens -= 1;
          resolve();
          return;
        }
        const deficit = 1 - tokens;
        const waitMs = Math.max(1, Math.ceil((deficit / ratePerSec) * 1000));
        scheduleTimeout(attempt, waitMs);
      }
      attempt();
    });
  }

  function getBreachCount(): number {
    return breachCount;
  }

  function reset(): void {
    tokens = burst;
    lastRefillMs = now();
    breachCount = 0;
  }

  return { acquire, tryAcquire, getBreachCount, reset };
}
