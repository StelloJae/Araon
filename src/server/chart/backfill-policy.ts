import type { MarketStatus } from '@shared/types.js';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const BACKFILL_START_MINUTE = 20 * 60 + 5;
const BACKFILL_STOP_MINUTE = 7 * 60 + 55;

export type BackfillMarketPhase = MarketStatus | 'unknown';

interface KstClock {
  dayOfWeek: number;
  minutes: number;
}

function kstClock(now: Date): KstClock {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  return {
    dayOfWeek: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

export function isBackfillAllowed(now: Date, phase: BackfillMarketPhase): boolean {
  if (Number.isNaN(now.getTime())) return false;
  if (phase === 'unknown') return false;
  if (phase === 'open' || phase === 'pre-open') return false;

  const clock = kstClock(now);
  if (clock.dayOfWeek === 0 || clock.dayOfWeek === 6) return true;

  return clock.minutes >= BACKFILL_START_MINUTE || clock.minutes < BACKFILL_STOP_MINUTE;
}
