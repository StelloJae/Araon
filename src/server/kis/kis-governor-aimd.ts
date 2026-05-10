export type KisGovernorAimdMode = 'observe_only' | 'active';

export type KisGovernorAimdWindowClassification =
  | 'regular_market'
  | 'thin_liquidity'
  | 'startup_warm'
  | 'mixed';

export type KisGovernorAimdAction = 'hold' | 'keep' | 'tighten' | 'loosen';

export interface KisGovernorAimdWindow {
  classification: KisGovernorAimdWindowClassification;
  durationMs: number;
  completedPollingCycles: number;
  throttleCount: number;
  circuitBreakerCount: number;
  throttleImmediatelyAfterNormal: boolean;
  maxRecoveryAttemptCount: number;
  queueStuckAfterRecovery: boolean;
  telemetryMalformed: boolean;
  dataHealthDisagrees: boolean;
  cleanRegularMarketWindowCount: number;
  degradedWindowCount: number;
}

export interface KisGovernorAimdEvaluationInput {
  mode?: KisGovernorAimdMode;
  allowBelowMinimumGap?: boolean;
  currentPollingMinStartGapMs: number;
  window: KisGovernorAimdWindow;
}

export interface KisGovernorAimdDecision {
  mode: KisGovernorAimdMode;
  action: KisGovernorAimdAction;
  currentPollingMinStartGapMs: number;
  proposedPollingMinStartGapMs: number;
  applyRuntimeChange: boolean;
  reason:
    | 'malformed_telemetry'
    | 'data_health_disagreement'
    | 'window_too_short'
    | 'insufficient_polling_cycles'
    | 'startup_warm_window'
    | 'mixed_window'
    | 'thin_liquidity_window'
    | 'circuit_breaker'
    | 'repeated_throttle'
    | 'throttle_after_normal'
    | 'recovery_attempts_high'
    | 'queue_stuck_after_recovery'
    | 'degraded_window_pressure'
    | 'single_throttle_observed'
    | 'clean_regular_market_windows'
    | 'minimum_gap_reached'
    | 'waiting_for_clean_windows';
}

export interface KisGovernorAimdObservationState {
  enabled: boolean;
  mode: KisGovernorAimdMode;
  currentPollingMinStartGapMs: number;
  cleanRegularMarketWindowCount: number;
  degradedWindowCount?: number;
}

export interface KisGovernorAimdObservationTelemetryEvent {
  atMs: number;
  event: 'throttle' | 'half_open' | 'recovered' | 'normal' | 'circuit_breaker';
  endpointClass?: string | null;
  priorityClass?: string;
  recoveryAttemptCount?: number;
}

export interface KisGovernorAimdObservationTelemetry {
  recent: readonly KisGovernorAimdObservationTelemetryEvent[];
}

export interface KisGovernorAimdObservationPollingSummary {
  cycleCount: number;
}

export interface KisGovernorAimdObservationInput {
  nowMs?: number;
  windowStartedAtMs?: number;
  classification?: KisGovernorAimdWindowClassification;
  state: KisGovernorAimdObservationState;
  telemetry?: KisGovernorAimdObservationTelemetry;
  polling?: KisGovernorAimdObservationPollingSummary;
}

export interface KisGovernorAimdObservation {
  evaluatedAtMs: number;
  source: 'telemetry_snapshot';
  window: KisGovernorAimdWindow;
  decision: KisGovernorAimdDecision;
}

const MIN_REVIEW_WINDOW_MS = 10 * 60 * 1_000;
const MIN_COMPLETED_POLLING_CYCLES = 2;
const REQUIRED_CLEAN_WINDOWS = 3;
const ADDITIVE_LOOSEN_STEP_MS = 25;
const MIN_GAP_MS = 300;
const NORMAL_MAX_GAP_MS = 800;
const EMERGENCY_MAX_GAP_MS = 1_200;

