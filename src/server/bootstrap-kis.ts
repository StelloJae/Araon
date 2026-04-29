/**
 * KIS runtime state machine.
 *
 * `createKisRuntimeRef` provides a single coordination point for the lazy
 * initialization, deduplication, and teardown of the full KIS subsystem.
 * The injected `actuallyStart` makes the state-machine logic testable in
 * isolation; `defaultActuallyStart` is the production wiring used by the
 * composition root (Task 6).
 */

import type { Database } from 'better-sqlite3';
import type { SettingsStore } from './settings-store.js';
import type { CredentialStore, KisCredentials } from './credential-store.js';
import type { PriceStore } from './price/price-store.js';
import type { SnapshotStore } from './price/snapshot-store.js';
import type { StockRepository, FavoriteRepository } from './db/repositories.js';
import type { KisAuth } from './kis/kis-auth.js';
import type { KisRestClient } from './kis/kis-rest-client.js';
import type { KisWsClient } from './kis/kis-ws-client.js';
import type { RealtimeBridge } from './realtime/realtime-bridge.js';
import type { TierManager } from './realtime/tier-manager.js';
import type { RealtimeSessionGate } from './realtime/runtime-operator.js';
import type { PollingScheduler } from './polling/polling-scheduler.js';
import type { SseManagerHandle } from './sse/sse-manager.js';
import type { MarketHoursScheduler } from './lifecycle/market-hours-scheduler.js';
import type { ApprovalIssuer } from './kis/kis-approval.js';
import { createChildLogger } from '@shared/logger.js';

const log = createChildLogger('bootstrap-kis');

// === Types ====================================================================

export interface KisRuntime {
  auth: KisAuth;
  restClient: KisRestClient;
  approvalIssuer: ApprovalIssuer;
  wsClient: KisWsClient;
  bridge: RealtimeBridge;
  sessionGate: RealtimeSessionGate;
  tierManager: TierManager;
  pollingScheduler: PollingScheduler;
  sseManager: SseManagerHandle;
  marketHoursScheduler: MarketHoursScheduler;
  stopSnapshotTimer: () => void;
}

export type KisRuntimeState =
  | { status: 'unconfigured' }
  | { status: 'starting'; promise: Promise<KisRuntime> }
  | { status: 'started'; runtime: KisRuntime }
  | { status: 'failed'; error: { code: string; message: string } };

export interface KisRuntimeStaticDeps {
  db: Database;
  settingsStore: SettingsStore;
  credentialStore: CredentialStore;
  priceStore: PriceStore;
  snapshotStore: SnapshotStore;
  stockRepo: StockRepository;
  favoriteRepo: FavoriteRepository;
}

export interface KisRuntimeRef {
  get(): KisRuntimeState;
  start(credentials: KisCredentials): Promise<KisRuntime>;
  stop(): Promise<void>;
  reset(): void;
}

export interface KisRuntimeRefOptions {
  /** Internal start logic — injectable so tests can stub it out. */
  actuallyStart: (deps: KisRuntimeStaticDeps, credentials: KisCredentials) => Promise<KisRuntime>;
}

// === Factory ==================================================================

