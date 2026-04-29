import { describe, expect, it } from 'vitest';
import { isMarketLive, isPreOpen } from '../market-status';

describe('market-status helpers', () => {
  it('isMarketLive only true for "open"', () => {
    expect(isMarketLive('open')).toBe(true);
    expect(isMarketLive('pre-open')).toBe(false);
    expect(isMarketLive('closed')).toBe(false);
    expect(isMarketLive('snapshot')).toBe(false);
  });

  it('isPreOpen only true for "pre-open"', () => {
    expect(isPreOpen('pre-open')).toBe(true);
    expect(isPreOpen('open')).toBe(false);
    expect(isPreOpen('closed')).toBe(false);
    expect(isPreOpen('snapshot')).toBe(false);
  });
});
