import { describe, expect, it } from 'vitest';

import { evaluateKisGovernorAimd } from '../kis-governor-aimd.js';

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
    ...overrides,
  };
}
