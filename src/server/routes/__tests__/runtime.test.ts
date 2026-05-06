import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

import type { KisRuntime, KisRuntimeRef } from '../../bootstrap-kis.js';
import type { CredentialStore } from '../../credential-store.js';
import {
  DEFAULT_SETTINGS,
  type Settings,
  type SettingsStore,
} from '../../settings-store.js';
import {
  createRealtimeSessionGate,
  type RealtimeSessionGate,
} from '../../realtime/runtime-operator.js';
import { runtimeRoutes } from '../runtime.js';

function settingsStore(overrides: Partial<Settings> = {}): SettingsStore {
  const snapshot = {
    ...DEFAULT_SETTINGS,
    ...overrides,
  };
  return {
    load: vi.fn(async () => snapshot),
    save: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined),
    snapshot: vi.fn(() => snapshot),
  };
}

function credentialStore(configured: boolean): CredentialStore {
  return {
    load: vi.fn(async () =>
      configured
        ? {
            credentials: {
              appKey: 'app-key-placeholder',
              appSecret: 'app-secret-placeholder',
              isPaper: false,
            },
          }
        : null,
    ),
    saveCredentials: vi.fn(async () => undefined),
    saveToken: vi.fn(async () => undefined),
    clearToken: vi.fn(async () => undefined),
    clearCredentials: vi.fn(async () => undefined),
  };
}

function runtimeRef(state: ReturnType<KisRuntimeRef['get']>): KisRuntimeRef {
  return {
    get: vi.fn(() => state),
    start: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  };
}

function startedRuntime(
  overrides: {
    favorites?: Array<{ ticker: string; tier: 'realtime' | 'polling'; addedAt: string }>;
    bridge?: {
      connect?: ReturnType<typeof vi.fn>;
      applyDiff?: ReturnType<typeof vi.fn>;
      disconnectAll?: ReturnType<typeof vi.fn>;
      stopSession?: ReturnType<typeof vi.fn>;
      getStats?: ReturnType<typeof vi.fn>;
    };
    pollingStop?: ReturnType<typeof vi.fn>;
    sessionGate?: RealtimeSessionGate;
  } = {},
): KisRuntime {
  const bridge = {
    connect: overrides.bridge?.connect ?? vi.fn(async () => undefined),
    applyDiff: overrides.bridge?.applyDiff ?? vi.fn(async () => undefined),
    disconnectAll: overrides.bridge?.disconnectAll ?? vi.fn(async () => undefined),
    stopSession: overrides.bridge?.stopSession ?? vi.fn(async () => undefined),
    getStats: overrides.bridge?.getStats ?? vi.fn(() => ({
      parsedTickCount: 0,
      appliedTickCount: 0,
      ignoredStaleTickCount: 0,
      sessionLimitIgnoredCount: 0,
      parseErrorCount: 0,
      applyErrorCount: 0,
      lastTickAt: null,
    })),
  };
  return {
    bridge,
    tierManager: {
      listFavorites: vi.fn(() => overrides.favorites ?? []),
    },
    sessionGate: overrides.sessionGate ?? createRealtimeSessionGate(),
    settingsStore: undefined,
    pollingScheduler: {
      stop: overrides.pollingStop ?? vi.fn(async () => undefined),
    },
    wsClient: {
      getStatus: vi.fn(() => ({
        state: 'idle',
        reconnectAttempts: 0,
        nextReconnectAt: null,
        lastConnectedAt: null,
        lastError: null,
        stopReason: null,
      })),
      activeSubscriptions: vi.fn(() => []),
    },
    approvalIssuer: {
      getState: vi.fn(() => ({ status: 'none' })),
    },
  } as unknown as KisRuntime;
}

