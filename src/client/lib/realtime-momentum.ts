/**
 * Realtime momentum detector for the surge feed.
 *
 * This module is intentionally pure. It does not know about SSE, Zustand, or
 * rendering. Consumers feed it bucketed live prices from the current market
 * session and it returns crossing-based signal decisions.
 */

export type MomentumSession = 'pre' | 'regular' | 'after' | 'unknown';

export type MomentumWindow = '10s' | '20s' | '30s' | '1m' | '3m' | '5m';

export type MomentumSignalType =
  | 'scalp'
  | 'strong_scalp'
  | 'overheat'
  | 'trend';

export type MomentumDecisionKind = 'none' | 'spawn' | 'update' | 'suppress';

export type MomentumExitWarningType =
  | 'drawdown_from_high'
  | 'below_signal_price'
  | 'weak_follow_through';

export interface MomentumBucket {
  ticker: string;
  session: MomentumSession;
  bucketStart: number;
  ts: number;
  price: number;
  volume: number | null;
}

export interface MomentumReading {
  window: MomentumWindow;
  momentumPct: number;
  baselinePrice: number;
  baselineAt: number;
  currentPrice: number;
  currentAt: number;
}

export interface MomentumSignal {
  ticker: string;
  name: string;
  price: number;
  signalType: MomentumSignalType;
  momentumPct: number;
  momentumWindow: MomentumWindow;
  baselinePrice: number;
  baselineAt: number;
  currentAt: number;
  dailyChangePct: number;
  volume: number | null;
  volumeSurgeRatio: number | null;
  source: 'realtime-momentum';
}

export interface ActiveMomentumSignal {
  ticker: string;
  signalType: MomentumSignalType;
  momentumWindow: MomentumWindow;
  signalPrice: number;
  highSinceSignal: number;
  signalAt: number;
}

export interface MomentumExitWarning {
  type: MomentumExitWarningType;
  message: string;
  valuePct: number;
}

export interface EvaluateMomentumSignalInput {
  ticker: string;
  name: string;
  currentPrice: number;
  currentAt: number;
  dailyChangePct: number;
  volume: number | null;
  volumeSurgeRatio?: number | null;
  readings: ReadonlyArray<MomentumReading>;
  previousMomentumByWindow?: Partial<Record<MomentumWindow, number>>;
  lastSignalAt?: number | null;
  activeSignal?: ActiveMomentumSignal | null;
  cooldownMs?: number;
  allowInitialSignal?: boolean;
}

export interface MomentumSignalDecision {
  kind: MomentumDecisionKind;
  signal: MomentumSignal | null;
  reason:
    | 'baseline_insufficient'
    | 'no_crossing'
    | 'cooldown'
    | 'level_escalation'
    | 'crossing';
}

interface MomentumThreshold {
  window: MomentumWindow;
  signalType: MomentumSignalType;
  thresholdPct: number;
}

export const MOMENTUM_BUCKET_MS = 1_000;
export const MOMENTUM_RETENTION_MS = 6 * 60_000;
export const MOMENTUM_COOLDOWN_MS = 90_000;

export const MOMENTUM_WINDOW_MS: Record<MomentumWindow, number> = {
  '10s': 10_000,
  '20s': 20_000,
  '30s': 30_000,
  '1m': 60_000,
  '3m': 3 * 60_000,
  '5m': 5 * 60_000,
};

export const MOMENTUM_BASELINE_TOLERANCE_MS: Record<MomentumWindow, number> = {
  '10s': 2_000,
  '20s': 3_000,
  '30s': 5_000,
  '1m': 10_000,
  '3m': 30_000,
  '5m': 60_000,
};

export const MOMENTUM_THRESHOLDS: ReadonlyArray<MomentumThreshold> = [
  { window: '10s', signalType: 'overheat', thresholdPct: 3.0 },
  { window: '30s', signalType: 'overheat', thresholdPct: 5.0 },
  { window: '10s', signalType: 'strong_scalp', thresholdPct: 1.5 },
  { window: '20s', signalType: 'strong_scalp', thresholdPct: 2.2 },
  { window: '30s', signalType: 'strong_scalp', thresholdPct: 3.0 },
  { window: '10s', signalType: 'scalp', thresholdPct: 0.8 },
  { window: '20s', signalType: 'scalp', thresholdPct: 1.2 },
  { window: '30s', signalType: 'scalp', thresholdPct: 1.8 },
  { window: '1m', signalType: 'trend', thresholdPct: 2.5 },
  { window: '3m', signalType: 'trend', thresholdPct: 4.0 },
  { window: '5m', signalType: 'trend', thresholdPct: 5.0 },
];

const SIGNAL_PRIORITY: Record<MomentumSignalType, number> = {
  overheat: 4,
  strong_scalp: 3,
  scalp: 2,
  trend: 1,
};

export function isPrimaryRealtimeSignal(type: MomentumSignalType): boolean {
  return type === 'scalp' || type === 'strong_scalp' || type === 'overheat';
}

export function calculateMomentumPct(
  currentPrice: number,
  baselinePrice: number,
): number | null {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(baselinePrice)) {
    return null;
  }
  if (currentPrice <= 0 || baselinePrice <= 0) return null;
  return (currentPrice / baselinePrice - 1) * 100;
}

export function buildMomentumReadings(
  buckets: ReadonlyArray<MomentumBucket>,
  current: MomentumBucket,
): MomentumReading[] {
  return (Object.keys(MOMENTUM_WINDOW_MS) as MomentumWindow[])
    .map((window) => buildMomentumReading(buckets, current, window))
    .filter((reading): reading is MomentumReading => reading !== null);
}

