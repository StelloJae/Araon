import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { createAgentEventQueue } from '../../agent/agent-event-queue.js';
import { agentEventsRoutes } from '../agent-events.js';

describe('agent events routes', () => {
  it('returns a sanitized read-only snapshot for future UI and agent consumers', async () => {
    const queue = createAgentEventQueue({
      idFactory: () => 'evt-1',
      now: () => '2026-05-11T06:00:30.000Z',
    });
    queue.enqueue({
      type: 'market_movement_detected',
      ticker: 'A005930',
      source: 'toss-sse',
      publishedAt: null,
      relevance: 0.6,
      confidence: 0.65,
      reason: 'Toss SSE price-refresh thin notification',
      dedupeKey: 'toss-sse:price-refresh:005930:2026-05-11T06:00:01.000Z',
      payloadRef: null,
    });

    const app = Fastify({ logger: false });
    await app.register(agentEventsRoutes, { queue });

    const res = await app.inject({ method: 'GET', url: '/agent/events?limit=5' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: {
        items: [
          {
            id: 'evt-1',
            type: 'market_movement_detected',
            ticker: '005930',
            source: 'toss-sse',
            publishedAt: null,
            firstSeenAt: '2026-05-11T06:00:30.000Z',
            freshnessMs: null,
            freshness: 'unknown',
            relevance: 0.6,
            confidence: 0.65,
            reason: 'Toss SSE price-refresh thin notification',
            payloadRef: null,
            product: {
              productCode: 'A005930',
              krTicker: '005930',
              market: null,
              displayName: null,
            },
            rawPayloadRedacted: true,
            relatedIds: {
              watchlistId: null,
              holdingId: null,
              orderIntentId: null,
              approvalId: null,
            },
            skipReason: null,
            createdAt: '2026-05-11T06:00:30.000Z',
            decisionSupport: {
              decision: 'buy',
              policyVersion: 'araon-agent-decision-v1',
              score: 74,
              strategyLabel: '단기 모멘텀',
              riskLabel: '모의만 · 실거래 잠금',
              evaluationLabels: [
                '점수 74',
                '시장 움직임 후보',
                '신선도 확인 필요',
                '신뢰 중간',
              ],
              readinessLabels: [
                '모의 미리보기만 가능',
                '리스크 확인 필요',
                '실거래 잠금',
              ],
              explanationLabels: [
                '0~30초 가격 움직임',
                '신뢰 중간',
                '실거래 전 리스크 확인 필요',
              ],
              liveExecutionLocked: true,
            },
          },
        ],
        returnedCount: 1,
      },
    });
    expect(JSON.stringify(res.json())).not.toContain('dedupeKey');
    expect(JSON.stringify(res.json())).not.toContain('price-refresh:005930');
    expect(JSON.stringify(res.json())).not.toContain('SESSION');
  });

  it('does not echo sensitive queue snapshot errors', async () => {
    const queue = {
      ...createAgentEventQueue(),
      snapshot() {
        throw new Error(
          'queue failed near SESSION=[test-session] accountNo=[test-account] dedupeKey=provider-key',
        );
      },
    };
    const app = Fastify({ logger: false });
    await app.register(agentEventsRoutes, { queue });

    const res = await app.inject({ method: 'GET', url: '/agent/events?limit=5' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      success: false,
      error: {
        code: 'agent_events_snapshot_failed',
        message: 'Agent event snapshot failed',
      },
    });
    expect(res.body).not.toContain('SESSION');
    expect(res.body).not.toContain('[test-session]');
    expect(res.body).not.toContain('accountNo');
    expect(res.body).not.toContain('[test-account]');
    expect(res.body).not.toContain('dedupeKey');
    expect(res.body).not.toContain('provider-key');
  });
});