async function build(
  opts: {
    runtimeRef: KisRuntimeRef;
    settingsStore?: SettingsStore;
    credentialStore?: CredentialStore;
    stockRepo?: { findAll(): Array<{ ticker: string; name: string; market: 'KOSPI' | 'KOSDAQ' }> };
    favoriteRepo?: { findAll(): Array<{ ticker: string; tier: 'realtime' | 'polling'; addedAt: string }> };
    candleRepo?: { summarizeCoverage(): Array<{ interval: '1m' | '1d'; tickerCount: number; candleCount: number; newestBucketAt: string | null }> };
    priceStore?: { getAllPrices(): Array<{ ticker: string; price: number; changeRate: number; volume: number; updatedAt: string; isSnapshot: boolean; volumeBaselineStatus?: 'ready' | 'collecting' | 'unavailable' }> };
    backfillStateStore?: { load(): Promise<{ budgetDateKey: string | null; dailyCallCount: number; cooldownUntilMs: number }>; save(): Promise<void>; snapshot(): { budgetDateKey: string | null; dailyCallCount: number; cooldownUntilMs: number } };
  },
) {
  const app = Fastify({ logger: false });
  await app.register(runtimeRoutes, {
    runtimeRef: opts.runtimeRef,
    settingsStore: opts.settingsStore ?? settingsStore(),
    credentialStore: opts.credentialStore ?? credentialStore(true),
    stockRepo: opts.stockRepo,
    favoriteRepo: opts.favoriteRepo,
    candleRepo: opts.candleRepo,
    priceStore: opts.priceStore,
    backfillStateStore: opts.backfillStateStore,
  });
  return app;
}

describe('GET /runtime/data-health', () => {
  it('summarizes tracking, candle coverage, backfill budget, and volume baselines safely', async () => {
    const app = await build({
      runtimeRef: runtimeRef({ status: 'unconfigured' }),
      settingsStore: settingsStore({
        backgroundDailyBackfillEnabled: true,
        backgroundDailyBackfillRange: '3m',
      }),
      stockRepo: {
        findAll: vi.fn(() => [
          { ticker: '005930', name: '삼성전자', market: 'KOSPI' },
          { ticker: '000660', name: 'SK하이닉스', market: 'KOSPI' },
        ]),
      },
      favoriteRepo: {
        findAll: vi.fn(() => [
          { ticker: '005930', tier: 'realtime', addedAt: '2026-05-06T00:00:00.000Z' },
        ]),
      },
      candleRepo: {
        summarizeCoverage: vi.fn(() => [
          { interval: '1m', tickerCount: 1, candleCount: 120, newestBucketAt: '2026-05-06T06:30:00.000Z' },
          { interval: '1d', tickerCount: 2, candleCount: 40, newestBucketAt: '2026-05-05T15:00:00.000Z' },
        ]),
      },
      priceStore: {
        getAllPrices: vi.fn(() => [
          { ticker: '005930', price: 70_000, changeRate: 1, volume: 1, updatedAt: '2026-05-06T06:30:00.000Z', isSnapshot: false, volumeBaselineStatus: 'ready' },
          { ticker: '000660', price: 140_000, changeRate: 2, volume: 1, updatedAt: '2026-05-06T06:30:00.000Z', isSnapshot: false, volumeBaselineStatus: 'collecting' },
        ]),
      },
      backfillStateStore: {
        load: vi.fn(async () => ({
          budgetDateKey: '2026-05-06',
          dailyCallCount: 4,
          cooldownUntilMs: 0,
        })),
        save: vi.fn(async () => undefined),
        snapshot: vi.fn(() => ({ budgetDateKey: '2026-05-06', dailyCallCount: 4, cooldownUntilMs: 0 })),
      },
    });

    const res = await app.inject({ method: 'GET', url: '/runtime/data-health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: {
        tracking: { trackedCount: 2, favoriteCount: 1 },
        candles: [
          { interval: '1m', tickerCount: 1, candleCount: 120, newestBucketAt: '2026-05-06T06:30:00.000Z' },
          { interval: '1d', tickerCount: 2, candleCount: 40, newestBucketAt: '2026-05-05T15:00:00.000Z' },
        ],
        backfill: {
          enabled: true,
          range: '3m',
          budgetDateKey: '2026-05-06',
          dailyCallCount: 4,
          cooldownUntil: null,
          cooldownActive: false,
        },
        volumeBaseline: {
          total: 2,
          ready: 1,
          collecting: 1,
          unavailable: 0,
        },
      },
    });
  });
});

