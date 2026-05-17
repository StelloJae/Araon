import type { MarketTopMoversSourcePhase } from '@shared/types.js';

const KST_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const PREMARKET_START_MINUTES = 8 * 60;
const OPENING_FREEZE_START_MINUTES = 8 * 60 + 50;
const REGULAR_START_MINUTES = 9 * 60;
const AFTER_HOURS_START_MINUTES = 15 * 60 + 30;
const INTEGRATED_CLOSE_MINUTES = 20 * 60;

export interface MarketTopMoversFetchWindow {
  readonly phase: Extract<MarketTopMoversSourcePhase, 'premarket' | 'regular' | 'after_hours'>;
  readonly currentWindow: boolean;
  readonly startsAt: string;
  readonly endsAt: string;
}

export function resolveMarketTopMoversSourcePhase(
  current: Date,
): MarketTopMoversSourcePhase {
  const minutes = kstParts(current).minutes;
  if (minutes >= PREMARKET_START_MINUTES && minutes < OPENING_FREEZE_START_MINUTES) {
    return 'premarket';
  }
  if (minutes >= OPENING_FREEZE_START_MINUTES && minutes < REGULAR_START_MINUTES) {
    return 'opening_freeze';
  }
  if (minutes >= REGULAR_START_MINUTES && minutes < AFTER_HOURS_START_MINUTES) {
    return 'regular';
  }
  if (minutes >= AFTER_HOURS_START_MINUTES && minutes < INTEGRATED_CLOSE_MINUTES) {
    return 'after_hours';
  }
  return 'stale_snapshot';
}

export function isFetchableMarketTopMoversSourcePhase(
  sourcePhase: MarketTopMoversSourcePhase,
): boolean {
  return sourcePhase === 'premarket'
    || sourcePhase === 'regular'
    || sourcePhase === 'after_hours';
}

export function getMarketTopMoversFetchWindow(
  current: Date,
): MarketTopMoversFetchWindow {
  const parts = kstParts(current);
  const currentPhase = resolveMarketTopMoversSourcePhase(current);
  if (currentPhase === 'premarket') {
    return buildWindow(parts, 'premarket', 0, PREMARKET_START_MINUTES, OPENING_FREEZE_START_MINUTES, true);
  }
  if (currentPhase === 'regular') {
    return buildWindow(parts, 'regular', 0, REGULAR_START_MINUTES, AFTER_HOURS_START_MINUTES, true);
  }
  if (currentPhase === 'after_hours') {
    return buildWindow(parts, 'after_hours', 0, AFTER_HOURS_START_MINUTES, INTEGRATED_CLOSE_MINUTES, true);
  }
  if (parts.minutes < PREMARKET_START_MINUTES) {
    return buildWindow(parts, 'premarket', 0, PREMARKET_START_MINUTES, OPENING_FREEZE_START_MINUTES, false);
  }
  if (parts.minutes < REGULAR_START_MINUTES) {
    return buildWindow(parts, 'regular', 0, REGULAR_START_MINUTES, AFTER_HOURS_START_MINUTES, false);
  }
  if (parts.minutes < AFTER_HOURS_START_MINUTES) {
    return buildWindow(parts, 'after_hours', 0, AFTER_HOURS_START_MINUTES, INTEGRATED_CLOSE_MINUTES, false);
  }
  return buildWindow(parts, 'premarket', 1, PREMARKET_START_MINUTES, OPENING_FREEZE_START_MINUTES, false);
}

export function millisecondsUntilMarketTopMoversFetchWindow(
  current: Date,
): number {
  const window = getMarketTopMoversFetchWindow(current);
  if (window.currentWindow) return 0;
  return Math.max(0, Date.parse(window.startsAt) - current.getTime());
}

interface KstParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly minutes: number;
}

function kstParts(current: Date): KstParts {
  const parts = KST_TIME_FORMATTER.formatToParts(current);
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    minutes: value('hour') * 60 + value('minute'),
  };
}

function buildWindow(
  parts: KstParts,
  phase: MarketTopMoversFetchWindow['phase'],
  dayOffset: number,
  startMinutes: number,
  endMinutes: number,
  currentWindow: boolean,
): MarketTopMoversFetchWindow {
  return {
    phase,
    currentWindow,
    startsAt: kstDateTimeIso(parts, dayOffset, startMinutes),
    endsAt: kstDateTimeIso(parts, dayOffset, endMinutes),
  };
}

function kstDateTimeIso(
  parts: KstParts,
  dayOffset: number,
  minutes: number,
): string {
  const hour = Math.trunc(minutes / 60);
  const minute = minutes % 60;
  return new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day + dayOffset,
    hour - 9,
    minute,
  )).toISOString();
}
