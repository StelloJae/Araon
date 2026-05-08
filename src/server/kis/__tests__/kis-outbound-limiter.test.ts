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

  it('starts endpoint-specific cooldown after KIS rate-limit errors', async () => {
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

    expect(sleep).not.toHaveBeenCalled();
    expect(limiter.snapshot().profiles).toEqual([
      expect.objectContaining({
        profileId: 'primary',
        endpointClass: 'daily-backfill',
        cooldownUntilMs: 61_000,
        cooldownActive: true,
      }),
    ]);
  });

  it('fails fast only for the endpoint class whose cooldown is active', async () => {
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

    await limiter.acquire({ profileId: 'primary', endpointClass: 'ranking' });
    expect(sleep).not.toHaveBeenCalled();

    await expect(
      limiter.acquire({ profileId: 'primary', endpointClass: 'polling' }),
    ).rejects.toMatchObject({
      status: 429,
      msgCd: 'EGW00201',
      payload: {
        localCooldown: true,
        cooldownUntilMs: 61_000,
      },
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

  it('allows endpoint-specific cooldown duration overrides', async () => {
    let now = 1_000;
    const limiter = createKisOutboundLimiter({
      ratePerSec: 10,
      burst: 10,
      cooldownMs: 60_000,
      cooldownMsByEndpointClass: {
        polling: 30_000,
      },
      now: () => now,
      sleep: vi.fn(async (ms: number) => {
        now += ms;
      }),
    });

    limiter.recordFailure({
      profileId: 'primary',
      endpointClass: 'polling',
      error: new KisRestError('limited', 429, null, 'EGW00201', null),
    });
    limiter.recordFailure({
      profileId: 'primary',
      endpointClass: 'daily-backfill',
      error: new KisRestError('limited', 429, null, 'EGW00201', null),
    });

    expect(limiter.snapshot().profiles).toEqual([
      expect.objectContaining({
        profileId: 'primary',
        endpointClass: 'daily-backfill',
        cooldownUntilMs: 61_000,
        cooldownActive: true,
      }),
      expect.objectContaining({
        profileId: 'primary',
        endpointClass: 'polling',
        cooldownUntilMs: 31_000,
        cooldownActive: true,
      }),
    ]);
  });

  it('does not extend cooldown when acquire is blocked by local cooldown', async () => {
    let now = 1_000;
    const limiter = createKisOutboundLimiter({
      ratePerSec: 10,
      burst: 10,
      cooldownMs: 60_000,
      cooldownMsByEndpointClass: {
        polling: 30_000,
      },
      now: () => now,
      sleep: vi.fn(async (ms: number) => {
        now += ms;
      }),
    });

    limiter.recordFailure({
      profileId: 'primary',
      endpointClass: 'polling',
      error: new KisRestError('limited', 500, null, 'EGW00201', null),
    });

    let localCooldownError: unknown;
    now = 2_000;
    try {
      await limiter.acquire({ profileId: 'primary', endpointClass: 'polling' });
    } catch (err: unknown) {
      localCooldownError = err;
    }

    expect(localCooldownError).toBeInstanceOf(KisRestError);
    limiter.recordFailure({
      profileId: 'primary',
      endpointClass: 'polling',
      error: localCooldownError,
    });

    expect(limiter.snapshot().profiles).toEqual([
      expect.objectContaining({
        profileId: 'primary',
        endpointClass: 'polling',
        cooldownUntilMs: 31_000,
        cooldownActive: true,
      }),
    ]);
  });
});