describe('GET /runtime/realtime/status', () => {
  it('returns a safe disabled status when KIS runtime is not started', async () => {
    const app = await build({
      runtimeRef: runtimeRef({ status: 'unconfigured' }),
      credentialStore: credentialStore(false),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/runtime/realtime/status',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        configured: false,
        runtimeStatus: 'unconfigured',
        state: 'disabled',
        source: 'integrated',
        websocketEnabled: true,
        applyTicksToPriceStore: true,
        canApplyTicksToPriceStore: false,
        subscribedTickerCount: 0,
        subscribedTickers: [],
        reconnectAttempts: 0,
        lastConnectedAt: null,
        lastTickAt: null,
        parsedTickCount: 0,
        appliedTickCount: 0,
        ignoredStaleTickCount: 0,
        sessionLimitIgnoredCount: 0,
        parseErrorCount: 0,
        applyErrorCount: 0,
        approvalKey: { status: 'none', issuedAt: null },
      }),
    });
  });

  it('returns started runtime counters without raw approval key material', async () => {
    const rawApprovalKey = [
      'rawapprovalkey',
      '1234567890',
      '1234567890',
      '1234567890',
    ].join('');
    const runtime = {
      wsClient: {
        getStatus: vi.fn(() => ({
          state: 'connected',
          reconnectAttempts: 1,
          nextReconnectAt: null,
          lastConnectedAt: '2026-04-28T01:00:00.000Z',
          lastError: null,
          stopReason: null,
        })),
        activeSubscriptions: vi.fn(() => [
          { trId: 'H0UNCNT0', trKey: '005930' },
        ]),
      },
      bridge: {
        getStats: vi.fn(() => ({
          parsedTickCount: 12,
          appliedTickCount: 6,
          ignoredStaleTickCount: 4,
          sessionLimitIgnoredCount: 2,
          parseErrorCount: 1,
          applyErrorCount: 0,
          lastTickAt: '2026-04-28T01:00:05.000Z',
        })),
      },
      approvalIssuer: {
        getState: vi.fn(() => ({
          status: 'ready',
          issuedAt: '2026-04-28T00:59:00.000Z',
          approvalKey: rawApprovalKey,
        })),
      },
      sessionGate: createRealtimeSessionGate(),
      tierManager: {
        listFavorites: vi.fn(() => Array.from({ length: 7 }, (_, i) => ({
          ticker: String(i + 1).padStart(6, '0'),
          tier: 'realtime' as const,
          addedAt: `2026-04-28T01:0${i}:00.000Z`,
        }))),
      },
    } as unknown as KisRuntime;
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
      settingsStore: settingsStore({
        websocketEnabled: true,
        applyTicksToPriceStore: true,
      }),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/runtime/realtime/status',
    });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.data).toMatchObject({
      configured: true,
      runtimeStatus: 'started',
      state: 'connected',
      websocketEnabled: true,
      applyTicksToPriceStore: true,
      subscribedTickerCount: 1,
      subscribedTickers: ['005930'],
      reconnectAttempts: 1,
      parsedTickCount: 12,
      appliedTickCount: 6,
      ignoredStaleTickCount: 4,
      sessionLimitIgnoredCount: 2,
      parseErrorCount: 1,
      applyErrorCount: 0,
      approvalKey: {
        status: 'ready',
        issuedAt: '2026-04-28T00:59:00.000Z',
      },
      readiness: {
        cap1Ready: true,
        cap3Ready: true,
        cap5Ready: true,
        cap10RouteReady: true,
        cap10UiPathReady: true,
        cap10UiHardLimitReady: true,
        cap10UiHardLimitConditional: false,
        readyForCap20: true,
        readyForCap40: true,
        verifiedCaps: [1, 3, 5, 10, 20, 40],
        nextCandidateCap: 20,
        cap20Readiness: expect.objectContaining({
          status: 'verified',
          blockers: [],
          warnings: [],
        }),
        cap20Preview: {
          requestedCap: 20,
          effectiveCap: 20,
          candidateCount: 7,
          shortage: 13,
          tickers: [
            '000001',
            '000002',
            '000003',
            '000004',
            '000005',
            '000006',
            '000007',
          ],
          usesFavoritesOnly: true,
        },
        cap40Readiness: expect.objectContaining({
          status: 'verified',
          blockers: [],
          warnings: [],
        }),
      },
    });
    expect(body.data.readiness.warnings).not.toContain(
      'cap10_ui_hard_limit_live_burst_not_observed',
    );
    expect(body.data.readiness.blockers).not.toContain('cap20_not_verified');
    expect(body.data.readiness.blockers).not.toContain('cap40_not_verified');
    expect(JSON.stringify(body)).not.toContain(rawApprovalKey);
  });

  it('sanitizes failed runtime error text in the status response', async () => {
    const secretLike = `secretkey=${[
      'rawsecret',
      '1234567890',
      '1234567890',
    ].join('')}`;
    const app = await build({
      runtimeRef: runtimeRef({
        status: 'failed',
        error: {
          code: 'KIS_START_FAILED',
          message: `upstream rejected ${secretLike}`,
        },
      }),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/runtime/realtime/status',
    });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.data.runtimeError.message).toContain('[REDACTED]');
    expect(JSON.stringify(body)).not.toContain('rawsecret');
  });

  it('returns session gate state in the status response', async () => {
    const enabledAt = new Date(Date.now() + 60_000).toISOString();
    const expiresAt = new Date(Date.parse(enabledAt) + 60_000).toISOString();
    const sessionGate = createRealtimeSessionGate({
      now: () => enabledAt,
    });
    sessionGate.enable({
      cap: 3,
      tickers: ['005930', '000660'],
    });
    const runtime = startedRuntime({ sessionGate });
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/runtime/realtime/status',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      sessionRealtimeEnabled: true,
      sessionApplyTicksToPriceStore: true,
      sessionCap: 3,
      sessionSource: 'integrated',
      sessionEnabledAt: enabledAt,
      sessionTickers: ['005930', '000660'],
      session: expect.objectContaining({
        enabled: true,
        cap: 3,
        maxSessionMs: 60000,
        expiresAt,
        maxAppliedTicks: 15,
        maxParsedTicks: 300,
        parsedTickCountAtSessionStart: 0,
        appliedTickCountAtSessionStart: 0,
        sessionParsedTickCount: 0,
        sessionAppliedTickCount: 0,
        sessionLimitIgnoredCount: 0,
        endReason: null,
      }),
    });
  });

  it('auto-disables and disconnects when applied tick session limit is reached', async () => {
    const stopSession = vi.fn(async () => undefined);
    const pollingStop = vi.fn(async () => undefined);
    const sessionGate = createRealtimeSessionGate({
      now: () => '2026-04-28T02:00:00.000Z',
    });
    sessionGate.enable({
      cap: 1,
      tickers: ['005930'],
      enabledAt: new Date().toISOString(),
      stats: {
        parsedTickCount: 10,
        appliedTickCount: 20,
      },
    });
    const runtime = startedRuntime({
      sessionGate,
      pollingStop,
      bridge: {
        stopSession,
        getStats: vi.fn(() => ({
          parsedTickCount: 12,
          appliedTickCount: 25,
          ignoredStaleTickCount: 0,
          sessionLimitIgnoredCount: 3,
          parseErrorCount: 0,
          applyErrorCount: 0,
          lastTickAt: '2026-04-28T02:00:01.000Z',
        })),
      },
    });
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/runtime/realtime/status',
    });

    expect(res.statusCode).toBe(200);
    expect(stopSession).toHaveBeenCalledTimes(1);
    expect(pollingStop).not.toHaveBeenCalled();
    expect(res.json().data).toMatchObject({
      sessionRealtimeEnabled: false,
      session: expect.objectContaining({
        enabled: false,
        parsedTickCountAtSessionStart: 10,
        appliedTickCountAtSessionStart: 20,
        sessionParsedTickCount: 2,
        sessionAppliedTickCount: 5,
        sessionLimitIgnoredCount: 3,
        endReason: 'applied_tick_limit_reached',
      }),
      subscribedTickerCount: 0,
    });
  });

  it.each([
    {
      label: 'parsed tick',
      reason: 'parsed_tick_limit_reached',
      enabledAt: () => new Date().toISOString(),
      stats: {
        parsedTickCount: 100,
        appliedTickCount: 0,
        ignoredStaleTickCount: 0,
        sessionLimitIgnoredCount: 0,
        parseErrorCount: 0,
        applyErrorCount: 0,
        lastTickAt: '2026-04-28T02:00:01.000Z',
      },
    },
    {
      label: 'time',
      reason: 'time_limit_reached',
      enabledAt: () => new Date(Date.now() - 11_000).toISOString(),
      stats: {
        parsedTickCount: 1,
        appliedTickCount: 0,
        ignoredStaleTickCount: 0,
        sessionLimitIgnoredCount: 0,
        parseErrorCount: 0,
        applyErrorCount: 0,
        lastTickAt: '2026-04-28T02:00:01.000Z',
      },
    },
  ])('auto-disables and disconnects when $label session limit is reached', async (input) => {
    const stopSession = vi.fn(async () => undefined);
    const sessionGate = createRealtimeSessionGate();
    sessionGate.enable({
      cap: 1,
      tickers: ['005930'],
      enabledAt: input.enabledAt(),
      maxSessionMs: 10_000,
      stats: {
        parsedTickCount: 0,
        appliedTickCount: 0,
      },
    });
    const runtime = startedRuntime({
      sessionGate,
      bridge: {
        stopSession,
        getStats: vi.fn(() => input.stats),
      },
    });
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/runtime/realtime/status',
    });

    expect(res.statusCode).toBe(200);
    expect(stopSession).toHaveBeenCalledTimes(1);
    expect(res.json().data.session).toMatchObject({
      enabled: false,
      endReason: input.reason,
    });
  });
});

