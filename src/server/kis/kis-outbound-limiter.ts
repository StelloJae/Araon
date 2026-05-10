import { KisRestError } from './kis-rest-client.js';
import {
  classifyKisRestFailure,
  isKisSecondWindowThrottle,
} from './kis-rate-limit-classifier.js';

export type KisEndpointClass =
  | 'auth'
  | 'token'
  | 'approval'
  | 'foreground'
  | 'polling'
  | 'ranking'
  | 'daily-backfill'
  | 'selected-minute'
  | 'background_backfill'
  | 'selected_backfill'
  | 'master_refresh'
  | 'maintenance';

export type KisGovernorState =
  | 'normal'
  | 'throttled'
  | 'half_open'
  | 'recovering'
  | 'circuit_breaker';

export type KisPriorityClass =
  | 'auth'
  | 'foreground'
  | 'selected_backfill'
  | 'polling'
  | 'ranking'
  | 'background_backfill'
  | 'master_refresh'
  | 'maintenance';

export interface KisOutboundLimiterAcquireInput {
  profileId?: string;
  endpointClass?: KisEndpointClass;
}

export interface KisOutboundLimiterFailureInput extends KisOutboundLimiterAcquireInput {
  error: unknown;
}

export interface KisOutboundLimiterProfileSnapshot {
  profileId: string;
  endpointClass: KisEndpointClass | null;
  priorityClass: KisPriorityClass;
  state: KisGovernorState;
  cooldownUntilMs: number;
  cooldownActive: boolean;
  firstLimitedAtMs: number | null;
  lastLimitedAtMs: number | null;
  recoveredAtMs: number | null;
  observedRecoveryMs: number | null;
  nextRetryAtMs: number | null;
  circuitBreakerUntilMs: number | null;
  lastThrottleCode: string | null;
  recoveryAttemptCount: number;
  recentThrottleCount: number;
  recentSuccessCount: number;
  currentAllowedRps: number;
  minStartGapMs: number;
  maxInFlight: number;
}

export interface KisOutboundLimiterSnapshot {
  ratePerSec: number;
  burst: number;
  tokens: number;
  profiles: KisOutboundLimiterProfileSnapshot[];
}

export interface KisOutboundLimiter {
  acquire(input?: KisOutboundLimiterAcquireInput): Promise<void>;
  recordFailure(input: KisOutboundLimiterFailureInput): void;
  recordSuccess?(input?: KisOutboundLimiterAcquireInput): void;
  snapshot(): KisOutboundLimiterSnapshot;
}

export interface KisClassPolicyInput {
  minStartGapMs?: number;
  maxInFlight?: number;
  recoveryRatePerSec?: number;
  recoveryBackoffMs?: readonly number[];
}

