import type { MarketPhase } from '../lifecycle/market-hours-scheduler.js';
import type {
  KisGovernorAimdDecision,
  KisGovernorAimdObservation,
  KisGovernorAimdWindowClassification,
} from './kis-governor-aimd.js';
import {
  buildKisGovernorAimdObservation,
  evaluateKisGovernorAimdProtectiveTighten,
} from './kis-governor-aimd.js';
import type { KisGovernorTelemetrySnapshot, KisOutboundLimiter } from './kis-outbound-limiter.js';
import {
  applyKisGovernorAimdDecisionToState,
  type KisGovernorAimdStateSnapshot,
  type KisGovernorAimdStateStore,
} from './kis-governor-aimd-state.js';

export const KIS_GOVERNOR_AIMD_EVALUATION_INTERVAL_MS = 10 * 60 * 1_000;

export interface ApplyKisGovernorAimdRuntimeInput {
  stateStore: KisGovernorAimdStateStore;
  outboundLimiter: Pick<KisOutboundLimiter, 'setClassPolicyOverride'>;
  telemetry?: KisGovernorTelemetrySnapshot | undefined;
  classification: KisGovernorAimdWindowClassification;
  pollingCycleCount?: number | undefined;
  nowMs?: number | undefined;
}

export interface ApplyKisGovernorAimdRuntimeResult {
  decision: KisGovernorAimdDecision | null;
  observation: KisGovernorAimdObservation | null;
  state: KisGovernorAimdStateSnapshot;
  skippedReason: 'disabled' | 'observe_only' | 'too_early' | null;
}

export async function applyKisGovernorAimdRuntime(
  input: ApplyKisGovernorAimdRuntimeInput,
): Promise<ApplyKisGovernorAimdRuntimeResult> {
  const nowMs = Math.max(0, Math.trunc(input.nowMs ?? Date.now()));
  const state = input.stateStore.snapshot();

  if (!state.enabled) {
    input.outboundLimiter.setClassPolicyOverride?.('polling', null);
    return { decision: null, observation: null, state, skippedReason: 'disabled' };
  }
  if (state.mode !== 'active') {
    input.outboundLimiter.setClassPolicyOverride?.('polling', null);
    return { decision: null, observation: null, state, skippedReason: 'observe_only' };
  }

  applyPollingGapOverride(input.outboundLimiter, state.currentPollingMinStartGapMs);
  if (state.nextEvaluationAtMs === null) {
    const scheduledState = {
      ...state,
      nextEvaluationAtMs: nowMs + KIS_GOVERNOR_AIMD_EVALUATION_INTERVAL_MS,
      rollbackBaseline: { ...state.rollbackBaseline },
    };
    await input.stateStore.save(scheduledState);
    return { decision: null, observation: null, state: scheduledState, skippedReason: 'too_early' };
  }
  if (state.nextEvaluationAtMs !== null && nowMs < state.nextEvaluationAtMs) {
    const earlyResult = await applyEarlyProtectiveTighten(input, state, nowMs);
    if (earlyResult !== null) return earlyResult;
    return { decision: null, observation: null, state, skippedReason: 'too_early' };
  }

  const windowStartedAtMs = evaluationWindowStartedAtMs(state, nowMs);
  const observation = buildKisGovernorAimdObservation({
    nowMs,
    windowStartedAtMs,
    state,
    telemetry: input.telemetry ?? { recent: [] },
    classification: input.classification,
    ...(input.pollingCycleCount !== undefined
      ? { polling: { cycleCount: input.pollingCycleCount } }
      : {}),
  });
  const nextState = nextStateForObservation(state, observation);
  await input.stateStore.save(nextState);
  applyPollingGapOverride(input.outboundLimiter, nextState.currentPollingMinStartGapMs);

  return {
    decision: observation.decision,
    observation,
    state: nextState,
    skippedReason: null,
  };
}

