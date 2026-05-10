import {
  createKisOutboundLimiter,
  type CreateKisOutboundLimiterOptions,
  type KisClassPolicyInput,
  type KisEndpointClass,
  type KisGovernorTelemetryEvent,
  type KisGovernorTelemetrySnapshot,
  type KisOutboundLimiter,
  type KisOutboundLimiterAcquireInput,
  type KisOutboundLimiterFailureInput,
  type KisOutboundLimiterSnapshot,
  type KisPriorityClass,
} from './kis-outbound-limiter.js';

const DEFAULT_PROFILE_ID = 'primary';
const DEFAULT_TELEMETRY_CAPACITY = 200;

export interface KisMultiProfileOutboundLimiterProfileOptions {
  profileId: string;
  options: CreateKisOutboundLimiterOptions;
}

export interface CreateKisMultiProfileOutboundLimiterOptions {
  profiles: readonly KisMultiProfileOutboundLimiterProfileOptions[];
  defaultProfileId?: string;
  telemetry?: {
    capacity?: number;
    initialEvents?: readonly KisGovernorTelemetryEvent[];
    onSnapshot?: (snapshot: KisGovernorTelemetrySnapshot) => void;
  };
}

interface RoutedLimiter {
  profileId: string;
  limiter: KisOutboundLimiter;
}

export function createKisMultiProfileOutboundLimiter(
  options: CreateKisMultiProfileOutboundLimiterOptions,
): KisOutboundLimiter {
  if (options.profiles.length === 0) {
    throw new Error('createKisMultiProfileOutboundLimiter requires at least one profile');
  }

  const defaultProfileId = options.defaultProfileId ?? DEFAULT_PROFILE_ID;
  const telemetryCapacity = Math.max(
    1,
    Math.floor(options.telemetry?.capacity ?? DEFAULT_TELEMETRY_CAPACITY),
  );
  const routedLimiters = new Map<string, RoutedLimiter>();

  const emitTelemetrySnapshot = (): void => {
    options.telemetry?.onSnapshot?.(mergeTelemetrySnapshots());
  };

  for (const profile of options.profiles) {
    const { telemetry: _ignoredTelemetry, ...limiterOptions } = profile.options;
    const initialEvents = options.telemetry?.initialEvents?.filter(
      (event) => event.profileId === profile.profileId,
    );
    routedLimiters.set(profile.profileId, {
      profileId: profile.profileId,
      limiter: createKisOutboundLimiter({
        ...limiterOptions,
        telemetry: {
          capacity: telemetryCapacity,
          ...(initialEvents !== undefined ? { initialEvents } : {}),
          onSnapshot: emitTelemetrySnapshot,
        },
      }),
    });
  }

  function route(
    input: KisOutboundLimiterAcquireInput | undefined,
  ): { routed: RoutedLimiter; input: KisOutboundLimiterAcquireInput } {
    const profileId = input?.profileId ?? defaultProfileId;
    const routed = routedLimiters.get(profileId) ?? routedLimiters.get(defaultProfileId);
    if (routed === undefined) {
      throw new Error(`KIS outbound limiter profile not found: ${profileId}`);
    }
    return {
      routed,
      input: {
        ...(input ?? {}),
        profileId: routed.profileId,
      },
    };
  }

  function mergeTelemetrySnapshots(): KisGovernorTelemetrySnapshot {
    const snapshots = Array.from(routedLimiters.values())
      .map((routed) => routed.limiter.snapshot().telemetry)
      .filter((snapshot): snapshot is KisGovernorTelemetrySnapshot => snapshot !== undefined);
    const recent = snapshots
      .flatMap((snapshot) => snapshot.recent)
      .sort((a, b) => a.atMs - b.atMs)
      .slice(-telemetryCapacity);
    return {
      capacity: telemetryCapacity,
      eventCount: snapshots.reduce((sum, snapshot) => sum + snapshot.eventCount, 0),
      recent,
    };
  }

  return {
    async acquire(input?: KisOutboundLimiterAcquireInput): Promise<void> {
      const selected = route(input);
      await selected.routed.limiter.acquire(selected.input);
    },

    recordFailure(input: KisOutboundLimiterFailureInput): void {
      const selected = route(input);
      selected.routed.limiter.recordFailure({
        ...selected.input,
        error: input.error,
      });
    },

    recordSuccess(input?: KisOutboundLimiterAcquireInput): void {
      const selected = route(input);
      selected.routed.limiter.recordSuccess?.(selected.input);
    },

    snapshot(): KisOutboundLimiterSnapshot {
      const snapshots = Array.from(routedLimiters.values()).map((routed) =>
        routed.limiter.snapshot(),
      );
      const queuedByPriority = mergeQueuedByPriority(snapshots);
      return {
        ratePerSec: snapshots.reduce((sum, snapshot) => sum + snapshot.ratePerSec, 0),
        burst: snapshots.reduce((sum, snapshot) => sum + snapshot.burst, 0),
        tokens: snapshots.reduce((sum, snapshot) => sum + snapshot.tokens, 0),
        queueDepth: snapshots.reduce((sum, snapshot) => sum + (snapshot.queueDepth ?? 0), 0),
        queuedByPriority,
        telemetry: mergeTelemetrySnapshots(),
        policies: snapshots[0]?.policies ?? [],
        profiles: snapshots.flatMap((snapshot) => snapshot.profiles),
      };
    },

    setClassPolicyOverride(
      endpointClass: KisEndpointClass,
      policy: KisClassPolicyInput | null,
    ): void {
      for (const routed of routedLimiters.values()) {
        routed.limiter.setClassPolicyOverride?.(endpointClass, policy);
      }
    },
  };
}

function mergeQueuedByPriority(
  snapshots: readonly KisOutboundLimiterSnapshot[],
): Partial<Record<KisPriorityClass, number>> {
  const merged: Partial<Record<KisPriorityClass, number>> = {};
  for (const snapshot of snapshots) {
    for (const [priority, count] of Object.entries(snapshot.queuedByPriority ?? {})) {
      const key = priority as KisPriorityClass;
      merged[key] = (merged[key] ?? 0) + (count ?? 0);
    }
  }
  return merged;
}
