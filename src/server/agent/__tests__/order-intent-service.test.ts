import { describe, expect, it } from 'vitest';

import { createAgentEventQueue } from '../agent-event-queue.js';
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
    expect(result.preview.riskChecks).toEqual([
      {
        code: 'policy_approval_missing',
        status: 'blocked',
        message: 'Fresh explicit live approval policy is missing.',
      },
      {
        code: 'allowed_universe_missing',
        status: 'blocked',
        message: 'Live allowed ticker universe is not configured.',
      },
      {
        code: 'max_order_amount_missing',
        status: 'blocked',
        message: 'Live maximum order amount is not configured.',
      },
      {
        code: 'max_daily_loss_missing',
        status: 'blocked',
        message: 'Live maximum daily loss is not configured.',
      },
      {
        code: 'trading_hours_missing',
        status: 'blocked',
        message: 'Live trading-hours guard is not configured.',
      },
      {
        code: 'order_type_policy_missing',
        status: 'blocked',
        message: 'Live allowed order types are not configured.',
      },
      {
        code: 'cooldown_missing',
        status: 'warning',
        message: 'Live order cooldown is not configured.',
      },
      {
        code: 'live_execution_locked',
        status: 'blocked',
        message: 'Live execution requires kill-switch release before any network order.',
      },
    ]);
    expect(result.preview.strategyEvaluation).toMatchObject({
      strategyId: 'araon-deterministic-preview-v1',
      status: 'evaluated',
      decision: 'buy',
      confidence: 'guarded',
      signals: expect.arrayContaining(['event-linked', 'simulated-mode', 'KR-market', 'limit-order']),
    });
    expect(result.preview.riskPolicy).toMatchObject({
      policyId: 'araon-live-lock-risk-v1',
      status: 'simulated_only',
      liveBlocked: true,
      maxOrderKrw: null,
      maxDailyLossKrw: null,
    });
    expect(result.preview.paperLedgerPreview).toEqual({
      ledgerId: 'paper-preview:intent-1',
      status: 'preview_only',
      booked: false,
      positionDelta: 3,
      cashDeltaKrw: null,
      note: '실제 원장에 기록하지 않는 모의 변화량입니다.',
    });
    expect(result.preview.previewImpact).toEqual({
      status: 'estimated',
      estimatedNotionalKrw: 2694000,
      positionImpact: '+3주 매수 예정',
      cashImpact: '-2,694,000원 사용 예상',
      pnlImpact: '체결 전 포지션이라 손익은 계산하지 않습니다.',
      liveExecutionImpact: '실제 주문은 생성하지 않습니다. 승인 게이트와 긴급 정지에서 실행이 잠겨 있습니다.',
    });
    expect(result.preview!.lifecycle).toEqual([
      expect.objectContaining({ code: 'candidate_observed', status: 'complete' }),
      expect.objectContaining({ code: 'evidence_collected', status: 'complete' }),
      expect.objectContaining({ code: 'strategy_evaluated', status: 'complete' }),
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

  it('publishes risk and preview lifecycle events to the agent queue without live execution', () => {
    const queue = createAgentEventQueue({
      idFactory: (() => {
        const ids = ['evt-risk', 'evt-preview'];
        return () => ids.shift() ?? 'evt-extra';
      })(),
      now: () => '2026-05-11T13:30:00.000Z',
    });
    const service = createOrderIntentService({
      idFactory: () => 'intent-agent-1',
      auditIdFactory: () => 'audit-agent-1',
      now: () => '2026-05-11T13:30:00.000Z',
      agentEventQueue: queue,
    });

    const result = service.createPreview({
      ticker: 'A005930',
      side: 'buy',
      market: 'KR',
      cashAmount: 500000,
      triggerEventId: 'evt-source-1',
      agentId: 'araon-agent',
      reason: 'news_detected candidate',
      requestedMode: 'simulated',
    });

    expect(result.preview).toMatchObject({
      id: 'intent-agent-1',
      liveExecutionLocked: true,
      auditRef: 'audit-agent-1',
    });
    expect(queue.snapshot()).toEqual([
      expect.objectContaining({
        id: 'evt-preview',
        type: 'preview_created',
        ticker: '005930',
        productCode: 'A005930',
        source: 'order-intent',
        firstSeenAt: '2026-05-11T13:30:00.000Z',
        confidence: 1,
        reason: 'Local simulated order preview created; live execution remains locked.',
        relatedIds: expect.objectContaining({
          orderIntentId: 'intent-agent-1',
        }),
      }),
      expect.objectContaining({
        id: 'evt-risk',
        type: 'risk_check_completed',
        ticker: '005930',
        source: 'order-intent',
        firstSeenAt: '2026-05-11T13:30:00.000Z',
        confidence: 1,
        reason: 'Risk check completed; live execution remains locked.',
        relatedIds: expect.objectContaining({
          orderIntentId: 'intent-agent-1',
        }),
      }),
    ]);
    expect(JSON.stringify(queue.snapshot())).not.toMatch(/SESSION|accountNumber|orderNo|approval_key/i);
  });

  it('builds a paper sell ledger preview without booking a live execution', () => {
    const service = createOrderIntentService({
      idFactory: () => 'intent-sell-1',
      auditIdFactory: () => 'audit-sell-1',
      now: () => '2026-05-11T13:30:00.000Z',
    });

    const result = service.createPreview({
      ticker: '005930',
      side: 'sell',
      market: 'KR',
      cashAmount: 120000,
      reason: 'risk reduction candidate',
      requestedMode: 'paper',
    });

    expect(result.preview).toMatchObject({
      id: 'intent-sell-1',
      side: 'sell',
      requestedMode: 'paper',
      executionMode: 'paper',
      liveExecutionLocked: true,
      strategyEvaluation: expect.objectContaining({
        decision: 'sell',
        signals: expect.arrayContaining(['operator-context-only', 'paper-mode', 'KR-market']),
      }),
      paperLedgerPreview: {
        ledgerId: 'paper-preview:intent-sell-1',
        status: 'preview_only',
        booked: false,
        positionDelta: null,
        cashDeltaKrw: 120000,
        note: '실제 원장에 기록하지 않는 모의 변화량입니다.',
      },
      previewImpact: {
        status: 'estimated',
        estimatedNotionalKrw: 120000,
        positionImpact: '수량 미정',
        cashImpact: '+120,000원 확보 예상',
        pnlImpact: '보유 평균단가와 실제 체결가 대조 전이라 손익은 계산하지 않습니다.',
        liveExecutionImpact: '실제 주문은 생성하지 않습니다. 승인 게이트와 긴급 정지에서 실행이 잠겨 있습니다.',
      },
    });
    expect(service.snapshotAudit()).toEqual([
      expect.objectContaining({
        id: 'audit-sell-1',
        event: 'preview_created',
        decision: 'allowed',
        ticker: '005930',
      }),
    ]);
    expect(service.snapshotPaperLedger()).toEqual({
      returnedCount: 1,
      items: [
        {
          id: 'paper-preview:intent-sell-1',
          intentId: 'intent-sell-1',
          ticker: '005930',
          side: 'sell',
          market: 'KR',
          status: 'preview_only',
          booked: false,
          positionDelta: null,
          cashDeltaKrw: 120000,
          note: '실제 원장에 기록하지 않는 모의 변화량입니다.',
          createdAt: '2026-05-11T13:30:00.000Z',
        },
      ],
      summary: {
        entryCount: 1,
        bookedCount: 0,
        previewOnlyCount: 1,
        cashDeltaKrw: 120000,
        byTicker: [
          {
            ticker: '005930',
            previewCount: 1,
            positionDelta: 0,
            cashDeltaKrw: 120000,
            lastPreviewAt: '2026-05-11T13:30:00.000Z',
          },
        ],
      },
    });
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
        expect.objectContaining({ code: 'decision_engine', status: 'partial', label: '의사결정 엔진' }),
        expect.objectContaining({ code: 'strategy_policy', status: 'partial', label: '전략 정책' }),
        expect.objectContaining({ code: 'risk_policy', status: 'partial', label: '리스크 정책' }),
        expect.objectContaining({ code: 'paper_trading_ledger', status: 'partial', label: '페이퍼 거래 원장' }),
        expect.objectContaining({ code: 'simulation_result_view', status: 'partial', label: '시뮬레이션 결과' }),
        expect.objectContaining({ code: 'toss_order_execution', status: 'locked', label: 'Toss 주문 실행' }),
        expect.objectContaining({ code: 'live_approval_executor', status: 'locked', label: '실거래 승인 실행기' }),
        expect.objectContaining({ code: 'execution_reconciliation', status: 'partial', label: '체결/잔고 대조' }),
        expect.objectContaining({ code: 'agent_performance_audit', status: 'partial', label: '에이전트 성과 감사' }),
        expect.objectContaining({ code: 'intent_explanation', status: 'partial', label: '판단 사유 설명' }),
        expect.objectContaining({ code: 'provider_freshness', status: 'partial', label: '데이터 신선도 보장' }),
        expect.objectContaining({ code: 'event_dedupe', status: 'partial', label: '이벤트 중복 제거' }),
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
          requiredStates: ['submitted', 'accepted', 'rejected', 'partial_fill', 'filled', 'canceled'],
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
      intentHash: expect.stringMatching(/^[a-f0-9]{16}$/),
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
    expect(confirmed.execution).toBeNull();
    expect(confirmed.lockedExecutionProof).toMatchObject({
      provider: 'toss',
      mode: 'dry_run_locked',
      status: 'blocked',
      reason: 'live_execution_locked',
      liveMutationEnabled: false,
      challengeId: 'challenge-1',
      intentId: 'intent-confirm-1',
      intentHash: expect.stringMatching(/^[a-f0-9]{16}$/),
      orderSummary: expect.objectContaining({
        ticker: '005930',
        side: 'buy',
        cashAmount: 500000,
        liveExecutionLocked: true,
      }),
      killSwitch: 'engaged',
      checkedAt: '2026-05-11T13:45:20.000Z',
    });
    expect(service.snapshotApprovalChallenges()).toEqual([
      expect.objectContaining({
        id: 'challenge-1',
        status: 'confirmed_live_locked',
        confirmationText: 'CONFIRM 005930 BUY LIVE',
        intentHash: expect.stringMatching(/^[a-f0-9]{16}$/),
        orderSummary: expect.objectContaining({
          ticker: '005930',
          side: 'buy',
          cashAmount: 500000,
        }),
        killSwitch: 'engaged',
      }),
    ]);
    expect(service.snapshotReconciliation()).toEqual({
      items: [
        {
          id: 'reconcile:challenge-1',
          intentId: 'intent-confirm-1',
          challengeId: 'challenge-1',
          ticker: '005930',
          side: 'buy',
          status: 'not_submitted_live_locked',
          reason: 'live_execution_locked',
          liveMutationEnabled: false,
          execution: null,
          intentHash: expect.stringMatching(/^[a-f0-9]{16}$/),
          orderSummary: expect.objectContaining({
            ticker: '005930',
            side: 'buy',
            cashAmount: 500000,
            liveExecutionLocked: true,
          }),
          checkedAt: '2026-05-11T13:45:20.000Z',
        },
      ],
      returnedCount: 1,
      liveMutationEnabled: false,
      source: 'local_locked_execution_proof',
      generatedAt: '2026-05-11T13:45:20.000Z',
      summary: {
        checkedCount: 1,
        liveSubmittedCount: 0,
        blockedCount: 1,
        pendingAccountSnapshotCount: 0,
      },
    });
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
    expect(JSON.stringify(service.snapshotReconciliation())).not.toMatch(/SESSION|accountNumber|orderNo|approval_key/i);
  });
});
