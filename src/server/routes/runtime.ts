import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';

import type { Favorite } from '@shared/types.js';
import type { KisRuntimeRef, KisRuntimeState } from '../bootstrap-kis.js';
import type { KisRuntime } from '../bootstrap-kis.js';
import type { CredentialStore } from '../credential-store.js';
import type { SettingsStore } from '../settings-store.js';
import {
  buildInactiveRealtimeOperatorStatus,
  buildRealtimeOperatorStatus,
  evaluateNxtRolloutReadiness,
  sanitizeRealtimeStatusText,
  sessionLimitEndReason,
  SESSION_REALTIME_CAPS,
  NXT_CAP20_PREVIEW_CAP,
  operatorDisableRealtimeRuntime,
  type RealtimeOperatorState,
  type RealtimeOperatorStatus,
  type RealtimeSessionState,
  type SessionRealtimeCap,
  type NxtCapReadiness,
} from '../realtime/runtime-operator.js';
import {
  computeTiers,
  previewRealtimeCandidates,
  type RealtimeCandidatePreview,
} from '../realtime/tier-manager.js';

export interface RuntimeRoutesOptions extends FastifyPluginOptions {
  runtimeRef: KisRuntimeRef;
  settingsStore: SettingsStore;
  credentialStore: CredentialStore;
}

export interface RuntimeRealtimeStatusPayload {
  readonly configured: boolean;
  readonly runtimeStatus: KisRuntimeState['status'];
  readonly state: RealtimeOperatorState;
  readonly source: 'integrated';
  readonly websocketEnabled: boolean;
  readonly applyTicksToPriceStore: boolean;
  readonly canApplyTicksToPriceStore: boolean;
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
  readonly approvalKey: RealtimeOperatorStatus['approvalKey'];
  readonly sessionRealtimeEnabled: boolean;
  readonly sessionApplyTicksToPriceStore: boolean;
  readonly sessionCap: number | null;
  readonly sessionSource: 'integrated';
  readonly sessionEnabledAt: string | null;
  readonly sessionTickers: readonly string[];
  readonly session: RuntimeRealtimeSessionPayload;
  readonly readiness: {
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
    readonly cap20Preview: RealtimeCandidatePreview;
    readonly cap40Readiness: NxtCapReadiness;
    readonly readyForCap20: boolean;
    readonly readyForCap40: boolean;
    readonly blockers: readonly string[];
    readonly warnings: readonly string[];
  };
  readonly runtimeError?: {
    readonly code: string;
    readonly message: string;
  };
}

export interface RuntimeRealtimeSessionPayload {
  readonly enabled: boolean;
  readonly applyEnabled: boolean;
  readonly cap: number | null;
  readonly source: 'integrated';
  readonly enabledAt: string | null;
  readonly tickers: readonly string[];
  readonly maxSessionMs: number;
  readonly expiresAt: string | null;
  readonly maxAppliedTicks: number | null;
  readonly maxParsedTicks: number | null;
  readonly parsedTickCountAtSessionStart: number;
  readonly appliedTickCountAtSessionStart: number;
  readonly sessionAppliedTickCount: number;
  readonly sessionParsedTickCount: number;
  readonly sessionLimitIgnoredCount: number;
  readonly parsedTickDelta: number;
  readonly appliedTickDelta: number;
  readonly endReason: RealtimeSessionState['sessionEndReason'];
}

const sessionEnableBodySchema = z.object({
  cap: z.number().int(),
  confirm: z.boolean(),
  maxSessionMs: z.number().int().optional(),
});

const sessionTimers = new WeakMap<KisRuntime, ReturnType<typeof setTimeout>>();

