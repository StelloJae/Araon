import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type {
  AgentEventPayload,
  OrderIntentApprovalChallengePayload,
  OrderIntentLivePolicyPayload,
  OrderIntentPaperLedgerSnapshotPayload,
  OrderIntentPerformanceReviewSnapshotPayload,
  OrderIntentPreviewPayload,
} from '../../lib/api-client';
import { AgentDecisionSummary } from '../AgentDecisionSummary';

describe('AgentDecisionSummary', () => {
  it('shows the agent as decision support with live execution locked', () => {
    const html = renderToStaticMarkup(
      createElement(AgentDecisionSummary, {
        events: [
          makeEvent({
            type: 'market_movement_detected',
            ticker: '277810',
            product: {
              productCode: 'A277810',
              krTicker: '277810',
              market: 'KOSDAQ',
              displayName: '레인보우로보틱스',
            },
            reason: 'KIS WS tick 가격 업데이트 감지 · 등락률 4.2%',
          }),
        ],
        previews: [makePreview()],
        approvalChallenges: [makeApprovalChallenge()],
        livePolicy: makeLivePolicy(),
        paperLedger: makePaperLedger(),
        performanceReview: makePerformanceReview(),
        loading: false,
      }),
    );

    expect(html).toContain('감지 → 후보 → 근거 → 모의 → 리스크 → 승인 → 잠금');
    expect(html).toContain('실거래 잠금');
    expect(html).toContain('1 후보');
    expect(html).toContain('1 미리보기');
    expect(html).toContain('페이퍼 원장');
    expect(html).toContain('모의 1건');
    expect(html).toContain('실제 0건');
    expect(html).toContain('성과 리뷰');
    expect(html).toContain('리뷰 1건');
    expect(html).toContain('시장 결과 대기');
    expect(html).toContain('-500,000원');
    expect(html).toContain('1건');
    expect(html).toContain('3개');
    expect(html).toContain('레인보우로보틱스');
    expect(html).toContain('급상승 신호');
    expect(html).toContain('단기 모멘텀');
    expect(html).toContain('모의만 · 실거래 잠금');
    expect(html).toContain('점수');
    expect(html).toContain('시장 움직임 후보');
    expect(html).toContain('전략 정책');
    expect(html).toContain('리스크 정책');
    expect(html).toContain('Toss 주문 실행');
    expect(html).not.toContain('KIS WS');
    expect(html).not.toContain('agent-1');
    expect(html).not.toContain('challenge-1');
  });

  it('keeps an honest empty state', () => {
    const html = renderToStaticMarkup(
      createElement(AgentDecisionSummary, {
        events: [],
        previews: [],
        approvalChallenges: [],
        livePolicy: null,
        loading: false,
      }),
    );

    expect(html).toContain('아직 감지된 후보가 없습니다.');
    expect(html).toContain('전략·리스크·주문·정산 상태 확인 필요');
    expect(html).not.toContain('005930');
  });
});

function makePerformanceReview(): OrderIntentPerformanceReviewSnapshotPayload {
  return {
    items: [
      {
        id: 'performance-review:paper-preview:intent-1',
        intentId: 'intent-1',
        ticker: '277810',
        side: 'buy',
        market: 'KR',
        outcomeStatus: 'pending_market_result',
        booked: false,
        liveMutationEnabled: false,
        reviewLabel: '시장 결과 대기',
        reason: '실제 체결 없이 모의 미리보기만 기록했습니다.',
        createdAt: '2026-05-19T00:00:00.000Z',
        reviewedAt: '2026-05-19T00:00:00.000Z',
      },
    ],
    returnedCount: 1,
    liveMutationEnabled: false,
    source: 'paper_ledger_preview_only',
    generatedAt: '2026-05-19T00:00:00.000Z',
    summary: {
      previewOnlyCount: 1,
      bookedCount: 0,
      pendingReviewCount: 1,
      buyPreviewCount: 1,
      sellPreviewCount: 0,
      liveSubmittedCount: 0,
      reviewedTickerCount: 1,
      latestPreviewAt: '2026-05-19T00:00:00.000Z',
      reviewStatus: 'needs_market_result',
    },
  };
}

function makeEvent(overrides: Partial<AgentEventPayload> = {}): AgentEventPayload {
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

function makePaperLedger(): OrderIntentPaperLedgerSnapshotPayload {
  return {
    items: [
      {
        id: 'paper-preview:intent-1',
        intentId: 'intent-1',
        ticker: '277810',
        side: 'buy',
        market: 'KR',
        status: 'preview_only',
        booked: false,
        positionDelta: null,
        cashDeltaKrw: -500000,
        note: '실제 원장에 기록하지 않는 모의 변화량입니다.',
        createdAt: '2026-05-19T00:00:00.000Z',
      },
    ],
    returnedCount: 1,
    summary: {
      entryCount: 1,
      bookedCount: 0,
      previewOnlyCount: 1,
      cashDeltaKrw: -500000,
      byTicker: [
        {
          ticker: '277810',
          previewCount: 1,
          positionDelta: 0,
          cashDeltaKrw: -500000,
          lastPreviewAt: '2026-05-19T00:00:00.000Z',
        },
      ],
    },
  };
}

function makePreview(): OrderIntentPreviewPayload {
  return {
    id: 'intent-1',
    ticker: '277810',
    side: 'buy',
    market: 'KR',
    requestedMode: 'simulated',
    executionMode: 'simulated',
    status: 'preview_ready',
    liveExecutionLocked: true,
    quantity: null,
    cashAmount: 500000,
    orderType: 'market',
    limitPrice: null,
    triggerEventId: 'event-1',
    agentId: 'agent-1',
    reason: 'candidate',
    riskChecks: [],
    lifecycle: [],
    createdAt: '2026-05-19T00:00:00.000Z',
    expiresAt: '2026-05-19T00:05:00.000Z',
    auditRef: null,
  };
}

function makeApprovalChallenge(): OrderIntentApprovalChallengePayload {
  return {
    id: 'challenge-1',
    intentId: 'intent-1',
    ticker: '277810',
    side: 'buy',
    requestedMode: 'live',
    status: 'pending_confirmation',
    confirmationText: 'CONFIRM 277810 BUY LIVE',
    liveExecutionLocked: true,
    operatorId: null,
    createdAt: '2026-05-19T00:00:00.000Z',
    expiresAt: '2026-05-19T00:05:00.000Z',
    confirmedAt: null,
    auditRef: null,
  };
}

function makeLivePolicy(): OrderIntentLivePolicyPayload {
  return {
    liveExecutionEnabled: false,
    policyApproved: false,
    killSwitch: 'engaged',
    allowedTickers: [],
    maxOrderKrw: null,
    maxDailyLossKrw: null,
    tradingHours: null,
    allowedOrderTypes: [],
    cooldownMs: null,
    missingConstraints: ['policy_approval'],
    automationReadinessGaps: [
      {
        code: 'strategy_policy',
        status: 'not_ready',
        severity: 'blocking',
        label: '전략 정책',
        detail: '전략 정책이 준비되지 않았습니다.',
      },
      {
        code: 'risk_policy',
        status: 'not_ready',
        severity: 'blocking',
        label: '리스크 정책',
        detail: '리스크 정책이 준비되지 않았습니다.',
      },
      {
        code: 'toss_order_execution',
        status: 'locked',
        severity: 'blocking',
        label: 'Toss 주문 실행',
        detail: '실제 주문 실행은 잠겨 있습니다.',
      },
    ],
    generatedAt: '2026-05-19T00:00:00.000Z',
  };
}
