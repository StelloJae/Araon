import type {
  CandleInterval,
  CandleSession,
  PriceCandle,
  PriceCandleSource,
} from '@shared/types.js';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const INTERVAL_MINUTES: Record<Exclude<CandleInterval, '1D' | '1W' | '1M'>, number> = {
  '1m': 1,
  '3m': 3,
  '5m': 5,
  '10m': 10,
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '2h': 120,
  '4h': 240,
  '6h': 360,
  '12h': 720,
};

interface KstParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
}

function toDate(input: string | Date): Date {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`invalid candle timestamp: ${String(input)}`);
  }
  return date;
}

function kstParts(input: string | Date): KstParts {
  const shifted = new Date(toDate(input).getTime() + KST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    dayOfWeek: shifted.getUTCDay(),
  };
}

function isoFromKst(parts: KstParts): string {
  const utcMs =
    Date.UTC(parts.year, parts.month, parts.day, parts.hour, parts.minute, 0, 0) -
    KST_OFFSET_MS;
  return new Date(utcMs).toISOString();
}

export function bucketAtForInterval(input: string | Date, interval: CandleInterval): string {
  const parts = kstParts(input);
  if (interval === '1D') {
    return isoFromKst({ ...parts, hour: 0, minute: 0 });
  }
  if (interval === '1W') {
    const daysSinceMonday = (parts.dayOfWeek + 6) % 7;
    return isoFromKst({
      ...parts,
      day: parts.day - daysSinceMonday,
      hour: 0,
      minute: 0,
    });
  }
  if (interval === '1M') {
    return isoFromKst({
      ...parts,
      day: 1,
      hour: 0,
      minute: 0,
    });
  }

  const step = INTERVAL_MINUTES[interval];
  const totalMinutes = parts.hour * 60 + parts.minute;
  const bucketMinute = Math.floor(totalMinutes / step) * step;
  return isoFromKst({
    ...parts,
    hour: Math.floor(bucketMinute / 60),
    minute: bucketMinute % 60,
  });
}

export function kstDateKey(input: string | Date): string {
  const parts = kstParts(input);
  const month = String(parts.month + 1).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${parts.year}-${month}-${day}`;
}

export function sessionForTimestamp(input: string | Date): CandleSession {
  const parts = kstParts(input);
  const minutes = parts.hour * 60 + parts.minute;
  if (minutes >= 8 * 60 && minutes < 8 * 60 + 50) return 'pre';
  if (minutes >= 9 * 60 && minutes < 15 * 60 + 30) return 'regular';
  if (minutes >= 15 * 60 + 30 && minutes < 20 * 60) return 'after';
  return 'unknown';
}

function mergeSource(
  previous: PriceCandleSource | null,
  next: PriceCandleSource | null,
): PriceCandleSource | null {
  if (previous === null) return next;
  if (next === null) return previous;
  return previous === next ? previous : 'mixed';
}

export function aggregateCandles(
  sourceCandles: readonly PriceCandle[],
  interval: CandleInterval,
): PriceCandle[] {
  const sorted = [...sourceCandles].sort((a, b) => a.bucketAt.localeCompare(b.bucketAt));
  if (interval === '1m') {
    return sorted.map((c) => ({ ...c, interval: '1m' }));
  }

  const groups = new Map<string, PriceCandle>();

  for (const candle of sorted) {
    const bucketAt = bucketAtForInterval(candle.bucketAt, interval);
    const existing = groups.get(bucketAt);
    if (existing === undefined) {
      groups.set(bucketAt, {
        ...candle,
        interval,
        bucketAt,
      });
      continue;
    }

    groups.set(bucketAt, {
      ...existing,
      high: Math.max(existing.high, candle.high),
      low: Math.min(existing.low, candle.low),
      close: candle.close,
      volume: existing.volume + candle.volume,
      sampleCount: existing.sampleCount + candle.sampleCount,
      source: mergeSource(existing.source, candle.source),
      isPartial: existing.isPartial || candle.isPartial,
      updatedAt: candle.updatedAt,
      session: existing.session === candle.session ? existing.session : 'unknown',
    });
  }

  return Array.from(groups.values()).sort((a, b) => a.bucketAt.localeCompare(b.bucketAt));
}
