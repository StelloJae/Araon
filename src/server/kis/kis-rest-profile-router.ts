import type {
  CredentialStore,
  KisCredentials,
  PersistedToken,
} from '../credential-store.js';
import {
  KisRestError,
  type KisRestClient,
  type KisRestRequest,
  type KisRestResponse,
} from './kis-rest-client.js';
import type {
  KisEndpointClass,
  KisGovernorState,
  KisOutboundLimiter,
  KisOutboundLimiterProfileSnapshot,
} from './kis-outbound-limiter.js';
import {
  classifyKisRestFailure,
  isKisSecondWindowThrottle,
  type KisRestFailureKind,
} from './kis-rate-limit-classifier.js';

const PRIMARY_PROFILE_ID = 'primary';

export type KisRestProfileIneligibleReason =
  | 'disabled'
  | 'paper_mismatch'
  | 'missing_client';

export interface KisRestProfileRouterProfile {
  profileId: string;
  label: string;
  isPaper: boolean;
  enabled: boolean;
  client?: KisRestClient;
  ineligibleReason?: KisRestProfileIneligibleReason;
}

export interface KisRestProfileRouterOptions {
  primaryProfileId?: string;
  profiles: readonly KisRestProfileRouterProfile[];
  outboundLimiter?: Pick<KisOutboundLimiter, 'snapshot'>;
  now?: () => number;
}

export interface KisRestProfileRouterProfileSnapshot {
  profileId: string;
  label: string;
  isPaper: boolean;
  enabled: boolean;
  eligible: boolean;
  ineligibleReason: KisRestProfileIneligibleReason | null;
  selectedCount: number;
  successCount: number;
  failureCount: number;
  failoverFromCount: number;
  failoverToCount: number;
  lastSelectedAtMs: number | null;
  lastSuccessAtMs: number | null;
  lastFailureAtMs: number | null;
  lastFailureKind: KisRestFailureKind | null;
  lastFailureCode: string | null;
  lastThrottleAtMs: number | null;
  governorState: KisGovernorState;
  cooldownActive: boolean;
  activeEndpointClasses: readonly KisEndpointClass[];
  currentAllowedRps: number | null;
}

export interface KisRestProfileRouterPolicySnapshot {
  endpointClass: KisEndpointClass;
  selection: 'primary_only' | 'primary_first' | 'round_robin';
  failoverEnabled: boolean;
}

export interface KisRestProfileRouterSnapshot {
  configured: boolean;
  primaryProfileId: string;
  profileCount: number;
  eligibleProfileCount: number;
  endpointPolicies: readonly KisRestProfileRouterPolicySnapshot[];
  profiles: readonly KisRestProfileRouterProfileSnapshot[];
}

export interface KisRestProfileRouter extends KisRestClient {
  snapshot(): KisRestProfileRouterSnapshot;
}

interface ProfileState {
  selectedCount: number;
  successCount: number;
  failureCount: number;
  failoverFromCount: number;
  failoverToCount: number;
  lastSelectedAtMs: number | null;
  lastSuccessAtMs: number | null;
  lastFailureAtMs: number | null;
  lastFailureKind: KisRestFailureKind | null;
  lastFailureCode: string | null;
  lastThrottleAtMs: number | null;
}

interface ResolvedProfile {
  profileId: string;
  label: string;
  isPaper: boolean;
  enabled: boolean;
  client?: KisRestClient;
  ineligibleReason: KisRestProfileIneligibleReason | undefined;
}

interface EligibleProfile extends ResolvedProfile {
  client: KisRestClient;
  ineligibleReason: undefined;
}

const ROUTED_ENDPOINT_CLASSES: readonly KisEndpointClass[] = [
  'auth',
  'token',
  'approval',
  'foreground',
  'polling',
  'ranking',
  'daily-backfill',
  'selected-minute',
  'background_backfill',
  'selected_backfill',
  'master_refresh',
  'maintenance',
];

