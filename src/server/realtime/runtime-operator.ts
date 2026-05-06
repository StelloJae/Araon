import type { ApprovalKeyState } from '../kis/kis-approval.js';
import type {
  WsClientStatus,
  WsConnectionState,
  WsSubscription,
} from '../kis/kis-ws-client.js';
import type { RealtimeBridge, RealtimeBridgeStats } from './realtime-bridge.js';
import type { Settings } from '../settings-store.js';

export const SESSION_REALTIME_CAPS = [1, 3, 5, 10, 20, 40] as const;
export type SessionRealtimeCap = (typeof SESSION_REALTIME_CAPS)[number];
export const DEFAULT_SESSION_MAX_MS = 60_000;
export const MIN_SESSION_MAX_MS = 10_000;
export const MAX_SESSION_MAX_MS = 300_000;
export const NXT_CAP20_PREVIEW_CAP = 20;
export const NXT_CAP20_SESSION_LIMIT_DESIGN = {
  maxAppliedTicks: 100,
  maxParsedTicks: 2000,
  maxSessionMs: 90_000,
} as const;
export const NXT_CAP40_SESSION_LIMIT_DESIGN = {
  maxAppliedTicks: 200,
  maxParsedTicks: 4000,
  maxSessionMs: 120_000,
} as const;

export type SessionEndReason =
  | 'time_limit_reached'
  | 'applied_tick_limit_reached'
  | 'parsed_tick_limit_reached'
  | 'operator_disabled'
  | null;

export type RealtimeOperatorState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'degraded'
  | 'disabled'
  | 'manual-disabled';

export interface RuntimeWsGates {
  readonly websocketEnabled: boolean;
  readonly applyTicksToPriceStore: boolean;
}

export interface RealtimeSessionState {
  readonly sessionRealtimeEnabled: boolean;
  readonly sessionApplyTicksToPriceStore: boolean;
  readonly sessionCap: number | null;
  readonly sessionSource: 'integrated';
  readonly sessionEnabledAt: string | null;
  readonly sessionTickers: readonly string[];
  readonly sessionMaxSessionMs: number;
  readonly sessionExpiresAt: string | null;
  readonly sessionMaxAppliedTicks: number | null;
  readonly sessionMaxParsedTicks: number | null;
  readonly sessionStartParsedTickCount: number;
  readonly sessionStartAppliedTickCount: number;
  readonly sessionStartLimitIgnoredCount: number;
  readonly sessionEndReason: SessionEndReason;
}

export interface RealtimeSessionGate {
  snapshot(): RealtimeSessionState;
  enable(input: {
    readonly cap: number;
    readonly tickers: readonly string[];
    readonly enabledAt?: string;
    readonly maxSessionMs?: number;
    readonly stats?: Pick<
      RealtimeBridgeStats,
      'parsedTickCount' | 'appliedTickCount' | 'sessionLimitIgnoredCount'
    >;
  }): RealtimeSessionState;
  disable(reason?: Exclude<SessionEndReason, null>): RealtimeSessionState;
  includesTicker(ticker: string): boolean;
}

export interface RealtimeOperatorStatus {
  readonly state: RealtimeOperatorState;
  readonly source: 'integrated';
  readonly enabledGates: RuntimeWsGates & {
    readonly canApplyTicksToPriceStore: boolean;
  };
  readonly subscribedTickerCount: number;
  readonly subscribedTickers: readonly string[];
  readonly reconnectAttempts: number;
  readonly nextReconnectAt: string | null;
  readonly lastConnectedAt: string | null;
  readonly lastTickAt: string | null;
  readonly parsedTickCount: number;
  readonly appliedTickCount: number;
  readonly ignoredStaleTickCount: number;
  readonly sessionLimitIgnoredCount: number;
  readonly parseErrorCount: number;
  readonly applyErrorCount: number;
  readonly approvalKey: {
    readonly status: ApprovalKeyState['status'] | 'unknown';
    readonly issuedAt: string | null;
  };
  readonly session: RealtimeSessionState;
}

