import { describe, expect, it } from 'vitest';

import type { Price, Stock } from '@shared/types';
import { collectVolumeBaselineCandidates } from '../volume-baseline-collector';

function price(ticker: string, volume: number): Price {
  return {
    ticker,
    price: 70_000,
    changeRate: 1.2,
    changeAbs: 800,
    volume,
    updatedAt: '2026-04-29T00:30:12.000Z',
    isSnapshot: false,
    source: 'ws-integrated',
  };
}

function stock(ticker: string): Stock {
  return { ticker, name: ticker, market: 'KOSPI' };
}

describe('volume baseline collector', () => {
  it('collects baseline candidates only for tracked stocks', () => {
    const got = collectVolumeBaselineCandidates({
      prices: [price('005930', 1_500_000), price('999999', 9_999_999)],
      trackedStocks: [stock('005930')],
    });

    expect(got).toEqual([
      {
        ticker: '005930',
        session: 'regular',
        timeBucket: '09:30',
        cumulativeVolume: 1_500_000,
        observedAt: '2026-04-29T00:30:12.000Z',
      },
    ]);
  });

  it('skips unknown sessions and non-positive volumes', () => {
    const got = collectVolumeBaselineCandidates({
      prices: [
        { ...price('005930', 0), updatedAt: '2026-04-29T00:30:12.000Z' },
        { ...price('000660', 100), updatedAt: '2026-04-29T21:00:00.000Z' },
      ],
      trackedStocks: [stock('005930'), stock('000660')],
    });

    expect(got).toEqual([]);
  });
});
