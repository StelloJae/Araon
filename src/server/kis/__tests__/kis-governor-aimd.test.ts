import { describe, expect, it } from 'vitest';

import {
  buildKisGovernorAimdObservation,
  evaluateKisGovernorAimd,
} from '../kis-governor-aimd.js';

describe('evaluateKisGovernorAimd', () => {
  it('keeps clean windows until enough regular-market evidence accumulates', () => {
    const decision = evaluateKisGovernorAimd({
      currentPollingMinStartGapMs: 350,
      window: cleanWindow({ cleanRegularMarketWindowCount: 2 }),
    });

    expect(decision).toMatchObject({
      action: 'keep',
      proposedPollingMinStartGapMs: 350,
      applyRuntimeChange: false,
      reason: 'waiting_for_clean_windows',
    });
  });

  it('loosens by one additive step after enough clean regular-market windows', () => {
    const decision = evaluateKisGovernorAimd({
      currentPollingMinStartGapMs: 350,
      window: cleanWindow({ cleanRegularMarketWindowCount: 3 }),
    });

    expect(decision).toMatchObject({
      action: 'loosen',
      proposedPollingMinStartGapMs: 325,
      applyRuntimeChange: false,
      reason: 'clean_regular_market_windows',
    });
  });

  it('does not loosen below 300ms without an explicit approval flag', () => {
    const decision = evaluateKisGovernorAimd({
      currentPollingMinStartGapMs: 300,
      window: cleanWindow({ cleanRegularMarketWindowCount: 3 }),
    });

    expect(decision).toMatchObject({
      action: 'keep',
      proposedPollingMinStartGapMs: 300,
      reason: 'minimum_gap_reached',
    });
  });

  it('can propose below 300ms only when explicitly approved', () => {
    const decision = evaluateKisGovernorAimd({
      allowBelowMinimumGap: true,
      currentPollingMinStartGapMs: 300,
      window: cleanWindow({ cleanRegularMarketWindowCount: 3 }),
    });

    expect(decision).toMatchObject({
      action: 'loosen',
      proposedPollingMinStartGapMs: 275,
      reason: 'clean_regular_market_windows',
    });
  });

  it('keeps instead of tightening for a single isolated throttle', () => {
    const decision = evaluateKisGovernorAimd({
      currentPollingMinStartGapMs: 350,
      window: cleanWindow({
        cleanRegularMarketWindowCount: 0,
        throttleCount: 1,
      }),
    });

    expect(decision).toMatchObject({
      action: 'keep',
      proposedPollingMinStartGapMs: 350,
      reason: 'single_throttle_observed',
    });
  });

  it('tightens by the repeated-throttle factor', () => {
    const decision = evaluateKisGovernorAimd({
      currentPollingMinStartGapMs: 350,
      window: cleanWindow({
        cleanRegularMarketWindowCount: 0,
        throttleCount: 2,
      }),
    });

    expect(decision).toMatchObject({
      action: 'tighten',
      proposedPollingMinStartGapMs: 438,
      reason: 'repeated_throttle',
    });
  });

  it('can enter the emergency band when repeated throttles occur at the normal maximum', () => {
    const decision = evaluateKisGovernorAimd({
      mode: 'active',
      currentPollingMinStartGapMs: 800,
      window: cleanWindow({
        cleanRegularMarketWindowCount: 0,
        throttleCount: 2,
      }),
    });

    expect(decision).toMatchObject({
      action: 'tighten',
      proposedPollingMinStartGapMs: 1000,
      applyRuntimeChange: true,
      reason: 'repeated_throttle',
    });
  });

  it('protectively tightens above the normal maximum after degraded windows accumulate', () => {
    const decision = evaluateKisGovernorAimd({
      mode: 'active',
      currentPollingMinStartGapMs: 800,
      window: cleanWindow({
        cleanRegularMarketWindowCount: 0,
        degradedWindowCount: 2,
        throttleCount: 1,
      }),
    });

    expect(decision).toMatchObject({
      action: 'tighten',
      proposedPollingMinStartGapMs: 920,
      applyRuntimeChange: true,
      reason: 'degraded_window_pressure',
    });
  });

  it('tightens more strongly after circuit breaker evidence', () => {
    const decision = evaluateKisGovernorAimd({
      currentPollingMinStartGapMs: 700,
      window: cleanWindow({
        circuitBreakerCount: 1,
        cleanRegularMarketWindowCount: 0,
      }),
    });

    expect(decision).toMatchObject({
      action: 'tighten',
      proposedPollingMinStartGapMs: 1050,
      reason: 'circuit_breaker',
    });
  });

  it('holds malformed telemetry', () => {
    const decision = evaluateKisGovernorAimd({
      currentPollingMinStartGapMs: 350,
      window: cleanWindow({
        cleanRegularMarketWindowCount: 3,
        telemetryMalformed: true,
      }),
    });

    expect(decision).toMatchObject({
      action: 'hold',
      proposedPollingMinStartGapMs: 350,
      reason: 'malformed_telemetry',
    });
  });

  it('holds startup warm windows', () => {
    const decision = evaluateKisGovernorAimd({
      currentPollingMinStartGapMs: 350,
      window: cleanWindow({
        classification: 'startup_warm',
        cleanRegularMarketWindowCount: 3,
      }),
    });

    expect(decision).toMatchObject({
      action: 'hold',
      proposedPollingMinStartGapMs: 350,
      reason: 'startup_warm_window',
    });
  });

  it('never loosens from thin-liquidity evidence alone', () => {
    const decision = evaluateKisGovernorAimd({
      currentPollingMinStartGapMs: 350,
      window: cleanWindow({
        classification: 'thin_liquidity',
        cleanRegularMarketWindowCount: 3,
      }),
    });

    expect(decision).toMatchObject({
      action: 'hold',
      proposedPollingMinStartGapMs: 350,
      reason: 'thin_liquidity_window',
    });
  });

  it('is observe-only by default even when it recommends a change', () => {
    const decision = evaluateKisGovernorAimd({
      currentPollingMinStartGapMs: 350,
      window: cleanWindow({
        throttleCount: 2,
        cleanRegularMarketWindowCount: 0,
      }),
    });

    expect(decision.mode).toBe('observe_only');
    expect(decision.action).toBe('tighten');
    expect(decision.applyRuntimeChange).toBe(false);
  });
});

