/**
 * Market hours scheduler tests.
 *
 * Uses vitest fake timers for setInterval ticks and an injected `clock`
 * function to control the apparent wall-clock time without depending on the
 * real system clock. Long market-day journeys advance minute-by-minute because
 * the scheduler compares HH:MM boundaries, not seconds.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMarketHoursScheduler } from '../market-hours-scheduler.js';

// === Helpers ==================================================================

/** Build a clock that returns a fixed Date with the given HH:MM on a Monday. */
function clockAt(hhmm: string, dayOffset = 0): () => Date {
  const [hStr, mStr] = hhmm.split(':') as [string, string];
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  // 2024-01-08 is a Monday (weekday baseline).
  const base = new Date(2024, 0, 8 + dayOffset, h, m, 0, 0);
  return () => new Date(base);
}

/** Build an advancing clock: starts at startHHMM and advances by however many
 *  milliseconds vi.advanceTimersByTime has elapsed since the scheduler started.
 *  We use a simple closure over a `Date` that can be mutated between tests. */
function makeAdvancingClock(startHhmm: string, dayOffset = 0): { clock: () => Date; advance: (ms: number) => void } {
  const [hStr, mStr] = startHhmm.split(':') as [string, string];
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  let current = new Date(2024, 0, 8 + dayOffset, h, m, 0, 0);
  return {
    clock: () => new Date(current),
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  };
}

async function advanceClockAndTimers(
  advanceClock: (ms: number) => void,
  totalMs: number,
  stepMs = 60_000,
): Promise<void> {
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    const delta = Math.min(stepMs, totalMs - elapsed);
    advanceClock(delta);
    await vi.advanceTimersByTimeAsync(delta);
  }
}

function makeHandlers(): {
  onWarmup: ReturnType<typeof vi.fn>;
  onOpen: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
  onShutdown: ReturnType<typeof vi.fn>;
} {
  return {
    onWarmup:   vi.fn().mockResolvedValue(undefined),
    onOpen:     vi.fn().mockResolvedValue(undefined),
    onClose:    vi.fn().mockResolvedValue(undefined),
    onShutdown: vi.fn().mockResolvedValue(undefined),
  };
}

// === Tests ====================================================================

