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
      classPolicies: {
        polling: { minStartGapMs: 0 },
      },
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
      classPolicies: {
        polling: { minStartGapMs: 0 },
        selected_backfill: { minStartGapMs: 0 },
      },
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

  it('records the observed recovery time after the first successful request', () => {
    let now = 1_000;
    const limiter = createKisOutboundLimiter({
      ratePerSec: 10,
      burst: 10,
      cooldownMs: 30_000,
      now: () => now,
      recoverySuccessThreshold: 1,
      recoveryStableMs: 0,
    });

    limiter.recordFailure({
      profileId: 'primary',
      endpointClass: 'polling',
      error: new KisRestError('limited', 500, null, 'EGW00201', null),
    });

    now = 31_005;
    limiter.recordSuccess({
      profileId: 'primary',
      endpointClass: 'polling',
    });

    expect(limiter.snapshot().profiles).toEqual([
      expect.objectContaining({
        profileId: 'primary',
        endpointClass: 'polling',
        firstLimitedAtMs: 1_000,
        lastLimitedAtMs: 1_000,
        recoveredAtMs: 31_005,
        observedRecoveryMs: 30_005,
      }),
    ]);
  });

  it('keeps the latest recovery observation visible after a new rate-limit window starts', () => {
    let now = 1_000;
    const limiter = createKisOutboundLimiter({
      ratePerSec: 10,
      burst: 10,
      cooldownMs: 30_000,
      now: () => now,
      recoverySuccessThreshold: 1,
      recoveryStableMs: 0,
    });

    limiter.recordFailure({
      profileId: 'primary',
      endpointClass: 'polling',
      error: new KisRestError('limited', 500, null, 'EGW00201', null),
    });

    now = 31_005;
    limiter.recordSuccess({
      profileId: 'primary',
      endpointClass: 'polling',
    });
    limiter.recordSuccess({
      profileId: 'primary',
      endpointClass: 'polling',
    });

    now = 32_000;
    limiter.recordFailure({
      profileId: 'primary',
      endpointClass: 'polling',
      error: new KisRestError('limited again', 500, null, 'EGW00201', null),
    });

    expect(limiter.snapshot().profiles).toEqual([
      expect.objectContaining({
        profileId: 'primary',
        endpointClass: 'polling',
        firstLimitedAtMs: 32_000,
        lastLimitedAtMs: 32_000,
        recoveredAtMs: 31_005,
        observedRecoveryMs: 30_005,
      }),
    ]);

    now = 62_010;
    limiter.recordSuccess({
      profileId: 'primary',
      endpointClass: 'polling',
    });

    expect(limiter.snapshot().profiles).toEqual([
      expect.objectContaining({
        profileId: 'primary',
        endpointClass: 'polling',
        firstLimitedAtMs: 32_000,
        lastLimitedAtMs: 32_000,
        recoveredAtMs: 62_010,
        observedRecoveryMs: 30_010,
      }),
    ]);
  });

  it('enters half-open shortly after a second-window throttle and recovers via one canary', async () => {
    let now = 1_000;
    const sleep = vi.fn(async (ms: number) => {
      now += ms;
    });
    const limiter = createKisOutboundLimiter({
      ratePerSec: 10,
      burst: 10,
      now: () => now,
      sleep,
      recoveryBackoffMs: [150, 300, 700],
    });

    limiter.recordFailure({
      profileId: 'primary',
      endpointClass: 'polling',
      error: new KisRestError('limited', 500, null, 'EGW00201', null),
    });

    expect(limiter.snapshot().profiles[0]).toEqual(expect.objectContaining({
      state: 'throttled',
      cooldownUntilMs: 1_150,
      nextRetryAtMs: 1_150,
      recoveryAttemptCount: 0,
      lastThrottleCode: 'EGW00201',
    }));

    now = 1_149;
    await expect(
      limiter.acquire({ profileId: 'primary', endpointClass: 'polling' }),
    ).rejects.toMatchObject({
      status: 429,
      msgCd: 'EGW00201',
    });

    now = 1_150;
    await limiter.acquire({ profileId: 'primary', endpointClass: 'polling' });
    expect(limiter.snapshot().profiles[0]).toEqual(expect.objectContaining({
      state: 'half_open',
    }));

    limiter.recordSuccess({ profileId: 'primary', endpointClass: 'polling' });
    expect(limiter.snapshot().profiles[0]).toEqual(expect.objectContaining({
      state: 'recovering',
      recoveredAtMs: 1_150,
      observedRecoveryMs: 150,
    }));
  });

  it('backs off failed canaries and escalates repeated failures to a 30s circuit breaker', async () => {
    let now = 1_000;
    const limiter = createKisOutboundLimiter({
      ratePerSec: 10,
      burst: 10,
      now: () => now,
      recoveryBackoffMs: [150, 300, 700],
      circuitBreakerAfterFailures: 3,
      circuitBreakerMs: 30_000,
    });

    for (const expected of [
      { now: 1_000, nextRetryAtMs: 1_150, attempt: 0, state: 'throttled' },
      { now: 1_150, nextRetryAtMs: 1_450, attempt: 1, state: 'throttled' },
      { now: 1_450, nextRetryAtMs: 2_150, attempt: 2, state: 'throttled' },
      { now: 2_150, nextRetryAtMs: 32_150, attempt: 3, state: 'circuit_breaker' },
    ] as const) {
      now = expected.now;
      limiter.recordFailure({
        profileId: 'primary',
        endpointClass: 'polling',
        error: new KisRestError('limited', 500, null, 'EGW00201', null),
      });
      expect(limiter.snapshot().profiles[0]).toEqual(expect.objectContaining({
        state: expected.state,
        nextRetryAtMs: expected.nextRetryAtMs,
        cooldownUntilMs: expected.nextRetryAtMs,
        recoveryAttemptCount: expected.attempt,
      }));
    }
  });

  it('keeps recovering traffic below full speed until stability is observed', () => {
    let now = 1_000;
    const limiter = createKisOutboundLimiter({
      ratePerSec: 10,
      burst: 10,
      now: () => now,
      recoveryBackoffMs: [150],
      recoveryRatePerSec: 4,
      recoverySuccessThreshold: 2,
      recoveryStableMs: 1_000,
    });

    limiter.recordFailure({
      profileId: 'primary',
      endpointClass: 'polling',
      error: new KisRestError('limited', 500, null, 'EGW00201', null),
    });
    now = 1_150;
    limiter.recordSuccess({ profileId: 'primary', endpointClass: 'polling' });

    expect(limiter.snapshot().profiles[0]).toEqual(expect.objectContaining({
      state: 'recovering',
      currentAllowedRps: 4,
    }));

    now = 2_151;
    limiter.recordSuccess({ profileId: 'primary', endpointClass: 'polling' });

    expect(limiter.snapshot().profiles[0]).toEqual(expect.objectContaining({
      state: 'normal',
      currentAllowedRps: 10,
    }));
  });

  it('records sanitized telemetry for throttle recovery transitions', () => {
    let now = Date.parse('2026-05-10T06:00:00.000Z');
    const limiter = createKisOutboundLimiter({
      ratePerSec: 10,
      burst: 10,
      now: () => now,
      recoveryBackoffMs: [150],
      recoverySuccessThreshold: 1,
      recoveryStableMs: 0,
      telemetry: { capacity: 3 },
    });

    limiter.recordFailure({
      profileId: 'primary',
      endpointClass: 'polling',
      error: new KisRestError(
        'limited appSecret=SHOULD_NOT_APPEAR',
        500,
        null,
        'EGW00201',
        { appKey: 'SHOULD_NOT_APPEAR' },
      ),
    });
    now += 150;
    limiter.recordSuccess({ profileId: 'primary', endpointClass: 'polling' });
    limiter.recordSuccess({ profileId: 'primary', endpointClass: 'polling' });

    expect(limiter.snapshot().telemetry).toEqual({
      capacity: 3,
      eventCount: 3,
      recent: [
        {
          atMs: Date.parse('2026-05-10T06:00:00.000Z'),
          event: 'throttle',
          profileId: 'primary',
          endpointClass: 'polling',
          priorityClass: 'polling',
          state: 'throttled',
          throttleCode: 'EGW00201',
          recoveryAttemptCount: 0,
          observedRecoveryMs: null,
          currentAllowedRps: 10,
          minStartGapMs: 120,
          maxInFlight: 2,
        },
        {
          atMs: Date.parse('2026-05-10T06:00:00.150Z'),
          event: 'recovered',
          profileId: 'primary',
          endpointClass: 'polling',
          priorityClass: 'polling',
          state: 'recovering',
          throttleCode: 'EGW00201',
          recoveryAttemptCount: 0,
          observedRecoveryMs: 150,
          currentAllowedRps: 4,
          minStartGapMs: 250,
          maxInFlight: 2,
        },
        {
          atMs: Date.parse('2026-05-10T06:00:00.150Z'),
          event: 'normal',
          profileId: 'primary',
          endpointClass: 'polling',
          priorityClass: 'polling',
          state: 'normal',
          throttleCode: 'EGW00201',
          recoveryAttemptCount: 0,
          observedRecoveryMs: 150,
          currentAllowedRps: 10,
          minStartGapMs: 120,
          maxInFlight: 2,
        },
      ],
    });
    expect(JSON.stringify(limiter.snapshot().telemetry)).not.toContain('SHOULD_NOT_APPEAR');
  });

  it('backs off if recovering traffic throttles before returning to normal', () => {
    let now = 1_000;
    const limiter = createKisOutboundLimiter({
      ratePerSec: 10,
      burst: 10,
      now: () => now,
      recoveryBackoffMs: [150, 300, 700],
      recoveryRatePerSec: 4,
      recoverySuccessThreshold: 3,
      recoveryStableMs: 5_000,
    });

    limiter.recordFailure({
      profileId: 'primary',
      endpointClass: 'polling',
      error: new KisRestError('limited', 500, null, 'EGW00201', null),
    });
    now = 1_150;
    limiter.recordSuccess({ profileId: 'primary', endpointClass: 'polling' });

    now = 1_300;
    limiter.recordFailure({
      profileId: 'primary',
      endpointClass: 'polling',
      error: new KisRestError('limited again', 500, null, 'EGW00201', null),
    });

    expect(limiter.snapshot().profiles[0]).toEqual(expect.objectContaining({
      state: 'throttled',
      firstLimitedAtMs: 1_000,
      nextRetryAtMs: 1_600,
      recoveryAttemptCount: 1,
      observedRecoveryMs: 150,
    }));
  });

  it('spaces request starts so token-bucket burst capacity cannot stampede KIS', async () => {
    let now = 1_000;
    const sleep = vi.fn(async (ms: number) => {
      now += ms;
    });
    const limiter = createKisOutboundLimiter({
      ratePerSec: 20,
      burst: 20,
      now: () => now,
      sleep,
      globalMinStartGapMs: 50,
      classPolicies: {
        foreground: { minStartGapMs: 80, maxInFlight: 2 },
      },
    });

    await limiter.acquire({ profileId: 'primary', endpointClass: 'foreground' });
    limiter.recordSuccess({ profileId: 'primary', endpointClass: 'foreground' });
    await limiter.acquire({ profileId: 'primary', endpointClass: 'foreground' });

    expect(sleep).toHaveBeenCalledWith(80);
  });

  it('applies runtime class policy overrides to request start spacing', async () => {
    let now = 1_000;
    const sleep = vi.fn(async (ms: number) => {
      now += ms;
    });
    const limiter = createKisOutboundLimiter({
      ratePerSec: 100,
      burst: 100,
      now: () => now,
      sleep,
      classPolicies: {
        polling: { minStartGapMs: 120 },
      },
    });

    await limiter.acquire({ profileId: 'primary', endpointClass: 'polling' });
    limiter.recordSuccess({ profileId: 'primary', endpointClass: 'polling' });

    limiter.setClassPolicyOverride!('polling', { minStartGapMs: 260 });
    await limiter.acquire({ profileId: 'primary', endpointClass: 'polling' });

    expect(sleep).toHaveBeenCalledWith(260);
  });

  it('clears runtime class policy overrides for rollback', async () => {
    let now = 1_000;
    const sleep = vi.fn(async (ms: number) => {
      now += ms;
    });
    const limiter = createKisOutboundLimiter({
      ratePerSec: 100,
      burst: 100,
      now: () => now,
      sleep,
      classPolicies: {
        polling: { minStartGapMs: 120 },
      },
    });

    await limiter.acquire({ profileId: 'primary', endpointClass: 'polling' });
    limiter.recordSuccess({ profileId: 'primary', endpointClass: 'polling' });

    limiter.setClassPolicyOverride!('polling', { minStartGapMs: 260 });
    await limiter.acquire({ profileId: 'primary', endpointClass: 'polling' });
    limiter.recordSuccess({ profileId: 'primary', endpointClass: 'polling' });

    limiter.setClassPolicyOverride!('polling', null);
    await limiter.acquire({ profileId: 'primary', endpointClass: 'polling' });

    expect(sleep).toHaveBeenNthCalledWith(1, 260);
    expect(sleep).toHaveBeenNthCalledWith(2, 120);
  });

  it('prioritizes foreground over queued background work when shared capacity opens', async () => {
    let now = 0;
    const sleeps: Array<{ ms: number; resolve: () => void }> = [];
    const sleep = vi.fn((ms: number) => new Promise<void>((resolve) => {
      sleeps.push({ ms, resolve });
    }));
    const limiter = createKisOutboundLimiter({
      ratePerSec: 1,
      burst: 1,
      now: () => now,
      sleep,
      classPolicies: {
        foreground: { minStartGapMs: 0, maxInFlight: 1 },
        background_backfill: { minStartGapMs: 0, maxInFlight: 1 },
        polling: { minStartGapMs: 0, maxInFlight: 1 },
      },
    });
    const started: string[] = [];

    await limiter.acquire({ profileId: 'primary', endpointClass: 'polling' });
    limiter.recordSuccess({ profileId: 'primary', endpointClass: 'polling' });

    const background = limiter
      .acquire({ profileId: 'primary', endpointClass: 'daily-backfill' })
      .then(() => {
        started.push('background');
      });
    await flushMicrotasks();

    const foreground = limiter
      .acquire({ profileId: 'primary', endpointClass: 'foreground' })
      .then(() => {
        started.push('foreground');
      });
    await flushMicrotasks();

    expect(sleeps[0]?.ms).toBe(1000);
    now = 1000;
    sleeps[0]?.resolve();
    await flushMicrotasks();

    const firstStarted = started[0];
    if (firstStarted === 'foreground') {
      limiter.recordSuccess({ profileId: 'primary', endpointClass: 'foreground' });
    }
    for (let index = 1; index < sleeps.length; index += 1) {
      const pending = sleeps[index]!;
      now += pending.ms;
      pending.resolve();
      await flushMicrotasks();
    }
    await Promise.allSettled([background, foreground]);

    expect(firstStarted).toBe('foreground');
  });

  it('reports queued request depth by priority class', async () => {
    let now = 0;
    const sleep = vi.fn(() => new Promise<void>(() => undefined));
    const limiter = createKisOutboundLimiter({
      ratePerSec: 1,
      burst: 1,
      now: () => now,
      sleep,
      classPolicies: {
        foreground: { minStartGapMs: 0, maxInFlight: 1 },
        background_backfill: { minStartGapMs: 0, maxInFlight: 1 },
        polling: { minStartGapMs: 0, maxInFlight: 1 },
      },
    });

    await limiter.acquire({ profileId: 'primary', endpointClass: 'polling' });
    limiter.recordSuccess({ profileId: 'primary', endpointClass: 'polling' });
    void limiter.acquire({ profileId: 'primary', endpointClass: 'daily-backfill' });
    await flushMicrotasks();
    void limiter.acquire({ profileId: 'primary', endpointClass: 'foreground' });
    await flushMicrotasks();

    expect(limiter.snapshot()).toEqual(expect.objectContaining({
      queueDepth: 2,
      queuedByPriority: expect.objectContaining({
        foreground: 1,
        background_backfill: 1,
      }),
    }));
  });

  it('records throttle state before draining queued work for the same class', async () => {
    let now = 0;
    const limiter = createKisOutboundLimiter({
      ratePerSec: 10,
      burst: 2,
      now: () => now,
      sleep: vi.fn(async (ms: number) => {
        now += ms;
      }),
      classPolicies: {
        polling: { minStartGapMs: 0, maxInFlight: 1 },
      },
    });

    await limiter.acquire({ profileId: 'primary', endpointClass: 'polling' });
    const queued = limiter
      .acquire({ profileId: 'primary', endpointClass: 'polling' })
      .then(
        () => 'started' as const,
        (err: unknown) => err,
      );
    await flushMicrotasks();

    limiter.recordFailure({
      profileId: 'primary',
      endpointClass: 'polling',
      error: new KisRestError('limited', 500, null, 'EGW00201', null),
    });
    await flushMicrotasks();

    const result = await queued;
    expect(result).toBeInstanceOf(KisRestError);
    expect(result).toMatchObject({
      status: 429,
      msgCd: 'EGW00201',
      payload: { localCooldown: true },
    });
  });
});

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
