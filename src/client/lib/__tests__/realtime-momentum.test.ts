import { describe, expect, it } from 'vitest';
import {
  buildMomentumReadings,
  calculateMomentumPct,
  evaluateExitWarnings,
  evaluateMomentumSignal,
  isPrimaryRealtimeSignal,
  type MomentumBucket,
  type MomentumReading,
} from '../realtime-momentum';

const NOW = 1_700_000_000_000;

function reading(
  window: MomentumReading['window'],
  momentumPct: number,
): MomentumReading {
  return {
    window,
    momentumPct,
    baselinePrice: 10_000,
    baselineAt: NOW - 30_000,
    currentPrice: 10_000 * (1 + momentumPct / 100),
    currentAt: NOW,
  };
}

function evalSignal(opts: {
  readings: MomentumReading[];
  previous?: Partial<Record<MomentumReading['window'], number>>;
  lastSignalAt?: number | null;
  activeSignalType?: 'scalp' | 'strong_scalp' | 'overheat' | 'trend';
  dailyChangePct?: number;
}) {
  return evaluateMomentumSignal({
    ticker: '005930',
    name: '삼성전자',
    currentPrice: 100_000,
    currentAt: NOW,
    dailyChangePct: opts.dailyChangePct ?? 0,
    volume: 1_000_000,
    volumeSurgeRatio: null,
    readings: opts.readings,
    previousMomentumByWindow: opts.previous,
    lastSignalAt: opts.lastSignalAt,
    activeSignal:
      opts.activeSignalType === undefined
        ? null
        : {
            ticker: '005930',
            signalType: opts.activeSignalType,
            momentumWindow: '30s',
            signalPrice: 99_000,
            highSinceSignal: 101_000,
            signalAt: NOW - 10_000,
          },
  });
}

describe('calculateMomentumPct', () => {
  it('returns null for invalid baselines', () => {
    expect(calculateMomentumPct(100, 0)).toBeNull();
    expect(calculateMomentumPct(100, -1)).toBeNull();
  });

  it('calculates current price versus baseline price', () => {
    expect(calculateMomentumPct(102, 100)).toBeCloseTo(2, 6);
  });
});