export function createKisRuntimeRef(
  deps: KisRuntimeStaticDeps,
  options: KisRuntimeRefOptions,
): KisRuntimeRef {
  let state: KisRuntimeState = { status: 'unconfigured' };

  async function start(credentials: KisCredentials): Promise<KisRuntime> {
    if (state.status === 'started') return state.runtime;
    if (state.status === 'starting') return state.promise;
    if (state.status === 'failed') {
      throw new Error('runtime is failed; call reset() before restart');
    }

    const promise = options.actuallyStart(deps, credentials)
      .then((runtime) => {
        if (state.status === 'starting' && state.promise === promise) {
          state = { status: 'started', runtime };
          log.info('KIS runtime started');
        } else {
          // stop() or a newer start() intervened; the dispose path owns this runtime now
          log.debug('runtime resolved after state moved out of starting; no state mutation');
        }
        return runtime;
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        if (state.status === 'starting' && state.promise === promise) {
          state = { status: 'failed', error: { code: 'KIS_START_FAILED', message } };
        }
        log.error({ err: message }, 'KIS runtime start failed');
        throw err;
      });
    state = { status: 'starting', promise };
    return promise;
  }

  async function stop(): Promise<void> {
    if (state.status === 'unconfigured' || state.status === 'failed') return;

    let runtimeToDispose: KisRuntime | undefined;
    if (state.status === 'started') {
      runtimeToDispose = state.runtime;
    } else if (state.status === 'starting') {
      try { await state.promise; } catch { /* ignore start failure */ }
      // Re-read state into a widened local const so TypeScript can narrow the
      // discriminant after the await. The .then() microtask may have already
      // transitioned `state` to 'started'.
      const stateAfterAwait = state as KisRuntimeState;
      runtimeToDispose = stateAfterAwait.status === 'started' ? stateAfterAwait.runtime : undefined;
    }
    state = { status: 'unconfigured' };
    if (runtimeToDispose === undefined) return;

    const steps: Array<[string, () => Promise<void> | void]> = [
      ['polling.stop',         () => runtimeToDispose!.pollingScheduler.stop()],
      ['sse.closeAll',         () => runtimeToDispose!.sseManager.closeAll()],
      ['bridge.disconnectAll', () => runtimeToDispose!.bridge.disconnectAll()],
      ['ws.disconnect',        () => runtimeToDispose!.wsClient.disconnect()],
      ['market.stop',          () => runtimeToDispose!.marketHoursScheduler.stop()],
      ['snapshot.stop',        () => runtimeToDispose!.stopSnapshotTimer()],
    ];
    for (const [name, fn] of steps) {
      try { await fn(); }
      catch (err: unknown) {
        log.warn(
          { step: name, err: err instanceof Error ? err.message : String(err) },
          'stop step failed',
        );
      }
    }
  }

  function reset(): void {
    if (state.status === 'started' || state.status === 'starting') {
      throw new Error(`cannot reset while runtime is ${state.status}`);
    }
    state = { status: 'unconfigured' };
  }

  return { get: () => state, start, stop, reset };
}

// === defaultActuallyStart =====================================================
//
// Production wiring. Not covered by unit tests here — Task 6 smoke-tests it
// against the real composition root. Import and pass as `options.actuallyStart`
// at startup.
//
// DONE_WITH_CONCERNS:
//   1. ~~`kisTickParser`~~ RESOLVED 2026-04-27 (NXT1): real parser at
//      `kis/kis-tick-parser.ts` with discriminated-union output and 19 unit
//      tests covering H0STCNT0/H0UNCNT0 fixtures, multi-tick (dataCount>1),
//      PINGPONG, encrypted (flag=1, AES decrypt deferred), unsupported tr_id
//      and malformed frames. The wrapper below intentionally downgrades
//      `ticks` results to `ignore` so the early NXT stage stayed dry-run.
//      Later NXT phases wired guarded apply and validated H0UNCNT0 live
//      sessions up to cap40; realtime can be enabled by persisted local
//      settings while fresh installs keep the gates off and REST polling
//      retained as fallback.
//   2. ~~`getApprovalKey`~~ RESOLVED 2026-04-27 (NXT2a): extracted to
//      `kis/kis-approval.ts` with Zod-validated response, state machine
//      (`none`/`issuing`/`ready`/`failed`), error classification
//      (`auth_rejected`/`malformed_response`/`network_error`/`unknown`),
//      concurrent-call dedup, and 19 mock-transport unit tests. Body field
//      name corrected from `appsecret` to `secretkey` — the inline version
//      had `appsecret` which would have 500'd on the first live call.
//      `getState()` is leak-safe (no key value, no upstream error text).
//      Live response shape (issuedAt/expiresAt) still unverified — that is
//      NXT2b (separately approved live probe, 1 call only).
//   3. ~~`mapPrice`~~ RESOLVED 2026-04-23: moved to `kis/kis-price-mapper.ts`
//      with Zod schema + 11 unit tests. Field names `stck_prpr`/`prdy_ctrt`/
//      `acml_vol` confirmed from KIS portal docs. Still needs live-call
//      verification of the output envelope, but unit-test coverage ensures
//      sensible fallbacks on schema drift.

import {
  REST_RATE_LIMIT_PER_SEC_LIVE,
  REST_RATE_LIMIT_PER_SEC_PAPER,
  REST_RATE_LIMIT_SAFETY_FACTOR,
  WS_MAX_SUBSCRIPTIONS,
} from '@shared/kis-constraints.js';
import type { Price } from '@shared/types.js';

