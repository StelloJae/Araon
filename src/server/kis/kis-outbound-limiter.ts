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

export type KisGovernorTelemetryEventType =
  | 'throttle'
  | 'half_open'
  | 'recovered'
  | 'normal'
  | 'circuit_breaker';

export interface KisGovernorTelemetryEvent {
  atMs: number;
  event: KisGovernorTelemetryEventType;
  profileId: string;
  endpointClass: KisEndpointClass | null;
  priorityClass: KisPriorityClass;
  state: KisGovernorState;
  throttleCode: string | null;
  recoveryAttemptCount: number;
  observedRecoveryMs: number | null;
  currentAllowedRps: number;
  minStartGapMs: number;
  maxInFlight: number;
}

export interface KisGovernorTelemetrySnapshot {
  capacity: number;
  eventCount: number;
  recent: readonly KisGovernorTelemetryEvent[];
}

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
  queueDepth?: number;
  queuedByPriority?: Partial<Record<KisPriorityClass, number>>;
  telemetry?: KisGovernorTelemetrySnapshot;
  profiles: KisOutboundLimiterProfileSnapshot[];
}

export interface KisOutboundLimiter {
  acquire(input?: KisOutboundLimiterAcquireInput): Promise<void>;
  recordFailure(input: KisOutboundLimiterFailureInput): void;
  recordSuccess?(input?: KisOutboundLimiterAcquireInput): void;
  snapshot(): KisOutboundLimiterSnapshot;
  setClassPolicyOverride?(endpointClass: KisEndpointClass, policy: KisClassPolicyInput | null): void;
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
  telemetry?: {
    capacity?: number;
    initialEvents?: readonly KisGovernorTelemetryEvent[];
    onSnapshot?: (snapshot: KisGovernorTelemetrySnapshot) => void;
  };
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
const DEFAULT_TELEMETRY_CAPACITY = 200;

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

interface QueuedAcquire {
  sequence: number;
  input: Required<Pick<KisOutboundLimiterAcquireInput, 'profileId'>> & {
    endpointClass?: KisEndpointClass;
  };
  resolve: () => void;
  reject: (err: unknown) => void;
}

const PRIORITY_ORDER: Record<KisPriorityClass, number> = {
  auth: 0,
  foreground: 1,
  selected_backfill: 2,
  polling: 3,
  ranking: 4,
  background_backfill: 5,
  master_refresh: 6,
  maintenance: 7,
};

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
  const telemetryEnabled = options.telemetry !== undefined;
  const telemetryCapacity = telemetryEnabled
    ? Math.max(0, Math.trunc(options.telemetry?.capacity ?? DEFAULT_TELEMETRY_CAPACITY))
    : 0;

  let tokens = burst;
  let lastRefillAtMs = now();
  let lastGlobalStartAtMs = 0;
  const cooldownUntilByKey = new Map<string, number>();
  const observationsByKey = new Map<string, CooldownObservation>();
  const lastStartAtMsByPriority = new Map<KisPriorityClass, number>();
  const inFlightByPriority = new Map<KisPriorityClass, number>();
  const runtimeClassPolicyOverrides = new Map<KisEndpointClass, KisClassPolicyInput>();
  const acquireQueue: QueuedAcquire[] = [];
  let telemetryEvents = trimTelemetryEvents(
    options.telemetry?.initialEvents ?? [],
    telemetryCapacity,
  );
  let nextSequence = 0;
  let drainActive = false;

  async function acquire(input: KisOutboundLimiterAcquireInput = {}): Promise<void> {
    const profileId = input.profileId ?? DEFAULT_PROFILE_ID;
    const cooldownKey = cooldownMapKey(profileId, input.endpointClass);
    const currentObservation = observationsByKey.get(cooldownKey);
    assertNotLocallyBlocked(currentObservation, input.endpointClass);
    return new Promise<void>((resolve, reject) => {
      acquireQueue.push({
        sequence: nextSequence,
        input: {
          profileId,
          ...(input.endpointClass !== undefined ? { endpointClass: input.endpointClass } : {}),
        },
        resolve,
        reject,
      });
      nextSequence += 1;
      void drainAcquireQueue();
    });
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
      const nextObservation: CooldownObservation = {
        ...observation,
        state: 'recovering',
        recoveredAtMs,
        observedRecoveryMs: recoveredAtMs - observation.firstLimitedAtMs,
        recoveryStartedAtMs: recoveredAtMs,
        recoverySuccessCount: 1,
        recentSuccessCount: observation.recentSuccessCount + 1,
        circuitBreakerUntilMs: null,
      };
      observationsByKey.set(cooldownKey, nextObservation);
      cooldownUntilByKey.set(cooldownKey, Math.max(cooldownUntilByKey.get(cooldownKey) ?? 0, current));
      appendTelemetryEvent(
        'recovered',
        profileId,
        input.endpointClass,
        nextObservation,
      );
      return;
    }

