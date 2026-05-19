import { describe, expect, it } from 'vitest';

import type { AgentEventPayload } from '../api-client';
import {
  agentCandidateScore,
  buildAgentCandidateViewModel,
  dedupeAgentCandidateEvents,
  sanitizeAgentEventReason,
} from '../agent-candidate-view-model';

describe('agent candidate view model', () => {
  it('normalizes a market movement candidate without raw provider copy', () => {
    const event = makeEvent({
      id: 'event-live',
      type: 'market_movement_detected',
      ticker: '277810',
      product: {
        productCode: 'A277810',
        krTicker: '277810',
        market: 'KOSDAQ',
        displayName: '레인보우로보틱스',
      },
      source: 'kis-ws-tick',
      reason: 'KIS WS tick 가격 업데이트 감지 · 등락률 4.2% · dedupeKey:raw-key',
      freshnessMs: 240,
      relevance: 0.8,
      confidence: 0.91,
    });

    const view = buildAgentCandidateViewModel(event, { '277810': '레인보우로보틱스' });

    expect(view.displayName).toBe('레인보우로보틱스');
    expect(view.ticker).toBe('277810');
    expect(view.typeLabel).toBe('시장 급변');
    expect(view.sourceLabel).toBe('가격 움직임');
    expect(view.reasonLabel).toContain('가격 업데이트 · 등락률 4.2%');
    expect(view.reasonLabel).not.toContain('KIS WS');
    expect(view.reasonLabel).not.toContain('dedupeKey');
    expect(view.freshnessLabel).toBe('방금');
    expect(view.confidenceLabel).toBe('신뢰 높음');
    expect(view.stageLabel).toBe('후보');
    expect(view.decision).toBe('buy');
    expect(view.decisionLabel).toBe('매수 검토');
    expect(view.strategyLabel).toBe('단기 모멘텀');
    expect(view.riskLabel).toBe('모의만 · 실거래 잠금');
    expect(view.explanationLabels).toEqual(
      expect.arrayContaining([
        '0~30초 가격 움직임',
        '신뢰 높음',
        '실거래 전 리스크 확인 필요',
      ]),
    );
    expect(view.explanationLabels.join(' ')).not.toContain('dedupeKey');
    expect(view.canCreatePreview).toBe(true);
    expect(view.score).toBeGreaterThanOrEqual(70);
  });

  it('labels downward market movement as 급락 instead of 급상승', () => {
    const event = makeEvent({
      id: 'event-down',
      type: 'market_movement_detected',
      ticker: '064800',
      product: {
        productCode: 'A064800',
        krTicker: '064800',
        market: 'KOSDAQ',
        displayName: '포니링크',
      },
      source: 'realtime-momentum',
      reason: '실시간 모멘텀 · 강한 단기 급락 · 30초 · -3.26%',
      freshnessMs: 120,
      relevance: 0.8,
      confidence: 0.91,
    });

    const view = buildAgentCandidateViewModel(event, { '064800': '포니링크' });

    expect(view.reasonLabel).toContain('급락 신호');
    expect(view.reasonLabel).not.toContain('급상승 신호');
    expect(view.decision).toBe('sell');
    expect(view.decisionLabel).toBe('매도 검토');
    expect(view.strategyLabel).toBe('하락 방어');
    expect(view.explanationLabels).toEqual(
      expect.arrayContaining(['하락/급락 리스크', '보유 리스크 먼저 확인']),
    );
  });

  it('labels TOP100 하락 rotation as 급락 even without a percent value', () => {
    const event = makeEvent({
      id: 'event-top100-down',
      type: 'market_movement_detected',
      ticker: '084670',
      source: 'toss-top100-rotation',
      reason: 'Toss TOP100 rotation · TOP100 하락 #5',
      freshnessMs: 120,
      relevance: 0.8,
      confidence: 0.91,
    });

    const view = buildAgentCandidateViewModel(event);

    expect(view.reasonLabel).toContain('급락 신호');
    expect(view.reasonLabel).toContain('TOP100 하락 #5');
    expect(view.reasonLabel).not.toContain('급상승 신호');
  });

  it('keeps upward market movement as 급상승', () => {
    const event = makeEvent({
      id: 'event-up',
      type: 'market_movement_detected',
      ticker: '084670',
      source: 'realtime-momentum',
      reason: '실시간 모멘텀 · 강한 단기 급등 · 30초 · +3.26%',
      freshnessMs: 120,
      relevance: 0.8,
      confidence: 0.91,
    });

    const view = buildAgentCandidateViewModel(event);

    expect(view.reasonLabel).toContain('급상승 신호');
    expect(view.reasonLabel).not.toContain('급락 신호');
    expect(view.decision).toBe('buy');
  });

  it('keeps low-confidence news as observe instead of pretending a trade decision is ready', () => {
    const view = buildAgentCandidateViewModel(
      makeEvent({
        type: 'news_detected',
        reason: 'New stock news detected: 단순 기사',
        confidence: 0.25,
        relevance: 0.2,
        freshnessMs: 20 * 60_000,
      }),
    );

    expect(view.decision).toBe('observe');
    expect(view.decisionLabel).toBe('관찰');
    expect(view.decisionReasonLabel).toContain('추가 근거 필요');
    expect(view.strategyLabel).toBe('정보 관찰');
    expect(view.riskLabel).toBe('근거 부족 · 관찰');
  });

  it('prefers server decision-support labels when present', () => {
    const view = buildAgentCandidateViewModel(
      makeEvent({
        type: 'news_detected',
        reason: 'New stock news detected: 단순 기사',
        confidence: 0.2,
        relevance: 0.2,
        decisionSupport: {
          decision: 'buy',
          policyVersion: 'araon-agent-decision-v1',
          score: 91,
          strategyLabel: '서버 전략',
          riskLabel: '서버 리스크',
          evaluationLabels: ['서버 평가'],
          readinessLabels: ['서버 준비'],
          explanationLabels: ['서버 근거'],
          liveExecutionLocked: true,
        },
      }),
    );

    expect(view.decision).toBe('buy');
    expect(view.decisionLabel).toBe('매수 검토');
    expect(view.score).toBe(91);
    expect(view.scoreLabel).toBe('점수 91');
    expect(view.strategyLabel).toBe('서버 전략');
    expect(view.riskLabel).toBe('서버 리스크');
    expect(view.evaluationLabels).toEqual(['서버 평가']);
    expect(view.readinessLabels).toEqual(['서버 준비']);
    expect(view.explanationLabels).toEqual(['서버 근거']);
  });

  it('marks skipped candidates as ignore', () => {
    const view = buildAgentCandidateViewModel(
      makeEvent({
        type: 'order_intent_skipped',
        reason: '리스크 한도 초과',
        skipReason: '리스크 한도 초과',
      }),
    );

    expect(view.decision).toBe('ignore');
    expect(view.decisionLabel).toBe('제외');
    expect(view.decisionReasonLabel).toBe('리스크 한도 초과');
    expect(view.strategyLabel).toBe('제외');
    expect(view.riskLabel).toBe('제외 · 리스크 한도 초과');
    expect(view.explanationLabels).toContain('리스크 한도 초과');
  });

  it('maps preview and approval lifecycle events to locked decision-support states', () => {
    const preview = buildAgentCandidateViewModel(
      makeEvent({
        type: 'preview_created',
        reason: 'Local simulated order preview created; live execution remains locked.',
      }),
    );
    const approval = buildAgentCandidateViewModel(
      makeEvent({
        type: 'approval_requested',
        reason: 'Fresh confirmation challenge created; live execution remains locked.',
      }),
    );
    const locked = buildAgentCandidateViewModel(
      makeEvent({
        type: 'execution_locked',
        reason: 'Live order execution is disabled.',
      }),
    );

    expect(preview.stageLabel).toBe('모의 가능');
    expect(preview.reasonLabel).toBe('모의 미리보기 생성');
    expect(preview.canCreatePreview).toBe(false);
    expect(approval.stageLabel).toBe('승인 대기');
    expect(approval.reasonLabel).toBe('승인 확인 필요');
    expect(locked.stageLabel).toBe('실거래 잠금');
    expect(locked.reasonLabel).toBe('실거래 실행 잠김');
  });

  it('keeps scoring deterministic and freshness-sensitive', () => {
    const fresh = makeEvent({
      type: 'market_movement_detected',
      freshnessMs: 400,
      relevance: 0.9,
      confidence: 0.9,
    });
    const stale = makeEvent({
      type: 'market_movement_detected',
      freshnessMs: 4 * 60 * 60_000,
      relevance: 0.9,
      confidence: 0.9,
    });

    expect(agentCandidateScore(fresh)).toBeGreaterThan(agentCandidateScore(stale));
    expect(agentCandidateScore(fresh)).toBe(agentCandidateScore(fresh));
  });

  it('dedupes semantic duplicates by event type and product identity', () => {
    const events = [
      makeEvent({
        id: 'a',
        type: 'market_movement_detected',
        ticker: '084670',
        product: {
          productCode: 'A084670',
          krTicker: '084670',
          market: 'KOSPI',
          displayName: '동양고속',
        },
      }),
      makeEvent({
        id: 'b',
        type: 'market_movement_detected',
        ticker: '084670',
        product: {
          productCode: 'A084670',
          krTicker: '084670',
          market: 'KOSPI',
          displayName: '동양고속',
        },
      }),
      makeEvent({
        id: 'c',
        type: 'news_detected',
        ticker: '084670',
        product: {
          productCode: 'A084670',
          krTicker: '084670',
          market: 'KOSPI',
          displayName: '동양고속',
        },
      }),
    ];

    expect(dedupeAgentCandidateEvents(events).map((event) => event.id)).toEqual([
      'a',
      'c',
    ]);
  });

  it('sanitizes internal reason fragments consistently', () => {
    expect(
      sanitizeAgentEventReason(
        'Toss TOP100 rotation · realtime-momentum · payloadRef:abc 가격 업데이트 감지',
      ),
    ).toBe('가격 업데이트');
  });
});

function makeEvent(
  overrides: Partial<AgentEventPayload> = {},
): AgentEventPayload {
  return {
    id: 'event-1',
    type: 'news_detected',
    ticker: '005930',
    product: {
      productCode: 'A005930',
      krTicker: '005930',
      market: 'KOSPI',
      displayName: '삼성전자',
    },
    source: 'test',
    publishedAt: null,
    firstSeenAt: '2026-05-19T00:00:00.000Z',
    freshnessMs: 18_000,
    freshness: 'near_realtime',
    relevance: 0.7,
    confidence: 0.72,
    reason: 'New stock news detected: 삼성전자 신규 뉴스',
    payloadRef: null,
    rawPayloadRedacted: true,
    relatedIds: {
      watchlistId: null,
      holdingId: null,
      orderIntentId: null,
      approvalId: null,
    },
    skipReason: null,
    createdAt: '2026-05-19T00:00:00.000Z',
    ...overrides,
  };
}