export interface BuildRealtimeOperatorStatusInput {
  readonly wsStatus: WsClientStatus;
  readonly activeSubscriptions: readonly WsSubscription[];
  readonly gates: RuntimeWsGates;
  readonly session?: RealtimeSessionState;
  readonly stats: RealtimeBridgeStats;
  readonly approvalKeyState?: ApprovalKeyState;
}

export interface OperatorDisableDeps {
  readonly bridge: Pick<RealtimeBridge, 'disconnectAll'>;
  readonly pollingScheduler?: { stop(): Promise<void> | void };
  readonly settingsStore?: {
    snapshot(): Settings;
    save(settings: Settings): Promise<void> | void;
  };
}

export interface OperatorDisableOptions {
  readonly persistSettings?: boolean;
}

export interface OperatorDisableResult {
  readonly state: 'manual-disabled';
  readonly persistedSettingsChanged: boolean;
}

export type AutoStopReason =
  | 'operator_action'
  | 'auth_failure'
  | 'max_reconnect_attempts'
  | 'parse_error_rate'
  | 'apply_error_threshold'
  | 'no_tick_timeout'
  | null;

export interface AutoStopInput {
  readonly wsStatus: WsClientStatus;
  readonly nowMs: number;
  readonly lastTickAt: string | null;
  readonly parsedTickCount: number;
  readonly parseErrorCount: number;
  readonly consecutiveApplyErrorCount: number;
  readonly maxReconnectAttempts: number;
  readonly parseErrorRateThreshold: number;
  readonly applyErrorThreshold: number;
  readonly noTickTimeoutMs: number;
  readonly operatorDisabled?: boolean;
}

export interface AutoStopDecision {
  readonly state: RealtimeOperatorState;
  readonly reason: AutoStopReason;
  readonly reconnectAllowed: boolean;
  readonly pollingShouldContinue: true;
}

export interface NxtRolloutReadinessInput {
  readonly status: RealtimeOperatorStatus;
  readonly verifiedMaxRuntimeCap: number;
  readonly cap10UiPathVerified?: boolean;
  readonly cap10UiHardLimitVerified?: boolean;
  readonly cap10UiHardLimitConditional?: boolean;
  readonly statusEndpointAvailable: boolean;
  readonly statusPanelAvailable: boolean;
  readonly rolloutRunbookUpdated: boolean;
}