    if (observation.state === 'recovering') {
      const recoveryStartedAtMs = observation.recoveryStartedAtMs ?? current;
      const recoverySuccessCount = observation.recoverySuccessCount + 1;
      const stable =
        recoverySuccessCount >= recoverySuccessThreshold
        && current - recoveryStartedAtMs >= recoveryStableMs;
      const nextObservation: CooldownObservation = {
        ...observation,
        state: stable ? 'normal' : 'recovering',
        recoverySuccessCount,
        recentSuccessCount: observation.recentSuccessCount + 1,
        nextRetryAtMs: null,
        circuitBreakerUntilMs: null,
      };
      observationsByKey.set(cooldownKey, nextObservation);
      if (stable) {
        appendTelemetryEvent(
          'normal',
          profileId,
          input.endpointClass,
          nextObservation,
        );
      }
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
      queueDepth: acquireQueue.length,
      queuedByPriority: queuedByPrioritySnapshot(),
      ...(telemetryEnabled ? { telemetry: telemetrySnapshot() } : {}),
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

  function setClassPolicyOverride(
    endpointClass: KisEndpointClass,
    policy: KisClassPolicyInput | null,
  ): void {
    if (policy === null) {
      runtimeClassPolicyOverrides.delete(endpointClass);
    } else {
      runtimeClassPolicyOverrides.set(endpointClass, normalizePolicyInput(policy));
    }
    if (acquireQueue.length > 0) {
      void drainAcquireQueue();
    }
  }

  function queuedByPrioritySnapshot(): Record<KisPriorityClass, number> {
    const counts = emptyPriorityCounts();
    for (const entry of acquireQueue) {
      const priorityClass = priorityClassForEndpoint(entry.input.endpointClass);
      counts[priorityClass] += 1;
    }
    return counts;
  }

  function refill(): void {
    const current = now();
    const elapsedMs = Math.max(0, current - lastRefillAtMs);
    if (elapsedMs <= 0) return;
    tokens = Math.min(burst, tokens + (elapsedMs / 1000) * ratePerSec);
    lastRefillAtMs = current;
  }

  async function drainAcquireQueue(): Promise<void> {
    if (drainActive) return;
    drainActive = true;
    try {
      while (acquireQueue.length > 0) {
        rejectLocallyBlockedQueuedAcquires();
        if (acquireQueue.length === 0) return;
        refill();

        const readyIndex = findReadyQueuedAcquireIndex();
        if (readyIndex >= 0) {
          const [entry] = acquireQueue.splice(readyIndex, 1);
          if (entry === undefined) continue;
          grantQueuedAcquire(entry);
          continue;
        }

        const waitMs = nextQueueWaitMs();
        await sleep(waitMs);
      }
    } finally {
      drainActive = false;
      if (acquireQueue.length > 0) {
        void drainAcquireQueue();
      }
    }
  }

  function rejectLocallyBlockedQueuedAcquires(): void {
    for (let index = acquireQueue.length - 1; index >= 0; index -= 1) {
      const entry = acquireQueue[index]!;
      const cooldownKey = cooldownMapKey(entry.input.profileId, entry.input.endpointClass);
      const observation = observationsByKey.get(cooldownKey);
      try {
        assertNotLocallyBlocked(observation, entry.input.endpointClass);
      } catch (err: unknown) {
        acquireQueue.splice(index, 1);
        entry.reject(err);
      }
    }
  }

  function findReadyQueuedAcquireIndex(): number {
    const sorted = acquireQueue
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => compareQueuedAcquires(a.entry, b.entry));
    for (const { entry, index } of sorted) {
      if (queuedAcquireWaitMs(entry) === 0) return index;
    }
    return -1;
  }

  function nextQueueWaitMs(): number {
    let waitMs = Number.POSITIVE_INFINITY;
    for (const entry of acquireQueue) {
      waitMs = Math.min(waitMs, queuedAcquireWaitMs(entry));
    }
    return Number.isFinite(waitMs) ? Math.max(1, Math.ceil(waitMs)) : 10;
  }