export function buildMomentumReading(
  buckets: ReadonlyArray<MomentumBucket>,
  current: MomentumBucket,
  window: MomentumWindow,
): MomentumReading | null {
  const baseline = findBaselineBucket(buckets, current, window);
  if (baseline === null) return null;
  const momentumPct = calculateMomentumPct(current.price, baseline.price);
  if (momentumPct === null) return null;
  return {
    window,
    momentumPct,
    baselinePrice: baseline.price,
    baselineAt: baseline.ts,
    currentPrice: current.price,
    currentAt: current.ts,
  };
}

export function findBaselineBucket(
  buckets: ReadonlyArray<MomentumBucket>,
  current: MomentumBucket,
  window: MomentumWindow,
): MomentumBucket | null {
  const targetAt = current.ts - MOMENTUM_WINDOW_MS[window];
  const tolerance = MOMENTUM_BASELINE_TOLERANCE_MS[window];
  let best: MomentumBucket | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const bucket of buckets) {
    if (bucket.ticker !== current.ticker) continue;
    if (bucket.session !== current.session) continue;
    if (bucket.ts > current.ts) continue;
    if (bucket.ts >= current.ts - MOMENTUM_BUCKET_MS) continue;
    const distance = Math.abs(bucket.ts - targetAt);
    if (distance <= tolerance && distance < bestDistance) {
      best = bucket;
      bestDistance = distance;
    }
  }

  return best;
}

export function evaluateMomentumSignal(
  input: EvaluateMomentumSignalInput,
): MomentumSignalDecision {
  const candidate = pickCrossingCandidate(input);
  if (candidate === null) {
    return {
      kind: 'none',
      signal: null,
      reason: input.readings.length === 0 ? 'baseline_insufficient' : 'no_crossing',
    };
  }

  const signal = toSignal(input, candidate.reading, candidate.threshold);
  const cooldownMs = input.cooldownMs ?? MOMENTUM_COOLDOWN_MS;
  const lastSignalAt = input.lastSignalAt ?? null;
  const inCooldown =
    lastSignalAt !== null && input.currentAt - lastSignalAt < cooldownMs;

  if (!inCooldown) {
    return { kind: 'spawn', signal, reason: 'crossing' };
  }

  if (
    input.activeSignal !== null &&
    input.activeSignal !== undefined &&
    SIGNAL_PRIORITY[signal.signalType] >
      SIGNAL_PRIORITY[input.activeSignal.signalType]
  ) {
    return { kind: 'update', signal, reason: 'level_escalation' };
  }

  return { kind: 'suppress', signal: null, reason: 'cooldown' };
}

function pickCrossingCandidate(input: EvaluateMomentumSignalInput): {
  threshold: MomentumThreshold;
  reading: MomentumReading;
} | null {
  const readingsByWindow = new Map<MomentumWindow, MomentumReading>();
  for (const reading of input.readings) readingsByWindow.set(reading.window, reading);

  const candidates: Array<{
    threshold: MomentumThreshold;
    reading: MomentumReading;
    score: number;
  }> = [];

  for (const threshold of MOMENTUM_THRESHOLDS) {
    const reading = readingsByWindow.get(threshold.window);
    if (reading === undefined) continue;
    if (reading.momentumPct < threshold.thresholdPct) continue;

    const previous = input.previousMomentumByWindow?.[threshold.window];
    const crossed =
      previous === undefined
        ? input.allowInitialSignal === true
        : previous < threshold.thresholdPct;
    if (!crossed) continue;

    candidates.push({
      threshold,
      reading,
      score:
        SIGNAL_PRIORITY[threshold.signalType] * 100 +
        reading.momentumPct / threshold.thresholdPct,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

function toSignal(
  input: EvaluateMomentumSignalInput,
  reading: MomentumReading,
  threshold: MomentumThreshold,
): MomentumSignal {
  return {
    ticker: input.ticker,
    name: input.name,
    price: input.currentPrice,
    signalType: threshold.signalType,
    momentumPct: reading.momentumPct,
    momentumWindow: reading.window,
    baselinePrice: reading.baselinePrice,
    baselineAt: reading.baselineAt,
    currentAt: reading.currentAt,
    dailyChangePct: input.dailyChangePct,
    volume: input.volume,
    volumeSurgeRatio: input.volumeSurgeRatio ?? null,
    source: 'realtime-momentum',
  };
}

export function evaluateExitWarnings(input: {
  signalPrice: number;
  highSinceSignal: number;
  currentPrice: number;
  signalAt: number;
  now: number;
}): MomentumExitWarning[] {
  const warnings: MomentumExitWarning[] = [];
  const highDrawdown = calculateMomentumPct(input.currentPrice, input.highSinceSignal);
  if (highDrawdown !== null && highDrawdown <= -0.7) {
    warnings.push({
      type: 'drawdown_from_high',
      message: '이탈 경고',
      valuePct: highDrawdown,
    });
  }

  const signalMove = calculateMomentumPct(input.currentPrice, input.signalPrice);
  if (signalMove !== null && signalMove <= -0.3) {
    warnings.push({
      type: 'below_signal_price',
      message: '신호가 이탈',
      valuePct: signalMove,
    });
  }

  if (
    input.now - input.signalAt >= 20_000 &&
    input.highSinceSignal <= input.signalPrice * 1.003
  ) {
    warnings.push({
      type: 'weak_follow_through',
      message: '탄력 약함',
      valuePct: 0,
    });
  }

  return warnings;
}
