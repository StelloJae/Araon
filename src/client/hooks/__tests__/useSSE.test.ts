import { describe, expect, it } from 'vitest';

import type { Price } from '@shared/types';
import { shouldAppendPriceHistoryPoint } from '../useSSE';

const basePrice: Price = {
  ticker: '005930',
  price: 70_000,
  change: 100,
  changeRate: 0.14,
  volume: 1_000,
  updatedAt: '2026-05-14T00:00:00.000Z',
  source: 'rest',
  isSnapshot: false,
};

describe('shouldAppendPriceHistoryPoint', () => {
  it('keeps live market points for the current sparkline', () => {
    expect(shouldAppendPriceHistoryPoint(basePrice, 'open')).toBe(true);
  });

  it('rejects warm snapshots even during the live session', () => {
    expect(
      shouldAppendPriceHistoryPoint({ ...basePrice, isSnapshot: true }, 'open'),
    ).toBe(false);
  });

  it('keeps pre-open and after-hours realtime ticks for 24h sparkline retention', () => {
    expect(
      shouldAppendPriceHistoryPoint(
        { ...basePrice, source: 'ws-krx' },
        'pre-open',
      ),
    ).toBe(true);
    expect(
      shouldAppendPriceHistoryPoint(
        { ...basePrice, source: 'ws-integrated' },
        'closed',
      ),
    ).toBe(true);
    expect(
      shouldAppendPriceHistoryPoint({ ...basePrice, source: 'ws-nxt' }, 'snapshot'),
    ).toBe(true);
  });

  it('does not turn closed-session REST polling into fake intraday movement', () => {
    expect(shouldAppendPriceHistoryPoint(basePrice, 'closed')).toBe(false);
    expect(shouldAppendPriceHistoryPoint(basePrice, 'pre-open')).toBe(false);
    expect(shouldAppendPriceHistoryPoint(basePrice, 'snapshot')).toBe(false);
  });
});
