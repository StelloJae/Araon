import { describe, expect, it, vi } from 'vitest';

import { WS_MAX_SUBSCRIPTIONS } from '@shared/kis-constraints.js';
import type {
  WsClientStatus,
  WsSubscription,
} from '../../kis/kis-ws-client.js';
import {
  DEFAULT_SETTINGS,
  settingsSchema,
  type Settings,
} from '../../settings-store.js';
import {
  buildRealtimeOperatorStatus,
  clampSessionMaxMs,
  createRealtimeSessionGate,
  decideRealtimeAutoStop,
  evaluateNxtRolloutReadiness,
  getDefaultSessionMaxMs,
  getSessionTickLimits,
  operatorDisableRealtimeRuntime,
  sanitizeRealtimeStatusText,
  sessionLimitEndReason,
  shouldApplyRuntimeWsTicks,
} from '../runtime-operator.js';

const baseSettings: Settings = {
  ...DEFAULT_SETTINGS,
  websocketEnabled: false,
  applyTicksToPriceStore: false,
};

function wsStatus(
  overrides: Partial<WsClientStatus> = {},
): WsClientStatus {
  return {
    state: 'idle',
    reconnectAttempts: 0,
    nextReconnectAt: null,
    lastConnectedAt: null,
    lastError: null,
    stopReason: null,
    ...overrides,
  };
}

function sub(ticker: string): WsSubscription {
  return { trId: 'H0UNCNT0', trKey: ticker };
}

