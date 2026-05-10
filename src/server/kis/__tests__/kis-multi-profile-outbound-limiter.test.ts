import { describe, expect, it, vi } from 'vitest';

import { KisRestError } from '../kis-rest-client.js';
import { createKisMultiProfileOutboundLimiter } from '../kis-multi-profile-outbound-limiter.js';

describe('createKisMultiProfileOutboundLimiter', () => {
  it('keeps token budget independent per KIS profile', async () => {
    let now = 0;
    const sleep = vi.fn(async (ms: number) => {
      now += ms;
    });
    const limiter = createKisMultiProfileOutboundLimiter({
      profiles: [
        {
          profileId: 'primary',
          options: {
            ratePerSec: 1,
            burst: 1,
            now: () => now,
            sleep,
            classPolicies: { polling: { minStartGapMs: 0 } },
          },
        },
        {
          profileId: 'secondary',
          options: {
            ratePerSec: 1,
            burst: 1,
            now: () => now,
            sleep,
            classPolicies: { polling: { minStartGapMs: 0 } },
          },
        },
      ],
    });

    await limiter.acquire({ profileId: 'primary', endpointClass: 'polling' });
    await limiter.acquire({ profileId: 'secondary', endpointClass: 'polling' });

    expect(sleep).not.toHaveBeenCalled();

    await limiter.acquire({ profileId: 'primary', endpointClass: 'polling' });

    expect(sleep).toHaveBeenCalledWith(1_000);
  });

  it('does not let one throttled profile block another profile', async () => {
    let now = 1_000;
    const sleep = vi.fn(async (ms: number) => {
      now += ms;
    });
    const limiter = createKisMultiProfileOutboundLimiter({
      profiles: [
        {
          profileId: 'primary',
          options: { ratePerSec: 10, burst: 10, now: () => now, sleep },
        },
        {
          profileId: 'secondary',
          options: { ratePerSec: 10, burst: 10, now: () => now, sleep },
        },
      ],
    });

    limiter.recordFailure({
      profileId: 'primary',
      endpointClass: 'polling',
      error: new KisRestError('limited', 429, null, 'EGW00201', null),
    });

    await limiter.acquire({ profileId: 'secondary', endpointClass: 'polling' });

    expect(sleep).not.toHaveBeenCalled();
    expect(limiter.snapshot().profiles).toEqual([
      expect.objectContaining({
        profileId: 'primary',
        endpointClass: 'polling',
        state: 'throttled',
      }),
    ]);
  });

  it('reports aggregate capacity without exposing profile credentials', () => {
    const limiter = createKisMultiProfileOutboundLimiter({
      profiles: [
        { profileId: 'primary', options: { ratePerSec: 2, burst: 2 } },
        { profileId: 'secondary', options: { ratePerSec: 3, burst: 3 } },
      ],
    });

    const snapshot = limiter.snapshot();

    expect(snapshot.ratePerSec).toBe(5);
    expect(snapshot.burst).toBe(5);
    expect(JSON.stringify(snapshot)).not.toMatch(/appKey|appSecret|accessToken/i);
  });
});
