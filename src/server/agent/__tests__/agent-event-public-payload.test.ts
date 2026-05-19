import { describe, expect, it } from 'vitest';

import { createAgentEventQueue } from '../agent-event-queue.js';
import {
  agentEventFreshness,
  agentEventToPublicPayload,
} from '../agent-event-public-payload.js';

describe('agent event public payload', () => {
  it('keeps provider dedupe keys internal while preserving normalized event evidence', () => {
    const queue = createAgentEventQueue({
      idFactory: () => 'evt-public',
      now: () => '2026-05-11T06:00:20.000Z',
    });

    const result = queue.enqueue({
      type: 'news_detected',
      ticker: 'A005930',
      source: 'toss-asset-news',
      publishedAt: '2026-05-11T06:00:00.000Z',
      relevance: 0.82,
      confidence: 0.78,
      reason: 'Toss asset news matched selected ticker',
      dedupeKey: 'news:toss-asset-news:provider-raw-id',
      payloadRef: null,
      productCode: 'A005930',
      market: 'KOSPI',
      displayName: '삼성전자',
    });

    const payload = agentEventToPublicPayload(result.event);

    expect(payload).toMatchObject({
      id: 'evt-public',
      type: 'news_detected',
      ticker: '005930',
      product: {
        productCode: 'A005930',
        krTicker: '005930',
        market: 'KOSPI',
        displayName: '삼성전자',
      },
      source: 'toss-asset-news',
      publishedAt: '2026-05-11T06:00:00.000Z',
      firstSeenAt: '2026-05-11T06:00:20.000Z',
      freshnessMs: 20_000,
      freshness: 'near_realtime',
      relevance: 0.82,
      confidence: 0.78,
      rawPayloadRedacted: true,
    });
    expect(JSON.stringify(payload)).not.toContain('dedupeKey');
    expect(JSON.stringify(payload)).not.toContain('provider-raw-id');
  });

  it('classifies event freshness without inventing provider timing', () => {
    expect(agentEventFreshness(null)).toBe('unknown');
    expect(agentEventFreshness(30_000)).toBe('near_realtime');
    expect(agentEventFreshness(300_000)).toBe('recent');
    expect(agentEventFreshness(300_001)).toBe('stale');
  });

  it('adds decision-support labels for upward market movement candidates', () => {
    const queue = createAgentEventQueue({
      idFactory: () => 'evt-upward',
      now: () => '2026-05-11T06:00:20.000Z',
    });

    const result = queue.enqueue({
      type: 'market_movement_detected',
      ticker: 'A005930',
      source: 'toss-fast-quote',
      publishedAt: '2026-05-11T06:00:18.000Z',
      relevance: 0.9,
      confidence: 0.86,
      reason: '가격 업데이트 · 등락률 +3.45%',
      dedupeKey: 'movement:upward:provider-raw-id',
      productCode: 'A005930',
      market: 'KOSPI',
      displayName: '삼성전자',
    });

    const payload = agentEventToPublicPayload(result.event);

    expect(payload.decisionSupport).toMatchObject({
      decision: 'buy',
      policyVersion: 'araon-agent-decision-v1',
      score: expect.any(Number),
      strategyLabel: '단기 모멘텀',
      riskLabel: '모의만 · 실거래 잠금',
      evaluationLabels: expect.arrayContaining(['시장 움직임 후보', '신선도 높음']),
      readinessLabels: expect.arrayContaining(['모의 미리보기만 가능', '실거래 잠금']),
      liveExecutionLocked: true,
    });
    expect(payload.decisionSupport.score).toBeGreaterThanOrEqual(65);
    expect(payload.decisionSupport.explanationLabels).toEqual(
      expect.arrayContaining(['0~30초 가격 움직임', '실거래 전 리스크 확인 필요']),
    );
    expect(JSON.stringify(payload.decisionSupport)).not.toContain('provider-raw-id');
  });

  it('classifies downward movement as sell-risk rather than upside surge', () => {
    const queue = createAgentEventQueue({
      idFactory: () => 'evt-downward',
      now: () => '2026-05-11T06:00:20.000Z',
    });

    const result = queue.enqueue({
      type: 'market_movement_detected',
      ticker: 'A005930',
      source: 'toss-top100-losers',
      publishedAt: '2026-05-11T06:00:18.000Z',
      relevance: 0.9,
      confidence: 0.86,
      reason: 'TOP100 하락 · 등락률 -4.12%',
      dedupeKey: 'movement:downward:provider-raw-id',
      productCode: 'A005930',
      market: 'KOSPI',
      displayName: '삼성전자',
    });

    const payload = agentEventToPublicPayload(result.event);

    expect(payload.decisionSupport).toMatchObject({
      decision: 'sell',
      policyVersion: 'araon-agent-decision-v1',
      strategyLabel: '하락 방어',
      riskLabel: '모의만 · 실거래 잠금',
      evaluationLabels: expect.arrayContaining(['시장 움직임 후보']),
      readinessLabels: expect.arrayContaining(['모의 미리보기만 가능', '실거래 잠금']),
      liveExecutionLocked: true,
    });
    expect(payload.decisionSupport.explanationLabels).toEqual(
      expect.arrayContaining(['하락/급락 리스크', '보유 리스크 먼저 확인']),
    );
  });

  it('marks skipped events as ignored with a sanitized reason', () => {
    const queue = createAgentEventQueue({
      idFactory: () => 'evt-skipped',
      now: () => '2026-05-11T06:00:20.000Z',
    });

    const result = queue.enqueue({
      type: 'order_intent_skipped',
      ticker: 'A005930',
      source: 'agent-policy',
      publishedAt: '2026-05-11T06:00:18.000Z',
      relevance: 0.7,
      confidence: 0.8,
      reason: 'Risk check completed; live execution remains locked.',
      dedupeKey: 'skip:provider-raw-id',
      skipReason: 'live execution locked',
      productCode: 'A005930',
      market: 'KOSPI',
      displayName: '삼성전자',
    });

    const payload = agentEventToPublicPayload(result.event);

    expect(payload.decisionSupport).toMatchObject({
      decision: 'ignore',
      policyVersion: 'araon-agent-decision-v1',
      strategyLabel: '제외',
      riskLabel: '제외 · 실거래 잠금',
      readinessLabels: expect.arrayContaining(['실거래 잠금']),
      liveExecutionLocked: true,
    });
    expect(payload.decisionSupport.explanationLabels).toEqual(['실거래 잠금']);
    expect(JSON.stringify(payload.decisionSupport)).not.toContain('provider-raw-id');
  });
});