export function evaluateKisGovernorAimd(
  input: KisGovernorAimdEvaluationInput,
): KisGovernorAimdDecision {
  const mode = input.mode ?? 'observe_only';
  const currentGap = Math.max(0, Math.trunc(input.currentPollingMinStartGapMs));
  const window = input.window;

  if (window.telemetryMalformed) {
    return unchanged(mode, currentGap, 'hold', 'malformed_telemetry');
  }
  if (window.dataHealthDisagrees) {
    return unchanged(mode, currentGap, 'hold', 'data_health_disagreement');
  }
  if (window.durationMs < MIN_REVIEW_WINDOW_MS) {
    return unchanged(mode, currentGap, 'hold', 'window_too_short');
  }
  if (window.completedPollingCycles < MIN_COMPLETED_POLLING_CYCLES) {
    return unchanged(mode, currentGap, 'hold', 'insufficient_polling_cycles');
  }
  if (window.classification === 'startup_warm') {
    return unchanged(mode, currentGap, 'hold', 'startup_warm_window');
  }
  if (window.classification === 'mixed') {
    return unchanged(mode, currentGap, 'hold', 'mixed_window');
  }

  const tighten = tighteningSignal(window, currentGap);
  if (tighten !== null) {
    return changed(
      mode,
      currentGap,
      clampGap(Math.ceil(currentGap * tighten.factor), MIN_GAP_MS, tighten.maxGapMs),
      'tighten',
      tighten.reason,
    );
  }

  if (window.throttleCount === 1) {
    return unchanged(mode, currentGap, 'keep', 'single_throttle_observed');
  }

  if (window.classification === 'thin_liquidity') {
    return unchanged(mode, currentGap, 'hold', 'thin_liquidity_window');
  }

  if (window.cleanRegularMarketWindowCount < REQUIRED_CLEAN_WINDOWS) {
    return unchanged(mode, currentGap, 'keep', 'waiting_for_clean_windows');
  }

  const minimumGapMs = input.allowBelowMinimumGap === true ? 0 : MIN_GAP_MS;
  const proposedGap = clampGap(currentGap - ADDITIVE_LOOSEN_STEP_MS, minimumGapMs, EMERGENCY_MAX_GAP_MS);
  if (proposedGap >= currentGap) {
    return unchanged(mode, currentGap, 'keep', 'minimum_gap_reached');
  }

  return changed(mode, currentGap, proposedGap, 'loosen', 'clean_regular_market_windows');
}

export function evaluateKisGovernorAimdProtectiveTighten(
  input: KisGovernorAimdEvaluationInput,
): KisGovernorAimdDecision | null {
  const mode = input.mode ?? 'observe_only';
  const currentGap = Math.max(0, Math.trunc(input.currentPollingMinStartGapMs));
  const window = input.window;

  if (window.telemetryMalformed || window.dataHealthDisagrees) return null;
  if (window.completedPollingCycles < MIN_COMPLETED_POLLING_CYCLES) return null;
  if (window.classification === 'startup_warm' || window.classification === 'mixed') return null;

  const tighten = tighteningSignal(window, currentGap);
  if (tighten === null) return null;

  return changed(
    mode,
    currentGap,
    clampGap(Math.ceil(currentGap * tighten.factor), MIN_GAP_MS, tighten.maxGapMs),
    'tighten',
    tighten.reason,
  );
}

export function buildKisGovernorAimdObservation(
  input: KisGovernorAimdObservationInput,
): KisGovernorAimdObservation {
  const evaluatedAtMs = Math.max(0, Math.trunc(input.nowMs ?? Date.now()));
  const telemetryEvents = input.telemetry?.recent ?? [];
  const telemetryMalformed = telemetryEvents.some((event) => !Number.isFinite(event.atMs));
  const windowStartedAtMs = input.windowStartedAtMs !== undefined
    ? Math.max(0, Math.trunc(input.windowStartedAtMs))
    : null;
  const pollingEvents = telemetryEvents
    .filter((event) => event.endpointClass === 'polling' || event.priorityClass === 'polling')
    .filter((event) => Number.isFinite(event.atMs))
    .filter((event) => windowStartedAtMs === null || event.atMs >= windowStartedAtMs)
    .filter((event) => event.atMs <= evaluatedAtMs)
    .sort((a, b) => a.atMs - b.atMs);
  const firstEventAtMs = windowStartedAtMs ?? pollingEvents[0]?.atMs ?? evaluatedAtMs;
  const throttleCount = pollingEvents.filter((event) => event.event === 'throttle').length;
  const circuitBreakerCount = pollingEvents.filter((event) => event.event === 'circuit_breaker').length;
  const maxRecoveryAttemptCount = pollingEvents.reduce(
    (max, event) => Math.max(max, Math.trunc(event.recoveryAttemptCount ?? 0)),
    0,
  );
  const window: KisGovernorAimdWindow = {
    classification: input.classification ?? 'mixed',
    durationMs: Math.max(0, evaluatedAtMs - firstEventAtMs),
    completedPollingCycles: completedPollingCycles(input.polling, pollingEvents),
    throttleCount,
    circuitBreakerCount,
    throttleImmediatelyAfterNormal: hasThrottleImmediatelyAfterNormal(pollingEvents),
    maxRecoveryAttemptCount,
    queueStuckAfterRecovery: false,
    telemetryMalformed,
    dataHealthDisagrees: false,
    cleanRegularMarketWindowCount:
      throttleCount === 0 && circuitBreakerCount === 0
        ? input.state.cleanRegularMarketWindowCount + 1
        : 0,
    degradedWindowCount: Math.max(0, Math.trunc(input.state.degradedWindowCount ?? 0)),
  };

  return {
    evaluatedAtMs,
    source: 'telemetry_snapshot',
    window,
    decision: evaluateKisGovernorAimd({
      mode: input.state.enabled ? input.state.mode : 'observe_only',
      currentPollingMinStartGapMs: input.state.currentPollingMinStartGapMs,
      window,
    }),
  };
}

