import type { Favorite } from '@shared/types.js';

import type { AgentEventQueue, AgentEventType } from '../agent/agent-event-queue.js';
import type { OrderIntentService } from '../agent/order-intent-service.js';
import type { MarketTopMoverRotationCandidate } from '../market/market-top-movers-service.js';
import type { RealtimeSessionGate } from './runtime-operator.js';
import {
  allocateKisWsSlots,
  type KisWsSlotDiff,
} from './kis-ws-slot-allocator.js';
import {
  buildKisWsSlotCandidates,
  KIS_WS_SLOT_CHURN_COOLDOWN_MS,
} from './kis-ws-slot-candidates.js';
import type { KisWsSlotStateStore } from './kis-ws-slot-state.js';
import type { TossPortfolioPositionsPayload } from '../toss/toss-portfolio-client.js';

export type KisWsSlotRebalanceOutcome =
  | 'rebalanced'
  | 'unchanged'
  | 'skipped'
  | 'no_candidates';

export type KisWsSlotRebalanceSkipReason =
  | 'runtime_not_started'
  | 'session_disabled';

export type KisWsSlotRebalanceResult =
  | {
      readonly outcome: 'rebalanced' | 'unchanged';
      readonly activeCount: number;
      readonly fallbackCount: number;
      readonly diff: KisWsSlotDiff;
    }
  | {
      readonly outcome: 'skipped';
      readonly reason: KisWsSlotRebalanceSkipReason;
    }
  | {
      readonly outcome: 'no_candidates';
      readonly activeCount: 0;
      readonly fallbackCount: 0;
      readonly diff: KisWsSlotDiff;
    };

export interface KisWsSlotSessionRebalancer {
  rebalance(reason: string): Promise<KisWsSlotRebalanceResult>;
}

export interface KisWsSlotSessionRebalancerOptions {
  readonly runtimeRef: { get(): unknown };
  readonly favoriteRepo: Pick<{ findAll(): Favorite[] }, 'findAll'>;
  readonly orderIntentService?: Pick<OrderIntentService, 'snapshotPreviews'>;
  readonly agentEventQueue?: Pick<AgentEventQueue, 'snapshot'>;
  readonly portfolioPositions?: { snapshot(): TossPortfolioPositionsPayload | null };
  readonly marketTopMoversService?: {
    snapshot(): {
      readonly rotationCandidates?: readonly MarketTopMoverRotationCandidate[];
    };
  };
  readonly kisWsSlotState?: KisWsSlotStateStore;
  readonly now?: () => string;
}

