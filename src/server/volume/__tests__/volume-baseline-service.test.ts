import { describe, expect, it } from 'vitest';

import type { Price, PriceSnapshot, Stock } from '@shared/types';
import { createVolumeBaselineEnricher } from '../volume-baseline-service';

function snapshot(snapshotAt: string, volume: number): PriceSnapshot {
  return {
    ticker: '005930',
    price: 70_000,
    changeRate: 1,
    volume,
    snapshotAt,
  };
}

function price(volume: number): Price {
  return {
    ticker: '005930',
    price: 70_000,
    changeRate: 1,
    volume,
    updatedAt: '2026-04-29T00:30:12.000Z',
    isSnapshot: false,
    source: 'rest',
  };
}

function stock(): Stock {
  return { ticker: '005930', name: '삼성전자', market: 'KOSPI' };
}

describe('createVolumeBaselineEnricher', () => {
  it('adds a ready volume surge ratio from persisted same-time snapshots', () => {
    const enricher = createVolumeBaselineEnricher({
      stockRepo: { findAll: () => [stock()] },
      snapshotRepo: {
        findSinceForTickers: () => [
          snapshot('2026-04-22T00:30:00.000Z', 1_000_000),
          snapshot('2026-04-23T00:30:00.000Z', 1_000_000),
          snapshot('2026-04-24T00:30:00.000Z', 1_000_000),
          snapshot('2026-04-27T00:30:00.000Z', 1_000_000),
          snapshot('2026-04-28T00:30:00.000Z', 1_000_000),
        ],
      },
    });

    expect(enricher.enrich(price(5_200_000))).toMatchObject({
      volumeSurgeRatio: 5.2,
      volumeBaselineStatus: 'ready',
    });
  });

  it('keeps the ratio hidden while persisted samples are insufficient', () => {
    const enricher = createVolumeBaselineEnricher({
      stockRepo: { findAll: () => [stock()] },
      snapshotRepo: {
        findSinceForTickers: () => [
          snapshot('2026-04-26T00:30:00.000Z', 1_000_000),
          snapshot('2026-04-27T00:30:00.000Z', 1_000_000),
        ],
      },
    });

    expect(enricher.enrich(price(5_200_000))).toMatchObject({
      volumeSurgeRatio: null,
      volumeBaselineStatus: 'collecting',
    });
  });

  it('does not mark missing or invalid volume as collecting', () => {
    const enricher = createVolumeBaselineEnricher({
      stockRepo: { findAll: () => [stock()] },
      snapshotRepo: { findSinceForTickers: () => [] },
    });

    expect(enricher.enrich(price(0))).toMatchObject({
      volumeSurgeRatio: null,
      volumeBaselineStatus: 'unavailable',
    });
  });
});