export async function runtimeRoutes(
  app: FastifyInstance,
  opts: RuntimeRoutesOptions,
): Promise<void> {
  app.get('/runtime/realtime/status', async (_request, reply) => {
    const configured = await isCredentialConfigured(opts.credentialStore);
    const runtimeState = opts.runtimeRef.get();
    const gates = opts.settingsStore.snapshot();

    if (runtimeState.status === 'started') {
      await enforceSessionLimits(runtimeState.runtime);
      const status = buildRealtimeOperatorStatus({
        wsStatus: runtimeState.runtime.wsClient.getStatus(),
        activeSubscriptions: runtimeState.runtime.wsClient.activeSubscriptions(),
        gates,
        session: runtimeState.runtime.sessionGate.snapshot(),
        stats: runtimeState.runtime.bridge.getStats(),
        approvalKeyState: runtimeState.runtime.approvalIssuer.getState(),
      });

      return reply.send({
        success: true,
        data: toPayload(
          configured,
          runtimeState.status,
          status,
          undefined,
          runtimeState.runtime.tierManager.listFavorites(),
        ),
      });
    }

    const state =
      runtimeState.status === 'starting' ? 'connecting' : 'disabled';
    const status = buildInactiveRealtimeOperatorStatus(gates, state);
    const runtimeError =
      runtimeState.status === 'failed'
        ? {
            code: runtimeState.error.code,
            message: sanitizeRealtimeStatusText(runtimeState.error.message),
          }
        : undefined;

    return reply.send({
      success: true,
      data: toPayload(configured, runtimeState.status, status, runtimeError),
    });
  });

  app.post<{ Body: z.infer<typeof sessionEnableBodySchema> }>(
    '/runtime/realtime/session-enable',
    async (request, reply) => {
      const parsed = sessionEnableBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_SESSION_ENABLE_BODY' },
        });
      }
      if (parsed.data.confirm !== true) {
        return reply.status(400).send({
          success: false,
          error: { code: 'CONFIRM_REQUIRED' },
        });
      }
      if (!isAllowedSessionCap(parsed.data.cap)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_SESSION_CAP',
            allowedCaps: SESSION_REALTIME_CAPS,
          },
        });
      }

      const runtimeState = opts.runtimeRef.get();
      if (runtimeState.status !== 'started') {
        return reply.status(503).send({
          success: false,
          error: {
            code: 'KIS_RUNTIME_NOT_READY',
            runtime: runtimeState.status,
          },
        });
      }

      const favorites = runtimeState.runtime.tierManager.listFavorites();
      const candidateTickers = computeTiers(favorites, [], parsed.data.cap)
        .realtimeTickers;
      if (candidateTickers.length === 0) {
        runtimeState.runtime.sessionGate.disable();
        return reply.send({
          success: true,
          data: {
            outcome: 'no_candidates',
            ...runtimeState.runtime.sessionGate.snapshot(),
          },
        });
      }

      const session = runtimeState.runtime.sessionGate.enable({
        cap: parsed.data.cap,
        tickers: candidateTickers,
        stats: runtimeState.runtime.bridge.getStats(),
        ...(parsed.data.maxSessionMs !== undefined
          ? { maxSessionMs: parsed.data.maxSessionMs }
          : {}),
      });

      try {
        await runtimeState.runtime.bridge.connect();
        await runtimeState.runtime.bridge.applyDiff({
          subscribe: candidateTickers,
          unsubscribe: [],
        });
        scheduleSessionTimer(runtimeState.runtime, session);
      } catch (err: unknown) {
        clearSessionTimer(runtimeState.runtime);
        try {
          await runtimeState.runtime.bridge.stopSession();
        } catch {
          // Keep the reported error focused on the enable failure.
        }
        runtimeState.runtime.sessionGate.disable();
        return reply.status(502).send({
          success: false,
          error: {
            code: 'REALTIME_SESSION_ENABLE_FAILED',
            message: sanitizeRealtimeStatusText(
              err instanceof Error ? err.message : String(err),
            ),
          },
        });
      }

      return reply.send({
        success: true,
        data: {
          outcome: 'enabled',
          ...session,
        },
      });
    },
  );

  app.post('/runtime/realtime/session-disable', async (_request, reply) => {
    const runtimeState = opts.runtimeRef.get();
    if (runtimeState.status !== 'started') {
      return reply.status(503).send({
        success: false,
        error: {
          code: 'KIS_RUNTIME_NOT_READY',
          runtime: runtimeState.status,
        },
      });
    }

    await runtimeState.runtime.bridge.stopSession();
    clearSessionTimer(runtimeState.runtime);
    const session = runtimeState.runtime.sessionGate.disable('operator_disabled');
    return reply.send({
      success: true,
      data: session,
    });
  });

  app.post('/runtime/realtime/emergency-disable', async (_request, reply) => {
    const runtimeState = opts.runtimeRef.get();
    if (runtimeState.status !== 'started') {
      const current = opts.settingsStore.snapshot();
      await opts.settingsStore.save({
        ...current,
        websocketEnabled: false,
        applyTicksToPriceStore: false,
      });
      return reply.send({
        success: true,
        data: {
          state: 'manual-disabled',
          persistedSettingsChanged: true,
        },
      });
    }

    const result = await operatorDisableRealtimeRuntime(
      {
        bridge: runtimeState.runtime.bridge,
        settingsStore: opts.settingsStore,
      },
      { persistSettings: true },
    );
    return reply.send({ success: true, data: result });
  });
}

async function isCredentialConfigured(
  credentialStore: CredentialStore,
): Promise<boolean> {
  try {
    return (await credentialStore.load()) !== null;
  } catch {
    return false;
  }
}