describe('NXT5c runtime apply gates', () => {
  it('keeps realtime WebSocket apply gates off for fresh installs', () => {
    const legacy = {
      pollingCycleDelayMs: 1000,
      pollingMaxInFlight: 5,
      pollingMinStartGapMs: 125,
      pollingStartJitterMs: 20,
      rateLimiterMode: 'paper',
    };

    const parsed = settingsSchema.parse(legacy);

    expect(DEFAULT_SETTINGS.websocketEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.applyTicksToPriceStore).toBe(false);
    expect(parsed.websocketEnabled).toBe(false);
    expect(parsed.applyTicksToPriceStore).toBe(false);
  });

  it('requires websocketEnabled and applyTicksToPriceStore before applying ticks', () => {
    expect(shouldApplyRuntimeWsTicks(baseSettings)).toBe(false);
    expect(shouldApplyRuntimeWsTicks({
      ...baseSettings,
      websocketEnabled: true,
    })).toBe(false);
    expect(shouldApplyRuntimeWsTicks({
      ...baseSettings,
      websocketEnabled: true,
      applyTicksToPriceStore: true,
    })).toBe(true);
  });

  it('allows session-scoped apply only for selected realtime favorites', () => {
    const gate = createRealtimeSessionGate({
      now: () => '2026-04-28T02:00:00.000Z',
    });
    gate.enable({
      cap: 3,
      tickers: ['005930', '000660'],
    });

    expect(shouldApplyRuntimeWsTicks(baseSettings, gate.snapshot(), '005930')).toBe(true);
    expect(shouldApplyRuntimeWsTicks(baseSettings, gate.snapshot(), '042700')).toBe(false);
    expect(shouldApplyRuntimeWsTicks(baseSettings, gate.snapshot())).toBe(true);
  });

  it('turns off the session-scoped gate without touching persisted settings', () => {
    const gate = createRealtimeSessionGate({
      now: () => '2026-04-28T02:00:00.000Z',
    });
    gate.enable({
      cap: 5,
      tickers: ['005930'],
    });
    gate.disable();

    expect(gate.snapshot()).toMatchObject({
      sessionRealtimeEnabled: false,
      sessionApplyTicksToPriceStore: false,
      sessionCap: 5,
      sessionEnabledAt: '2026-04-28T02:00:00.000Z',
      sessionTickers: ['005930'],
      sessionEndReason: 'operator_disabled',
    });
  });

  it('preserves the first session end reason once a limit has closed the gate', () => {
    const gate = createRealtimeSessionGate();
    gate.enable({
      cap: 1,
      tickers: ['005930'],
    });

    gate.disable('applied_tick_limit_reached');
    gate.disable('operator_disabled');

    expect(gate.snapshot()).toMatchObject({
      sessionRealtimeEnabled: false,
      sessionEndReason: 'applied_tick_limit_reached',
    });
  });

  it('uses safe default session limits and cap-specific tick limits', () => {
    const gate = createRealtimeSessionGate({
      now: () => '2026-04-28T02:00:00.000Z',
    });

    const session = gate.enable({
      cap: 3,
      tickers: ['005930', '000660'],
      stats: {
        parsedTickCount: 10,
        appliedTickCount: 4,
      },
    });

    expect(getSessionTickLimits(1)).toEqual({
      maxAppliedTicks: 5,
      maxParsedTicks: 100,
    });
    expect(getSessionTickLimits(3)).toEqual({
      maxAppliedTicks: 15,
      maxParsedTicks: 300,
    });
    expect(getSessionTickLimits(20)).toEqual({
      maxAppliedTicks: 100,
      maxParsedTicks: 2000,
    });
    expect(getSessionTickLimits(40)).toEqual({
      maxAppliedTicks: 200,
      maxParsedTicks: 4000,
    });
    expect(getDefaultSessionMaxMs(10)).toBe(60_000);
    expect(getDefaultSessionMaxMs(20)).toBe(90_000);
    expect(getDefaultSessionMaxMs(40)).toBe(120_000);
    expect(clampSessionMaxMs(1)).toBe(10_000);
    expect(clampSessionMaxMs(999_999)).toBe(300_000);
    expect(session).toMatchObject({
      sessionRealtimeEnabled: true,
      sessionMaxSessionMs: 60_000,
      sessionExpiresAt: '2026-04-28T02:01:00.000Z',
      sessionMaxAppliedTicks: 15,
      sessionMaxParsedTicks: 300,
        sessionStartParsedTickCount: 10,
        sessionStartAppliedTickCount: 4,
        sessionStartLimitIgnoredCount: 0,
        sessionEndReason: null,
      });
  });

  it('uses longer default timeboxes for cap20 and cap40 sessions', () => {
    const gate = createRealtimeSessionGate({
      now: () => '2026-04-29T01:00:00.000Z',
    });

    const cap20 = gate.enable({ cap: 20, tickers: ['005930'] });
    expect(cap20).toMatchObject({
      sessionMaxSessionMs: 90_000,
      sessionExpiresAt: '2026-04-29T01:01:30.000Z',
      sessionMaxAppliedTicks: 100,
      sessionMaxParsedTicks: 2000,
    });

    const cap40 = gate.enable({ cap: 40, tickers: ['005930'] });
    expect(cap40).toMatchObject({
      sessionMaxSessionMs: 120_000,
      sessionExpiresAt: '2026-04-29T01:02:00.000Z',
      sessionMaxAppliedTicks: 200,
      sessionMaxParsedTicks: 4000,
    });
  });

  it('decides session end reasons from time, applied, and parsed limits', () => {
    const gate = createRealtimeSessionGate({
      now: () => '2026-04-28T02:00:00.000Z',
    });
    const session = gate.enable({
      cap: 1,
      tickers: ['005930'],
      maxSessionMs: 10_000,
      stats: {
        parsedTickCount: 100,
        appliedTickCount: 20,
      },
    });

    expect(sessionLimitEndReason(session, {
      nowMs: Date.parse('2026-04-28T02:00:11.000Z'),
      parsedTickCount: 101,
      appliedTickCount: 21,
    })).toBe('time_limit_reached');
    expect(sessionLimitEndReason(session, {
      nowMs: Date.parse('2026-04-28T02:00:01.000Z'),
      parsedTickCount: 101,
      appliedTickCount: 25,
    })).toBe('applied_tick_limit_reached');
    expect(sessionLimitEndReason(session, {
      nowMs: Date.parse('2026-04-28T02:00:01.000Z'),
      parsedTickCount: 200,
      appliedTickCount: 21,
    })).toBe('parsed_tick_limit_reached');
  });
});

