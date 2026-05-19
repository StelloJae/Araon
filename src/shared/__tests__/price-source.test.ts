import { describe, expect, it } from 'vitest';

import { isRealtimePriceSource } from '../price-source.js';

describe('isRealtimePriceSource', () => {
  it('treats Toss fast quote as a realtime-like price source', () => {
    expect(isRealtimePriceSource('toss-fast-quote')).toBe(true);
  });

  it('keeps ordinary REST refresh out of realtime source handling', () => {
    expect(isRealtimePriceSource('rest')).toBe(false);
  });
});
