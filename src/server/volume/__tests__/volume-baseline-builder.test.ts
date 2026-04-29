import { describe, expect, it } from 'vitest';

import type { PriceSnapshot } from '@shared/types';
import { buildVolumeBaselinesFromSnapshots } from '../volume-baseline-builder';

function snapshot(
  ticker: string,
  snapshotAt: string,
  volume: number,
): PriceSnapshot {
  return {
    ticker,
    price: 70_000,
    changeRate: 1,
    volume,
    snapshotAt,
  };
}

describe('volume baseline builder', () => {
  it('builds same-session same-time baselines from tracked snapshot history', () => {
    const snapshots: PriceSnapshot[] = [
      snapshot('005930', '2026-04-22T00:30:00.000Z', 1_000_000),
      snapshot('005930', '2026-04-23T00:30:00.000Z', 2_000_000),
      snapshot('005930', '2026-04-24T00:30:00.000Z', 3_000_000),
      snapshot('005930', '2026-04-27T00:30:00.000Z', 4_000_000),
      snapshot('005930', '2026-04-28T00:30:00.000Z', 5_000_000),
      snapshot('005930', '2026-04-29T00:30:00.000Z', 50_000_000),
      snapshot('005930', '2026-04-28T06:30:00.000Z', 99_000_000),
      snapshot('999999', '2026-04-28T00:30:00.000Z', 99_000_000),
    ];

    expect(
      buildVolumeBaselinesFromSnapshots({
        snapshots,
        tickers: ['005930'],
        asOfIso: '2026-04-29T00:30:12.000Z',
      }),
    ).toEqual([
      {
        ticker: '005930',
        session: 'regular',
        timeBucket: '09:30',
        sampleCount: 5,
        avgCumulativeVolume: 3_000_000,
        updatedAt: '2026-04-28T00:30:00.000Z',
      },
    ]);
  });

  it('limits baselines to the most recent 20 matching days', () => {
    const snapshots = [
      ...Array.from({ length: 25 }, (_, i) =>
        snapshot(
          '005930',
          `2026-04-${String(i + 1).padStart(2, '0')}T00:30:00.000Z`,
          i + 1,
        ),
      ),
      snapshot('005930', '2026-04-29T00:30:00.000Z', 999),
    ];

    const [got] = buildVolumeBaselinesFromSnapshots({
      snapshots,
      tickers: ['005930'],
      asOfIso: '2026-04-29T00:30:12.000Z',
    });

    expect(got?.sampleCount).toBe(20);
    expect(got?.avgCumulativeVolume).toBe(15.5);
  });
});