describe('NXT5c operator status helper', () => {
  it('exposes diagnostics without approval key raw values', () => {
    const rawApprovalKey = [
      'raw-approval-key-that',
      'must-never-appear',
      '1234567890',
    ].join('-');

    const status = buildRealtimeOperatorStatus({
      wsStatus: wsStatus({
        state: 'connected',
        reconnectAttempts: 2,
        lastConnectedAt: '2026-04-27T09:00:00.000Z',
      }),
      activeSubscriptions: [sub('005930'), sub('000660')],
      gates: {
        websocketEnabled: true,
        applyTicksToPriceStore: false,
      },
      session: {
        sessionRealtimeEnabled: true,
        sessionApplyTicksToPriceStore: true,
        sessionCap: 3,
        sessionSource: 'integrated',
        sessionEnabledAt: '2026-04-28T02:00:00.000Z',
        sessionTickers: ['005930', '000660'],
        sessionMaxSessionMs: 60_000,
        sessionExpiresAt: '2026-04-28T02:01:00.000Z',
        sessionMaxAppliedTicks: 15,
        sessionMaxParsedTicks: 300,
        sessionStartParsedTickCount: 0,
        sessionStartAppliedTickCount: 0,
        sessionStartLimitIgnoredCount: 0,
        sessionEndReason: null,
      },
      stats: {
        parsedTickCount: 9,
        appliedTickCount: 3,
        ignoredStaleTickCount: 1,
        sessionLimitIgnoredCount: 2,
        parseErrorCount: 0,
        applyErrorCount: 0,
        lastTickAt: '2026-04-27T09:01:00.000Z',
      },
      approvalKeyState: {
        status: 'ready',
        issuedAt: '2026-04-27T08:59:00.000Z',
        approvalKey: rawApprovalKey,
      } as never,
    });

    expect(status).toMatchObject({
      state: 'connected',
      source: 'integrated',
      enabledGates: {
        websocketEnabled: true,
        applyTicksToPriceStore: false,
        canApplyTicksToPriceStore: true,
      },
      subscribedTickerCount: 2,
      subscribedTickers: ['005930', '000660'],
      reconnectAttempts: 2,
      parsedTickCount: 9,
      appliedTickCount: 3,
      ignoredStaleTickCount: 1,
      sessionLimitIgnoredCount: 2,
      approvalKey: {
        status: 'ready',
        issuedAt: '2026-04-27T08:59:00.000Z',
      },
      session: {
        sessionRealtimeEnabled: true,
        sessionCap: 3,
        sessionTickers: ['005930', '000660'],
      },
    });
    expect(JSON.stringify(status)).not.toContain(rawApprovalKey);
  });

  it('sanitizes credential-like upstream text before status surfaces use it', () => {
    const approvalValue = ['rawapprovalkey', '1234567890', '1234567890'].join('');
    const secretValue = ['rawsecret', '1234567890', '1234567890'].join('');
    const tokenValue = ['rawtoken', '1234567890', '1234567890'].join('');
    const text = sanitizeRealtimeStatusText(
      `approval_key=${approvalValue} appsecret=${secretValue} Bearer ${tokenValue}`,
    );

    expect(text).toContain('[REDACTED]');
    expect(text).not.toContain('rawapprovalkey');
    expect(text).not.toContain('rawsecret');
    expect(text).not.toContain('rawtoken');
  });

  it('does not mark cap20 or cap40 ready from cap10-only evidence', () => {
    const status = buildRealtimeOperatorStatus({
      wsStatus: wsStatus(),
      activeSubscriptions: [],
      gates: baseSettings,
      stats: {
        parsedTickCount: 0,
        appliedTickCount: 0,
        ignoredStaleTickCount: 0,
        sessionLimitIgnoredCount: 0,
        parseErrorCount: 0,
        applyErrorCount: 0,
        lastTickAt: null,
      },
      approvalKeyState: { status: 'none' },
    });

    const readiness = evaluateNxtRolloutReadiness({
      status,
      verifiedMaxRuntimeCap: 10,
      cap10UiPathVerified: true,
      cap10UiHardLimitVerified: false,
      cap10UiHardLimitConditional: true,
      statusEndpointAvailable: true,
      statusPanelAvailable: true,
      rolloutRunbookUpdated: true,
    });

    expect(readiness.cap1Ready).toBe(true);
    expect(readiness.cap3Ready).toBe(true);
    expect(readiness.cap5Ready).toBe(true);
    expect(readiness.cap10RouteReady).toBe(true);
    expect(readiness.cap10UiPathReady).toBe(true);
    expect(readiness.cap10UiHardLimitReady).toBe(false);
    expect(readiness.cap10UiHardLimitConditional).toBe(true);
    expect(readiness.readyForCap20).toBe(false);
    expect(readiness.readyForCap40).toBe(false);
    expect(readiness.warnings).toContain(
      'cap10_ui_hard_limit_live_burst_not_observed',
    );
    expect(readiness.blockers).toContain('cap20_not_verified');
    expect(readiness.blockers).toContain('cap40_not_verified');
  });

  it('marks cap10 UI hard-limit ready without enabling cap20 or cap40', () => {
    const status = buildRealtimeOperatorStatus({
      wsStatus: wsStatus(),
      activeSubscriptions: [],
      gates: baseSettings,
      stats: {
        parsedTickCount: 179,
        appliedTickCount: 50,
        ignoredStaleTickCount: 129,
        sessionLimitIgnoredCount: 0,
        parseErrorCount: 0,
        applyErrorCount: 0,
        lastTickAt: '2026-04-29T00:14:21.689Z',
      },
      approvalKeyState: { status: 'ready', issuedAt: '2026-04-29T00:14:19.356Z' },
    });

    const readiness = evaluateNxtRolloutReadiness({
      status,
      verifiedMaxRuntimeCap: 10,
      cap10UiPathVerified: true,
      cap10UiHardLimitVerified: true,
      cap10UiHardLimitConditional: false,
      statusEndpointAvailable: true,
      statusPanelAvailable: true,
      rolloutRunbookUpdated: true,
    });

    expect(readiness.cap10RouteReady).toBe(true);
    expect(readiness.cap10UiPathReady).toBe(true);
    expect(readiness.cap10UiHardLimitReady).toBe(true);
    expect(readiness.cap10UiHardLimitConditional).toBe(false);
    expect(readiness.verifiedCaps).toEqual([1, 3, 5, 10]);
    expect(readiness.nextCandidateCap).toBe(20);
    expect(readiness.cap20Readiness).toMatchObject({
      status: 'not_ready',
      blockers: [
        'cap20_live_smoke_not_performed',
        'operator_approval_required',
      ],
      warnings: [
        'requires_liquid_market_window',
        'do_not_enable_outside_explicit_live_smoke',
      ],
      sessionLimit: {
        maxAppliedTicks: 100,
        maxParsedTicks: 2000,
        maxSessionMs: 90_000,
      },
    });
    expect(readiness.cap40Readiness).toMatchObject({
      status: 'not_ready',
      blockers: ['cap40_not_validated'],
    });
    expect(readiness.warnings).not.toContain(
      'cap10_ui_hard_limit_live_burst_not_observed',
    );
    expect(readiness.readyForCap20).toBe(false);
    expect(readiness.readyForCap40).toBe(false);
    expect(readiness.blockers).toContain('cap20_not_verified');
    expect(readiness.blockers).toContain('cap40_not_verified');
  });

  it('marks cap20 and cap40 verified only when the verified runtime cap reaches 40', () => {
    const status = buildRealtimeOperatorStatus({
      wsStatus: wsStatus(),
      activeSubscriptions: [],
      gates: baseSettings,
      stats: {
        parsedTickCount: 0,
        appliedTickCount: 0,
        ignoredStaleTickCount: 0,
        sessionLimitIgnoredCount: 0,
        parseErrorCount: 0,
        applyErrorCount: 0,
        lastTickAt: null,
      },
      approvalKeyState: { status: 'none' },
    });

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

    expect(readiness.verifiedCaps).toEqual([1, 3, 5, 10, 20, 40]);
    expect(readiness.cap20Readiness.status).toBe('verified');
    expect(readiness.cap40Readiness.status).toBe('verified');
    expect(readiness.readyForCap20).toBe(true);
    expect(readiness.readyForCap40).toBe(true);
  });
});