export function createKisWsSlotSessionRebalancer(
  options: KisWsSlotSessionRebalancerOptions,
): KisWsSlotSessionRebalancer {
  async function rebalance(reason: string): Promise<KisWsSlotRebalanceResult> {
    const requestedAt = options.now?.() ?? new Date().toISOString();
    const runtimeState = options.runtimeRef.get();
    if (!isRuntimeStarted(runtimeState)) {
      const result: KisWsSlotRebalanceResult = {
        outcome: 'skipped',
        reason: 'runtime_not_started',
      };
      options.kisWsSlotState?.recordRebalance({
        requestedAt,
        reason,
        outcome: result.outcome,
        skipReason: result.reason,
      });
      return result;
    }

    const session = runtimeState.runtime.sessionGate.snapshot();
    if (!session.sessionRealtimeEnabled || session.sessionCap === null) {
      const result: KisWsSlotRebalanceResult = {
        outcome: 'skipped',
        reason: 'session_disabled',
      };
      options.kisWsSlotState?.recordRebalance({
        requestedAt,
        reason,
        outcome: result.outcome,
        skipReason: result.reason,
      });
      return result;
    }

    const now = requestedAt;
    const plan = allocateKisWsSlots({
      candidates: buildKisWsSlotCandidates({
        favorites: options.favoriteRepo.findAll(),
        portfolioSnapshot: options.portfolioPositions?.snapshot() ?? null,
        agentEvents: options.agentEventQueue?.snapshot(40) ?? [],
        orderIntentPreviews: options.orderIntentService?.snapshotPreviews(40) ?? [],
        topMoverRotationCandidates:
          options.marketTopMoversService?.snapshot().rotationCandidates ?? [],
        marketPhase: runtimeState.runtime.marketHoursScheduler.getCurrentPhase(),
        now,
      }),
      previousSubscribed: runtimeState.runtime.bridge.getRealtimeTickers(),
      previousSlots: options.kisWsSlotState?.snapshot() ?? [],
      cap: session.sessionCap,
      now,
      churnCooldownMs: KIS_WS_SLOT_CHURN_COOLDOWN_MS,
    });

    if (plan.subscribed.length === 0) {
      const result: KisWsSlotRebalanceResult = {
        outcome: 'no_candidates',
        activeCount: 0,
        fallbackCount: 0,
        diff: plan.diff,
      };
      options.kisWsSlotState?.recordRebalance({
        requestedAt,
        reason,
        outcome: result.outcome,
        activeCount: result.activeCount,
        fallbackCount: result.fallbackCount,
        diff: result.diff,
      });
      return result;
    }

    const nextTickers = plan.subscribed.map((item) => item.ticker);
    const unchanged =
      plan.diff.subscribe.length === 0 &&
      plan.diff.unsubscribe.length === 0 &&
      sameTickers(session.sessionTickers, nextTickers);
    if (!unchanged) {
      await runtimeState.runtime.bridge.applyDiff(plan.diff);
      runtimeState.runtime.sessionGate.replaceTickers(nextTickers);
    }
    options.kisWsSlotState?.applyPlan(plan);

    const result: KisWsSlotRebalanceResult = {
      outcome: unchanged ? 'unchanged' : 'rebalanced',
      activeCount: plan.used,
      fallbackCount: plan.fallback.length,
      diff: plan.diff,
    };
    options.kisWsSlotState?.recordRebalance({
      requestedAt,
      reason,
      outcome: result.outcome,
      activeCount: result.activeCount,
      fallbackCount: result.fallbackCount,
      diff: result.diff,
    });
    return result;
  }

  return { rebalance };
}

export function shouldRebalanceKisWsSlotsForAgentEvent(
  type: AgentEventType,
): boolean {
  switch (type) {
    case 'news_detected':
    case 'disclosure_detected':
    case 'toss_signal_detected':
      return true;
    case 'market_movement_detected':
      return false;
    default:
      return false;
  }
}

function sameTickers(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((ticker, index) => ticker === right[index]);
}

function isRuntimeStarted(
  runtimeState: unknown,
): runtimeState is {
  status: 'started';
  runtime: {
    bridge: {
      getRealtimeTickers(): readonly string[];
      applyDiff(diff: KisWsSlotDiff): Promise<void>;
    };
    sessionGate: RealtimeSessionGate;
    marketHoursScheduler: {
      getCurrentPhase(): 'pre-open' | 'open' | 'closed';
    };
  };
} {
  if (
    typeof runtimeState !== 'object' ||
    runtimeState === null ||
    (runtimeState as { status?: unknown }).status !== 'started'
  ) {
    return false;
  }
  const runtime = (runtimeState as { runtime?: unknown }).runtime;
  if (typeof runtime !== 'object' || runtime === null) return false;
  const maybeRuntime = runtime as {
    bridge?: unknown;
    sessionGate?: unknown;
    marketHoursScheduler?: unknown;
  };
  return (
    hasFunction(maybeRuntime.bridge, 'getRealtimeTickers') &&
    hasFunction(maybeRuntime.bridge, 'applyDiff') &&
    hasFunction(maybeRuntime.sessionGate, 'snapshot') &&
    hasFunction(maybeRuntime.sessionGate, 'replaceTickers') &&
    hasFunction(maybeRuntime.marketHoursScheduler, 'getCurrentPhase')
  );
}

function hasFunction(value: unknown, key: string): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)[key] === 'function'
  );
}