export function createKisRestProfileRouter(
  options: KisRestProfileRouterOptions,
): KisRestProfileRouter {
  const primaryProfileId = options.primaryProfileId ?? PRIMARY_PROFILE_ID;
  const now = options.now ?? Date.now;
  const states = new Map<string, ProfileState>();
  const roundRobinIndex = new Map<KisEndpointClass, number>();
  const profiles: ResolvedProfile[] = options.profiles.map((profile) => ({
    ...profile,
    ineligibleReason: profile.ineligibleReason ?? (
      profile.enabled && profile.client !== undefined ? undefined : 'missing_client'
    ),
  }));

  for (const profile of profiles) {
    states.set(profile.profileId, createInitialProfileState());
  }

  function ensureState(profileId: string): ProfileState {
    let state = states.get(profileId);
    if (state === undefined) {
      state = createInitialProfileState();
      states.set(profileId, state);
    }
    return state;
  }

  const eligibleProfiles = (): EligibleProfile[] =>
    profiles.filter((profile): profile is EligibleProfile =>
      profile.enabled && profile.client !== undefined && profile.ineligibleReason === undefined,
    );

  const primaryProfile = (): EligibleProfile | undefined =>
    eligibleProfiles().find((profile) => profile.profileId === primaryProfileId)
    ?? eligibleProfiles()[0];

  function policyFor(endpointClass: KisEndpointClass): KisRestProfileRouterPolicySnapshot {
    if (
      endpointClass === 'auth'
      || endpointClass === 'token'
      || endpointClass === 'approval'
    ) {
      return {
        endpointClass,
        selection: 'primary_only',
        failoverEnabled: false,
      };
    }
    if (endpointClass === 'foreground') {
      return {
        endpointClass,
        selection: 'primary_first',
        failoverEnabled: true,
      };
    }
    return {
      endpointClass,
      selection: 'round_robin',
      failoverEnabled: true,
    };
  }

  function candidatesFor(endpointClass: KisEndpointClass): EligibleProfile[] {
    const eligible = eligibleProfiles();
    if (eligible.length === 0) return [];
    const policy = policyFor(endpointClass);
    if (policy.selection === 'primary_only') {
      const primary = primaryProfile();
      return primary !== undefined ? [primary] : [];
    }
    if (policy.selection === 'primary_first') {
      const primary = primaryProfile();
      const ordered = primary === undefined
        ? eligible
        : [primary, ...eligible.filter((profile) => profile.profileId !== primary.profileId)];
      return prioritizeAvailableProfiles(ordered, endpointClass);
    }

    const start = roundRobinIndex.get(endpointClass) ?? 0;
    roundRobinIndex.set(endpointClass, (start + 1) % eligible.length);
    const rotated = [
      ...eligible.slice(start),
      ...eligible.slice(0, start),
    ];
    return prioritizeAvailableProfiles(rotated, endpointClass);
  }

  function prioritizeAvailableProfiles(
    ordered: readonly EligibleProfile[],
    endpointClass: KisEndpointClass,
  ): EligibleProfile[] {
    const available: EligibleProfile[] = [];
    const blocked: EligibleProfile[] = [];
    for (const profile of ordered) {
      if (isLocallyBlocked(profile.profileId, endpointClass)) {
        blocked.push(profile);
      } else {
        available.push(profile);
      }
    }
    return available.length > 0 ? [...available, ...blocked] : [...ordered];
  }

  function isLocallyBlocked(profileId: string, endpointClass: KisEndpointClass): boolean {
    const limiterSnapshot = options.outboundLimiter?.snapshot();
    if (limiterSnapshot === undefined) return false;
    return limiterSnapshot.profiles.some((profile) =>
      profile.profileId === profileId
      && profile.endpointClass === endpointClass
      && profile.cooldownActive,
    );
  }

  function markSelected(profile: EligibleProfile, wasFailoverTarget: boolean): void {
    const state = ensureState(profile.profileId);
    state.selectedCount += 1;
    state.lastSelectedAtMs = now();
    if (wasFailoverTarget) state.failoverToCount += 1;
  }

  function markSuccess(profile: EligibleProfile): void {
    const state = ensureState(profile.profileId);
    state.successCount += 1;
    state.lastSuccessAtMs = now();
  }

  function markFailure(profile: EligibleProfile, err: unknown): void {
    const classification = classifyKisRestFailure(err);
    const state = ensureState(profile.profileId);
    state.failureCount += 1;
    state.lastFailureAtMs = now();
    state.lastFailureKind = classification.kind;
    state.lastFailureCode = classification.code;
    if (isKisSecondWindowThrottle(classification)) {
      state.lastThrottleAtMs = state.lastFailureAtMs;
    }
  }

  function markFailoverFrom(profile: EligibleProfile): void {
    const state = ensureState(profile.profileId);
    state.failoverFromCount += 1;
  }

  async function requestWithMeta<T>(req: KisRestRequest): Promise<KisRestResponse<T>> {
    const endpointClass = req.endpointClass ?? 'maintenance';
    const policy = policyFor(endpointClass);
    const candidates = candidatesFor(endpointClass);
    if (candidates.length === 0) {
      throw new Error('no eligible KIS REST credential profile is available');
    }

    let lastErr: unknown;
    for (let index = 0; index < candidates.length; index += 1) {
      const profile = candidates[index]!;
      markSelected(profile, index > 0);
      try {
        const response = await profile.client.requestWithMeta<T>({
          ...req,
          endpointClass,
          profileId: profile.profileId,
        });
        markSuccess(profile);
        return response;
      } catch (err: unknown) {
        lastErr = err;
        markFailure(profile, err);
        if (
          !policy.failoverEnabled
          || index === candidates.length - 1
          || !isProfileFailoverError(err)
        ) {
          throw err;
        }
        markFailoverFrom(profile);
      }
    }
    throw lastErr;
  }

  function snapshot(): KisRestProfileRouterSnapshot {
    const limiterProfiles = options.outboundLimiter?.snapshot().profiles ?? [];
    return {
      configured: true,
      primaryProfileId,
      profileCount: profiles.length,
      eligibleProfileCount: eligibleProfiles().length,
      endpointPolicies: ROUTED_ENDPOINT_CLASSES.map((endpointClass) => policyFor(endpointClass)),
      profiles: profiles.map((profile) => {
        const state = ensureState(profile.profileId);
        const governor = summarizeGovernorState(profile.profileId, limiterProfiles);
        return {
          profileId: profile.profileId,
          label: profile.label,
          isPaper: profile.isPaper,
          enabled: profile.enabled,
          eligible: profile.enabled
            && profile.client !== undefined
            && profile.ineligibleReason === undefined,
          ineligibleReason: profile.ineligibleReason ?? null,
          selectedCount: state.selectedCount,
          successCount: state.successCount,
          failureCount: state.failureCount,
          failoverFromCount: state.failoverFromCount,
          failoverToCount: state.failoverToCount,
          lastSelectedAtMs: state.lastSelectedAtMs,
          lastSuccessAtMs: state.lastSuccessAtMs,
          lastFailureAtMs: state.lastFailureAtMs,
          lastFailureKind: state.lastFailureKind,
          lastFailureCode: state.lastFailureCode,
          lastThrottleAtMs: state.lastThrottleAtMs,
          governorState: governor.state,
          cooldownActive: governor.cooldownActive,
          activeEndpointClasses: governor.activeEndpointClasses,
          currentAllowedRps: governor.currentAllowedRps,
        };
      }),
    };
  }

  return {
    async request<T>(req: KisRestRequest): Promise<T> {
      const response = await requestWithMeta<T>(req);
      return response.payload;
    },
    requestWithMeta,
    async postToken(body): Promise<unknown> {
      const primary = primaryProfile();
      if (primary === undefined) {
        throw new Error('no primary KIS REST credential profile is available');
      }
      return primary.client.postToken(body);
    },
    snapshot,
  };
}

