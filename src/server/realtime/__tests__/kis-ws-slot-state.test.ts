import { describe, expect, it } from 'vitest';

import { createKisWsSlotStateStore } from '../kis-ws-slot-state.js';

describe('KIS WS slot state store', () => {
  it('remembers subscribe times and clears slots that leave the plan', () => {
    const store = createKisWsSlotStateStore();

    store.applyPlan({
      generatedAt: '2026-05-11T06:00:00.000Z',
      subscribed: [
        {
          ticker: 'A010130',
          state: 'subscribed',
          source: 'top100_rotation',
          reason: 'TOP100 상승 #1',
          score: 1,
          priority: 100,
          ttlMs: 240_000,
          lastSeenAt: '2026-05-11T05:59:30.000Z',
          pinned: false,
        },
      ],
    });

    expect(store.snapshot()).toEqual([
      {
        ticker: '010130',
        subscribedAt: '2026-05-11T06:00:00.000Z',
        stickyUntilAt: '2026-05-11T06:00:30.000Z',
      },
    ]);

    store.applyPlan({
      generatedAt: '2026-05-11T06:00:10.000Z',
      subscribed: [
        {
          ticker: '010130',
          state: 'subscribed',
          source: 'top100_rotation',
          reason: 'TOP100 상승 #1',
          score: 1,
          priority: 100,
          ttlMs: 230_000,
          lastSeenAt: '2026-05-11T05:59:30.000Z',
          pinned: false,
        },
        {
          ticker: '005380',
          state: 'subscribed',
          source: 'current_view',
          reason: '현재 화면',
          score: 0.9,
          priority: 500,
          ttlMs: 300_000,
          lastSeenAt: '2026-05-11T06:00:10.000Z',
          pinned: false,
        },
      ],
    });

    expect(store.snapshot()).toEqual([
      {
        ticker: '010130',
        subscribedAt: '2026-05-11T06:00:00.000Z',
        stickyUntilAt: '2026-05-11T06:00:30.000Z',
      },
      {
        ticker: '005380',
        subscribedAt: '2026-05-11T06:00:10.000Z',
        stickyUntilAt: '2026-05-11T06:00:40.000Z',
      },
    ]);

    store.applyPlan({
      generatedAt: '2026-05-11T06:00:40.000Z',
      subscribed: [
        {
          ticker: '005380',
          state: 'subscribed',
          source: 'current_view',
          reason: '현재 화면',
          score: 0.9,
          priority: 500,
          ttlMs: 300_000,
          lastSeenAt: '2026-05-11T06:00:40.000Z',
          pinned: false,
        },
      ],
    });

    expect(store.snapshot()).toEqual([
      {
        ticker: '005380',
        subscribedAt: '2026-05-11T06:00:10.000Z',
        stickyUntilAt: '2026-05-11T06:00:40.000Z',
      },
    ]);

    store.clear();
    expect(store.snapshot()).toEqual([]);
  });

  it('records a sanitized rebalance status for operator visibility', () => {
    const store = createKisWsSlotStateStore();
    const fakeSessionValue = `session-${'value'}`;
    const fakeSession = `SESSION${'='}${fakeSessionValue}`;

    store.recordRebalance({
      requestedAt: '2026-05-11T06:01:00.000Z',
      reason: `agent-event:news_detected ${fakeSession}`,
      outcome: 'rebalanced',
      activeCount: 1,
      fallbackCount: 2,
      diff: {
        subscribe: ['A000660'],
        unsubscribe: ['005930'],
      },
    });

    expect(store.rebalanceSnapshot()).toEqual({
      requestedAt: '2026-05-11T06:01:00.000Z',
      reason: 'agent-event:news_detected',
      outcome: 'rebalanced',
      skipReason: null,
      activeCount: 1,
      fallbackCount: 2,
      diff: {
        subscribe: ['000660'],
        unsubscribe: ['005930'],
      },
    });

    store.clear();
    expect(store.rebalanceSnapshot()).toBeNull();

    store.recordRebalance({
      requestedAt: '2026-05-11T06:02:00.000Z',
      reason: fakeSession,
      outcome: 'skipped',
      skipReason: 'session_disabled',
    });

    expect(store.rebalanceSnapshot()).toMatchObject({
      reason: 'rebalance',
      outcome: 'skipped',
      skipReason: 'session_disabled',
    });
  });
});