describe('buildKisGovernorAimdObservation', () => {
  it('derives an observe-only tighten decision from repeated polling throttles', () => {
    const observation = buildKisGovernorAimdObservation({
      nowMs: 1_700_000_600_000,
      classification: 'regular_market',
      state: {
        enabled: false,
        mode: 'observe_only',
        currentPollingMinStartGapMs: 350,
        cleanRegularMarketWindowCount: 0,
      },
      telemetry: {
        capacity: 10,
        eventCount: 3,
        recent: [
          telemetryEvent(1_700_000_000_000, 'throttle'),
          telemetryEvent(1_700_000_010_000, 'normal'),
          telemetryEvent(1_700_000_600_000, 'throttle'),
        ],
      },
    });

    expect(observation.window).toMatchObject({
      classification: 'regular_market',
      durationMs: 600_000,
      completedPollingCycles: 2,
      throttleCount: 2,
      cleanRegularMarketWindowCount: 0,
    });
    expect(observation.decision).toMatchObject({
      mode: 'observe_only',
      action: 'tighten',
      reason: 'repeated_throttle',
      currentPollingMinStartGapMs: 350,
      proposedPollingMinStartGapMs: 438,
      applyRuntimeChange: false,
    });
  });

  it('holds when telemetry is present but the observation window is too short', () => {
    const observation = buildKisGovernorAimdObservation({
      nowMs: 1_700_000_030_000,
      classification: 'regular_market',
      state: {
        enabled: false,
        mode: 'observe_only',
        currentPollingMinStartGapMs: 350,
        cleanRegularMarketWindowCount: 0,
      },
      telemetry: {
        capacity: 10,
        eventCount: 2,
        recent: [
          telemetryEvent(1_700_000_000_000, 'throttle'),
          telemetryEvent(1_700_000_030_000, 'normal'),
        ],
      },
    });

    expect(observation.window.durationMs).toBe(30_000);
    expect(observation.decision).toMatchObject({
      action: 'hold',
      reason: 'window_too_short',
      proposedPollingMinStartGapMs: 350,
    });
  });

  it('uses polling scheduler cycle count instead of inferring cycles from event count', () => {
    const observation = buildKisGovernorAimdObservation({
      nowMs: 1_700_000_600_000,
      classification: 'regular_market',
      state: {
        enabled: false,
        mode: 'observe_only',
        currentPollingMinStartGapMs: 350,
        cleanRegularMarketWindowCount: 0,
      },
      polling: {
        cycleCount: 1,
      },
      telemetry: {
        capacity: 10,
        eventCount: 2,
        recent: [
          telemetryEvent(1_700_000_000_000, 'throttle'),
          telemetryEvent(1_700_000_600_000, 'throttle'),
        ],
      },
    });

    expect(observation.window).toMatchObject({
      completedPollingCycles: 1,
      throttleCount: 2,
    });
    expect(observation.decision).toMatchObject({
      action: 'hold',
      reason: 'insufficient_polling_cycles',
      proposedPollingMinStartGapMs: 350,
    });
  });
});

function cleanWindow(
  overrides: Partial<Parameters<typeof evaluateKisGovernorAimd>[0]['window']> = {},
): Parameters<typeof evaluateKisGovernorAimd>[0]['window'] {
  return {
    classification: 'regular_market',
    durationMs: 30 * 60 * 1_000,
    completedPollingCycles: 2,
    throttleCount: 0,
    circuitBreakerCount: 0,
    throttleImmediatelyAfterNormal: false,
    maxRecoveryAttemptCount: 0,
    queueStuckAfterRecovery: false,
    telemetryMalformed: false,
    dataHealthDisagrees: false,
    cleanRegularMarketWindowCount: 0,
    degradedWindowCount: 0,
    ...overrides,
  };
}

function telemetryEvent(
  atMs: number,
  event: 'throttle' | 'normal' | 'recovered' | 'half_open' | 'circuit_breaker',
) {
  return {
    atMs,
    event,
    profileId: 'primary',
    endpointClass: 'polling',
    priorityClass: 'polling',
    state: event === 'normal' ? 'normal' : event === 'circuit_breaker' ? 'circuit_breaker' : 'throttled',
    throttleCode: event === 'throttle' ? 'EGW00201' : null,
    recoveryAttemptCount: 0,
    observedRecoveryMs: event === 'normal' ? 200 : null,
    currentAllowedRps: event === 'recovered' ? 3 : 15,
    minStartGapMs: 350,
    maxInFlight: 2,
  } as const;
}