function toPayload(
  configured: boolean,
  runtimeStatus: KisRuntimeState['status'],
  status: RealtimeOperatorStatus,
  runtimeError?: RuntimeRealtimeStatusPayload['runtimeError'],
  favorites: readonly Favorite[] = [],
): RuntimeRealtimeStatusPayload {
  const readiness = evaluateNxtRolloutReadiness({
    status,
    verifiedMaxRuntimeCap: 40,
    cap10UiPathVerified: true,
    cap10UiHardLimitVerified: true,
    cap10UiHardLimitConditional: false,
    statusEndpointAvailable: true,
    statusPanelAvailable: true,
    rolloutRunbookUpdated: true,
  });
  return {
    configured,
    runtimeStatus,
    state: status.state,
    source: status.source,
    websocketEnabled: status.enabledGates.websocketEnabled,
    applyTicksToPriceStore: status.enabledGates.applyTicksToPriceStore,
    canApplyTicksToPriceStore: status.enabledGates.canApplyTicksToPriceStore,
    subscribedTickerCount: status.subscribedTickerCount,
    subscribedTickers: status.subscribedTickers,
    reconnectAttempts: status.reconnectAttempts,
    nextReconnectAt: status.nextReconnectAt,
    lastConnectedAt: status.lastConnectedAt,
    lastTickAt: status.lastTickAt,
    parsedTickCount: status.parsedTickCount,
    appliedTickCount: status.appliedTickCount,
    ignoredStaleTickCount: status.ignoredStaleTickCount,
    sessionLimitIgnoredCount: status.sessionLimitIgnoredCount,
    parseErrorCount: status.parseErrorCount,
    applyErrorCount: status.applyErrorCount,
    approvalKey: status.approvalKey,
    sessionRealtimeEnabled: status.session.sessionRealtimeEnabled,
    sessionApplyTicksToPriceStore:
      status.session.sessionApplyTicksToPriceStore,
    sessionCap: status.session.sessionCap,
    sessionSource: status.session.sessionSource,
    sessionEnabledAt: status.session.sessionEnabledAt,
    sessionTickers: status.session.sessionTickers,
    session: toSessionPayload(status.session, status),
    readiness: {
      ...readiness,
      cap20Preview: previewRealtimeCandidates({
        favorites,
        requestedCap: NXT_CAP20_PREVIEW_CAP,
      }),
    },
    ...(runtimeError !== undefined ? { runtimeError } : {}),
  };
}

async function enforceSessionLimits(runtime: KisRuntime): Promise<void> {
  const session = runtime.sessionGate.snapshot();
  const stats = runtime.bridge.getStats();
  const reason = sessionLimitEndReason(session, {
    nowMs: Date.now(),
    parsedTickCount: stats.parsedTickCount,
    appliedTickCount: stats.appliedTickCount,
  });
  if (reason === null) return;

  clearSessionTimer(runtime);
  runtime.sessionGate.disable(reason);
  await runtime.bridge.stopSession();
}

function scheduleSessionTimer(
  runtime: KisRuntime,
  session: RealtimeSessionState,
): void {
  clearSessionTimer(runtime);
  if (!session.sessionRealtimeEnabled || session.sessionExpiresAt === null) return;
  const delay = Math.max(0, Date.parse(session.sessionExpiresAt) - Date.now());
  const timer = setTimeout(() => {
    void enforceSessionLimits(runtime);
  }, delay);
  timer.unref?.();
  sessionTimers.set(runtime, timer);
}

function clearSessionTimer(runtime: KisRuntime): void {
  const timer = sessionTimers.get(runtime);
  if (timer === undefined) return;
  clearTimeout(timer);
  sessionTimers.delete(runtime);
}

function toSessionPayload(
  session: RealtimeSessionState,
  status: RealtimeOperatorStatus,
): RuntimeRealtimeSessionPayload {
  const sessionParsedTickCount = Math.max(
    0,
    status.parsedTickCount - session.sessionStartParsedTickCount,
  );
  const sessionAppliedTickCount = Math.max(
    0,
    status.appliedTickCount - session.sessionStartAppliedTickCount,
  );
  const sessionLimitIgnoredCount = Math.max(
    0,
    status.sessionLimitIgnoredCount - session.sessionStartLimitIgnoredCount,
  );
  return {
    enabled: session.sessionRealtimeEnabled,
    applyEnabled: session.sessionApplyTicksToPriceStore,
    cap: session.sessionCap,
    source: session.sessionSource,
    enabledAt: session.sessionEnabledAt,
    tickers: session.sessionTickers,
    maxSessionMs: session.sessionMaxSessionMs,
    expiresAt: session.sessionExpiresAt,
    maxAppliedTicks: session.sessionMaxAppliedTicks,
    maxParsedTicks: session.sessionMaxParsedTicks,
    parsedTickCountAtSessionStart: session.sessionStartParsedTickCount,
    appliedTickCountAtSessionStart: session.sessionStartAppliedTickCount,
    sessionAppliedTickCount,
    sessionParsedTickCount,
    sessionLimitIgnoredCount,
    parsedTickDelta: sessionParsedTickCount,
    appliedTickDelta: sessionAppliedTickCount,
    endReason: session.sessionEndReason,
  };
}

function isAllowedSessionCap(cap: number): cap is SessionRealtimeCap {
  return SESSION_REALTIME_CAPS.includes(cap as SessionRealtimeCap);
}