describe('NXT5c operator action', () => {
  it('disconnects realtime only without stopping polling or persisting settings by default', async () => {
    const bridge = {
      disconnectAll: vi.fn(async () => undefined),
    };
    const pollingScheduler = {
      stop: vi.fn(async () => undefined),
    };
    const settingsStore = {
      snapshot: vi.fn(() => ({
        ...baseSettings,
        websocketEnabled: true,
        applyTicksToPriceStore: true,
      })),
      save: vi.fn(async (_settings: Settings) => undefined),
    };

    const result = await operatorDisableRealtimeRuntime({
      bridge,
      pollingScheduler,
      settingsStore,
    });

    expect(result).toEqual({
      state: 'manual-disabled',
      persistedSettingsChanged: false,
    });
    expect(bridge.disconnectAll).toHaveBeenCalledTimes(1);
    expect(pollingScheduler.stop).not.toHaveBeenCalled();
    expect(settingsStore.save).not.toHaveBeenCalled();
  });

  it('can persist an operator rollback by turning off both runtime gates', async () => {
    const bridge = {
      disconnectAll: vi.fn(async () => undefined),
    };
    const settingsStore = {
      snapshot: vi.fn(() => ({
        ...baseSettings,
        websocketEnabled: true,
        applyTicksToPriceStore: true,
      })),
      save: vi.fn(async (_settings: Settings) => undefined),
    };

    const result = await operatorDisableRealtimeRuntime({
      bridge,
      settingsStore,
    }, { persistSettings: true });

    expect(result.persistedSettingsChanged).toBe(true);
    expect(settingsStore.save).toHaveBeenCalledWith(expect.objectContaining({
      websocketEnabled: false,
      applyTicksToPriceStore: false,
    }));
  });
});

