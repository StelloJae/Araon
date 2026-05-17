import { describe, expect, it } from 'vitest';

import { createOrderIntentService } from '../order-intent-service.js';

describe('order intent service', () => {
  it('creates a local simulated preview with an audit entry and no live execution', () => {
    const service = createOrderIntentService({
      idFactory: () => 'intent-1',
      auditIdFactory: () => 'audit-1',
      now: () => '2026-05-11T13:30:00.000Z',
    });

    const result = service.createPreview({
      ticker: 'A005930',
      side: 'buy',
      market: 'KR',
      quantity: 3,
      orderType: 'limit',
      limitPrice: 898000,
      triggerEventId: 'evt-1',
      agentId: 'araon-agent',
      reason: 'New disclosure event for Samsung Electronics',
      requestedMode: 'simulated',
    });

    expect(result.preview).toMatchObject({
      id: 'intent-1',
      ticker: '005930',
      side: 'buy',
      market: 'KR',
      requestedMode: 'simulated',
      executionMode: 'simulated',
      status: 'preview_ready',
      liveExecutionLocked: true,
      quantity: 3,
      orderType: 'limit',
      limitPrice: 898000,
      triggerEventId: 'evt-1',
      agentId: 'araon-agent',
      auditRef: 'audit-1',
    });
    expect(result.preview.riskChecks).toContainEqual({
      code: 'live_execution_locked',
      status: 'blocked',
      message: 'Live execution requires a fresh explicit user approval gate.',
    });
    expect(result.preview!.lifecycle).toEqual([
      expect.objectContaining({ code: 'candidate_observed', status: 'complete' }),
      expect.objectContaining({ code: 'evidence_collected', status: 'complete' }),
      expect.objectContaining({ code: 'strategy_evaluated', status: 'not_ready' }),
      expect.objectContaining({ code: 'risk_checked', status: 'blocked' }),
      expect.objectContaining({ code: 'preview_created', status: 'complete' }),
      expect.objectContaining({ code: 'approval_required', status: 'pending' }),
      expect.objectContaining({ code: 'execution_locked', status: 'blocked' }),
    ]);
    expect(service.snapshotAudit()).toEqual([
      expect.objectContaining({
        id: 'audit-1',
        intentId: 'intent-1',
        event: 'preview_created',
        ticker: '005930',
        decision: 'allowed',
        reason: 'Local simulated order preview created; live execution remains locked.',
      }),
    ]);
    expect(JSON.stringify(result)).not.toMatch(/SESSION|accountNumber|appSecret|approval_key/i);
  });

  it('blocks live execution requests while preserving a skip reason in audit', () => {
    const service = createOrderIntentService({
      idFactory: () => 'intent-2',
      auditIdFactory: () => 'audit-2',
      now: () => '2026-05-11T13:31:00.000Z',
    });

    const result = service.createPreview({
      ticker: '005930',
      side: 'buy',
      quantity: 1,
      reason: 'Try live execution',
      requestedMode: 'live',
    });

    expect(result.preview).toBeNull();
    expect(result.rejection).toEqual({
      code: 'live_execution_locked',
      message: 'Live order execution is disabled until a fresh explicit approval policy is present.',
      auditRef: 'audit-2',
    });
    expect(service.snapshotAudit()).toEqual([
      expect.objectContaining({
        id: 'audit-2',
        intentId: null,
        event: 'live_execution_blocked',
        ticker: '005930',
        decision: 'blocked',
        reason: 'Live order execution is disabled until a fresh explicit approval policy is present.',
      }),
    ]);
  });

  it('reports a disabled live policy with all required production constraints missing', () => {
    const service = createOrderIntentService({
      now: () => '2026-05-11T13:42:00.000Z',
    });

    expect(service.snapshotLivePolicy()).toEqual({
      liveExecutionEnabled: false,
      policyApproved: false,
      killSwitch: 'engaged',
      allowedTickers: [],
      maxOrderKrw: null,
      maxDailyLossKrw: null,
      tradingHours: null,
      allowedOrderTypes: [],
      cooldownMs: null,
      missingConstraints: [
        'policy_approval',
        'allowed_tickers',
        'max_order_amount',
        'max_daily_loss',
        'trading_hours',
        'order_type',
        'cooldown',
        'kill_switch_release',
      ],
      automationReadinessGaps: [
        expect.objectContaining({ code: 'decision_engine', status: 'not_ready', label: '의사결정 엔진' }),
        expect.objectContaining({ code: 'strategy_policy', status: 'not_ready', label: '전략 정책' }),
        expect.objectContaining({ code: 'risk_policy', status: 'not_ready', label: '리스크 정책' }),
        expect.objectContaining({ code: 'paper_trading_ledger', status: 'not_ready', label: '페이퍼 거래 원장' }),
        expect.objectContaining({ code: 'simulation_result_view', status: 'not_ready', label: '시뮬레이션 결과' }),
        expect.objectContaining({ code: 'toss_order_execution', status: 'locked', label: 'Toss 주문 실행' }),
        expect.objectContaining({ code: 'live_approval_executor', status: 'locked', label: '실거래 승인 실행기' }),
        expect.objectContaining({ code: 'execution_reconciliation', status: 'not_ready', label: '체결/잔고 대조' }),
        expect.objectContaining({ code: 'agent_performance_audit', status: 'not_ready', label: '에이전트 성과 감사' }),
        expect.objectContaining({ code: 'intent_explanation', status: 'partial', label: '판단 사유 설명' }),
        expect.objectContaining({ code: 'provider_freshness', status: 'not_ready', label: '데이터 신선도 보장' }),
        expect.objectContaining({ code: 'event_dedupe', status: 'not_ready', label: '이벤트 중복 제거' }),
      ],
      generatedAt: '2026-05-11T13:42:00.000Z',
    });
  });

  it('creates and confirms a fresh approval challenge without unlocking live execution', () => {
    const service = createOrderIntentService({
      idFactory: () => 'intent-confirm-1',
      auditIdFactory: (() => {
        const ids = ['audit-preview', 'audit-challenge', 'audit-confirm'];
        return () => ids.shift() ?? 'audit-extra';
      })(),
      approvalChallengeIdFactory: () => 'challenge-1',
      now: (() => {
        const values = [
          '2026-05-11T13:45:00.000Z',
          '2026-05-11T13:45:05.000Z',
          '2026-05-11T13:45:20.000Z',
        ];
        return () => values.shift() ?? '2026-05-11T13:45:20.000Z';
      })(),
    });

    const preview = service.createPreview({
      ticker: '005930',
      side: 'buy',
      cashAmount: 500000,
      reason: 'news_detected candidate',
      requestedMode: 'simulated',
    }).preview;
    expect(preview).not.toBeNull();

    const challenge = service.createApprovalChallenge({
      intentId: preview!.id,
      operatorId: 'local-user',
      expiresInMs: 60_000,
    });

    expect(challenge.rejection).toBeNull();
    expect(challenge.challenge).toMatchObject({
      id: 'challenge-1',
      intentId: 'intent-confirm-1',
      ticker: '005930',
      side: 'buy',
      status: 'pending_confirmation',
      liveExecutionLocked: true,
      confirmationText: 'CONFIRM 005930 BUY LIVE',
      operatorId: 'local-user',
      auditRef: 'audit-challenge',
    });

    const confirmed = service.confirmApprovalChallenge({
      challengeId: 'challenge-1',
      confirmationText: 'CONFIRM 005930 BUY LIVE',
    });

    expect(confirmed.rejection).toBeNull();
    expect(confirmed.challenge).toMatchObject({
      id: 'challenge-1',
      status: 'confirmed_live_locked',
      liveExecutionLocked: true,
      confirmedAt: '2026-05-11T13:45:20.000Z',
    });
    expect(confirmed.liveExecutionLocked).toBe(true);
    expect(service.snapshotApprovalChallenges()).toEqual([
      expect.objectContaining({
        id: 'challenge-1',
        status: 'confirmed_live_locked',
        confirmationText: 'CONFIRM 005930 BUY LIVE',
      }),
    ]);
    expect(service.snapshotAudit()).toEqual([
      expect.objectContaining({
        id: 'audit-confirm',
        intentId: 'intent-confirm-1',
        event: 'confirm_token_verified_live_locked',
        decision: 'blocked',
        ticker: '005930',
        reason: 'Confirmation token verified; live execution remains locked.',
      }),
      expect.objectContaining({
        id: 'audit-challenge',
        event: 'confirm_challenge_created',
        decision: 'allowed',
      }),
      expect.objectContaining({
        id: 'audit-preview',
        event: 'preview_created',
      }),
    ]);
    expect(JSON.stringify(confirmed)).not.toMatch(/SESSION|accountNumber|approval_key/i);
  });
});