describe('POST /runtime/realtime/session-enable', () => {
  it('requires explicit confirmation', async () => {
    const runtime = startedRuntime();
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/runtime/realtime/session-enable',
      payload: { cap: 3, confirm: false },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('CONFIRM_REQUIRED');
  });

  it('rejects invalid caps outside the controlled cap set', async () => {
    const runtime = startedRuntime();
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
    });

    for (const cap of [0, 2, 41]) {
      const res = await app.inject({
        method: 'POST',
        url: '/runtime/realtime/session-enable',
        payload: { cap, confirm: true },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_SESSION_CAP');
    }
  });

  it('allows cap20 and cap40 sessions without exceeding the KIS hard cap', async () => {
    const applyDiff = vi.fn(async () => undefined);
    const connect = vi.fn(async () => undefined);
    const settings = settingsStore();
    const favorites = Array.from({ length: 42 }, (_, i) => ({
      ticker: String(i + 1).padStart(6, '0'),
      tier: 'realtime' as const,
      addedAt: `2026-04-28T01:${String(i).padStart(2, '0')}:00.000Z`,
    }));
    const runtime = startedRuntime({
      favorites,
      bridge: { connect, applyDiff },
    });
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
      settingsStore: settings,
    });

    const cap20 = await app.inject({
      method: 'POST',
      url: '/runtime/realtime/session-enable',
      payload: { cap: 20, confirm: true },
    });
    const cap40 = await app.inject({
      method: 'POST',
      url: '/runtime/realtime/session-enable',
      payload: { cap: 40, confirm: true },
    });

    expect(cap20.statusCode).toBe(200);
    expect(cap20.json().data).toMatchObject({
      outcome: 'enabled',
      sessionCap: 20,
      sessionMaxAppliedTicks: 100,
      sessionMaxParsedTicks: 2000,
      sessionMaxSessionMs: 90_000,
    });
    expect(cap20.json().data.sessionTickers).toHaveLength(20);
    expect(cap40.statusCode).toBe(200);
    expect(cap40.json().data).toMatchObject({
      outcome: 'enabled',
      sessionCap: 40,
      sessionMaxAppliedTicks: 200,
      sessionMaxParsedTicks: 4000,
      sessionMaxSessionMs: 120_000,
    });
    expect(cap40.json().data.sessionTickers).toHaveLength(40);
    expect(applyDiff).toHaveBeenLastCalledWith({
      subscribe: favorites.slice(0, 40).map((favorite) => favorite.ticker),
      unsubscribe: [],
    });
    expect(settings.save).not.toHaveBeenCalled();
  });

  it('returns no_candidates when there are no favorite candidates', async () => {
    const runtime = startedRuntime({ favorites: [] });
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/runtime/realtime/session-enable',
      payload: { cap: 3, confirm: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      outcome: 'no_candidates',
      sessionRealtimeEnabled: false,
    });
  });

  it('enables only favorite candidates and does not persist settings', async () => {
    const applyDiff = vi.fn(async () => undefined);
    const connect = vi.fn(async () => undefined);
    const settings = settingsStore();
    const runtime = startedRuntime({
      favorites: [
        { ticker: '005930', tier: 'realtime', addedAt: '2026-04-28T01:00:00.000Z' },
        { ticker: '000660', tier: 'polling', addedAt: '2026-04-28T01:01:00.000Z' },
      ],
      bridge: { connect, applyDiff },
    });
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
      settingsStore: settings,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/runtime/realtime/session-enable',
      payload: { cap: 10, confirm: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      outcome: 'enabled',
      sessionRealtimeEnabled: true,
      sessionCap: 10,
      sessionTickers: ['005930', '000660'],
    });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(applyDiff).toHaveBeenCalledWith({
      subscribe: ['005930', '000660'],
      unsubscribe: [],
    });
    expect(settings.save).not.toHaveBeenCalled();
  });

  it('accepts optional maxSessionMs and clamps it into the safe range', async () => {
    const settings = settingsStore();
    const runtime = startedRuntime({
      favorites: [
        { ticker: '005930', tier: 'realtime', addedAt: '2026-04-28T01:00:00.000Z' },
      ],
    });
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
      settingsStore: settings,
    });

    const low = await app.inject({
      method: 'POST',
      url: '/runtime/realtime/session-enable',
      payload: { cap: 1, confirm: true, maxSessionMs: 100 },
    });
    const high = await app.inject({
      method: 'POST',
      url: '/runtime/realtime/session-enable',
      payload: { cap: 1, confirm: true, maxSessionMs: 999_999 },
    });

    expect(low.statusCode).toBe(200);
    expect(low.json().data.sessionMaxSessionMs).toBe(10_000);
    expect(high.statusCode).toBe(200);
    expect(high.json().data.sessionMaxSessionMs).toBe(300_000);
    expect(settings.save).not.toHaveBeenCalled();
  });

  it('cleans up the session gate when bridge enable fails', async () => {
    const applyDiff = vi.fn(async () => {
      throw new Error('approval_key=synthetic');
    });
    const stopSession = vi.fn(async () => undefined);
    const sessionGate = createRealtimeSessionGate();
    const runtime = startedRuntime({
      favorites: [
        { ticker: '005930', tier: 'realtime', addedAt: '2026-04-28T01:00:00.000Z' },
      ],
      bridge: { applyDiff, stopSession },
      sessionGate,
    });
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/runtime/realtime/session-enable',
      payload: { cap: 1, confirm: true },
    });

    expect(res.statusCode).toBe(502);
    expect(res.json().error.message).toContain('[REDACTED]');
    expect(stopSession).toHaveBeenCalledTimes(1);
    expect(sessionGate.snapshot().sessionRealtimeEnabled).toBe(false);
  });
});