describe('NXT5c auto-stop helper', () => {
  const baseDecisionInput = {
    wsStatus: wsStatus(),
    nowMs: Date.parse('2026-04-27T09:02:00.000Z'),
    lastTickAt: '2026-04-27T09:01:30.000Z',
    parsedTickCount: 100,
    parseErrorCount: 0,
    consecutiveApplyErrorCount: 0,
    maxReconnectAttempts: 5,
    parseErrorRateThreshold: 0.2,
    applyErrorThreshold: 3,
    noTickTimeoutMs: 60_000,
  };

  it('disables without reconnect on auth_failure', () => {
    const decision = decideRealtimeAutoStop({
      ...baseDecisionInput,
      wsStatus: wsStatus({
        state: 'stopped',
        stopReason: 'auth_failure',
      }),
    });

    expect(decision).toMatchObject({
      state: 'disabled',
      reason: 'auth_failure',
      reconnectAllowed: false,
      pollingShouldContinue: true,
    });
  });

  it('maps threshold breaches to degraded or disabled without stopping polling', () => {
    expect(decideRealtimeAutoStop({
      ...baseDecisionInput,
      parseErrorCount: 26,
    })).toMatchObject({
      state: 'degraded',
      reason: 'parse_error_rate',
      pollingShouldContinue: true,
    });

    expect(decideRealtimeAutoStop({
      ...baseDecisionInput,
      consecutiveApplyErrorCount: 3,
    })).toMatchObject({
      state: 'disabled',
      reason: 'apply_error_threshold',
      pollingShouldContinue: true,
    });

    expect(decideRealtimeAutoStop({
      ...baseDecisionInput,
      lastTickAt: '2026-04-27T09:00:00.000Z',
    })).toMatchObject({
      state: 'degraded',
      reason: 'no_tick_timeout',
      pollingShouldContinue: true,
    });

    expect(decideRealtimeAutoStop({
      ...baseDecisionInput,
      operatorDisabled: true,
    })).toMatchObject({
      state: 'manual-disabled',
      reason: 'operator_action',
      pollingShouldContinue: true,
    });
  });

  it('disables when reconnect attempts reach the hard cap', () => {
    const decision = decideRealtimeAutoStop({
      ...baseDecisionInput,
      wsStatus: wsStatus({
        state: 'degraded',
        reconnectAttempts: 5,
      }),
    });

    expect(decision).toMatchObject({
      state: 'disabled',
      reason: 'max_reconnect_attempts',
      reconnectAllowed: false,
    });
  });

  it('keeps the hard subscription ceiling at the KIS WebSocket cap', () => {
    expect(WS_MAX_SUBSCRIPTIONS).toBe(40);
  });
});
