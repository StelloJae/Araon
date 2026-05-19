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
            previewImpact: {
              status: 'estimated',
              estimatedNotionalKrw: 500000,
              positionImpact: '수량 미정',
              cashImpact: '-500,000원 사용 예상',
              pnlImpact: '체결 전 포지션이라 손익은 계산하지 않습니다.',
              liveExecutionImpact: '실제 주문은 생성하지 않습니다. 승인 게이트와 긴급 정지에서 실행이 잠겨 있습니다.',
            },
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
          executionReadiness: {
            orderAdapter: {
              provider: 'toss',
              mode: 'dry_run_locked',
              status: 'contract_ready',
              liveMutationEnabled: false,
              supportedMarkets: ['KR'],
              supportedSides: ['buy', 'sell'],
              supportedOrderTypes: ['market', 'limit'],
            },
            lockedExecutor: {
              status: 'ready_locked',
              blockedBeforeNetwork: true,
              liveMutationEnabled: false,
              output: 'locked_execution_proof',
              requires: ['fresh_approval', 'risk_policy', 'kill_switch_release', 'reconciliation_ready'],
            },
            liveApprovalExecutor: {
              status: 'ready_locked',
              blockedBeforeAdapter: true,
              liveMutationEnabled: false,
              input: 'confirmed_approval_challenge',
              output: 'locked_execution_proof',
              requires: ['confirmed_approval_challenge', 'intent_hash_match', 'kill_switch_release', 'locked_order_adapter'],
            },
            approvalGate: {
              status: 'locked',
              requiresFreshApproval: true,
              confirmationChallenge: true,
              liveExecutionLocked: true,
            },
            reconciliation: {
              status: 'planned',
              source: 'toss_account_readonly_snapshot',
              requiredStates: [
                'submitted',
                'accepted',
                'rejected',
                'partial_fill',
                'filled',
                'canceled',
              ],
              executor: {
                status: 'read_only_ready',
                requiredInputs: ['intent_hash', 'order_summary', 'read_only_account_snapshot'],
                matchKeys: ['intent_hash', 'ticker', 'side'],
                liveMutationEnabled: false,
              },
              liveMutationEnabled: false,
            },
            dataFreshnessGate: {
              status: 'ready_locked',
              blocksLiveExecution: true,
              liveMutationEnabled: false,
              requiredSources: ['quote', 'chart', 'news_or_disclosure', 'watchlist_membership'],
              maxAgeMs: {
                quote: 1000,
                chart: 60000,
                newsOrDisclosure: 300000,
                watchlistMembership: 300000,
              },
            },
          },
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
    expect(html).toContain('매수 검토 · 신중');
    expect(html).toContain('실거래 잠금 · 모의만');
    expect(html).toContain('-500,000원 변화 · 미기록');
    expect(html).toContain('수량 미정 · -500,000원 사용 예상');
    expect(html).toContain('체결 전 포지션이라 손익은 계산하지 않습니다.');
    expect(html).toContain('뉴스 감지 후보');
    expect(html).toContain('승인 확인 · 실행 잠금');
    expect(html).toContain('판단 단계');
    expect(html).toContain('전략 평가');
    expect(html).toContain('준비 안됨');
    expect(html).toContain('실거래 차단');
    expect(html).toContain('긴급 정지 켜짐');
    expect(html).toContain('자동거래 준비 1개 필요');
    expect(html).toContain('의사결정 엔진');
    expect(html).toContain('실행 준비 계약');
    expect(html).toContain('Toss dry-run 계약 준비');
    expect(html).toContain('네트워크 주문 전 차단 · proof만 생성');
    expect(html).toContain('승인 후에도 주문 연결 전 차단');
    expect(html).toContain('fresh 승인 필요 · 실행 잠금');
    expect(html).toContain('6개 상태 · read-only 대조 계획');
    expect(html).toContain('데이터 신선도');
    expect(html).toContain('가격/차트/뉴스·공시 확인 전 차단');
    expect(html).not.toContain('Trading safety');
    expect(html).not.toContain('LIVE EXECUTION LOCKED');
    expect(html).not.toContain('dry_run_locked');
    expect(html).not.toContain('contract_ready');
    expect(html).not.toContain('toss_account_readonly_snapshot');
    expect(html).not.toContain('intent-1');
    expect(html).not.toContain('paper-preview:intent-1');
    expect(html).not.toContain('audit-1');
    expect(html).not.toContain('challenge-1');
    expect(html).not.toContain('operator-1');
  });

  it('summarizes multiple live-risk checks without exposing internal codes', () => {
    const html = renderToStaticMarkup(
      createElement(OrderSafetyModal, {
        previews: [
          {
            id: 'intent-risk-1',
            ticker: '005930',
            side: 'buy',
            market: 'KR',
            requestedMode: 'simulated',
            executionMode: 'simulated',
            status: 'preview_ready',
            liveExecutionLocked: true,
            quantity: 1,
            cashAmount: null,
            orderType: 'market',
            limitPrice: null,
            triggerEventId: null,
            agentId: null,
            reason: 'market_movement_detected candidate',
            riskChecks: [
              { code: 'policy_approval_missing', status: 'blocked', message: 'Fresh explicit live approval policy is missing.' },
              { code: 'allowed_universe_missing', status: 'blocked', message: 'Live allowed ticker universe is not configured.' },
              { code: 'cooldown_missing', status: 'warning', message: 'Live order cooldown is not configured.' },
            ],
            strategyEvaluation: {
              strategyId: 'araon-deterministic-preview-v1',
              status: 'evaluated',
              decision: 'buy',
              confidence: 'guarded',
              rationale: '매수 후보를 모의 미리보기로만 평가했습니다.',
              signals: ['operator-context-only', 'simulated-mode'],
            },
            riskPolicy: {
              policyId: 'araon-live-lock-risk-v1',
              status: 'simulated_only',
              liveBlocked: true,
              maxOrderKrw: null,
              maxDailyLossKrw: null,
              checks: [
                { code: 'policy_approval_missing', status: 'blocked', message: 'Fresh explicit live approval policy is missing.' },
                { code: 'allowed_universe_missing', status: 'blocked', message: 'Live allowed ticker universe is not configured.' },
                { code: 'cooldown_missing', status: 'warning', message: 'Live order cooldown is not configured.' },
              ],
            },
            paperLedgerPreview: undefined,
            previewImpact: {
              status: 'estimated',
              estimatedNotionalKrw: null,
              positionImpact: '+1주 매수 예정',
              cashImpact: '현금 영향 추정 대기',
              pnlImpact: '체결 전 포지션이라 손익은 계산하지 않습니다.',
              liveExecutionImpact: '실제 주문은 생성하지 않습니다. 승인 게이트와 긴급 정지에서 실행이 잠겨 있습니다.',
            },
            lifecycle: [],
            createdAt: '2026-05-11T07:10:00.000Z',
            expiresAt: '2026-05-11T07:15:00.000Z',
            auditRef: 'audit-risk-1',
          },
        ],
        audit: [],
        approvalChallenges: [],
        livePolicy: null,
        loading: false,
        onCreateApprovalChallenge: vi.fn(),
        onConfirmApprovalChallenge: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    expect(html).toContain('2개 차단 · 1개 경고 · 모의만');
    expect(html).not.toContain('policy_approval_missing');
    expect(html).not.toContain('allowed_universe_missing');
    expect(html).not.toContain('cooldown_missing');
  });
});
