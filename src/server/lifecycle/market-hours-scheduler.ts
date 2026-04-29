/**
 * Integrated KRX+NXT market hours scheduler.
 *
 * Fires async lifecycle hooks at the integrated-feed daily schedule:
 *   07:55 → onWarmup   (connection warm-up)
 *   08:00 → onOpen     (NXT pre-market opens)
 *   20:00 → onClose    (NXT after-market closes)
 *   20:05 → onShutdown (tear down WS, save snapshot)
 *
 * // Assumption: host clock is KST
 * The scheduler reads host-local time directly. All time comparisons use
 * 'HH:MM' strings from @shared/constants so no literal time values appear here.
 *
 * Idempotency: each transition fires at most once per calendar day. The fired
 * set is keyed by `${date}:${phase}` so a midnight rollover resets the gate.
 *
 * Late-boot catchup: on startup (and on each tick) the scheduler evaluates
 * which transitions are in the past for today and fires any that have not yet
 * been fired. This ensures a process that starts at 10:00 still invokes
 * onWarmup and onOpen before the first tick completes.
 */

import {
  MARKET_OPEN_KST,
  MARKET_CLOSE_KST,
  WARMUP_KST,
  SHUTDOWN_AFTER_CLOSE_KST,
} from '@shared/constants.js';
import { createChildLogger } from '@shared/logger.js';

const log = createChildLogger('market-hours-scheduler');

// === Types ====================================================================

export type MarketPhase = 'pre-open' | 'open' | 'closed';

export interface MarketHoursSchedulerDeps {
  onWarmup: () => Promise<void>;
  onOpen: () => Promise<void>;
  onClose: () => Promise<void>;
  onShutdown: () => Promise<void>;
  /** Injected clock for testability. Defaults to `() => new Date()`. */
  clock?: () => Date;
  /**
   * Stub holiday/closure calendar. Return `true` to suppress all handler
   * invocations on the given date. v1 holidays are out of scope per plan §7;
   * this hook is a forward-compatibility shim.
   */
  holidayCalendar?: (d: Date) => boolean;
  /** Interval between scheduler ticks in ms. Defaults to 60_000 (1 minute). */
  tickMs?: number;
}

export interface MarketHoursScheduler {
  start(): void;
  stop(): void;
  getCurrentPhase(): MarketPhase;
}

// === Helpers ==================================================================

/** Parse 'HH:MM' into { h, m } for numeric comparison. */
function parseHHMM(hhmm: string): { h: number; m: number } {
  const [hStr, mStr] = hhmm.split(':') as [string, string];
  return { h: parseInt(hStr, 10), m: parseInt(mStr, 10) };
}

/** Convert a Date to total minutes since midnight (in host-local time). */
function toMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Convert 'HH:MM' to total minutes since midnight. */
function hhmmToMinutes(hhmm: string): number {
  const { h, m } = parseHHMM(hhmm);
  return h * 60 + m;
}

/** YYYY-MM-DD string in host-local time, used as the idempotency day key. */
function localDateString(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** Returns true if d falls on a Saturday (6) or Sunday (0). */
function isWeekend(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

// === Transition table =========================================================

type TransitionName = 'warmup' | 'open' | 'close' | 'shutdown';

interface Transition {
  readonly name: TransitionName;
  readonly hhmmMinutes: number;
}

const TRANSITIONS: readonly Transition[] = [
  { name: 'warmup',   hhmmMinutes: hhmmToMinutes(WARMUP_KST) },
  { name: 'open',     hhmmMinutes: hhmmToMinutes(MARKET_OPEN_KST) },
  { name: 'close',    hhmmMinutes: hhmmToMinutes(MARKET_CLOSE_KST) },
  { name: 'shutdown', hhmmMinutes: hhmmToMinutes(SHUTDOWN_AFTER_CLOSE_KST) },
];

// Pre-compute phase boundaries once (no literals in loop body).
const OPEN_MINUTES     = hhmmToMinutes(MARKET_OPEN_KST);
const CLOSE_MINUTES    = hhmmToMinutes(MARKET_CLOSE_KST);
const WARMUP_MINUTES   = hhmmToMinutes(WARMUP_KST);

// === Factory ==================================================================

export function createMarketHoursScheduler(
  deps: MarketHoursSchedulerDeps,
): MarketHoursScheduler {
  const clock          = deps.clock ?? (() => new Date());
  const holidayCalendar = deps.holidayCalendar ?? ((_d: Date) => false);
  const tickMs         = deps.tickMs ?? 60_000;

  /** fired keys: `${YYYY-MM-DD}:${TransitionName}` */
  const fired = new Set<string>();

  let intervalHandle: ReturnType<typeof setInterval> | null = null;

  // Map transition name → handler.
  const handlerMap: Record<TransitionName, () => Promise<void>> = {
    warmup:   deps.onWarmup,
    open:     deps.onOpen,
    close:    deps.onClose,
    shutdown: deps.onShutdown,
  };

  function firedKey(dateStr: string, name: TransitionName): string {
    return `${dateStr}:${name}`;
  }

  /**
   * Evaluate all transitions whose scheduled minute is ≤ currentMinutes
   * and fire any that have not yet been recorded for today.
   */
  async function evaluate(): Promise<void> {
    const now = clock();

    // Never fire on weekends or holidays.
    if (isWeekend(now) || holidayCalendar(now)) {
      return;
    }

    const nowMin  = toMinutes(now);
    const dateStr = localDateString(now);

    for (const transition of TRANSITIONS) {
      if (nowMin < transition.hhmmMinutes) continue;

      const key = firedKey(dateStr, transition.name);
      if (fired.has(key)) continue;

      fired.add(key);
      log.info({ transition: transition.name, date: dateStr }, 'market transition');

      try {
        await handlerMap[transition.name]();
      } catch (err: unknown) {
        log.error(
          {
            transition: transition.name,
            err: err instanceof Error ? err.message : String(err),
          },
          'market transition handler threw',
        );
      }
    }
  }

  function start(): void {
    if (intervalHandle !== null) return;

    // Evaluate immediately on start to handle late-boot catchup.
    void evaluate();

    intervalHandle = setInterval(() => {
      void evaluate();
    }, tickMs);
  }

  function stop(): void {
    if (intervalHandle === null) return;
    clearInterval(intervalHandle);
    intervalHandle = null;
  }

  /**
   * Returns the market phase based purely on the current clock value.
   * Not latched — always deterministic at call time.
   */
  function getCurrentPhase(): MarketPhase {
    const now    = clock();
    const nowMin = toMinutes(now);

    if (nowMin >= OPEN_MINUTES && nowMin < CLOSE_MINUTES) {
      return 'open';
    }
    if (nowMin >= WARMUP_MINUTES && nowMin < OPEN_MINUTES) {
      return 'pre-open';
    }
    return 'closed';
  }

  return { start, stop, getCurrentPhase };
}