function completedPollingCycles(
  polling: KisGovernorAimdObservationPollingSummary | undefined,
  events: readonly KisGovernorAimdObservationTelemetryEvent[],
): number {
  if (polling !== undefined && Number.isFinite(polling.cycleCount)) {
    return Math.max(0, Math.min(2, Math.trunc(polling.cycleCount)));
  }
  return events.length > 0 ? Math.min(2, events.length) : 0;
}

function tighteningSignal(
  window: KisGovernorAimdWindow,
  currentGap: number,
): { factor: number; maxGapMs: number; reason: KisGovernorAimdDecision['reason'] } | null {
  if (window.circuitBreakerCount > 0) {
    return { factor: 1.5, maxGapMs: EMERGENCY_MAX_GAP_MS, reason: 'circuit_breaker' };
  }
  if (window.throttleCount >= 2) {
    return {
      factor: 1.25,
      maxGapMs: currentGap >= NORMAL_MAX_GAP_MS ? EMERGENCY_MAX_GAP_MS : NORMAL_MAX_GAP_MS,
      reason: 'repeated_throttle',
    };
  }
  if (window.throttleImmediatelyAfterNormal) {
    return {
      factor: 1.25,
      maxGapMs: currentGap >= NORMAL_MAX_GAP_MS ? EMERGENCY_MAX_GAP_MS : NORMAL_MAX_GAP_MS,
      reason: 'throttle_after_normal',
    };
  }
  if (window.maxRecoveryAttemptCount > 2) {
    return {
      factor: 1.25,
      maxGapMs: currentGap >= NORMAL_MAX_GAP_MS ? EMERGENCY_MAX_GAP_MS : NORMAL_MAX_GAP_MS,
      reason: 'recovery_attempts_high',
    };
  }
  if (window.queueStuckAfterRecovery) {
    return {
      factor: 1.15,
      maxGapMs: currentGap >= NORMAL_MAX_GAP_MS ? EMERGENCY_MAX_GAP_MS : NORMAL_MAX_GAP_MS,
      reason: 'queue_stuck_after_recovery',
    };
  }
  if (
    window.throttleCount > 0
    && window.degradedWindowCount >= 2
    && currentGap >= NORMAL_MAX_GAP_MS
  ) {
    return {
      factor: 1.15,
      maxGapMs: EMERGENCY_MAX_GAP_MS,
      reason: 'degraded_window_pressure',
    };
  }
  return null;
}

function hasThrottleImmediatelyAfterNormal(
  events: readonly KisGovernorAimdObservationTelemetryEvent[],
): boolean {
  return events.some((event, index) => {
    if (event.event !== 'throttle') return false;
    return events[index - 1]?.event === 'normal';
  });
}

function unchanged(
  mode: KisGovernorAimdMode,
  currentGap: number,
  action: KisGovernorAimdAction,
  reason: KisGovernorAimdDecision['reason'],
): KisGovernorAimdDecision {
  return {
    mode,
    action,
    currentPollingMinStartGapMs: currentGap,
    proposedPollingMinStartGapMs: currentGap,
    applyRuntimeChange: false,
    reason,
  };
}

function changed(
  mode: KisGovernorAimdMode,
  currentGap: number,
  proposedGap: number,
  action: Extract<KisGovernorAimdAction, 'tighten' | 'loosen'>,
  reason: KisGovernorAimdDecision['reason'],
): KisGovernorAimdDecision {
  return {
    mode,
    action,
    currentPollingMinStartGapMs: currentGap,
    proposedPollingMinStartGapMs: proposedGap,
    applyRuntimeChange: mode === 'active' && proposedGap !== currentGap,
    reason,
  };
}

function clampGap(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