  function queuedAcquireWaitMs(entry: QueuedAcquire): number {
    const policy = policyForEndpoint(entry.input.endpointClass);
    const observation = observationsByKey.get(
      cooldownMapKey(entry.input.profileId, entry.input.endpointClass),
    );
    if ((inFlightByPriority.get(policy.priorityClass) ?? 0) >= policy.maxInFlight) {
      return 10;
    }
    const effectiveRate = effectiveRatePerSec(observation, policy);
    const tokenWaitMs = tokens < 1
      ? Math.ceil(((1 - tokens) / effectiveRate) * 1000)
      : 0;
    return Math.max(tokenWaitMs, startSpacingWaitMs(policy, observation));
  }

  function grantQueuedAcquire(entry: QueuedAcquire): void {
    const cooldownKey = cooldownMapKey(entry.input.profileId, entry.input.endpointClass);
    transitionToHalfOpenIfReady(cooldownKey, entry.input.endpointClass);
    const policy = policyForEndpoint(entry.input.endpointClass);
    tokens = Math.max(0, tokens - 1);
    inFlightByPriority.set(
      policy.priorityClass,
      (inFlightByPriority.get(policy.priorityClass) ?? 0) + 1,
    );
    const startedAt = now();
    lastGlobalStartAtMs = startedAt;
    lastStartAtMsByPriority.set(policy.priorityClass, startedAt);
    entry.resolve();
  }

  function assertNotLocallyBlocked(
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
  }

  function transitionToHalfOpenIfReady(
    cooldownKey: string,
    endpointClass: KisEndpointClass | undefined,
  ): void {
    const observation = observationsByKey.get(cooldownKey);
    if (observation === undefined) return;
    const current = now();
    if (observation.state === 'normal' || observation.state === 'recovering') return;
    const retryAt = observation.circuitBreakerUntilMs ?? observation.nextRetryAtMs ?? 0;
    if (retryAt > current || observation.state === 'half_open') {
      throw localCooldownError(endpointClass, retryAt, observation.state);
    }
    const nextObservation: CooldownObservation = {
      ...observation,
      state: 'half_open',
    };
    observationsByKey.set(cooldownKey, nextObservation);
    appendTelemetryEvent(
      'half_open',
      parseCooldownMapKey(cooldownKey).profileId,
      endpointClass,
      nextObservation,
    );
  }

  function startSpacingWaitMs(
    policy: ResolvedKisClassPolicy,
    observation: CooldownObservation | undefined,
  ): number {
    const minStartGapMs = effectiveMinStartGapMs(policy, observation);
    const current = now();
    const lastClassStartAtMs = lastStartAtMsByPriority.get(policy.priorityClass) ?? 0;
    const target = Math.max(
      lastGlobalStartAtMs + globalMinStartGapMs,
      lastClassStartAtMs + minStartGapMs,
    );
    return Math.max(0, target - current);
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

    const nextObservation: CooldownObservation = {
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
    };
    observationsByKey.set(cooldownKey, nextObservation);
    cooldownUntilByKey.set(cooldownKey, Math.max(cooldownUntilByKey.get(cooldownKey) ?? 0, nextRetryAtMs));
    appendTelemetryEvent(
      shouldCircuitBreak ? 'circuit_breaker' : 'throttle',
      parseCooldownMapKey(cooldownKey).profileId,
      endpointClass,
      nextObservation,
    );
  }

  function release(endpointClass: KisEndpointClass | undefined): void {
    const policy = policyForEndpoint(endpointClass);
    const current = inFlightByPriority.get(policy.priorityClass) ?? 0;
    if (current <= 0) return;
    inFlightByPriority.set(policy.priorityClass, current - 1);
    if (acquireQueue.length > 0) {
      void drainAcquireQueue();
    }
  }

