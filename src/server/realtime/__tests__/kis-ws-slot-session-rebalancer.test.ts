import { describe, expect, it, vi } from 'vitest';

import { createAgentEventQueue } from '../../agent/agent-event-queue.js';
import { createRealtimeSessionGate } from '../runtime-operator.js';
import { createKisWsSlotStateStore } from '../kis-ws-slot-state.js';
import {
  createKisWsSlotSessionRebalancer,
  shouldRebalanceKisWsSlotsForAgentEvent,
} from '../kis-ws-slot-session-rebalancer.js';

describe('KIS WS slot session rebalancer', () => {
  it('schedules only agent event types that can change KIS WS slot candidates', () => {
    expect(shouldRebalanceKisWsSlotsForAgentEvent('news_detected')).toBe(true);
    expect(shouldRebalanceKisWsSlotsForAgentEvent('disclosure_detected')).toBe(true);
    expect(shouldRebalanceKisWsSlotsForAgentEvent('toss_signal_detected')).toBe(true);
    expect(shouldRebalanceKisWsSlotsForAgentEvent('market_movement_detected')).toBe(false);
  });

  it('skips when the KIS realtime session gate is disabled', async () => {
    const applyDiff = vi.fn(async () => undefined);
    const rebalancer = createKisWsSlotSessionRebalancer({
      runtimeRef: {
        get: () => ({
          status: 'started',
          runtime: runtime({ applyDiff }),
        }),
      },
      favoriteRepo: { findAll: () => [] },
      now: () => '2026-05-11T12:01:00.000Z',
    });

    await expect(rebalancer.rebalance('agent-event')).resolves.toMatchObject({
      outcome: 'skipped',
      reason: 'session_disabled',
    });
    expect(applyDiff).not.toHaveBeenCalled();
  });

  it('applies only the subscription diff and preserves the active session bounds', async () => {
    const activeTickers: string[] = ['005930'];
    const applyDiff = vi.fn(async (diff: { subscribe: readonly string[]; unsubscribe: readonly string[] }) => {
      for (const ticker of diff.unsubscribe) {
        const index = activeTickers.indexOf(ticker);
        if (index !== -1) activeTickers.splice(index, 1);
      }
      activeTickers.push(...diff.subscribe);
    });
    const sessionGate = createRealtimeSessionGate({
      now: () => '2026-05-11T12:00:00.000Z',
    });
    sessionGate.enable({
      cap: 1,
      tickers: ['005930'],
      stats: {
        parsedTickCount: 10,
        appliedTickCount: 2,
        sessionLimitIgnoredCount: 1,
      },
    });
    const agentEventQueue = createAgentEventQueue({
      idFactory: () => 'evt-news-000660',
      now: () => '2026-05-11T12:00:30.000Z',
    });
    agentEventQueue.enqueue({
      type: 'news_detected',
      ticker: '000660',
      source: 'naver-news',
      publishedAt: '2026-05-11T12:00:00.000Z',
      relevance: 0.95,
      confidence: 0.9,
      reason: 'fresh material news',
      dedupeKey: 'news:000660:1',
      payloadRef: 'stock-news:1',
    });
    const slotState = createKisWsSlotStateStore();
    slotState.applyPlan({
      generatedAt: '2026-05-11T12:00:00.000Z',
      subscribed: [{
        ticker: '005930',
        state: 'subscribed',
        source: 'manual_watchlist',
        reason: '사용자 관심종목',
        score: 0.5,
        priority: 200,
        ttlMs: null,
        lastSeenAt: '2026-05-11T11:00:00.000Z',
        pinned: false,
      }],
    });
    const rebalancer = createKisWsSlotSessionRebalancer({
      runtimeRef: {
        get: () => ({
          status: 'started',
          runtime: runtime({
            applyDiff,
            getRealtimeTickers: () => activeTickers,
            sessionGate,
          }),
        }),
      },
      favoriteRepo: {
        findAll: () => [
          { ticker: '005930', tier: 'polling', addedAt: '2026-05-11T11:00:00.000Z' },
        ],
      },
      agentEventQueue,
      kisWsSlotState: slotState,
      now: () => '2026-05-11T12:01:00.000Z',
    });

    await expect(rebalancer.rebalance('agent-event')).resolves.toMatchObject({
      outcome: 'rebalanced',
      activeCount: 1,
      diff: {
        subscribe: ['000660'],
        unsubscribe: ['005930'],
      },
    });
    expect(applyDiff).toHaveBeenCalledWith({
      subscribe: ['000660'],
      unsubscribe: ['005930'],
    });
    expect(sessionGate.snapshot()).toMatchObject({
      sessionRealtimeEnabled: true,
      sessionCap: 1,
      sessionEnabledAt: '2026-05-11T12:00:00.000Z',
      sessionExpiresAt: '2026-05-11T12:01:00.000Z',
      sessionTickers: ['000660'],
      sessionStartParsedTickCount: 10,
      sessionStartAppliedTickCount: 2,
      sessionStartLimitIgnoredCount: 1,
    });
    expect(slotState.snapshot()).toEqual([{
      ticker: '000660',
      subscribedAt: '2026-05-11T12:01:00.000Z',
      stickyUntilAt: '2026-05-11T12:01:30.000Z',
    }]);
    expect(slotState.rebalanceSnapshot()).toMatchObject({
      requestedAt: '2026-05-11T12:01:00.000Z',
      reason: 'agent-event',
      outcome: 'rebalanced',
      activeCount: 1,
      fallbackCount: 1,
      diff: {
        subscribe: ['000660'],
        unsubscribe: ['005930'],
      },
    });
  });
});

function runtime(options: {
  applyDiff?: (diff: { subscribe: readonly string[]; unsubscribe: readonly string[] }) => Promise<void>;
  getRealtimeTickers?: () => readonly string[];
  sessionGate?: ReturnType<typeof createRealtimeSessionGate>;
} = {}) {
  return {
    bridge: {
      applyDiff: options.applyDiff ?? vi.fn(async () => undefined),
      getRealtimeTickers: options.getRealtimeTickers ?? vi.fn(() => []),
    },
    sessionGate: options.sessionGate ?? createRealtimeSessionGate(),
    marketHoursScheduler: {
      getCurrentPhase: () => 'open',
    },
  };
}
