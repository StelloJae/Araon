import { describe, expect, it } from 'vitest';
import { WS_MAX_SUBSCRIPTIONS } from '@shared/kis-constraints.js';

import { allocateKisWsSlots } from '../kis-ws-slot-allocator.js';

describe('KIS WS smart slot allocator', () => {
  it('assigns only the highest-value candidates within the per-profile cap', () => {
    const candidates = [
      candidate('005930', 'holding', 'Toss holding', 0.7),
      candidate('000660', 'holding', 'Toss holding', 0.6),
      candidate('035420', 'user_pin', 'User pinned realtime', 0.5),
      candidate('005380', 'current_view', 'Current chart', 0.95),
      candidate('042660', 'recent_news', 'Fresh news detected', 1),
      candidate('247540', 'agent_candidate', 'Agent candidate', 1),
    ];

    const plan = allocateKisWsSlots({
      candidates,
      previousSubscribed: ['042660'],
      cap: 4,
      now: '2026-05-11T06:00:10.000Z',
    });

    expect(plan.cap).toBe(4);
    expect(plan.used).toBe(4);
    expect(plan.subscribed.map((item) => item.ticker)).toEqual([
      '005930',
      '000660',
      '035420',
      '005380',
    ]);
    expect(plan.fallback.map((item) => item.ticker)).toEqual(['042660', '247540']);
    expect(plan.diff).toEqual({
      subscribe: ['005930', '000660', '035420', '005380'],
      unsubscribe: ['042660'],
    });
    expect(plan.subscribed[0]).toMatchObject({
      state: 'subscribed',
      source: 'holding',
      reason: 'Toss holding',
      score: 0.7,
      pinned: false,
    });
    expect(plan.fallback[0]).toMatchObject({
      state: 'fallback',
      source: 'recent_news',
      reason: 'Fresh news detected',
    });
  });

  it('dedupes candidate sources and never exceeds WS_MAX_SUBSCRIPTIONS', () => {
    const topMoverCandidates = Array.from({ length: WS_MAX_SUBSCRIPTIONS + 5 }, (_, index) =>
      candidate(`${100000 + index}`, 'top100_rotation', 'TOP100 rotation sample', index / 100),
    );
    const plan = allocateKisWsSlots({
      candidates: [
        candidate('005930', 'manual_watchlist', 'Watchlist', 0.2),
        candidate('005930', 'recent_disclosure', 'Disclosure detected', 0.9),
        ...topMoverCandidates,
      ],
      cap: WS_MAX_SUBSCRIPTIONS + 10,
      now: '2026-05-11T06:00:10.000Z',
    });

    expect(plan.cap).toBe(WS_MAX_SUBSCRIPTIONS);
    expect(plan.subscribed).toHaveLength(WS_MAX_SUBSCRIPTIONS);
    expect(plan.subscribed[0]).toMatchObject({
      ticker: '005930',
      source: 'recent_disclosure',
      reason: 'Disclosure detected',
    });
    expect(plan.subscribed.every((item) => item.ticker !== 'A005930')).toBe(true);
  });

  it('keeps existing slots sticky during the churn cooldown window', () => {
    const plan = allocateKisWsSlots({
      candidates: [
        candidate('042660', 'recent_news', 'Fresh news detected', 0.2),
        candidate('005380', 'current_view', 'Current chart', 1),
      ],
      previousSubscribed: ['042660'],
      previousSlots: [
        { ticker: '042660', subscribedAt: '2026-05-11T06:00:00.000Z' },
      ],
      churnCooldownMs: 60_000,
      cap: 1,
      now: '2026-05-11T06:00:10.000Z',
    });

    expect(plan.subscribed.map((item) => item.ticker)).toEqual(['042660']);
    expect(plan.fallback.map((item) => item.ticker)).toEqual(['005380']);
    expect(plan.diff).toEqual({ subscribe: [], unsubscribe: [] });
  });
});

function candidate(
  ticker: string,
  source: Parameters<typeof allocateKisWsSlots>[0]['candidates'][number]['source'],
  reason: string,
  score: number,
) {
  return {
    ticker,
    source,
    reason,
    score,
    ttlMs: 120_000,
    lastSeenAt: '2026-05-11T06:00:00.000Z',
    pinned: source === 'user_pin',
  };
}