export interface CreateKisOutboundLimiterOptions {
  ratePerSec: number;
  burst: number;
  cooldownMs?: number;
  cooldownMsByEndpointClass?: Partial<Record<KisEndpointClass, number>>;
  recoveryBackoffMs?: readonly number[];
  recoveryRatePerSec?: number;
  recoverySuccessThreshold?: number;
  recoveryStableMs?: number;
  circuitBreakerAfterFailures?: number;
  circuitBreakerMs?: number;
  globalMinStartGapMs?: number;
  classPolicies?: Partial<Record<KisEndpointClass, KisClassPolicyInput>>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_PROFILE_ID = 'primary';
const DEFAULT_RECOVERY_BACKOFF_MS = [150, 300, 700, 1_500, 3_000, 5_000, 10_000] as const;
const DEFAULT_RECOVERY_RATE_PER_SEC = 4;
const DEFAULT_RECOVERY_SUCCESS_THRESHOLD = 10;
const DEFAULT_RECOVERY_STABLE_MS = 10_000;
const DEFAULT_CIRCUIT_BREAKER_AFTER_FAILURES = 6;
const DEFAULT_CIRCUIT_BREAKER_MS = 30_000;

interface ResolvedKisClassPolicy {
  priorityClass: KisPriorityClass;
  minStartGapMs: number;
  maxInFlight: number;
  recoveryRatePerSec: number;
  recoveryBackoffMs: readonly number[];
}

interface CooldownObservation {
  firstLimitedAtMs: number;
  lastLimitedAtMs: number;
  recoveredAtMs: number | null;
  observedRecoveryMs: number | null;
  state: KisGovernorState;
  nextRetryAtMs: number | null;
  circuitBreakerUntilMs: number | null;
  lastThrottleCode: string | null;
  recoveryAttemptCount: number;
  recentThrottleCount: number;
  recentSuccessCount: number;
  recoveryStartedAtMs: number | null;
  recoverySuccessCount: number;
}

const DEFAULT_CLASS_POLICIES: Record<KisPriorityClass, ResolvedKisClassPolicy> = {
  auth: {
    priorityClass: 'auth',
    minStartGapMs: 1_000,
    maxInFlight: 1,
    recoveryRatePerSec: 1,
    recoveryBackoffMs: [1_000, 3_000, 10_000],
  },
  foreground: {
    priorityClass: 'foreground',
    minStartGapMs: 80,
    maxInFlight: 2,
    recoveryRatePerSec: DEFAULT_RECOVERY_RATE_PER_SEC,
    recoveryBackoffMs: DEFAULT_RECOVERY_BACKOFF_MS,
  },
  selected_backfill: {
    priorityClass: 'selected_backfill',
    minStartGapMs: 1_000,
    maxInFlight: 1,
    recoveryRatePerSec: 1,
    recoveryBackoffMs: [700, 1_500, 3_000, 5_000, 10_000],
  },
  polling: {
    priorityClass: 'polling',
    minStartGapMs: 120,
    maxInFlight: 2,
    recoveryRatePerSec: DEFAULT_RECOVERY_RATE_PER_SEC,
    recoveryBackoffMs: DEFAULT_RECOVERY_BACKOFF_MS,
  },
  ranking: {
    priorityClass: 'ranking',
    minStartGapMs: 750,
    maxInFlight: 1,
    recoveryRatePerSec: 1,
    recoveryBackoffMs: [1_500, 3_000, 5_000, 10_000],
  },
  background_backfill: {
    priorityClass: 'background_backfill',
    minStartGapMs: 1_500,
    maxInFlight: 1,
    recoveryRatePerSec: 1,
    recoveryBackoffMs: [3_000, 5_000, 10_000, 30_000],
  },
  master_refresh: {
    priorityClass: 'master_refresh',
    minStartGapMs: 2_000,
    maxInFlight: 1,
    recoveryRatePerSec: 1,
    recoveryBackoffMs: [5_000, 10_000, 30_000],
  },
  maintenance: {
    priorityClass: 'maintenance',
    minStartGapMs: 1_500,
    maxInFlight: 1,
    recoveryRatePerSec: 1,
    recoveryBackoffMs: [3_000, 5_000, 10_000],
  },
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createKisOutboundLimiter(
  options: CreateKisOutboundLimiterOptions,
): KisOutboundLimiter {
  const ratePerSec = Math.max(0.1, options.ratePerSec);
  const burst = Math.max(1, Math.trunc(options.burst));
  const globalMinStartGapMs = Math.max(0, options.globalMinStartGapMs ?? 0);
  const recoveryBackoffMs = normalizeBackoff(
    options.recoveryBackoffMs ?? DEFAULT_RECOVERY_BACKOFF_MS,
  );
  const recoveryRatePerSec = Math.max(0.1, options.recoveryRatePerSec ?? DEFAULT_RECOVERY_RATE_PER_SEC);
  const recoverySuccessThreshold = Math.max(1, options.recoverySuccessThreshold ?? DEFAULT_RECOVERY_SUCCESS_THRESHOLD);
  const recoveryStableMs = Math.max(0, options.recoveryStableMs ?? DEFAULT_RECOVERY_STABLE_MS);
  const circuitBreakerAfterFailures = Math.max(
    1,
    options.circuitBreakerAfterFailures ?? DEFAULT_CIRCUIT_BREAKER_AFTER_FAILURES,
  );
  const circuitBreakerMs = Math.max(1, options.circuitBreakerMs ?? DEFAULT_CIRCUIT_BREAKER_MS);
  const cooldownMsByEndpointClass = options.cooldownMsByEndpointClass ?? {};
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? defaultSleep;

  let tokens = burst;
  let lastRefillAtMs = now();
  let lastGlobalStartAtMs = 0;
  const cooldownUntilByKey = new Map<string, number>();
  const observationsByKey = new Map<string, CooldownObservation>();
  const lastStartAtMsByPriority = new Map<KisPriorityClass, number>();
  const inFlightByPriority = new Map<KisPriorityClass, number>();

  async function acquire(input: KisOutboundLimiterAcquireInput = {}): Promise<void> {
    const profileId = input.profileId ?? DEFAULT_PROFILE_ID;
    const cooldownKey = cooldownMapKey(profileId, input.endpointClass);
    const policy = policyForEndpoint(input.endpointClass);
    const currentObservation = observationsByKey.get(cooldownKey);
    enforceGovernorState(cooldownKey, currentObservation, input.endpointClass);

    await waitForClassCapacity(policy);
    refill();
    const effectiveRate = effectiveRatePerSec(currentObservation, policy);
    if (tokens < 1) {
      const waitMs = Math.ceil(((1 - tokens) / effectiveRate) * 1000);
      await sleep(waitMs);
      refill();
    }
    await waitForStartSpacing(policy, currentObservation);

    tokens = Math.max(0, tokens - 1);
    inFlightByPriority.set(
      policy.priorityClass,
      (inFlightByPriority.get(policy.priorityClass) ?? 0) + 1,
    );
  }

  function recordFailure(input: KisOutboundLimiterFailureInput): void {
    release(input.endpointClass);
    if (isLocalCooldownError(input.error)) return;
    const classification = classifyKisRestFailure(input.error);
    if (!isKisSecondWindowThrottle(classification)) return;
    const profileId = input.profileId ?? DEFAULT_PROFILE_ID;
    const cooldownKey = cooldownMapKey(profileId, input.endpointClass);
    recordLimited(cooldownKey, input.endpointClass, classification.code);
  }

  function recordSuccess(input: KisOutboundLimiterAcquireInput = {}): void {
    release(input.endpointClass);
    const profileId = input.profileId ?? DEFAULT_PROFILE_ID;
    const cooldownKey = cooldownMapKey(profileId, input.endpointClass);
    const observation = observationsByKey.get(cooldownKey);
    if (observation === undefined) return;
    const current = now();

    if (
      observation.state === 'throttled'
      && observation.nextRetryAtMs !== null
      && current < observation.nextRetryAtMs
    ) {
      observationsByKey.set(cooldownKey, {
        ...observation,
        recentSuccessCount: observation.recentSuccessCount + 1,
      });
      return;
    }

    if (
      observation.state === 'half_open'
      || observation.state === 'throttled'
      || observation.state === 'circuit_breaker'
    ) {
      const recoveredAtMs = current;
      observationsByKey.set(cooldownKey, {
        ...observation,
        state: 'recovering',
        recoveredAtMs,
        observedRecoveryMs: recoveredAtMs - observation.firstLimitedAtMs,
        recoveryStartedAtMs: recoveredAtMs,
        recoverySuccessCount: 1,
        recentSuccessCount: observation.recentSuccessCount + 1,
        circuitBreakerUntilMs: null,
      });
      cooldownUntilByKey.set(cooldownKey, Math.max(cooldownUntilByKey.get(cooldownKey) ?? 0, current));
      return;
    }

    if (observation.state === 'recovering') {
      const recoveryStartedAtMs = observation.recoveryStartedAtMs ?? current;
      const recoverySuccessCount = observation.recoverySuccessCount + 1;
      const stable =
        recoverySuccessCount >= recoverySuccessThreshold
        && current - recoveryStartedAtMs >= recoveryStableMs;
      observationsByKey.set(cooldownKey, {
        ...observation,
        state: stable ? 'normal' : 'recovering',
        recoverySuccessCount,
        recentSuccessCount: observation.recentSuccessCount + 1,
        nextRetryAtMs: null,
        circuitBreakerUntilMs: null,
      });
      return;
    }

    observationsByKey.set(cooldownKey, {
      ...observation,
      recentSuccessCount: observation.recentSuccessCount + 1,
    });
  }

  function snapshot(): KisOutboundLimiterSnapshot {
    const current = now();
    return {
      ratePerSec,
      burst,
      tokens,
      profiles: Array.from(cooldownUntilByKey.entries())
        .map(([key, cooldownUntilMs]) => ({
          ...parseCooldownMapKey(key),
          cooldownUntilMs,
          observation: observationsByKey.get(key) ?? null,
        }))
        .sort((a, b) => {
          const profileOrder = a.profileId.localeCompare(b.profileId);
          if (profileOrder !== 0) return profileOrder;
          return String(a.endpointClass ?? '').localeCompare(String(b.endpointClass ?? ''));
        })
        .map(({ profileId, endpointClass, cooldownUntilMs, observation }) => {
          const policy = policyForEndpoint(endpointClass ?? undefined);
          const state = observation?.state ?? 'normal';
          const activeUntil = observation?.circuitBreakerUntilMs
            ?? observation?.nextRetryAtMs
            ?? cooldownUntilMs;
          return {
            profileId,
            endpointClass,
            priorityClass: policy.priorityClass,
            state,
            cooldownUntilMs: activeUntil ?? cooldownUntilMs,
            cooldownActive: state !== 'normal' && (activeUntil ?? cooldownUntilMs) > current,
            firstLimitedAtMs: observation?.firstLimitedAtMs ?? null,
            lastLimitedAtMs: observation?.lastLimitedAtMs ?? null,
            recoveredAtMs: observation?.recoveredAtMs ?? null,
            observedRecoveryMs: observation?.observedRecoveryMs ?? null,
            nextRetryAtMs: observation?.nextRetryAtMs ?? null,
            circuitBreakerUntilMs: observation?.circuitBreakerUntilMs ?? null,
            lastThrottleCode: observation?.lastThrottleCode ?? null,
            recoveryAttemptCount: observation?.recoveryAttemptCount ?? 0,
            recentThrottleCount: observation?.recentThrottleCount ?? 0,
            recentSuccessCount: observation?.recentSuccessCount ?? 0,
            currentAllowedRps: effectiveRatePerSec(observation ?? undefined, policy),
            minStartGapMs: effectiveMinStartGapMs(policy, observation ?? undefined),
            maxInFlight: policy.maxInFlight,
          };
        }),
    };
  }

  function refill(): void {
    const current = now();
    const elapsedMs = Math.max(0, current - lastRefillAtMs);
    if (elapsedMs <= 0) return;
    tokens = Math.min(burst, tokens + (elapsedMs / 1000) * ratePerSec);
    lastRefillAtMs = current;
  }

  function enforceGovernorState(
    cooldownKey: string,
    observation: CooldownObservation | undefined,
    endpointClass: KisEndpointClass | undefined,
  ): void {
    if (observation === undefined) return;
    const current = now();
    if (observation.state === 'normal' || observation.state === 'recovering') return;
    const retryAt = observation.circuitBreakerUntilMs ?? observation.nextRetryAtMs ?? 0;
    if (retryAt > current || observation.state === 'half_open') {
      throw localCooldownError(endpointClass, retryAt, observation.state);
    }
    observationsByKey.set(cooldownKey, {
      ...observation,
      state: 'half_open',
    });
  }

  async function waitForClassCapacity(policy: ResolvedKisClassPolicy): Promise<void> {
    while ((inFlightByPriority.get(policy.priorityClass) ?? 0) >= policy.maxInFlight) {
      await sleep(10);
    }
  }

  async function waitForStartSpacing(
    policy: ResolvedKisClassPolicy,
    observation: CooldownObservation | undefined,
  ): Promise<void> {
    const minStartGapMs = effectiveMinStartGapMs(policy, observation);
    const current = now();
    const lastClassStartAtMs = lastStartAtMsByPriority.get(policy.priorityClass) ?? 0;
    const target = Math.max(
      lastGlobalStartAtMs + globalMinStartGapMs,
      lastClassStartAtMs + minStartGapMs,
    );
    const waitMs = Math.max(0, target - current);
    if (waitMs > 0) await sleep(waitMs);
    const startedAt = now();
    lastGlobalStartAtMs = startedAt;
    lastStartAtMsByPriority.set(policy.priorityClass, startedAt);
  }

  function recordLimited(
    cooldownKey: string,
    endpointClass: KisEndpointClass | undefined,
    code: string | null,
  ): void {
    const current = now();
    const existing = observationsByKey.get(cooldownKey);
    const startsNewWindow = existing === undefined || existing.state === 'normal';
    const attempt = startsNewWindow ? 0 : existing.recoveryAttemptCount + 1;
    const policy = policyForEndpoint(endpointClass);
    const shouldCircuitBreak = attempt >= circuitBreakerAfterFailures;
    const delayMs = shouldCircuitBreak
      ? circuitBreakerMs
      : backoffMsForEndpoint(endpointClass, policy, attempt);
    const nextRetryAtMs = current + delayMs;
    const state: KisGovernorState = shouldCircuitBreak ? 'circuit_breaker' : 'throttled';

    observationsByKey.set(cooldownKey, {
      firstLimitedAtMs: startsNewWindow ? current : existing.firstLimitedAtMs,
      lastLimitedAtMs: current,
      recoveredAtMs: startsNewWindow ? existing?.recoveredAtMs ?? null : existing.recoveredAtMs,
      observedRecoveryMs: startsNewWindow ? existing?.observedRecoveryMs ?? null : existing.observedRecoveryMs,
      state,
      nextRetryAtMs,
      circuitBreakerUntilMs: shouldCircuitBreak ? nextRetryAtMs : null,
      lastThrottleCode: code,
      recoveryAttemptCount: attempt,
      recentThrottleCount: (existing?.recentThrottleCount ?? 0) + 1,
      recentSuccessCount: existing?.recentSuccessCount ?? 0,
      recoveryStartedAtMs: null,
      recoverySuccessCount: 0,
    });
    cooldownUntilByKey.set(cooldownKey, Math.max(cooldownUntilByKey.get(cooldownKey) ?? 0, nextRetryAtMs));
  }

  function release(endpointClass: KisEndpointClass | undefined): void {
    const policy = policyForEndpoint(endpointClass);
    const current = inFlightByPriority.get(policy.priorityClass) ?? 0;
    if (current <= 0) return;
    inFlightByPriority.set(policy.priorityClass, current - 1);
  }

  function backoffMsForEndpoint(
    endpointClass: KisEndpointClass | undefined,
    policy: ResolvedKisClassPolicy,
    attempt: number,
  ): number {
    const legacyCooldownMs = legacyCooldownMsForEndpoint(endpointClass);
    if (legacyCooldownMs !== null && attempt === 0) return legacyCooldownMs;
    const backoffs = normalizeBackoff(
      options.classPolicies?.[endpointClass ?? 'maintenance']?.recoveryBackoffMs
        ?? policy.recoveryBackoffMs
        ?? recoveryBackoffMs,
    );
    return backoffs[Math.min(attempt, backoffs.length - 1)] ?? recoveryBackoffMs[0]!;
  }

  function legacyCooldownMsForEndpoint(endpointClass: KisEndpointClass | undefined): number | null {
    if (endpointClass !== undefined && cooldownMsByEndpointClass[endpointClass] !== undefined) {
      return Math.max(1, cooldownMsByEndpointClass[endpointClass]!);
    }
    return options.cooldownMs !== undefined ? Math.max(1, options.cooldownMs) : null;
  }

  function policyForEndpoint(endpointClass: KisEndpointClass | undefined): ResolvedKisClassPolicy {
    const priorityClass = priorityClassForEndpoint(endpointClass);
    const base = DEFAULT_CLASS_POLICIES[priorityClass];
    const directOverride = endpointClass !== undefined ? options.classPolicies?.[endpointClass] : undefined;
    const priorityOverride = options.classPolicies?.[priorityClass as KisEndpointClass];
    return {
      priorityClass,
      minStartGapMs: Math.max(0, directOverride?.minStartGapMs ?? priorityOverride?.minStartGapMs ?? base.minStartGapMs),
      maxInFlight: Math.max(1, directOverride?.maxInFlight ?? priorityOverride?.maxInFlight ?? base.maxInFlight),
      recoveryRatePerSec: Math.max(
        0.1,
        directOverride?.recoveryRatePerSec
          ?? priorityOverride?.recoveryRatePerSec
          ?? base.recoveryRatePerSec
          ?? recoveryRatePerSec,
      ),
      recoveryBackoffMs: normalizeBackoff(
        directOverride?.recoveryBackoffMs
          ?? priorityOverride?.recoveryBackoffMs
          ?? base.recoveryBackoffMs
          ?? recoveryBackoffMs,
      ),
    };
  }

  function effectiveRatePerSec(
    observation: CooldownObservation | undefined,
    policy: ResolvedKisClassPolicy,
  ): number {
    return observation?.state === 'recovering'
      ? Math.min(ratePerSec, policy.recoveryRatePerSec)
      : ratePerSec;
  }

  function effectiveMinStartGapMs(
    policy: ResolvedKisClassPolicy,
    observation: CooldownObservation | undefined,
  ): number {
    if (observation?.state !== 'recovering') return Math.max(globalMinStartGapMs, policy.minStartGapMs);
    const recoveryGap = Math.ceil(1000 / Math.max(0.1, policy.recoveryRatePerSec));
    return Math.max(globalMinStartGapMs, policy.minStartGapMs, recoveryGap);
  }

  return { acquire, recordFailure, recordSuccess, snapshot };
}

function cooldownMapKey(profileId: string, endpointClass: KisEndpointClass | undefined): string {
  return `${profileId}\u0000${endpointClass ?? ''}`;
}

function parseCooldownMapKey(key: string): {
  profileId: string;
  endpointClass: KisEndpointClass | null;
} {
  const [profileId = DEFAULT_PROFILE_ID, endpointClass = ''] = key.split('\u0000');
  return {
    profileId,
    endpointClass: endpointClass.length > 0 ? (endpointClass as KisEndpointClass) : null,
  };
}

function priorityClassForEndpoint(endpointClass: KisEndpointClass | undefined): KisPriorityClass {
  switch (endpointClass) {
    case 'auth':
    case 'token':
    case 'approval':
      return 'auth';
    case 'foreground':
      return 'foreground';
    case 'selected-minute':
    case 'selected_backfill':
      return 'selected_backfill';
    case 'polling':
      return 'polling';
    case 'ranking':
      return 'ranking';
    case 'daily-backfill':
    case 'background_backfill':
      return 'background_backfill';
    case 'master_refresh':
      return 'master_refresh';
    case 'maintenance':
    case undefined:
      return 'maintenance';
  }
}

function normalizeBackoff(values: readonly number[]): readonly number[] {
  const normalized = values
    .map((value) => Math.max(1, Math.trunc(value)))
    .filter((value) => Number.isFinite(value));
  return normalized.length > 0 ? normalized : DEFAULT_RECOVERY_BACKOFF_MS;
}

function localCooldownError(
  endpointClass: KisEndpointClass | undefined,
  cooldownUntilMs: number,
  governorState: KisGovernorState,
): KisRestError {
  return new KisRestError(
    'KIS outbound limiter cooldown active',
    429,
    null,
    'EGW00201',
    {
      localCooldown: true,
      endpointClass: endpointClass ?? null,
      cooldownUntilMs,
      governorState,
    },
  );
}

function isLocalCooldownError(error: unknown): boolean {
  if (!(error instanceof KisRestError)) return false;
  const payload = error.payload;
  return (
    typeof payload === 'object'
    && payload !== null
    && (payload as Record<string, unknown>)['localCooldown'] === true
  );
}