async function applyEarlyProtectiveTighten(
  input: ApplyKisGovernorAimdRuntimeInput,
  state: KisGovernorAimdStateSnapshot,
  nowMs: number,
): Promise<ApplyKisGovernorAimdRuntimeResult | null> {
  const observation = buildKisGovernorAimdObservation({
    nowMs,
    windowStartedAtMs: evaluationWindowStartedAtMs(state, nowMs),
    state,
    telemetry: input.telemetry ?? { recent: [] },
    classification: input.classification,
    ...(input.pollingCycleCount !== undefined
      ? { polling: { cycleCount: input.pollingCycleCount } }
      : {}),
  });
  const decision = evaluateKisGovernorAimdProtectiveTighten({
    mode: state.mode,
    currentPollingMinStartGapMs: state.currentPollingMinStartGapMs,
    window: observation.window,
  });
  if (decision === null || !decision.applyRuntimeChange) return null;

  const protectiveObservation = { ...observation, decision };
  const nextState = nextStateForObservation(state, protectiveObservation);
  await input.stateStore.save(nextState);
  applyPollingGapOverride(input.outboundLimiter, nextState.currentPollingMinStartGapMs);

  return {
    decision,
    observation: protectiveObservation,
    state: nextState,
    skippedReason: null,
  };
}

export function classifyKisGovernorAimdWindowFromMarketPhase(
  phase: MarketPhase | undefined,
): KisGovernorAimdWindowClassification {
  if (phase === 'open') return 'regular_market';
  if (phase === 'pre-open') return 'startup_warm';
  return 'mixed';
}

function nextStateForObservation(
  state: KisGovernorAimdStateSnapshot,
  observation: KisGovernorAimdObservation,
): KisGovernorAimdStateSnapshot {
  const decision = observation.decision;
  if (decision.applyRuntimeChange) {
    const adjusted = applyKisGovernorAimdDecisionToState(state, decision, {
      evaluatedAtMs: observation.evaluatedAtMs,
      nextEvaluationDelayMs: KIS_GOVERNOR_AIMD_EVALUATION_INTERVAL_MS,
    });
    return {
      ...adjusted,
      cleanRegularMarketWindowCount: decision.action === 'tighten'
        ? 0
        : observation.window.cleanRegularMarketWindowCount,
      degradedWindowCount: decision.action === 'tighten'
        ? adjusted.degradedWindowCount
        : 0,
    };
  }

  return {
    ...state,
    nextEvaluationAtMs: observation.evaluatedAtMs + KIS_GOVERNOR_AIMD_EVALUATION_INTERVAL_MS,
    cleanRegularMarketWindowCount: shouldCountCleanWindow(observation)
      ? observation.window.cleanRegularMarketWindowCount
      : shouldResetCleanWindow(observation)
        ? 0
        : state.cleanRegularMarketWindowCount,
    degradedWindowCount: shouldResetCleanWindow(observation)
      ? state.degradedWindowCount + 1
      : state.degradedWindowCount,
    rollbackBaseline: { ...state.rollbackBaseline },
  };
}

function shouldCountCleanWindow(observation: KisGovernorAimdObservation): boolean {
  return (
    observation.window.classification === 'regular_market'
    && !observation.window.telemetryMalformed
    && !observation.window.dataHealthDisagrees
    && observation.window.durationMs >= KIS_GOVERNOR_AIMD_EVALUATION_INTERVAL_MS
    && observation.window.completedPollingCycles >= 2
    && observation.window.throttleCount === 0
    && observation.window.circuitBreakerCount === 0
  );
}

function shouldResetCleanWindow(observation: KisGovernorAimdObservation): boolean {
  return observation.window.throttleCount > 0 || observation.window.circuitBreakerCount > 0;
}

function evaluationWindowStartedAtMs(
  state: KisGovernorAimdStateSnapshot,
  nowMs: number,
): number {
  if (state.nextEvaluationAtMs !== null) {
    return Math.max(0, state.nextEvaluationAtMs - KIS_GOVERNOR_AIMD_EVALUATION_INTERVAL_MS);
  }
  return Math.max(0, nowMs - KIS_GOVERNOR_AIMD_EVALUATION_INTERVAL_MS);
}

function applyPollingGapOverride(
  outboundLimiter: Pick<KisOutboundLimiter, 'setClassPolicyOverride'>,
  minStartGapMs: number,
): void {
  outboundLimiter.setClassPolicyOverride?.('polling', {
    minStartGapMs: Math.max(0, Math.trunc(minStartGapMs)),
  });
}
