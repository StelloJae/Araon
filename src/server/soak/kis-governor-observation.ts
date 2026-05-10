import {
  evaluateSoakSamples,
  type SoakHttpSample,
  type SoakSampleIssue,
} from './soak-evaluator.js';

export interface TimedSoakHttpSample extends SoakHttpSample {
  sampledAt: string;
}

export interface KisGovernorObservationReport {
  ok: boolean;
  mode: 'kis-governor-observation';
  targetUrl: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  intervalMs: number;
  sampleCount: number;
  issueCount: number;
  issues: SoakSampleIssue[];
  kisOutboundLimiter: {
    configuredSamples: number;
    stateCounts: Record<string, number>;
    maxQueueDepth: number;
    maxRecoveryAttemptCount: number;
    throttleSamples: number;
    circuitBreakerSamples: number;
    lastThrottleAt: string | null;
    lastThrottleClass: string | null;
    lastThrottleCode: string | null;
    observedRecoveryMs: {
      count: number;
      min: number | null;
      max: number | null;
      last: number | null;
    };
    currentAllowedRps: {
      min: number | null;
      max: number | null;
      last: number | null;
    };
    aimd: {
      enabledSamples: number;
      activeSamples: number;
      lastMode: string | null;
      lastPollingMinStartGapMs: number | null;
      lastPollingRecoveryRatePerSec: number | null;
      lastDecisionAction: string | null;
      lastDecisionReason: string | null;
      lastWindowClassification: string | null;
    };
  };
  marketTopMovers: {
    configuredSamples: number;
    statusCounts: Record<string, number>;
    guaranteedTop100Samples: number;
    partialSamples: number;
    cooldownSamples: number;
    inflightSamples: number;
    lastFetchedAt: string | null;
    lastErrorCode: string | null;
  };
  backfill: {
    runningSamples: number;
    cooldownSamples: number;
    maxLastAttempted: number;
    maxLastSucceeded: number;
    maxLastFailed: number;
  };
  findings: string[];
}

export interface BuildKisGovernorObservationReportInput {
  targetUrl: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  intervalMs: number;
  samples: readonly TimedSoakHttpSample[];
}