export interface NxtRolloutReadiness {
  readonly cap1Ready: boolean;
  readonly cap3Ready: boolean;
  readonly cap5Ready: boolean;
  readonly cap10RouteReady: boolean;
  readonly cap10UiPathReady: boolean;
  readonly cap10UiHardLimitReady: boolean;
  readonly cap10UiHardLimitConditional: boolean;
  readonly verifiedCaps: readonly number[];
  readonly nextCandidateCap: typeof NXT_CAP20_PREVIEW_CAP;
  readonly cap20Readiness: NxtCapReadiness;
  readonly cap40Readiness: NxtCapReadiness;
  readonly readyForCap20: boolean;
  readonly readyForCap40: boolean;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

export interface NxtCapReadiness {
  readonly status: 'not_ready' | 'verified';
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly sessionLimit?: {
    readonly maxAppliedTicks: number;
    readonly maxParsedTicks: number;
    readonly maxSessionMs: number;
  };
}

const DEFAULT_SESSION_STATE: RealtimeSessionState = {
  sessionRealtimeEnabled: false,
  sessionApplyTicksToPriceStore: false,
  sessionCap: null,
  sessionSource: 'integrated',
  sessionEnabledAt: null,
  sessionTickers: [],
  sessionMaxSessionMs: DEFAULT_SESSION_MAX_MS,
  sessionExpiresAt: null,
  sessionMaxAppliedTicks: null,
  sessionMaxParsedTicks: null,
  sessionStartParsedTickCount: 0,
  sessionStartAppliedTickCount: 0,
  sessionStartLimitIgnoredCount: 0,
  sessionEndReason: null,
};

const SESSION_TICK_LIMITS: Record<
  SessionRealtimeCap,
  { readonly maxAppliedTicks: number; readonly maxParsedTicks: number }
> = {
  1: { maxAppliedTicks: 5, maxParsedTicks: 100 },
  3: { maxAppliedTicks: 15, maxParsedTicks: 300 },
  5: { maxAppliedTicks: 25, maxParsedTicks: 500 },
  10: { maxAppliedTicks: 50, maxParsedTicks: 1000 },
  20: { maxAppliedTicks: 100, maxParsedTicks: 2000 },
  40: { maxAppliedTicks: 200, maxParsedTicks: 4000 },
};

const SESSION_MAX_MS_BY_CAP: Record<SessionRealtimeCap, number> = {
  1: DEFAULT_SESSION_MAX_MS,
  3: DEFAULT_SESSION_MAX_MS,
  5: DEFAULT_SESSION_MAX_MS,
  10: DEFAULT_SESSION_MAX_MS,
  20: 90_000,
  40: 120_000,
};

export function getSessionTickLimits(cap: number): {
  readonly maxAppliedTicks: number;
  readonly maxParsedTicks: number;
} {
  if (SESSION_REALTIME_CAPS.includes(cap as SessionRealtimeCap)) {
    return SESSION_TICK_LIMITS[cap as SessionRealtimeCap];
  }
  return SESSION_TICK_LIMITS[10];
}

export function clampSessionMaxMs(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_SESSION_MAX_MS;
  return Math.min(MAX_SESSION_MAX_MS, Math.max(MIN_SESSION_MAX_MS, Math.trunc(value)));
}

export function getDefaultSessionMaxMs(cap: number): number {
  if (SESSION_REALTIME_CAPS.includes(cap as SessionRealtimeCap)) {
    return SESSION_MAX_MS_BY_CAP[cap as SessionRealtimeCap];
  }
  return DEFAULT_SESSION_MAX_MS;
}

export function createRealtimeSessionGate(
  options: { readonly now?: () => string } = {},
): RealtimeSessionGate {
  const now = options.now ?? ((): string => new Date().toISOString());
  let state: RealtimeSessionState = DEFAULT_SESSION_STATE;

  return {
    snapshot(): RealtimeSessionState {
      return cloneSessionState(state);
    },
    enable(input): RealtimeSessionState {
      const enabledAt = input.enabledAt ?? now();
      const maxSessionMs = clampSessionMaxMs(
        input.maxSessionMs ?? getDefaultSessionMaxMs(input.cap),
      );
      const tickLimits = getSessionTickLimits(input.cap);
      const enabledAtMs = Date.parse(enabledAt);
      const expiresAt = Number.isFinite(enabledAtMs)
        ? new Date(enabledAtMs + maxSessionMs).toISOString()
        : null;
      state = {
        sessionRealtimeEnabled: true,
        sessionApplyTicksToPriceStore: true,
        sessionCap: input.cap,
        sessionSource: 'integrated',
        sessionEnabledAt: enabledAt,
        sessionTickers: [...input.tickers],
        sessionMaxSessionMs: maxSessionMs,
        sessionExpiresAt: expiresAt,
        sessionMaxAppliedTicks: tickLimits.maxAppliedTicks,
        sessionMaxParsedTicks: tickLimits.maxParsedTicks,
        sessionStartParsedTickCount: input.stats?.parsedTickCount ?? 0,
        sessionStartAppliedTickCount: input.stats?.appliedTickCount ?? 0,
        sessionStartLimitIgnoredCount: input.stats?.sessionLimitIgnoredCount ?? 0,
        sessionEndReason: null,
      };
      return cloneSessionState(state);
    },
    disable(reason = 'operator_disabled'): RealtimeSessionState {
      const previous = state;
      state = {
        ...previous,
        sessionRealtimeEnabled: false,
        sessionApplyTicksToPriceStore: false,
        sessionEndReason: previous.sessionEndReason ?? reason,
      };
      return cloneSessionState(state);
    },
    includesTicker(ticker: string): boolean {
      return state.sessionTickers.includes(ticker);
    },
  };
}

export function sessionLimitEndReason(
  session: RealtimeSessionState,
  stats: {
    readonly nowMs: number;
    readonly parsedTickCount: number;
    readonly appliedTickCount: number;
  },
): Exclude<SessionEndReason, 'operator_disabled'> {
  if (!session.sessionRealtimeEnabled) return null;
  const enabledAtMs =
    session.sessionEnabledAt !== null ? Date.parse(session.sessionEnabledAt) : NaN;
  if (
    Number.isFinite(enabledAtMs) &&
    stats.nowMs - enabledAtMs >= session.sessionMaxSessionMs
  ) {
    return 'time_limit_reached';
  }
  if (
    session.sessionMaxAppliedTicks !== null &&
    stats.appliedTickCount - session.sessionStartAppliedTickCount >=
      session.sessionMaxAppliedTicks
  ) {
    return 'applied_tick_limit_reached';
  }
  if (
    session.sessionMaxParsedTicks !== null &&
    stats.parsedTickCount - session.sessionStartParsedTickCount >=
      session.sessionMaxParsedTicks
  ) {
    return 'parsed_tick_limit_reached';
  }
  return null;
}

export function shouldApplyRuntimeWsTicks(
  gates: RuntimeWsGates,
  session: RealtimeSessionState = DEFAULT_SESSION_STATE,
  ticker?: string,
): boolean {
  const persistedGatesAllow =
    gates.websocketEnabled && gates.applyTicksToPriceStore;
  const sessionAllowsTicker =
    ticker === undefined || session.sessionTickers.includes(ticker);
  const sessionGatesAllow =
    session.sessionRealtimeEnabled &&
    session.sessionApplyTicksToPriceStore &&
    sessionAllowsTicker;
  return persistedGatesAllow || sessionGatesAllow;
}

export function sanitizeRealtimeStatusText(message: string): string {
  return message
    .replace(/approval[_-]?key[=:]\s*[^\s&"',}]+/gi, 'approval_key=[REDACTED]')
    .replace(/appkey[=:]\s*[^\s&"',}]+/gi, 'appkey=[REDACTED]')
    .replace(/appsecret[=:]\s*[^\s&"',}]+/gi, 'appsecret=[REDACTED]')
    .replace(/secretkey[=:]\s*[^\s&"',}]+/gi, 'secretkey=[REDACTED]')
    .replace(/access[_-]?token[=:]\s*[^\s&"',}]+/gi, 'access_token=[REDACTED]')
    .replace(/bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]');
}

export function buildRealtimeOperatorStatus(
  input: BuildRealtimeOperatorStatusInput,
): RealtimeOperatorStatus {
  const subscribedTickers = input.activeSubscriptions.map((sub) => sub.trKey);
  const session = input.session ?? DEFAULT_SESSION_STATE;
  const canApplyTicksToPriceStore = shouldApplyRuntimeWsTicks(
    input.gates,
    session,
  );
  return {
    state: mapWsState(input.wsStatus),
    source: 'integrated',
    enabledGates: {
      ...input.gates,
      canApplyTicksToPriceStore,
    },
    subscribedTickerCount: subscribedTickers.length,
    subscribedTickers,
    reconnectAttempts: input.wsStatus.reconnectAttempts,
    nextReconnectAt: input.wsStatus.nextReconnectAt,
    lastConnectedAt: input.wsStatus.lastConnectedAt,
    lastTickAt: input.stats.lastTickAt,
    parsedTickCount: input.stats.parsedTickCount,
    appliedTickCount: input.stats.appliedTickCount,
    ignoredStaleTickCount: input.stats.ignoredStaleTickCount,
    sessionLimitIgnoredCount: input.stats.sessionLimitIgnoredCount,
    parseErrorCount: input.stats.parseErrorCount,
    applyErrorCount: input.stats.applyErrorCount,
    approvalKey: summarizeApprovalKey(input.approvalKeyState),
    session: cloneSessionState(session),
  };
}

export function buildInactiveRealtimeOperatorStatus(
  gates: RuntimeWsGates,
  state: RealtimeOperatorState = 'disabled',
  session: RealtimeSessionState = DEFAULT_SESSION_STATE,
): RealtimeOperatorStatus {
  return {
    state,
    source: 'integrated',
    enabledGates: {
      ...gates,
      canApplyTicksToPriceStore: false,
    },
    subscribedTickerCount: 0,
    subscribedTickers: [],
    reconnectAttempts: 0,
    nextReconnectAt: null,
    lastConnectedAt: null,
    lastTickAt: null,
    parsedTickCount: 0,
    appliedTickCount: 0,
    ignoredStaleTickCount: 0,
    sessionLimitIgnoredCount: 0,
    parseErrorCount: 0,
    applyErrorCount: 0,
    approvalKey: { status: 'none', issuedAt: null },
    session: cloneSessionState(session),
  };
}

export function evaluateNxtRolloutReadiness(
  input: NxtRolloutReadinessInput,
): NxtRolloutReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const cap1Ready = input.verifiedMaxRuntimeCap >= 1;
  const cap3Ready = input.verifiedMaxRuntimeCap >= 3;
  const cap5Ready = input.verifiedMaxRuntimeCap >= 5;
  const cap10RouteReady = input.verifiedMaxRuntimeCap >= 10;
  const cap10UiPathReady = input.cap10UiPathVerified === true;
  const cap10UiHardLimitReady = input.cap10UiHardLimitVerified === true;
  const cap10UiHardLimitConditional =
    input.cap10UiHardLimitConditional === true &&
    cap10UiPathReady &&
    !cap10UiHardLimitReady;

  if (!input.statusEndpointAvailable) blockers.push('status_endpoint_missing');
  if (!input.statusPanelAvailable) blockers.push('status_panel_missing');
  if (!input.rolloutRunbookUpdated) blockers.push('rollout_runbook_stale');
  if (cap10UiHardLimitConditional) {
    warnings.push('cap10_ui_hard_limit_live_burst_not_observed');
  }
  const cap20Verified = input.verifiedMaxRuntimeCap >= 20;
  const cap40Verified = input.verifiedMaxRuntimeCap >= 40;

  if (!cap20Verified) {
    blockers.push('cap20_not_verified');
  }
  if (!cap40Verified) {
    blockers.push('cap40_not_verified');
  }
  const commonReady =
    input.statusEndpointAvailable &&
    input.statusPanelAvailable &&
    input.rolloutRunbookUpdated;

  const verifiedCaps = [
    ...(cap1Ready ? [1] : []),
    ...(cap3Ready ? [3] : []),
    ...(cap5Ready ? [5] : []),
    ...(cap10RouteReady && cap10UiPathReady && cap10UiHardLimitReady ? [10] : []),
    ...(cap20Verified ? [20] : []),
    ...(cap40Verified ? [40] : []),
  ];
  const cap20Readiness: NxtCapReadiness = {
    status: cap20Verified ? 'verified' : 'not_ready',
    blockers: cap20Verified
      ? []
      : [
          'cap20_live_smoke_not_performed',
          'operator_approval_required',
        ],
    warnings: cap20Verified
      ? []
      : [
          'requires_liquid_market_window',
          'do_not_enable_outside_explicit_live_smoke',
        ],
    sessionLimit: NXT_CAP20_SESSION_LIMIT_DESIGN,
  };
  const cap40Readiness: NxtCapReadiness = {
    status: cap40Verified ? 'verified' : 'not_ready',
    blockers: cap40Verified ? [] : ['cap40_not_validated'],
    warnings: cap40Verified ? [] : ['cap40_requires_cap20_stabilization_first'],
    sessionLimit: NXT_CAP40_SESSION_LIMIT_DESIGN,
  };

  return {
    cap1Ready,
    cap3Ready,
    cap5Ready,
    cap10RouteReady,
    cap10UiPathReady,
    cap10UiHardLimitReady,
    cap10UiHardLimitConditional,
    verifiedCaps,
    nextCandidateCap: NXT_CAP20_PREVIEW_CAP,
    cap20Readiness,
    cap40Readiness,
    readyForCap20: commonReady && cap20Readiness.status === 'verified',
    readyForCap40: commonReady && cap40Readiness.status === 'verified',
    blockers,
    warnings,
  };
}

export async function operatorDisableRealtimeRuntime(
  deps: OperatorDisableDeps,
  options: OperatorDisableOptions = {},
): Promise<OperatorDisableResult> {
  await deps.bridge.disconnectAll();

  if (options.persistSettings === true && deps.settingsStore !== undefined) {
    const current = deps.settingsStore.snapshot();
    await deps.settingsStore.save({
      ...current,
      websocketEnabled: false,
      applyTicksToPriceStore: false,
    });
  }

  return {
    state: 'manual-disabled',
    persistedSettingsChanged:
      options.persistSettings === true && deps.settingsStore !== undefined,
  };
}

export function decideRealtimeAutoStop(
  input: AutoStopInput,
): AutoStopDecision {
  if (input.operatorDisabled === true) {
    return manualDisabled('operator_action');
  }
  if (input.wsStatus.stopReason === 'auth_failure') {
    return disabled('auth_failure');
  }
  if (input.wsStatus.reconnectAttempts >= input.maxReconnectAttempts) {
    return disabled('max_reconnect_attempts');
  }
  if (input.consecutiveApplyErrorCount >= input.applyErrorThreshold) {
    return disabled('apply_error_threshold');
  }
  if (parseErrorRate(input) > input.parseErrorRateThreshold) {
    return degraded('parse_error_rate');
  }
  if (isNoTickTimedOut(input)) {
    return degraded('no_tick_timeout');
  }
  return {
    state: mapWsState(input.wsStatus),
    reason: null,
    reconnectAllowed: true,
    pollingShouldContinue: true,
  };
}

function mapWsState(wsStatus: WsClientStatus): RealtimeOperatorState {
  if (wsStatus.state === 'stopped') {
    return wsStatus.stopReason === 'manual' ? 'manual-disabled' : 'disabled';
  }
  return mapNonStoppedState(wsStatus.state);
}

function mapNonStoppedState(
  state: Exclude<WsConnectionState, 'stopped'>,
): RealtimeOperatorState {
  switch (state) {
    case 'idle':
    case 'connecting':
    case 'connected':
    case 'degraded':
      return state;
  }
}

function parseErrorRate(input: AutoStopInput): number {
  const total = input.parsedTickCount + input.parseErrorCount;
  if (total === 0) return 0;
  return input.parseErrorCount / total;
}

function isNoTickTimedOut(input: AutoStopInput): boolean {
  if (input.lastTickAt === null) return false;
  const lastTickMs = Date.parse(input.lastTickAt);
  if (!Number.isFinite(lastTickMs)) return false;
  return input.nowMs - lastTickMs > input.noTickTimeoutMs;
}

function summarizeApprovalKey(
  state: ApprovalKeyState | undefined,
): RealtimeOperatorStatus['approvalKey'] {
  if (state?.status === 'ready') {
    return { status: 'ready', issuedAt: state.issuedAt };
  }
  return {
    status: state?.status ?? 'unknown',
    issuedAt: null,
  };
}

function cloneSessionState(state: RealtimeSessionState): RealtimeSessionState {
  return {
    ...state,
    sessionTickers: [...state.sessionTickers],
  };
}

function degraded(reason: Exclude<AutoStopReason, null>): AutoStopDecision {
  return {
    state: 'degraded',
    reason,
    reconnectAllowed: true,
    pollingShouldContinue: true,
  };
}

function disabled(reason: Exclude<AutoStopReason, null>): AutoStopDecision {
  return {
    state: 'disabled',
    reason,
    reconnectAllowed: false,
    pollingShouldContinue: true,
  };
}

function manualDisabled(
  reason: Exclude<AutoStopReason, null>,
): AutoStopDecision {
  return {
    state: 'manual-disabled',
    reason,
    reconnectAllowed: false,
    pollingShouldContinue: true,
  };
}
