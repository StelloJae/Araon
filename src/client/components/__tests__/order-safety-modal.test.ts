import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { OrderSafetyModal } from '../OrderSafetyModal';

describe('OrderSafetyModal', () => {
  it('uses human Korean safety copy and keeps live execution locked', () => {
    const html = renderToStaticMarkup(
      createElement(OrderSafetyModal, {
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
            riskChecks: [],
            lifecycle: [
              {
                code: 'strategy_evaluated',
                status: 'not_ready',
                label: '전략 평가',
                detail: '실제 전략 엔진은 아직 준비되지 않았습니다.',
              },
              {
                code: 'execution_locked',
                status: 'blocked',
                label: '실행 잠금',
                detail: 'Toss 주문 실행은 잠겨 있습니다.',
              },
            ],
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
          ],
          generatedAt: '2026-05-11T07:12:00.000Z',
        },
        loading: false,
        onCreateApprovalChallenge: vi.fn(),
        onConfirmApprovalChallenge: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    expect(html).toContain('주문 미리보기 · 승인 · 기록');
    expect(html).toContain('실거래 실행 잠금');
    expect(html).toContain('모의 / 기록용');
    expect(html).toContain('뉴스 감지 후보');
    expect(html).toContain('승인 확인 · 실행 잠금');
    expect(html).toContain('판단 단계');
    expect(html).toContain('전략 평가');
    expect(html).toContain('준비 안됨');
    expect(html).toContain('실거래 차단');
    expect(html).toContain('긴급 정지 켜짐');
    expect(html).toContain('자동거래 준비 1개 필요');
    expect(html).toContain('의사결정 엔진');
    expect(html).not.toContain('Trading safety');
    expect(html).not.toContain('LIVE EXECUTION LOCKED');
    expect(html).not.toContain('intent-1');
    expect(html).not.toContain('audit-1');
    expect(html).not.toContain('challenge-1');
    expect(html).not.toContain('operator-1');
  });
});