export function buildKisGovernorObservationReport(
  input: BuildKisGovernorObservationReportInput,
): KisGovernorObservationReport {
  const evaluated = evaluateSoakSamples(input.samples);
  const stateCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};
  const recoveryMs: number[] = [];
  const rps: number[] = [];
  const findings: string[] = [];

  let configuredSamples = 0;
  let maxQueueDepth = 0;
  let maxRecoveryAttemptCount = 0;
  let throttleSamples = 0;
  let circuitBreakerSamples = 0;
  let lastThrottleAt: string | null = null;
  let lastThrottleClass: string | null = null;
  let lastThrottleCode: string | null = null;
  let aimdEnabledSamples = 0;
  let aimdActiveSamples = 0;
  let lastAimdMode: string | null = null;
  let lastPollingMinStartGapMs: number | null = null;
  let lastPollingRecoveryRatePerSec: number | null = null;
  let lastDecisionAction: string | null = null;
  let lastDecisionReason: string | null = null;
  let lastWindowClassification: string | null = null;

  let topMoversConfiguredSamples = 0;
  let guaranteedTop100Samples = 0;
  let partialSamples = 0;
  let cooldownSamples = 0;
  let inflightSamples = 0;
  let lastTopMoversFetchedAt: string | null = null;
  let lastTopMoversErrorCode: string | null = null;

  let backfillRunningSamples = 0;
  let backfillCooldownSamples = 0;
  let maxLastAttempted = 0;
  let maxLastSucceeded = 0;
  let maxLastFailed = 0;

  for (const sample of input.samples) {
    const data = parseDataHealthData(sample);
    if (data === null) continue;

    const limiter = readObject(data.kisOutboundLimiter);
    if (limiter !== null) {
      if (readBoolean(limiter.configured) === true) configuredSamples += 1;
      const state = readString(limiter.currentState) ?? 'unknown';
      increment(stateCounts, state);
      if (state === 'throttled' || state === 'half_open' || state === 'recovering') {
        throttleSamples += 1;
      }
      if (state === 'circuit_breaker') circuitBreakerSamples += 1;
      maxQueueDepth = Math.max(maxQueueDepth, readNumber(limiter.queueDepth) ?? 0);
      maxRecoveryAttemptCount = Math.max(
        maxRecoveryAttemptCount,
        readNumber(limiter.recoveryAttemptCount) ?? 0,
      );
      lastThrottleAt = readString(limiter.lastThrottleAt) ?? lastThrottleAt;
      lastThrottleClass = readString(limiter.lastThrottleClass) ?? lastThrottleClass;
      lastThrottleCode = readString(limiter.lastThrottleCode) ?? lastThrottleCode;
      pushNumber(rps, limiter.currentAllowedRps);

      const profiles = Array.isArray(limiter.profiles) ? limiter.profiles : [];
      for (const rawProfile of profiles) {
        const profile = readObject(rawProfile);
        if (profile === null) continue;
        pushNumber(recoveryMs, profile.observedRecoveryMs);
      }

      const aimd = readObject(limiter.aimd);
      if (aimd !== null) {
        if (readBoolean(aimd.enabled) === true) aimdEnabledSamples += 1;
        const mode = readString(aimd.mode);
        if (mode === 'active') aimdActiveSamples += 1;
        lastAimdMode = mode ?? lastAimdMode;
        lastPollingMinStartGapMs =
          readNumber(aimd.currentPollingMinStartGapMs) ?? lastPollingMinStartGapMs;
        lastPollingRecoveryRatePerSec =
          readNumber(aimd.currentPollingRecoveryRatePerSec)
          ?? lastPollingRecoveryRatePerSec;
        const decision = readObject(aimd.lastDecision);
        if (decision !== null) {
          lastDecisionAction = readString(decision.action) ?? lastDecisionAction;
          lastDecisionReason = readString(decision.reason) ?? lastDecisionReason;
        }
        const window = readObject(aimd.observationWindow);
        if (window !== null) {
          lastWindowClassification =
            readString(window.classification) ?? lastWindowClassification;
        }
      }
    }

    const topMovers = readObject(data.marketTopMovers);
    if (topMovers !== null) {
      if (readBoolean(topMovers.configured) === true) topMoversConfiguredSamples += 1;
      const status = readString(topMovers.status) ?? 'unknown';
      increment(statusCounts, status);
      if (status === 'partial') partialSamples += 1;
      if (status === 'cooldown' || readBoolean(topMovers.cooldownActive) === true) {
        cooldownSamples += 1;
      }
      if (readBoolean(topMovers.inflight) === true) inflightSamples += 1;
      lastTopMoversFetchedAt = readString(topMovers.lastFetchedAt) ?? lastTopMoversFetchedAt;
      lastTopMoversErrorCode = readString(topMovers.lastErrorCode) ?? lastTopMoversErrorCode;
      const coverage = readObject(topMovers.coverage);
      if (coverage !== null && readBoolean(coverage.guaranteedTop100) === true) {
        guaranteedTop100Samples += 1;
      }
    }

    const backfill = readObject(data.backfill);
    if (backfill !== null) {
      if (readBoolean(backfill.running) === true) backfillRunningSamples += 1;
      if (readBoolean(backfill.cooldownActive) === true) backfillCooldownSamples += 1;
      maxLastAttempted = Math.max(maxLastAttempted, readNumber(backfill.lastAttempted) ?? 0);
      maxLastSucceeded = Math.max(maxLastSucceeded, readNumber(backfill.lastSucceeded) ?? 0);
      maxLastFailed = Math.max(maxLastFailed, readNumber(backfill.lastFailed) ?? 0);
    }
  }

  if (evaluated.issues.length > 0) {
    findings.push('http_json_or_sensitive_value_issue_detected');
  }
  if (configuredSamples === 0) findings.push('kis_runtime_not_configured_in_samples');
  if (throttleSamples > 0) findings.push('kis_governor_throttle_or_recovery_seen');
  if (circuitBreakerSamples > 0) findings.push('kis_governor_circuit_breaker_seen');
  if (maxQueueDepth > 0) findings.push('kis_governor_queue_nonzero_seen');
  if (topMoversConfiguredSamples > 0 && guaranteedTop100Samples === 0) {
    findings.push('top100_not_fully_guaranteed_in_samples');
  }

  return {
    ok: evaluated.ok,
    mode: 'kis-governor-observation',
    targetUrl: input.targetUrl,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    durationMs: input.durationMs,
    intervalMs: input.intervalMs,
    sampleCount: input.samples.length,
    issueCount: evaluated.issues.length,
    issues: evaluated.issues,
    kisOutboundLimiter: {
      configuredSamples,
      stateCounts,
      maxQueueDepth,
      maxRecoveryAttemptCount,
      throttleSamples,
      circuitBreakerSamples,
      lastThrottleAt,
      lastThrottleClass,
      lastThrottleCode,
      observedRecoveryMs: summarizeNumbers(recoveryMs),
      currentAllowedRps: summarizeNumbers(rps),
      aimd: {
        enabledSamples: aimdEnabledSamples,
        activeSamples: aimdActiveSamples,
        lastMode: lastAimdMode,
        lastPollingMinStartGapMs,
        lastPollingRecoveryRatePerSec,
        lastDecisionAction,
        lastDecisionReason,
        lastWindowClassification,
      },
    },
    marketTopMovers: {
      configuredSamples: topMoversConfiguredSamples,
      statusCounts,
      guaranteedTop100Samples,
      partialSamples,
      cooldownSamples,
      inflightSamples,
      lastFetchedAt: lastTopMoversFetchedAt,
      lastErrorCode: lastTopMoversErrorCode,
    },
    backfill: {
      runningSamples: backfillRunningSamples,
      cooldownSamples: backfillCooldownSamples,
      maxLastAttempted,
      maxLastSucceeded,
      maxLastFailed,
    },
    findings,
  };
}

function parseDataHealthData(sample: TimedSoakHttpSample): Record<string, unknown> | null {
  if (sample.status < 200 || sample.status >= 300) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(sample.bodyText);
  } catch {
    return null;
  }
  const env = readObject(parsed);
  if (env === null) return null;
  const data = readObject(env.data);
  return data;
}

function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function pushNumber(values: number[], value: unknown): void {
  const n = readNumber(value);
  if (n !== null) values.push(n);
}

function summarizeNumbers(values: readonly number[]): {
  count: number;
  min: number | null;
  max: number | null;
  last: number | null;
} {
  if (values.length === 0) {
    return { count: 0, min: null, max: null, last: null };
  }
  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    last: values.at(-1) ?? null,
  };
}
