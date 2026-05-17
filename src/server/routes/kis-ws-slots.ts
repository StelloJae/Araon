import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { Favorite } from '@shared/types.js';
import { WS_MAX_SUBSCRIPTIONS } from '@shared/kis-constraints.js';

import type { AgentEventQueue } from '../agent/agent-event-queue.js';
import type { OrderIntentService } from '../agent/order-intent-service.js';
import type { MarketTopMoverRotationCandidate } from '../market/market-top-movers-service.js';
import { allocateKisWsSlots } from '../realtime/kis-ws-slot-allocator.js';
import {
  buildKisWsSlotCandidates,
  KIS_WS_SLOT_CHURN_COOLDOWN_MS,
} from '../realtime/kis-ws-slot-candidates.js';
import type { KisWsSlotStateStore } from '../realtime/kis-ws-slot-state.js';
import type { TossPortfolioPositionsPayload } from '../toss/toss-portfolio-client.js';

export interface KisWsSlotsRoutesOptions extends FastifyPluginOptions {
  readonly favoriteRepo: Pick<{ findAll(): Favorite[] }, 'findAll'>;
  readonly runtimeRef: { get(): unknown };
  readonly orderIntentService?: Pick<OrderIntentService, 'snapshotPreviews'>;
  readonly agentEventQueue?: Pick<AgentEventQueue, 'snapshot'>;
  readonly portfolioPositions?: { snapshot(): TossPortfolioPositionsPayload | null };
  readonly marketTopMoversService?: {
    snapshot(): {
      readonly rotationCandidates?: readonly MarketTopMoverRotationCandidate[];
    };
  };
  readonly kisWsSlotState?: Pick<KisWsSlotStateStore, 'snapshot' | 'rebalanceSnapshot'>;
  readonly now?: () => string;
}

export async function kisWsSlotsRoutes(
  app: FastifyInstance,
  opts: KisWsSlotsRoutesOptions,
): Promise<void> {
  app.get<{ Querystring: { currentTicker?: string } }>(
    '/runtime/realtime/kis-ws-slots',
    async (request, reply) => {
      try {
        const now = opts.now?.() ?? new Date().toISOString();
        const runtimeState = opts.runtimeRef.get();
        const previousSubscribed = readActiveRealtimeTickers(runtimeState);
        const plan = allocateKisWsSlots({
          candidates: buildKisWsSlotCandidates({
            favorites: opts.favoriteRepo.findAll(),
            portfolioSnapshot: opts.portfolioPositions?.snapshot() ?? null,
            currentTicker: request.query.currentTicker,
            agentEvents: opts.agentEventQueue?.snapshot(40) ?? [],
            orderIntentPreviews: opts.orderIntentService?.snapshotPreviews(40) ?? [],
            topMoverRotationCandidates:
              opts.marketTopMoversService?.snapshot().rotationCandidates ?? [],
            marketPhase: readMarketPhase(runtimeState),
            now,
          }),
          previousSubscribed,
          previousSlots: opts.kisWsSlotState?.snapshot() ?? [],
          cap: WS_MAX_SUBSCRIPTIONS,
          now,
          churnCooldownMs: KIS_WS_SLOT_CHURN_COOLDOWN_MS,
        });
        return reply.send({
          success: true,
          data: {
            enabled: isRuntimeStarted(runtimeState),
            provider: 'kis',
            perProfileCap: plan.cap,
            activeCount: plan.used,
            fallbackCount: plan.fallback.length,
            churnCooldownMs: KIS_WS_SLOT_CHURN_COOLDOWN_MS,
            diff: plan.diff,
            lastRebalance: opts.kisWsSlotState?.rebalanceSnapshot() ?? null,
            candidates: [...plan.subscribed, ...plan.fallback].map((item) => ({
              ticker: item.ticker,
              state: item.state,
              source: item.source,
              reason: item.reason,
              score: item.score,
              ttlMs: item.ttlMs,
              lastSeenAt: item.lastSeenAt,
              pinned: item.pinned,
            })),
          },
        });
      } catch {
        return reply.code(500).send({
          success: false,
          error: {
            code: 'KIS_WS_SLOTS_PREVIEW_FAILED',
            message: 'KIS WS slot preview failed',
          },
        });
      }
    },
  );
}

function readMarketPhase(runtimeState: unknown): 'pre-open' | 'open' | 'closed' | undefined {
  if (!isRuntimeStarted(runtimeState)) return undefined;
  if (
    typeof runtimeState.runtime.marketHoursScheduler !== 'object' ||
    runtimeState.runtime.marketHoursScheduler === null
  ) {
    return undefined;
  }
  const scheduler = runtimeState.runtime.marketHoursScheduler as {
    getCurrentPhase?: () => 'pre-open' | 'open' | 'closed';
  };
  return typeof scheduler.getCurrentPhase === 'function'
    ? scheduler.getCurrentPhase()
    : undefined;
}

function readActiveRealtimeTickers(runtimeState: unknown): string[] {
  if (!isRuntimeStarted(runtimeState)) return [];
  const bridge = runtimeState.runtime.bridge as { getRealtimeTickers?: () => readonly string[] };
  return typeof bridge.getRealtimeTickers === 'function'
    ? [...bridge.getRealtimeTickers()]
    : [];
}

function isRuntimeStarted(
  runtimeState: unknown,
): runtimeState is {
  status: 'started';
  runtime: { bridge: unknown; marketHoursScheduler?: unknown };
} {
  return typeof runtimeState === 'object'
    && runtimeState !== null
    && (runtimeState as { status?: unknown }).status === 'started'
    && typeof (runtimeState as { runtime?: unknown }).runtime === 'object'
    && (runtimeState as { runtime?: unknown }).runtime !== null;
}