  function backoffMsForEndpoint(
    endpointClass: KisEndpointClass | undefined,
    policy: ResolvedKisClassPolicy,
    attempt: number,
  ): number {
    const legacyCooldownMs = legacyCooldownMsForEndpoint(endpointClass);
    if (legacyCooldownMs !== null && attempt === 0) return legacyCooldownMs;
    const backoffs = normalizeBackoff(policy.recoveryBackoffMs ?? recoveryBackoffMs);
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
    const directOverride = mergePolicyInputs(
      endpointClass !== undefined ? options.classPolicies?.[endpointClass] : undefined,
      endpointClass !== undefined ? runtimeClassPolicyOverrides.get(endpointClass) : undefined,
    );
    const priorityOverride = mergePolicyInputs(
      options.classPolicies?.[priorityClass as KisEndpointClass],
      runtimeClassPolicyOverrides.get(priorityClass as KisEndpointClass),
    );
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

  function appendTelemetryEvent(
    event: KisGovernorTelemetryEventType,
    profileId: string,
    endpointClass: KisEndpointClass | undefined,
    observation: CooldownObservation,
  ): void {
    if (!telemetryEnabled || telemetryCapacity <= 0) return;
    const policy = policyForEndpoint(endpointClass);
    const item: KisGovernorTelemetryEvent = {
      atMs: now(),
      event,
      profileId,
      endpointClass: endpointClass ?? null,
      priorityClass: policy.priorityClass,
      state: observation.state,
      throttleCode: observation.lastThrottleCode,
      recoveryAttemptCount: observation.recoveryAttemptCount,
      observedRecoveryMs: observation.observedRecoveryMs,
      currentAllowedRps: effectiveRatePerSec(observation, policy),
      minStartGapMs: effectiveMinStartGapMs(policy, observation),
      maxInFlight: policy.maxInFlight,
    };
    telemetryEvents = trimTelemetryEvents([...telemetryEvents, item], telemetryCapacity);
    try {
      options.telemetry?.onSnapshot?.(telemetrySnapshot());
    } catch {
      // Telemetry must never affect live request pacing.
    }
  }

  function telemetrySnapshot(): KisGovernorTelemetrySnapshot {
    return {
      capacity: telemetryCapacity,
      eventCount: telemetryEvents.length,
      recent: telemetryEvents.map((event) => ({ ...event })),
    };
  }

  return { acquire, recordFailure, recordSuccess, snapshot, setClassPolicyOverride };
}

function trimTelemetryEvents(
  events: readonly KisGovernorTelemetryEvent[],
  capacity: number,
): KisGovernorTelemetryEvent[] {
  if (capacity <= 0) return [];
  return events
    .filter((event) => Number.isFinite(event.atMs))
    .slice(-capacity)
    .map((event) => ({
      atMs: Math.trunc(event.atMs),
      event: event.event,
      profileId: String(event.profileId),
      endpointClass: event.endpointClass,
      priorityClass: event.priorityClass,
      state: event.state,
      throttleCode: event.throttleCode,
      recoveryAttemptCount: Math.max(0, Math.trunc(event.recoveryAttemptCount)),
      observedRecoveryMs: event.observedRecoveryMs === null
        ? null
        : Math.max(0, Math.trunc(event.observedRecoveryMs)),
      currentAllowedRps: event.currentAllowedRps,
      minStartGapMs: Math.max(0, Math.trunc(event.minStartGapMs)),
      maxInFlight: Math.max(1, Math.trunc(event.maxInFlight)),
    }));
}

function compareQueuedAcquires(a: QueuedAcquire, b: QueuedAcquire): number {
  const priorityOrder =
    PRIORITY_ORDER[priorityClassForEndpoint(a.input.endpointClass)]
    - PRIORITY_ORDER[priorityClassForEndpoint(b.input.endpointClass)];
  if (priorityOrder !== 0) return priorityOrder;
  return a.sequence - b.sequence;
}

function emptyPriorityCounts(): Record<KisPriorityClass, number> {
  return {
    auth: 0,
    foreground: 0,
    selected_backfill: 0,
    polling: 0,
    ranking: 0,
    background_backfill: 0,
    master_refresh: 0,
    maintenance: 0,
  };
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

function normalizePolicyInput(policy: KisClassPolicyInput): KisClassPolicyInput {
  return mergePolicyInputs(policy) ?? {};
}

function mergePolicyInputs(
  ...policies: Array<KisClassPolicyInput | undefined>
): KisClassPolicyInput | undefined {
  const merged: KisClassPolicyInput = {};
  let hasValue = false;
  for (const policy of policies) {
    if (policy === undefined) continue;
    if (policy.minStartGapMs !== undefined) {
      merged.minStartGapMs = Math.max(0, Math.trunc(policy.minStartGapMs));
      hasValue = true;
    }
    if (policy.maxInFlight !== undefined) {
      merged.maxInFlight = Math.max(1, Math.trunc(policy.maxInFlight));
      hasValue = true;
    }
    if (policy.recoveryRatePerSec !== undefined) {
      merged.recoveryRatePerSec = Math.max(0.1, policy.recoveryRatePerSec);
      hasValue = true;
    }
    if (policy.recoveryBackoffMs !== undefined) {
      merged.recoveryBackoffMs = normalizeBackoff(policy.recoveryBackoffMs);
      hasValue = true;
    }
  }
  return hasValue ? merged : undefined;
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
