import { describe, expect, it } from 'vitest';

import { isApiPath } from '../static-client.js';

describe('static client API prefix guard', () => {
  it('keeps market summary requests out of the SPA fallback', () => {
    expect(isApiPath('/market')).toBe(true);
    expect(isApiPath('/market/summary')).toBe(true);
    expect(isApiPath('/toss')).toBe(true);
    expect(isApiPath('/toss/auth/status')).toBe(true);
    expect(isApiPath('/watchlist/005930')).toBe(false);
  });
});
