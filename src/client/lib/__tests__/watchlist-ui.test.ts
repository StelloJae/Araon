import { describe, expect, it } from 'vitest';
import {
  buildWatchlistAddInput,
  productCodeForWatchlistUiCode,
} from '../watchlist-ui';
import type { AraonWatchlistItem } from '../api-client';

const tossOnlyItem: AraonWatchlistItem = {
  productCode: 'A0011T0',
  krTicker: null,
  symbol: '0011T0',
  name: '채비',
  market: 'TOSS_ONLY',
  currency: 'UNKNOWN',
  source: 'toss',
  syncState: 'sync_unavailable',
  kisEligible: false,
  tossEligible: true,
  chartEligible: false,
  quoteEligible: true,
  realtimeTrackingState: 'not_eligible',
  addedAt: null,
  groupName: null,
  base: null,
  last: null,
};

describe('watchlist UI identity helpers', () => {
  it('builds a KRX watchlist add payload from a six-digit UI code', () => {
    expect(buildWatchlistAddInput('005930')).toMatchObject({
      productCode: 'A005930',
      krTicker: '005930',
      symbol: '005930',
      market: 'UNKNOWN',
      currency: 'UNKNOWN',
    });
  });

  it('preserves Toss-only product identity instead of forcing krTicker', () => {
    expect(buildWatchlistAddInput('0011T0', undefined, tossOnlyItem)).toMatchObject({
      productCode: 'A0011T0',
      krTicker: null,
      symbol: '0011T0',
      name: '채비',
      market: 'TOSS_ONLY',
      currency: 'UNKNOWN',
    });
  });

  it('uses the normalized watchlist productCode when removing a Toss-only row', () => {
    expect(productCodeForWatchlistUiCode('0011T0', tossOnlyItem)).toBe('A0011T0');
  });
});