import { createKisAuth } from './kis/kis-auth.js';
import { createKisRestClient } from './kis/kis-rest-client.js';
import { createKisWsClient } from './kis/kis-ws-client.js';
import {
  createRealtimeBridge,
  type RealtimeApplyDisabledReason,
  type RealtimeBridgeStats,
  type WsTickParser,
  type ParsedWsFrame,
} from './realtime/realtime-bridge.js';
import { createTierManager } from './realtime/tier-manager.js';
import { createPollingScheduler } from './polling/polling-scheduler.js';
import { createRateLimiter } from './polling/rate-limiter.js';
import { createSseManager } from './sse/sse-manager.js';
import { createMarketHoursScheduler } from './lifecycle/market-hours-scheduler.js';
import { primeStoreFromSnapshot } from './price/cold-start-loader.js';
import { mapKisInquirePriceToPrice } from './kis/kis-price-mapper.js';
import { parseKisTickFrame } from './kis/kis-tick-parser.js';
import { createApprovalIssuer, type ApprovalRequest } from './kis/kis-approval.js';
import {
  createRealtimeSessionGate,
  sessionLimitEndReason,
  shouldApplyRuntimeWsTicks,
  type SessionEndReason,
} from './realtime/runtime-operator.js';

// NXT4a wrapper: parse real KIS WS frames and expose parsed ticks to the
// bridge. The bridge still defaults to applyTicksToPriceStore=false, so parsing
// can be exercised without mutating priceStore/SSE until an explicit NXT4b
// probe opts into the apply path.
const kisTickParser: WsTickParser = (raw: string): ParsedWsFrame => {
  const result = parseKisTickFrame(raw);
  switch (result.kind) {
    case 'ticks': {
      const first = result.ticks[0];
      log.debug(
        {
          count: result.ticks.length,
          trId: first?.trId,
          source: first?.source,
          ticker: first?.ticker,
        },
        'kis tick frame parsed',
      );
      return { kind: 'ticks', ticks: result.ticks };
    }
    case 'pingpong':
      return { kind: 'ignore', reason: 'PINGPONG control frame' };
    case 'ignore':
      return { kind: 'ignore', reason: result.reason };
    case 'error':
      return { kind: 'error', message: `${result.code}: ${result.message}` };
  }
};

// Price mapping moved to kis/kis-price-mapper.ts — unit-tested standalone.

export async function connectRealtimeFavoritesOnWarmup(deps: {
  readonly bridge: Pick<RealtimeBridge, 'connect' | 'applyDiff'>;
  readonly tierManager: Pick<TierManager, 'getAssignment'>;
}): Promise<void> {
  await deps.bridge.connect();
  const realtimeTickers = deps.tierManager.getAssignment().realtimeTickers;
  if (realtimeTickers.length === 0) return;
  await deps.bridge.applyDiff({
    subscribe: realtimeTickers,
    unsubscribe: [],
  });
}

