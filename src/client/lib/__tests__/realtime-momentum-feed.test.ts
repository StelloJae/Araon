import { describe, expect, it } from 'vitest';
import type { MarketStatus, Price } from '@shared/types';
import {
  createMomentumFeedState,
  evaluateRealtimeMomentumPrice,
  shouldProcessRealtimeMomentumPrice,
} from '../realtime-momentum-feed';
import type { MomentumBucket } from '../realtime-momentum';

function price(overrides: Partial<Price> = {}): Price {
  return {
    ticker: '005930',
    price: 101_900,
    changeRate: 10,
    changeAbs: 10_000,
    volume: 1_000_000,
    volumeSurgeRatio: null,
    volumeBaselineStatus: 'collecting',
    updatedAt: '2026-04-29T01:00:30.000Z',
    isSnapshot: false,
    source: 'ws-integrated',
    ...overrides,
  };
}

const OPEN: MarketStatus = 'open';
const CLOSED: MarketStatus = 'closed';

describe('shouldProcessRealtimeMomentumPrice', () => {
  it('accepts only ws-integrated live market price updates', () => {
    expect(shouldProcessRealtimeMomentumPrice(price(), OPEN)).toBe(true);
    expect(shouldProcessRealtimeMomentumPrice(price({ source: 'rest' }), OPEN)).toBe(false);
    expect(shouldProcessRealtimeMomentumPrice(price({ isSnapshot: true }), OPEN)).toBe(false);
    expect(shouldProcessRealtimeMomentumPrice(price(), CLOSED)).toBe(false);
  });

  it('rejects invalid ticker or price values', () => {
    expect(shouldProcessRealtimeMomentumPrice(price({ ticker: '' }), OPEN)).toBe(false);
    expect(shouldProcessRealtimeMomentumPrice(price({ price: 0 }), OPEN)).toBe(false);
  });
});

describe('evaluateRealtimeMomentumPrice', () => {
  function bucket(ts: number, bucketPrice: number): MomentumBucket {
    return {
      ticker: '005930',
      session: 'regular',
      bucketStart: ts,
      ts,
      price: bucketPrice,
      volume: 1_000_000,
    };
  }

  it('creates a realtime momentum signal from a 30s crossing', () => {
    const state = createMomentumFeedState();
    const now = 1_700_000_030_000;
    evaluateRealtimeMomentumPrice({
      price: price({ price: 101_700 }),
      marketStatus: OPEN,
      name: '삼성전자',
      buckets: [bucket(now - 31_000, 100_000), bucket(now - 1_000, 101_700)],
      now: now - 1_000,
      state,
    });
    const result = evaluateRealtimeMomentumPrice({
      price: price({ price: 101_900 }),
      marketStatus: OPEN,
      name: '삼성전자',
      buckets: [bucket(now - 30_000, 100_000), bucket(now, 101_900)],
      now,
      state,
    });

    expect(result.decision.kind).toBe('spawn');
    expect(result.decision.signal).toMatchObject({
      ticker: '005930',
      signalType: 'scalp',
      momentumWindow: '30s',
      source: 'realtime-momentum',
    });
    expect(state.lastSignalAtByTicker['005930']).toBe(now);
  });

  it('creates the first realtime signal when the first usable 10s baseline is already above threshold', () => {
    const state = createMomentumFeedState();
    const now = 1_700_000_010_000;
    const result = evaluateRealtimeMomentumPrice({
      price: price({ price: 100_900 }),
      marketStatus: OPEN,
      name: '삼성전자',
      buckets: [bucket(now - 10_000, 100_000), bucket(now, 100_900)],
      now,
      state,
    });

    expect(result.decision.kind).toBe('spawn');
    expect(result.decision.signal).toMatchObject({
      ticker: '005930',
      signalType: 'scalp',
      momentumWindow: '10s',
      source: 'realtime-momentum',
    });
  });

  it('does not create a realtime signal from previous-close change alone', () => {
    const state = createMomentumFeedState();
    const now = 1_700_000_030_000;
    const result = evaluateRealtimeMomentumPrice({
      price: price({ price: 100_000, changeRate: 10 }),
      marketStatus: OPEN,
      name: '삼성전자',
      buckets: [bucket(now - 30_000, 100_000), bucket(now, 100_000)],
      now,
      state,
    });

    expect(result.decision.kind).toBe('none');
  });
});
