import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMomentumReadings } from '../../lib/realtime-momentum';

beforeEach(() => {
  vi.resetModules();
});

describe('useMomentumHistoryStore', () => {
  it('starts empty', async () => {
    const { useMomentumHistoryStore } = await import('../momentum-history-store');
    expect(useMomentumHistoryStore.getState().byKey).toEqual({});
  });

  it('stores one last price per ticker/session/bucket', async () => {
    const mod = await import('../momentum-history-store');
    const s = mod.useMomentumHistoryStore.getState();
    s.appendBucketPoint('005930', {
      price: 100,
      volume: 1,
      ts: 1_000,
      session: 'regular',
    });
    s.appendBucketPoint('005930', {
      price: 101,
      volume: 2,
      ts: 1_500,
      session: 'regular',
    });

    const buckets = mod.selectMomentumBuckets(
      mod.useMomentumHistoryStore.getState(),
      '005930',
      'regular',
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({
      price: 101,
      volume: 2,
      bucketStart: 1_000,
    });
  });

  it('keeps sessions separate', async () => {
    const mod = await import('../momentum-history-store');
    const s = mod.useMomentumHistoryStore.getState();
    s.appendBucketPoint('005930', {
      price: 100,
      volume: 1,
      ts: 1_000,
      session: 'pre',
    });
    s.appendBucketPoint('005930', {
      price: 101,
      volume: 2,
      ts: 2_000,
      session: 'regular',
    });

    expect(
      mod.selectMomentumBuckets(mod.useMomentumHistoryStore.getState(), '005930', 'pre'),
    ).toHaveLength(1);
    expect(
      mod.selectMomentumBuckets(
        mod.useMomentumHistoryStore.getState(),
        '005930',
        'regular',
      ),
    ).toHaveLength(1);
  });

  it('prunes buckets older than retention', async () => {
    const mod = await import('../momentum-history-store');
    const { MOMENTUM_RETENTION_MS } = await import('../../lib/realtime-momentum');
    const s = mod.useMomentumHistoryStore.getState();
    s.appendBucketPoint('005930', {
      price: 100,
      volume: 1,
      ts: 1_000,
      session: 'regular',
    });
    s.appendBucketPoint('005930', {
      price: 105,
      volume: 2,
      ts: 1_000 + MOMENTUM_RETENTION_MS + 2_000,
      session: 'regular',
    });

    const buckets = mod.selectMomentumBuckets(
      mod.useMomentumHistoryStore.getState(),
      '005930',
      'regular',
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.price).toBe(105);
  });

  it('keeps a 5m baseline even under high-frequency ticks', async () => {
    const mod = await import('../momentum-history-store');
    const s = mod.useMomentumHistoryStore.getState();
    const start = 1_700_000_000_000;
    const end = start + 5 * 60_000;

    for (let ts = start; ts <= end; ts += 100) {
      const pct = (ts - start) / (end - start);
      s.appendBucketPoint('005930', {
        price: 100 + pct * 5,
        volume: 1_000,
        ts,
        session: 'regular',
      });
    }

    const state = mod.useMomentumHistoryStore.getState();
    const buckets = mod.selectMomentumBuckets(state, '005930', 'regular');
    const current = buckets[buckets.length - 1]!;
    const readings = buildMomentumReadings(buckets, current);

    expect(buckets.length).toBeLessThanOrEqual(301);
    expect(readings.find((it) => it.window === '5m')?.momentumPct).toBeCloseTo(
      5,
      1,
    );
  });

  it('evicts least-recently-touched keys when key cap is exceeded', async () => {
    const mod = await import('../momentum-history-store');
    const s = mod.useMomentumHistoryStore.getState();
    for (let i = 0; i < mod.MOMENTUM_MAX_TRACKED_KEYS; i++) {
      s.appendBucketPoint(`T${i}`, {
        price: 100,
        volume: 1,
        ts: 1_000 + i,
        session: 'regular',
      });
    }

    s.appendBucketPoint('NEW', {
      price: 200,
      volume: 1,
      ts: 2_000,
      session: 'regular',
    });

    const after = mod.useMomentumHistoryStore.getState().byKey;
    expect(Object.keys(after)).toHaveLength(mod.MOMENTUM_MAX_TRACKED_KEYS);
    expect(after[mod.momentumHistoryKey('T0', 'regular')]).toBeUndefined();
    expect(after[mod.momentumHistoryKey('NEW', 'regular')]).toBeDefined();
  });

  it('clearTicker removes every session for a ticker', async () => {
    const mod = await import('../momentum-history-store');
    const s = mod.useMomentumHistoryStore.getState();
    s.appendBucketPoint('005930', {
      price: 100,
      volume: 1,
      ts: 1_000,
      session: 'pre',
    });
    s.appendBucketPoint('005930', {
      price: 101,
      volume: 1,
      ts: 2_000,
      session: 'regular',
    });

    s.clearTicker('005930');

    expect(mod.useMomentumHistoryStore.getState().byKey).toEqual({});
  });
});