describe('POST /runtime/realtime/session-disable', () => {
  it('turns off session gate without stopping REST polling or persisting settings', async () => {
    const stopSession = vi.fn(async () => undefined);
    const pollingStop = vi.fn(async () => undefined);
    const settings = settingsStore();
    const sessionGate = createRealtimeSessionGate();
    sessionGate.enable({ cap: 3, tickers: ['005930'] });
    const runtime = startedRuntime({
      sessionGate,
      bridge: { stopSession },
      pollingStop,
    });
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
      settingsStore: settings,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/runtime/realtime/session-disable',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      sessionRealtimeEnabled: false,
      sessionCap: 3,
      sessionEndReason: 'operator_disabled',
    });
    expect(stopSession).toHaveBeenCalledTimes(1);
    expect(pollingStop).not.toHaveBeenCalled();
    expect(settings.save).not.toHaveBeenCalled();
  });
});

describe('POST /runtime/realtime/emergency-disable', () => {
  it('disconnects realtime, persists disabled gates, and leaves REST polling running', async () => {
    const disconnectAll = vi.fn(async () => undefined);
    const pollingStop = vi.fn(async () => undefined);
    const settings = settingsStore({
      websocketEnabled: true,
      applyTicksToPriceStore: true,
    });
    const runtime = startedRuntime({
      bridge: { disconnectAll },
      pollingStop,
    });
    const app = await build({
      runtimeRef: runtimeRef({ status: 'started', runtime }),
      settingsStore: settings,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/runtime/realtime/emergency-disable',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        state: 'manual-disabled',
        persistedSettingsChanged: true,
      },
    });
    expect(disconnectAll).toHaveBeenCalledTimes(1);
    expect(pollingStop).not.toHaveBeenCalled();
    expect(settings.save).toHaveBeenCalledWith(
      expect.objectContaining({
        websocketEnabled: false,
        applyTicksToPriceStore: false,
      }),
    );
  });
});