export async function defaultActuallyStart(
  deps: KisRuntimeStaticDeps,
  credentials: KisCredentials,
): Promise<KisRuntime> {
  const tokenRest = createKisRestClient({ isPaper: credentials.isPaper });
  const auth = createKisAuth({ store: deps.credentialStore, transport: tokenRest });
  await auth.getAccessToken();

  await primeStoreFromSnapshot(deps.priceStore, deps.snapshotStore);

  const restClient = createKisRestClient({ isPaper: credentials.isPaper, auth });

  // KIS WebSocket requires a one-time approval key from POST /oauth2/Approval.
  // The issuer module enforces a Zod-validated response, the correct
  // `secretkey` body field (not `appsecret`), error classification that the
  // WS state machine relies on (auth_rejected → stopped, no reconnect loop),
  // and a leak-safe diagnostic `getState()`.
  const approvalIssuer = createApprovalIssuer({
    appKey: credentials.appKey,
    appSecret: credentials.appSecret,
    transport: {
      request: <T>(req: ApprovalRequest): Promise<T> => restClient.request<T>(req),
    },
  });

  const wsClient = createKisWsClient({
    isPaper: credentials.isPaper,
    getApprovalKey: () => approvalIssuer.issue(),
  });
  const sessionGate = createRealtimeSessionGate();
  let bridgeForSessionCleanup: RealtimeBridge | null = null;

  const disableSessionForLimit = (
    reason: Exclude<SessionEndReason, 'operator_disabled' | null>,
  ): void => {
    sessionGate.disable(reason);
    void bridgeForSessionCleanup?.stopSession().catch((err: unknown) => {
      log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'session limit realtime cleanup failed',
      );
    });
  };

  const currentSessionLimitReason = (
    stats: RealtimeBridgeStats,
  ): Exclude<SessionEndReason, 'operator_disabled' | null> | null =>
    sessionLimitEndReason(sessionGate.snapshot(), {
      nowMs: Date.now(),
      parsedTickCount: stats.parsedTickCount,
      appliedTickCount: stats.appliedTickCount,
    });

  const bridge = createRealtimeBridge({
    wsClient,
    priceStore: deps.priceStore,
    parseTick: kisTickParser,
    getApplyDisabledReason: (ticker, stats): RealtimeApplyDisabledReason | null => {
      const gates = deps.settingsStore.snapshot();
      if (gates.websocketEnabled && gates.applyTicksToPriceStore) return null;

      const session = sessionGate.snapshot();
      if (
        !session.sessionRealtimeEnabled &&
        session.sessionEndReason !== null &&
        session.sessionEndReason !== 'operator_disabled'
      ) {
        return 'session_limit_reached';
      }

      const limitReason = currentSessionLimitReason(stats);
      if (limitReason !== null) {
        disableSessionForLimit(limitReason);
        return 'session_limit_reached';
      }

      return shouldApplyRuntimeWsTicks(gates, session, ticker)
        ? null
        : 'apply_disabled';
    },
    onPriceApplied: (_price, stats) => {
      const limitReason = currentSessionLimitReason(stats);
      if (limitReason !== null) disableSessionForLimit(limitReason);
    },
  });
  bridgeForSessionCleanup = bridge;

  // Always-on mode for persisted local settings: favoritesRoutes consumes
  // tierManager diffs and forwards them to the bridge. Initial assignment is
  // capped at the KIS WS ceiling so favorites are eligible for realtime when
  // both persisted gates are enabled while non-favorites stay on REST polling.
  const tierManager = createTierManager({
    initialFavorites: deps.favoriteRepo.findAll(),
    cap: WS_MAX_SUBSCRIPTIONS,
  });

  const rawRate = credentials.isPaper
    ? REST_RATE_LIMIT_PER_SEC_PAPER
    : REST_RATE_LIMIT_PER_SEC_LIVE;
  const ratePerSec = rawRate * REST_RATE_LIMIT_SAFETY_FACTOR;

  // burst = ceil(rate) = 15 live / 4 paper. Larger burst + concurrent workers
  // occasionally triggers KIS throttle, but kis-rest-client's built-in 3-attempt
  // backoff absorbs most (steady-state ~1/10 ticker fail rate observed live).
  // Don't drop burst to 1 — counter-intuitively that spikes failures because
  // workers line up into a near-simultaneous multi-request pattern.
  const rateLimiter = createRateLimiter({
    ratePerSec,
    burst: Math.ceil(ratePerSec),
  });

  const pollingScheduler = createPollingScheduler({
    restClient: {
      fetchPrice: async (ticker: string): Promise<Price> => {
        // KIS 주식현재가 시세 TR — same ID for both live (FH...) and paper hosts.
        const trId = 'FHKST01010100';
        const resp = await restClient.request<Record<string, unknown>>({
          method: 'GET',
          path: '/uapi/domestic-stock/v1/quotations/inquire-price',
          query: { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: ticker },
          trId,
        });
        return mapKisInquirePriceToPrice(ticker, resp);
      },
    },
    stockRepo: deps.stockRepo,
    priceStore: deps.priceStore,
    rateLimiter,
    settings: deps.settingsStore,
  });

  const marketHoursScheduler = createMarketHoursScheduler({
    onWarmup: async () => {
      if (deps.settingsStore.snapshot().websocketEnabled) {
        await connectRealtimeFavoritesOnWarmup({ bridge, tierManager });
      }
    },
    onOpen: async () => { /* connection established during warmup */ },
    onClose: async () => {
      if (deps.settingsStore.snapshot().websocketEnabled) {
        await bridge.disconnectAll();
      }
    },
    onShutdown: async () => {
      await bridge.disconnectAll();
    },
  });

  const sseManager = createSseManager({
    priceStore: deps.priceStore,
    getInitialSnapshot: () => deps.priceStore.getAllPrices(),
    getMarketStatus: () => marketHoursScheduler.getCurrentPhase(),
  });

  pollingScheduler.start();
  const stopSnapshotTimer = deps.snapshotStore.startPeriodicSave(deps.priceStore);
  marketHoursScheduler.start();

  return {
    auth,
    restClient,
    approvalIssuer,
    wsClient,
    bridge,
    sessionGate,
    tierManager,
    pollingScheduler,
    sseManager,
    marketHoursScheduler,
    stopSnapshotTimer,
  };
}