describe('evaluateMomentumSignal', () => {
  it('does not create a recent surge when today is strong but recent price is flat', () => {
    const got = evalSignal({
      dailyChangePct: 10,
      readings: [reading('10s', 0), reading('30s', 0), reading('5m', 0)],
      previous: { '10s': 0, '30s': 0, '5m': 0 },
    });
    expect(got.kind).toBe('none');
  });

  it('creates a scalp signal on a 10s +0.9% crossing', () => {
    const got = evalSignal({
      readings: [reading('10s', 0.9)],
      previous: { '10s': 0.7 },
    });
    expect(got.kind).toBe('spawn');
    expect(got.signal).toMatchObject({
      signalType: 'scalp',
      momentumWindow: '10s',
    });
    expect(isPrimaryRealtimeSignal(got.signal!.signalType)).toBe(true);
  });

  it('creates a scalp signal on a 20s +1.3% crossing', () => {
    const got = evalSignal({
      readings: [reading('20s', 1.3)],
      previous: { '20s': 1.1 },
    });
    expect(got.signal).toMatchObject({
      signalType: 'scalp',
      momentumWindow: '20s',
    });
  });

  it('creates a scalp signal on a 30s +1.9% crossing', () => {
    const got = evalSignal({
      readings: [reading('30s', 1.9)],
      previous: { '30s': 1.7 },
    });
    expect(got.signal).toMatchObject({
      signalType: 'scalp',
      momentumWindow: '30s',
    });
  });

  it('creates a strong scalp signal on a 30s +3.1% crossing', () => {
    const got = evalSignal({
      readings: [reading('30s', 3.1)],
      previous: { '30s': 2.9 },
    });
    expect(got.signal).toMatchObject({
      signalType: 'strong_scalp',
      momentumWindow: '30s',
    });
  });

  it('creates an overheat signal on a 30s +5.1% crossing', () => {
    const got = evalSignal({
      readings: [reading('30s', 5.1)],
      previous: { '30s': 4.9 },
    });
    expect(got.signal).toMatchObject({
      signalType: 'overheat',
      momentumWindow: '30s',
    });
  });

  it('can signal a rebound even when the ticker is down on the day', () => {
    const got = evalSignal({
      dailyChangePct: -5,
      readings: [reading('30s', 2.0)],
      previous: { '30s': 1.0 },
    });
    expect(got.kind).toBe('spawn');
    expect(got.signal?.dailyChangePct).toBe(-5);
  });

  it('keeps trend-only signals separate from recent surge primary signals', () => {
    const got = evalSignal({
      readings: [reading('5m', 5.2)],
      previous: { '5m': 4.8 },
    });
    expect(got.kind).toBe('spawn');
    expect(got.signal).toMatchObject({
      signalType: 'trend',
      momentumWindow: '5m',
    });
    expect(isPrimaryRealtimeSignal(got.signal!.signalType)).toBe(false);
  });

  it('does not duplicate while momentum remains above the same threshold', () => {
    const got = evalSignal({
      readings: [reading('30s', 2.3)],
      previous: { '30s': 2.0 },
    });
    expect(got).toMatchObject({ kind: 'none', reason: 'no_crossing' });
  });

  it('suppresses a duplicate row during cooldown', () => {
    const got = evalSignal({
      readings: [reading('30s', 1.9)],
      previous: { '30s': 1.7 },
      lastSignalAt: NOW - 20_000,
      activeSignalType: 'scalp',
    });
    expect(got).toMatchObject({ kind: 'suppress', reason: 'cooldown' });
  });

  it('updates an existing row when signal level escalates during cooldown', () => {
    const got = evalSignal({
      readings: [reading('30s', 3.1)],
      previous: { '30s': 2.9 },
      lastSignalAt: NOW - 20_000,
      activeSignalType: 'scalp',
    });
    expect(got).toMatchObject({ kind: 'update', reason: 'level_escalation' });
    expect(got.signal?.signalType).toBe('strong_scalp');
  });

  it('does not signal when baseline readings are missing', () => {
    const got = evalSignal({ readings: [], previous: {} });
    expect(got).toMatchObject({
      kind: 'none',
      reason: 'baseline_insufficient',
    });
  });

  it('does not invent a volume surge ratio', () => {
    const got = evalSignal({
      readings: [reading('10s', 0.9)],
      previous: { '10s': 0.7 },
    });
    expect(got.signal?.volumeSurgeRatio).toBeNull();
  });
});

describe('buildMomentumReadings', () => {
  function bucket(
    ts: number,
    price: number,
    session: MomentumBucket['session'] = 'regular',
  ): MomentumBucket {
    return {
      ticker: '005930',
      session,
      bucketStart: ts,
      ts,
      price,
      volume: 100,
    };
  }

  it('does not compare across market sessions', () => {
    const current = bucket(NOW, 102, 'regular');
    const got = buildMomentumReadings(
      [bucket(NOW - 30_000, 100, 'pre'), current],
      current,
    );
    expect(got.find((it) => it.window === '30s')).toBeUndefined();
  });

  it('uses same-session buckets near the target baseline time', () => {
    const current = bucket(NOW, 102, 'regular');
    const got = buildMomentumReadings(
      [bucket(NOW - 31_000, 100, 'regular'), current],
      current,
    );
    expect(got.find((it) => it.window === '30s')?.momentumPct).toBeCloseTo(2, 6);
  });
});

describe('evaluateExitWarnings', () => {
  it('flags drawdown from the post-signal high', () => {
    const got = evaluateExitWarnings({
      signalPrice: 100,
      highSinceSignal: 102,
      currentPrice: 101,
      signalAt: NOW - 5_000,
      now: NOW,
    });
    expect(got.map((it) => it.type)).toContain('drawdown_from_high');
  });

  it('flags price falling below the signal price', () => {
    const got = evaluateExitWarnings({
      signalPrice: 100,
      highSinceSignal: 101,
      currentPrice: 99.6,
      signalAt: NOW - 5_000,
      now: NOW,
    });
    expect(got.map((it) => it.type)).toContain('below_signal_price');
  });
});
