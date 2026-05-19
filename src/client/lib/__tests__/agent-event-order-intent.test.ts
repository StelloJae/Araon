import { describe, expect, it } from 'vitest';

import { buildSimulatedBuyPreviewInputFromAgentEvent } from '../agent-event-order-intent';
import type { AgentEventPayload } from '../api-client';

describe('agent event order-intent mapping', () => {
  it('builds a KR simulated buy preview without inventing amount or leaking provider keys', () => {
    const input = buildSimulatedBuyPreviewInputFromAgentEvent(agentEvent({
      ticker: '005930',
      source: 'naver-finance',
      reason: 'New stock news detected: 삼성전자 신규 뉴스',
      payloadRef: 'stock-news:42',
    }));

    expect(input).toMatchObject({
      ticker: '005930',
      side: 'buy',
      market: 'KR',
      requestedMode: 'simulated',
      triggerEventId: 'event-1',
    });
    expect(input).not.toHaveProperty('cashAmount');
    expect(input).not.toHaveProperty('quantity');
    expect(input.reason).toContain('news_detected');
    expect(input.reason).toContain('naver-finance');
    expect(JSON.stringify(input)).not.toContain('internal-key');
    expect(JSON.stringify(input)).not.toContain('stock-news:42');
  });

  it('marks non-six-digit tickers as US while staying simulated', () => {
    const input = buildSimulatedBuyPreviewInputFromAgentEvent(agentEvent({
      ticker: 'AAPL',
      source: 'toss-signal',
      reason: 'Toss signal candidate',
      payloadRef: null,
    }));

    expect(input.market).toBe('US');
    expect(input.requestedMode).toBe('simulated');
  });

  it('maps downward market movement to a simulated sell preview without live execution', () => {
    const input = buildSimulatedBuyPreviewInputFromAgentEvent(agentEvent({
      type: 'market_movement_detected',
      ticker: '064800',
      source: 'toss-fast-quote',
      reason: '실시간 모멘텀 · 강한 단기 급락 · 30초 · -3.26%',
      payloadRef: null,
    }));

    expect(input).toMatchObject({
      ticker: '064800',
      side: 'sell',
      market: 'KR',
      requestedMode: 'simulated',
      triggerEventId: 'event-1',
    });
    expect(input).not.toHaveProperty('cashAmount');
    expect(input).not.toHaveProperty('quantity');
  });
});

function agentEvent(overrides: Partial<AgentEventPayload>): AgentEventPayload {
  return {
    id: 'event-1',
    type: 'news_detected',
    ticker: '005930',
    source: 'naver-finance',
    publishedAt: '2026-05-11T06:00:00.000Z',
    firstSeenAt: '2026-05-11T06:00:18.000Z',
    freshnessMs: 18_000,
    freshness: 'near_realtime',
    relevance: 0.7,
    confidence: 0.72,
    reason: 'New stock news detected',
    payloadRef: 'stock-news:42',
    createdAt: '2026-05-11T06:00:18.000Z',
    ...overrides,
  };
}