export function createInMemoryKisCredentialStore(
  credentials: KisCredentials,
  initialToken: PersistedToken | null = null,
): CredentialStore {
  let currentCredentials = credentials;
  let token = initialToken;
  return {
    async load() {
      return {
        credentials: currentCredentials,
        ...(token !== null ? { token } : {}),
      };
    },
    async saveCredentials(nextCredentials) {
      currentCredentials = nextCredentials;
    },
    async saveToken(nextToken) {
      token = nextToken;
    },
    async clearToken() {
      token = null;
    },
    async clearCredentials() {
      token = null;
    },
  };
}

function isProfileFailoverError(err: unknown): boolean {
  if (err instanceof KisRestError) {
    const classification = classifyKisRestFailure(err);
    return isKisSecondWindowThrottle(classification);
  }
  return false;
}

function createInitialProfileState(): ProfileState {
  return {
    selectedCount: 0,
    successCount: 0,
    failureCount: 0,
    failoverFromCount: 0,
    failoverToCount: 0,
    lastSelectedAtMs: null,
    lastSuccessAtMs: null,
    lastFailureAtMs: null,
    lastFailureKind: null,
    lastFailureCode: null,
    lastThrottleAtMs: null,
  };
}

function summarizeGovernorState(
  profileId: string,
  profiles: readonly KisOutboundLimiterProfileSnapshot[],
): {
  state: KisGovernorState;
  cooldownActive: boolean;
  activeEndpointClasses: readonly KisEndpointClass[];
  currentAllowedRps: number | null;
} {
  const rows = profiles.filter((profile) => profile.profileId === profileId);
  const activeRows = rows.filter((profile) =>
    profile.state !== 'normal' || profile.cooldownActive,
  );
  const state = activeRows
    .map((profile) => profile.state)
    .sort((a, b) => governorStateSeverity(b) - governorStateSeverity(a))[0] ?? 'normal';
  const currentAllowedRps = rows.length > 0
    ? Math.min(...rows.map((profile) => profile.currentAllowedRps))
    : null;
  return {
    state,
    cooldownActive: rows.some((profile) => profile.cooldownActive),
    activeEndpointClasses: activeRows
      .map((profile) => profile.endpointClass)
      .filter((endpointClass): endpointClass is KisEndpointClass => endpointClass !== null),
    currentAllowedRps,
  };
}

function governorStateSeverity(state: KisGovernorState): number {
  switch (state) {
    case 'circuit_breaker':
      return 5;
    case 'throttled':
      return 4;
    case 'half_open':
      return 3;
    case 'recovering':
      return 2;
    case 'normal':
      return 1;
  }
}
