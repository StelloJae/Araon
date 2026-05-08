import { describe, expect, it, vi } from 'vitest';
import { KisRestError } from '../kis-rest-client.js';
import { createKisOutboundLimiter } from '../kis-outbound-limiter.js';

describe('createKisOutboundLimiter', () => {
  it('delays requests when the shared burst is exhausted', async () => {
    let now = 0;
    const sleep = vi.fn(async (ms: number) => {
      now += ms;
    });
    const limiter = createKisOutboundLimiter({
      ratePerSec: 1,
      burst: 1,
      now: () => now,
      sleep,
    });

    await limiter.acquire({ endpointClass: 'polling' });
    await limiter.acquire({ endpointClass: 'polling' });

    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it('starts profile cooldown after KIS rate-limit errors', async () => {
    let now = 1_000;
    const sleep = vi.fn(async (ms: number) => {
      now += ms;
    });
    const limiter = createKisOutboundLimiter({
      ratePerSec: 10,
      burst: 10,
      cooldownMs: 60_000,
      now: () => now,
      sleep,
    });

    limiter.recordFailure({
      profileId: 'primary',
      endpointClass: 'daily-backfill',
      error: new KisRestError('limited', 429, null, 'EGW00201', null),
    });

    await limiter.acquire({ profileId: 'primary', endpointClass: 'polling' });

    expect(sleep).toHaveBeenCalledWith(60_000);
    expect(limiter.snapshot().profiles).toEqual([
      expect.objectContaining({
        profileId: 'primary',
        cooldownUntilMs: 61_000,
        cooldownActive: false,
      }),
    ]);
  });

  it('fails fast for daily backfill while a profile cooldown is active', async () => {
    let now = 1_000;
    const sleep = vi.fn(async (ms: number) => {
      now += ms;
    });
    const limiter = createKisOutboundLimiter({
      ratePerSec: 10,
      burst: 10,
      cooldownMs: 60_000,
      now: () => now,
      sleep,
    });

    limiter.recordFailure({
      profileId: 'primary',
      endpointClass: 'polling',
      error: new KisRestError('limited', 429, null, 'EGW00201', null),
    });

    await expect(
      limiter.acquire({ profileId: 'primary', endpointClass: 'daily-backfill' }),
    ).rejects.toMatchObject({
      status: 429,
      msgCd: 'EGW00201',
    });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not cooldown unrelated profiles', async () => {
    let now = 0;
    const sleep = vi.fn(async (ms: number) => {
      now += ms;
    });
    const limiter = createKisOutboundLimiter({
      ratePerSec: 10,
      burst: 10,
      now: () => now,
      sleep,
    });

    limiter.recordFailure({
      profileId: 'primary',
      endpointClass: 'selected-minute',
      error: new KisRestError('limited', 429, null, 'EGW00201', null),
    });

    await limiter.acquire({ profileId: 'secondary', endpointClass: 'polling' });

    expect(sleep).not.toHaveBeenCalled();
  });
});
