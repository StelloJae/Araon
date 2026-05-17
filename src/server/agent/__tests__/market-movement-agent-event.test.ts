import { describe, expect, it } from 'vitest';
import type { Price } from '@shared/types.js';

import { createAgentEventQueue } from '../agent-event-queue.js';
import {
  enqueueMarketMovementFromPrice,
  enqueueMarketMovementFromTopMover,
} from '../market-movement-agent-event.js';

function price(overrides: Partial<Price> = {}): Price {
  return {
    ticker: '005930',
    price: 10000,
    changeRate: 3.21,
    changeAbs: 120,
    volume: 123456,
    tradeAt: '2026-05-12T00:01:12.000Z',
    updatedAt: '2026-05-12T00:01:15.000Z',
    isSnapshot: false,
    source: 'ws-integrated',
    ...overrides,
  };
}

describe('market movement agent event', () => {
  it('normalizes an applied KIS realtime tick into a throttled market movement event', () => {
    const queue = createAgentEventQueue({
      idFactory: () => 'event-1',
      now: () => '2026-05-12T00:01:20.000Z',
    });

    const result = enqueueMarketMovementFromPrice({
      queue,
      price: price(),
      source: 'kis-ws-tick',
      now: () => '2026-05-12T00:01:20.000Z',
    });

    expect(result?.inserted).toBe(true);
    expect(queue.snapshot()).toEqual([
      expect.objectContaining({
        id: 'event-1',
        type: 'market_movement_detected',
        ticker: '005930',
        source: 'kis-ws-tick',
        publishedAt: '2026-05-12T00:01:12.000Z',
        firstSeenAt: '2026-05-12T00:01:20.000Z',
        freshnessMs: 8000,
        dedupeKey: 'market-movement:kis-ws-tick:005930:2026-05-12T00:01:00.000Z',
        payloadRef: null,
      }),
    ]);
    expect(queue.snapshot()[0]?.reason).toBe('가격 업데이트 감지 · 등락률 3.21%');
    expect(queue.snapshot()[0]?.reason).not.toContain('KIS WS tick');
    expect(queue.snapshot()[0]?.reason).not.toContain('실시간 추적');
    expect(JSON.stringify(queue.snapshot())).not.toContain('10000');
  });

  it('dedupes repeated ticks in the same source ticker minute bucket', () => {
    let id = 0;
    const queue = createAgentEventQueue({
      idFactory: () => `event-${++id}`,
      now: () => '2026-05-12T00:01:20.000Z',
    });

    const first = enqueueMarketMovementFromPrice({
      queue,
      price: price({ updatedAt: '2026-05-12T00:01:15.000Z' }),
      source: 'kis-ws-tick',
      now: () => '2026-05-12T00:01:20.000Z',
    });
    const second = enqueueMarketMovementFromPrice({
      queue,
      price: price({ updatedAt: '2026-05-12T00:01:40.000Z' }),
      source: 'kis-ws-tick',
      now: () => '2026-05-12T00:01:45.000Z',
    });

    expect(first?.inserted).toBe(true);
    expect(second?.inserted).toBe(false);
    expect(queue.snapshot()).toHaveLength(1);
  });

  it('skips price movements below the configured threshold', () => {
    const queue = createAgentEventQueue();

    expect(enqueueMarketMovementFromPrice({
      queue,
      price: price({ changeRate: 2.99 }),
      source: 'kis-ws-tick',
    })).toBeNull();
    expect(enqueueMarketMovementFromPrice({
      queue,
      price: price({ changeRate: -1.65 }),
      source: 'kis-ws-tick',
    })).toBeNull();
    expect(enqueueMarketMovementFromPrice({
      queue,
      price: price({ changeRate: 4.99 }),
      source: 'toss-fast-quote',
      thresholdPct: 5,
    })).toBeNull();
    expect(queue.snapshot()).toEqual([]);
  });

  it('skips snapshot prices and non-KR tickers', () => {
    const queue = createAgentEventQueue();

    expect(enqueueMarketMovementFromPrice({
      queue,
      price: price({ isSnapshot: true }),
      source: 'kis-ws-tick',
    })).toBeNull();
    expect(enqueueMarketMovementFromPrice({
      queue,
      price: price({ ticker: 'AAPL' }),
      source: 'kis-ws-tick',
    })).toBeNull();
    expect(queue.snapshot()).toEqual([]);
  });

  it('normalizes a Toss TOP100 rotation entry without raw price payloads', () => {
    const queue = createAgentEventQueue({
      idFactory: () => 'event-top100',
      now: () => '2026-05-12T00:02:15.000Z',
    });

    const result = enqueueMarketMovementFromTopMover({
      queue,
      candidate: {
        ticker: 'A005930',
        direction: 'gainers',
        rank: 3,
        reason: 'TOP100 상승 #3',
        score: 0.98,
        ttlMs: 240_000,
        lastSeenAt: '2026-05-12T00:02:00.000Z',
      },
      source: 'toss-top100-rotation',
      now: () => '2026-05-12T00:02:15.000Z',
    });

    expect(result?.inserted).toBe(true);
    expect(queue.snapshot()).toEqual([
      expect.objectContaining({
        id: 'event-top100',
        type: 'market_movement_detected',
        ticker: '005930',
        source: 'toss-top100-rotation',
        publishedAt: '2026-05-12T00:02:00.000Z',
        firstSeenAt: '2026-05-12T00:02:15.000Z',
        freshnessMs: 15_000,
        relevance: 0.98,
        confidence: 0.66,
        reason: 'TOP100 상승 #3',
        dedupeKey: 'market-movement:toss-top100-rotation:gainers:005930:2026-05-12T00:02:00.000Z',
        payloadRef: null,
      }),
    ]);
    expect(JSON.stringify(queue.snapshot())).not.toContain('price');
  });
});
