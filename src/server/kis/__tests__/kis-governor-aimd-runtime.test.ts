import { describe, expect, it, vi } from 'vitest';

import {
  defaultKisGovernorAimdState,
  type KisGovernorAimdStateSnapshot,
  type KisGovernorAimdStateStore,
} from '../kis-governor-aimd-state.js';
import {
  applyKisGovernorAimdRuntime,
  classifyKisGovernorAimdWindowFromMarketPhase,
} from '../kis-governor-aimd-runtime.js';
import type { KisGovernorTelemetryEvent } from '../kis-outbound-limiter.js';

describe('applyKisGovernorAimdRuntime', () => {
  it('applies active tighten decisions to persisted state and polling limiter override', async () => {
    const nowMs = Date.parse('2026-05-10T01:30:00.000Z');
    const store = stateStore({
      ...defaultKisGovernorAimdState(),
      enabled: true,
      mode: 'active',
      currentPollingMinStartGapMs: 350,
      nextEvaluationAtMs: nowMs,
    });
    const setClassPolicyOverride = vi.fn();

    const result = await applyKisGovernorAimdRuntime({
      stateStore: store,
      outboundLimiter: { setClassPolicyOverride },
      telemetry: {
        capacity: 10,
        eventCount: 2,
        recent: [
          telemetryEvent(nowMs - 600_000, 'throttle'),
          telemetryEvent(nowMs, 'throttle'),
        ],
      },
      classification: 'regular_market',
      pollingCycleCount: 2,
      nowMs,
    });

    expect(result.decision).toMatchObject({
      mode: 'active',
      action: 'tighten',
      reason: 'repeated_throttle',
      proposedPollingMinStartGapMs: 438,
      applyRuntimeChange: true,
    });
    expect(setClassPolicyOverride).toHaveBeenCalledWith('polling', { minStartGapMs: 438 });
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({
      currentPollingMinStartGapMs: 438,
      lastAdjustmentAtMs: nowMs,
      lastAdjustmentDirection: 'increase_gap',
      lastAdjustmentReason: 'repeated_throttle',
      nextEvaluationAtMs: nowMs + 600_000,
      cleanRegularMarketWindowCount: 0,
      degradedWindowCount: 1,
    }));
  });

  it('counts clean active windows before loosening', async () => {
    const nowMs = Date.parse('2026-05-10T01:40:00.000Z');
    const store = stateStore({
      ...defaultKisGovernorAimdState(),
      enabled: true,
      mode: 'active',
      currentPollingMinStartGapMs: 350,
      nextEvaluationAtMs: nowMs,
      cleanRegularMarketWindowCount: 0,
    });
    const setClassPolicyOverride = vi.fn();

    const result = await applyKisGovernorAimdRuntime({
      stateStore: store,
      outboundLimiter: { setClassPolicyOverride },
      telemetry: { capacity: 10, eventCount: 0, recent: [] },
      classification: 'regular_market',
      pollingCycleCount: 2,
      nowMs,
    });

    expect(result.decision).toMatchObject({
      action: 'keep',
      reason: 'waiting_for_clean_windows',
      applyRuntimeChange: false,
    });
    expect(setClassPolicyOverride).toHaveBeenCalledWith('polling', { minStartGapMs: 350 });
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({
      currentPollingMinStartGapMs: 350,
      nextEvaluationAtMs: nowMs + 600_000,
      cleanRegularMarketWindowCount: 1,
      degradedWindowCount: 0,
    }));
  });

  it('schedules the first active window without immediately tuning', async () => {
    const nowMs = Date.parse('2026-05-10T01:45:00.000Z');
    const store = stateStore({
      ...defaultKisGovernorAimdState(),
      enabled: true,
      mode: 'active',
      currentPollingMinStartGapMs: 350,
      nextEvaluationAtMs: null,
    });
    const setClassPolicyOverride = vi.fn();

    const result = await applyKisGovernorAimdRuntime({
      stateStore: store,
      outboundLimiter: { setClassPolicyOverride },
      telemetry: { capacity: 10, eventCount: 0, recent: [] },
      classification: 'regular_market',
      pollingCycleCount: 2,
      nowMs,
    });

    expect(result.decision).toBeNull();
    expect(result.skippedReason).toBe('too_early');
    expect(setClassPolicyOverride).toHaveBeenCalledWith('polling', { minStartGapMs: 350 });
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({
      nextEvaluationAtMs: nowMs + 600_000,
      cleanRegularMarketWindowCount: 0,
    }));
  });

  it('applies protective tighten before the next scheduled evaluation on repeated throttles', async () => {
    const nowMs = Date.parse('2026-05-10T01:47:00.000Z');
    const store = stateStore({
      ...defaultKisGovernorAimdState(),
      enabled: true,
      mode: 'active',
      currentPollingMinStartGapMs: 438,
      nextEvaluationAtMs: nowMs + 480_000,
    });
    const setClassPolicyOverride = vi.fn();

    const result = await applyKisGovernorAimdRuntime({
      stateStore: store,
      outboundLimiter: { setClassPolicyOverride },
      telemetry: {
        capacity: 10,
        eventCount: 4,
        recent: [
          telemetryEvent(nowMs - 100_000, 'throttle'),
          telemetryEvent(nowMs - 99_000, 'recovered'),
          telemetryEvent(nowMs - 10_000, 'throttle'),
          telemetryEvent(nowMs - 9_000, 'recovered'),
        ],
      },
      classification: 'regular_market',
      pollingCycleCount: 2,
      nowMs,
    });

    expect(result.decision).toMatchObject({
      action: 'tighten',
      reason: 'repeated_throttle',
      proposedPollingMinStartGapMs: 548,
      applyRuntimeChange: true,
    });
    expect(setClassPolicyOverride).toHaveBeenCalledWith('polling', { minStartGapMs: 548 });
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({
      currentPollingMinStartGapMs: 548,
      lastAdjustmentAtMs: nowMs,
      lastAdjustmentDirection: 'increase_gap',
      lastAdjustmentReason: 'repeated_throttle',
      nextEvaluationAtMs: nowMs + 600_000,
      degradedWindowCount: 1,
    }));
  });

  it('does not tune early on a single throttle', async () => {
    const nowMs = Date.parse('2026-05-10T01:48:00.000Z');
    const store = stateStore({
      ...defaultKisGovernorAimdState(),
      enabled: true,
      mode: 'active',
      currentPollingMinStartGapMs: 438,
      nextEvaluationAtMs: nowMs + 480_000,
    });
    const setClassPolicyOverride = vi.fn();

    const result = await applyKisGovernorAimdRuntime({
      stateStore: store,
      outboundLimiter: { setClassPolicyOverride },
      telemetry: {
        capacity: 10,
        eventCount: 2,
        recent: [
          telemetryEvent(nowMs - 100_000, 'throttle'),
          telemetryEvent(nowMs - 99_000, 'recovered'),
        ],
      },
      classification: 'regular_market',
      pollingCycleCount: 2,
      nowMs,
    });

    expect(result.decision).toBeNull();
    expect(result.skippedReason).toBe('too_early');
    expect(setClassPolicyOverride).toHaveBeenCalledWith('polling', { minStartGapMs: 438 });
    expect(store.save).not.toHaveBeenCalled();
  });

  it('clears polling overrides when AIMD is disabled', async () => {
    const store = stateStore(defaultKisGovernorAimdState());
    const setClassPolicyOverride = vi.fn();

    const result = await applyKisGovernorAimdRuntime({
      stateStore: store,
      outboundLimiter: { setClassPolicyOverride },
      telemetry: { capacity: 10, eventCount: 0, recent: [] },
      classification: 'regular_market',
      pollingCycleCount: 2,
      nowMs: Date.parse('2026-05-10T01:50:00.000Z'),
    });

    expect(result.decision).toBeNull();
    expect(result.skippedReason).toBe('disabled');
    expect(setClassPolicyOverride).toHaveBeenCalledWith('polling', null);
    expect(store.save).not.toHaveBeenCalled();
  });
});

describe('classifyKisGovernorAimdWindowFromMarketPhase', () => {
  it('treats only open market as regular-market evidence', () => {
    expect(classifyKisGovernorAimdWindowFromMarketPhase('open')).toBe('regular_market');
    expect(classifyKisGovernorAimdWindowFromMarketPhase('pre-open')).toBe('startup_warm');
    expect(classifyKisGovernorAimdWindowFromMarketPhase('closed')).toBe('mixed');
  });
});

function stateStore(initial: KisGovernorAimdStateSnapshot): KisGovernorAimdStateStore {
  let current = initial;
  return {
    load: vi.fn(async () => current),
    save: vi.fn(async (next: KisGovernorAimdStateSnapshot) => {
      current = next;
    }),
    reset: vi.fn(async () => undefined),
    snapshot: vi.fn(() => current),
  };
}

function telemetryEvent(
  atMs: number,
  event: 'throttle' | 'normal' | 'recovered' | 'half_open' | 'circuit_breaker',
): KisGovernorTelemetryEvent {
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
  };
}
