import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { OrderIntentSafetyRail } from '../OrderIntentSafetyRail';

describe('OrderIntentSafetyRail', () => {
  it('renders live-locked preview and audit status without internal identifiers', () => {
    const html = renderToStaticMarkup(
      createElement(OrderIntentSafetyRail, {
        previews: [
          {
            id: 'intent-1',
            ticker: '005930',
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
            reason: 'news_detected candidate',
            riskChecks: [
              {
                code: 'live_execution_locked',
                status: 'blocked',
                message: 'Live execution requires approval.',
              },
            ],
            strategyEvaluation: {
              strategyId: 'araon-deterministic-preview-v1',
              status: 'evaluated',
              decision: 'buy',
              confidence: 'guarded',
              rationale: '매수 후보를 모의 미리보기로만 평가했습니다.',
              signals: ['event-linked', 'simulated-mode'],
            },
            riskPolicy: {
              policyId: 'araon-live-lock-risk-v1',
              status: 'simulated_only',
              liveBlocked: true,
              maxOrderKrw: null,
              maxDailyLossKrw: null,
              checks: [],
            },
            paperLedgerPreview: {
              ledgerId: 'paper-preview:intent-1',
              status: 'preview_only',
              booked: false,
              positionDelta: null,
              cashDeltaKrw: -500000,
              note: '실제 원장에 기록하지 않는 모의 변화량입니다.',
            },
            lifecycle: [],
            createdAt: '2026-05-11T07:10:00.000Z',
            expiresAt: '2026-05-11T07:15:00.000Z',
            auditRef: 'audit-1',
          },
        ],
        audit: [
          {
            id: 'audit-1',
            intentId: 'intent-1',
            event: 'live_execution_blocked',
            decision: 'blocked',
            ticker: '005930',
            side: 'buy',
            requestedMode: 'live',
            agentId: 'agent-1',
            triggerEventId: 'event-1',
            reason: 'Live order execution is disabled.',
            createdAt: '2026-05-11T07:11:00.000Z',
          },
        ],
        approvalChallenges: [
          {
            id: 'challenge-1',
            intentId: 'intent-1',
            ticker: '005930',
            side: 'buy',
            requestedMode: 'live',
            status: 'confirmed_live_locked',
            confirmationText: 'CONFIRM 005930 BUY LIVE',
            intentHash: 'abc123def4567890',
            orderSummary: {
              ticker: '005930',
              side: 'buy',
              market: 'KR',
              orderType: 'market',
              quantity: null,
              cashAmount: 500000,
              limitPrice: null,
              liveExecutionLocked: true,
            },
            killSwitch: 'engaged',
            liveExecutionLocked: true,
            operatorId: 'operator-1',
            createdAt: '2026-05-11T07:12:00.000Z',
            expiresAt: '2026-05-11T07:17:00.000Z',
            confirmedAt: '2026-05-11T07:13:00.000Z',
            auditRef: 'audit-confirm-1',
          },
        ],
        livePolicy: {
          liveExecutionEnabled: false,
          policyApproved: false,
          killSwitch: 'engaged',
          allowedTickers: [],
          maxOrderKrw: null,
          maxDailyLossKrw: null,
          tradingHours: null,
          allowedOrderTypes: [],
          cooldownMs: null,
          missingConstraints: ['policy_approval', 'kill_switch_release'],
          automationReadinessGaps: [
            {
              code: 'decision_engine',
              status: 'not_ready',
              severity: 'blocking',
              label: '의사결정 엔진',
              detail: '자동 매매 판단 엔진은 아직 준비되지 않았습니다.',
            },
            {
              code: 'risk_policy',
              status: 'not_ready',
              severity: 'blocking',
              label: '리스크 정책',
              detail: '실거래 리스크 정책이 준비되지 않았습니다.',
            },
            {
              code: 'toss_order_execution',
              status: 'locked',
              severity: 'blocking',
              label: 'Toss 주문 실행',
              detail: '실제 Toss 주문 실행은 잠겨 있습니다.',
            },
          ],
          generatedAt: '2026-05-11T07:12:00.000Z',
        },
        loading: false,
      }),
    );

    expect(html).toContain('거래 안전장치');
    expect(html).toContain('실거래 잠금');
    expect(html).toContain('005930');
    expect(html).toContain('매수 검토');
    expect(html).toContain('모의 주문');
    expect(html).toContain('-500,000원');
    expect(html).toContain('500,000원');
    expect(html).toContain('차단');
    expect(html).toContain('실행 없음');
    expect(html).toContain('긴급 정지 켜짐');
    expect(html).toContain('미승인 2개');
    expect(html).toContain('승인 확인 · 실행 잠금');
    expect(html).toContain('005930 매수 · 500,000원 · 지문 abc123de · 긴급 정지');
    expect(html).toContain('자동거래 준비 안됨');
    expect(html).toContain('의사결정 엔진 · 리스크 정책 · Toss 주문 실행');
    expect(html).not.toContain('intent-1');
    expect(html).not.toContain('audit-1');
    expect(html).not.toContain('agent-1');
    expect(html).not.toContain('event-1');
    expect(html).not.toContain('challenge-1');
    expect(html).not.toContain('audit-confirm-1');
    expect(html).not.toContain('operator-1');
    expect(html).not.toContain('CONFIRM 005930 BUY LIVE');
    expect(html).not.toContain('paper-preview:intent-1');
  });

  it('keeps an honest empty state instead of inventing previews', () => {
    const html = renderToStaticMarkup(
      createElement(OrderIntentSafetyRail, {
        previews: [],
        audit: [],
        approvalChallenges: [],
        livePolicy: null,
        loading: false,
      }),
    );

    expect(html).toContain('주문 미리보기 없음');
    expect(html).toContain('승인 기록 없음');
    expect(html).toContain('정책 확인 중');
    expect(html).toContain('신규 승인 없음');
    expect(html).toContain('자동거래 준비 안됨');
    expect(html).not.toContain('005930');
  });

  it('shows the locked agent decision pipeline in user-facing language', () => {
    const html = renderToStaticMarkup(
      createElement(OrderIntentSafetyRail, {
        previews: [],
        audit: [],
        approvalChallenges: [],
        livePolicy: null,
        loading: false,
      }),
    );

    expect(html).toContain('판단 흐름');
    expect(html).toContain('감지');
    expect(html).toContain('후보');
    expect(html).toContain('근거');
    expect(html).toContain('모의');
    expect(html).toContain('리스크');
    expect(html).toContain('승인');
    expect(html).toContain('실행 잠금');
    expect(html).not.toContain('decision engine');
    expect(html).not.toContain('order execution');
  });
});
