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
    | 'single_throttle_observed'
    | 'clean_regular_market_windows'
    | 'minimum_gap_reached'
    | 'waiting_for_clean_windows';
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

  const tighten = tighteningSignal(window);
  if (tighten !== null) {
    const maxGapMs = tighten.reason === 'circuit_breaker' ? EMERGENCY_MAX_GAP_MS : NORMAL_MAX_GAP_MS;
    return changed(
      mode,
      currentGap,
      clampGap(Math.ceil(currentGap * tighten.factor), MIN_GAP_MS, maxGapMs),
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

function tighteningSignal(
  window: KisGovernorAimdWindow,
): { factor: number; reason: KisGovernorAimdDecision['reason'] } | null {
  if (window.circuitBreakerCount > 0) {
    return { factor: 1.5, reason: 'circuit_breaker' };
  }
  if (window.throttleCount >= 2) {
    return { factor: 1.25, reason: 'repeated_throttle' };
  }
  if (window.throttleImmediatelyAfterNormal) {
    return { factor: 1.25, reason: 'throttle_after_normal' };
  }
  if (window.maxRecoveryAttemptCount > 2) {
    return { factor: 1.25, reason: 'recovery_attempts_high' };
  }
  if (window.queueStuckAfterRecovery) {
    return { factor: 1.15, reason: 'queue_stuck_after_recovery' };
  }
  return null;
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