describe('market-hours-scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // T1 ─────────────────────────────────────────────────────────────────────────
  it('T1: boot at 07:00 on a weekday → no handler fires', async () => {
    const handlers = makeHandlers();
    const scheduler = createMarketHoursScheduler({
      ...handlers,
      clock: clockAt('07:00'),
      tickMs: 1_000,
    });

    scheduler.start();
    // Advance several ticks — still before integrated-market warmup.
    await vi.advanceTimersByTimeAsync(10_000);
    scheduler.stop();

    expect(handlers.onWarmup).not.toHaveBeenCalled();
    expect(handlers.onOpen).not.toHaveBeenCalled();
    expect(handlers.onClose).not.toHaveBeenCalled();
    expect(handlers.onShutdown).not.toHaveBeenCalled();
  });

  // T2 ─────────────────────────────────────────────────────────────────────────
  it('T2: boot at 07:00, advance clock to 07:55 → onWarmup fires exactly once', async () => {
    const handlers = makeHandlers();
    const { clock, advance } = makeAdvancingClock('07:00');

    const scheduler = createMarketHoursScheduler({
      ...handlers,
      clock,
      tickMs: 60_000,
    });

    scheduler.start();

    // Advance fake timers and clock together up to 07:55 (55m).
    await advanceClockAndTimers(advance, 55 * 60_000);

    expect(handlers.onWarmup).toHaveBeenCalledTimes(1);
    // Open has not been reached yet (we are exactly at 07:55).
    expect(handlers.onOpen).not.toHaveBeenCalled();

    scheduler.stop();
  });

  // T3 ─────────────────────────────────────────────────────────────────────────
  it('T3: advance through 08:00, 20:00, 20:05 → handlers fire once each in order', async () => {
    const handlers = makeHandlers();
    const callOrder: string[] = [];
    handlers.onWarmup.mockImplementation(async () => { callOrder.push('warmup'); });
    handlers.onOpen.mockImplementation(async () => { callOrder.push('open'); });
    handlers.onClose.mockImplementation(async () => { callOrder.push('close'); });
    handlers.onShutdown.mockImplementation(async () => { callOrder.push('shutdown'); });

    const { clock, advance } = makeAdvancingClock('07:50');

    const scheduler = createMarketHoursScheduler({
      ...handlers,
      clock,
      tickMs: 60_000,
    });

    scheduler.start();

    // Total journey: 07:50 -> 20:05 = 12h15m.
    await advanceClockAndTimers(advance, 735 * 60_000);

    scheduler.stop();

    expect(handlers.onWarmup).toHaveBeenCalledTimes(1);
    expect(handlers.onOpen).toHaveBeenCalledTimes(1);
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
    expect(handlers.onShutdown).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['warmup', 'open', 'close', 'shutdown']);
  });

  // T4 ─────────────────────────────────────────────────────────────────────────
  it('T4: getCurrentPhase() returns correct phase for given clock values', () => {
    const handlers = makeHandlers();

    // pre-open: 07:55 ≤ t < 08:00
    const preOpenScheduler = createMarketHoursScheduler({
      ...handlers,
      clock: clockAt('07:58'),
    });
    expect(preOpenScheduler.getCurrentPhase()).toBe('pre-open');

    // open: 08:00 ≤ t < 20:00
    const openScheduler = createMarketHoursScheduler({
      ...handlers,
      clock: clockAt('12:00'),
    });
    expect(openScheduler.getCurrentPhase()).toBe('open');

    // closed: before 07:55
    const earlyScheduler = createMarketHoursScheduler({
      ...handlers,
      clock: clockAt('07:30'),
    });
    expect(earlyScheduler.getCurrentPhase()).toBe('closed');

    // closed: after 20:00
    const lateScheduler = createMarketHoursScheduler({
      ...handlers,
      clock: clockAt('20:01'),
    });
    expect(lateScheduler.getCurrentPhase()).toBe('closed');

    // Edge: exactly 08:00 → open
    const atOpenScheduler = createMarketHoursScheduler({
      ...handlers,
      clock: clockAt('08:00'),
    });
    expect(atOpenScheduler.getCurrentPhase()).toBe('open');

    // Edge: exactly 20:00 → closed (close time is excluded from 'open')
    const atCloseScheduler = createMarketHoursScheduler({
      ...handlers,
      clock: clockAt('20:00'),
    });
    expect(atCloseScheduler.getCurrentPhase()).toBe('closed');
  });

  // T5 ─────────────────────────────────────────────────────────────────────────
  it('T5: boot at 10:00 (past warmup and open) → warmup + open fire; close/shutdown do not fire until their times', async () => {
    // Design decision: a late boot still needs warm-up resources initialized
    // before open state is processed, so the scheduler fires every elapsed
    // transition in chronological order during the initial evaluation pass.
    // This preserves the invariant that onWarmup always precedes onOpen.
    const handlers = makeHandlers();
    const callOrder: string[] = [];
    handlers.onWarmup.mockImplementation(async () => { callOrder.push('warmup'); });
    handlers.onOpen.mockImplementation(async () => { callOrder.push('open'); });
    handlers.onClose.mockImplementation(async () => { callOrder.push('close'); });
    handlers.onShutdown.mockImplementation(async () => { callOrder.push('shutdown'); });

    const { clock, advance } = makeAdvancingClock('10:00');

    const scheduler = createMarketHoursScheduler({
      ...handlers,
      clock,
      tickMs: 60_000,
    });

    scheduler.start();

    // Give the initial evaluate() call time to resolve (it's async).
    await vi.advanceTimersByTimeAsync(0);

    expect(handlers.onWarmup).toHaveBeenCalledTimes(1);
    expect(handlers.onOpen).toHaveBeenCalledTimes(1);
    // Close (20:00) and shutdown (20:05) have not been reached yet.
    expect(handlers.onClose).not.toHaveBeenCalled();
    expect(handlers.onShutdown).not.toHaveBeenCalled();
    expect(callOrder).toEqual(['warmup', 'open']);

    // Now advance to 20:00.
    const minutesTo2000 = (20 * 60) - (10 * 60);
    await advanceClockAndTimers(advance, minutesTo2000 * 60_000);

    expect(handlers.onClose).toHaveBeenCalledTimes(1);
    expect(handlers.onShutdown).not.toHaveBeenCalled();

    scheduler.stop();
  });

  // T6 ─────────────────────────────────────────────────────────────────────────
  it('T6: holiday (holidayCalendar returns true) → no handler fires even on a weekday', async () => {
    const handlers = makeHandlers();

    // Clock is set to 15:35 (past all transitions) but calendar marks it holiday.
    const scheduler = createMarketHoursScheduler({
      ...handlers,
      clock: clockAt('15:35'),
      holidayCalendar: (_d: Date) => true,
      tickMs: 1_000,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(5_000);
    scheduler.stop();

    expect(handlers.onWarmup).not.toHaveBeenCalled();
    expect(handlers.onOpen).not.toHaveBeenCalled();
    expect(handlers.onClose).not.toHaveBeenCalled();
    expect(handlers.onShutdown).not.toHaveBeenCalled();
  });

  it('T6b: Saturday → no handler fires even when clock is past all transitions', async () => {
    const handlers = makeHandlers();

    // dayOffset=5 from Monday 2024-01-08 → Saturday 2024-01-13
    const scheduler = createMarketHoursScheduler({
      ...handlers,
      clock: clockAt('15:35', 5), // Saturday at 15:35
      tickMs: 1_000,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(5_000);
    scheduler.stop();

    expect(handlers.onWarmup).not.toHaveBeenCalled();
    expect(handlers.onOpen).not.toHaveBeenCalled();
    expect(handlers.onClose).not.toHaveBeenCalled();
    expect(handlers.onShutdown).not.toHaveBeenCalled();
  });
});
