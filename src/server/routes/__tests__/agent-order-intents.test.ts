import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { createOrderIntentService } from '../../agent/order-intent-service.js';
import { agentOrderIntentRoutes } from '../agent-order-intents.js';

describe('agent order intent routes', () => {
  it('exposes simulated previews and a sanitized audit trail', async () => {
    const service = createOrderIntentService({
      idFactory: () => 'intent-1',
      auditIdFactory: () => 'audit-1',
      now: () => '2026-05-11T13:40:00.000Z',
    });
    const app = Fastify({ logger: false });
    await app.register(agentOrderIntentRoutes, { service });
    const rawSession = ['SESSION', 'should-not-echo'].join('=');

    const preview = await app.inject({
      method: 'POST',
      url: '/agent/order-intents/preview',
      payload: {
        ticker: 'A005930',
        side: 'buy',
        market: 'KR',
        cashAmount: 500000,
        orderType: 'market',
        triggerEventId: 'evt-1',
        reason: 'agent wants a paper preview',
        requestedMode: 'simulated',
        rawSession,
      },
    });

    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      success: true,
      data: {
        preview: {
          id: 'intent-1',
          ticker: '005930',
          side: 'buy',
          requestedMode: 'simulated',
          executionMode: 'simulated',
          liveExecutionLocked: true,
          cashAmount: 500000,
          previewImpact: {
            status: 'estimated',
            estimatedNotionalKrw: 500000,
            positionImpact: '수량 미정',
            cashImpact: '-500,000원 사용 예상',
            pnlImpact: '체결 전 포지션이라 손익은 계산하지 않습니다.',
            liveExecutionImpact: '실제 주문은 생성하지 않습니다. 승인 게이트와 긴급 정지에서 실행이 잠겨 있습니다.',
          },
          auditRef: 'audit-1',
          lifecycle: [
            expect.objectContaining({ code: 'candidate_observed', status: 'complete' }),
            expect.objectContaining({ code: 'evidence_collected', status: 'complete' }),
            expect.objectContaining({ code: 'strategy_evaluated', status: 'complete' }),
            expect.objectContaining({ code: 'risk_checked', status: 'blocked' }),
            expect.objectContaining({ code: 'preview_created', status: 'complete' }),
            expect.objectContaining({ code: 'approval_required', status: 'pending' }),
            expect.objectContaining({ code: 'execution_locked', status: 'blocked' }),
          ],
        },
      },
    });

    const audit = await app.inject({ method: 'GET', url: '/agent/order-intents/audit?limit=5' });
    expect(audit.statusCode).toBe(200);
    expect(audit.json()).toMatchObject({
      success: true,
      data: {
        returnedCount: 1,
        items: [
          {
            id: 'audit-1',
            intentId: 'intent-1',
            event: 'preview_created',
            decision: 'allowed',
            ticker: '005930',
          },
        ],
      },
    });
    expect(audit.body).not.toContain(rawSession);

    const intents = await app.inject({ method: 'GET', url: '/agent/order-intents?limit=5' });
    expect(intents.statusCode).toBe(200);
    expect(intents.json()).toMatchObject({
      success: true,
      data: {
        returnedCount: 1,
        items: [
          {
            id: 'intent-1',
            ticker: '005930',
            executionMode: 'simulated',
            liveExecutionLocked: true,
            auditRef: 'audit-1',
          },
        ],
      },
    });
  });

  it('rejects live mode at the approval gate before any execution path exists', async () => {
    const service = createOrderIntentService({
      auditIdFactory: () => 'audit-live-block',
      now: () => '2026-05-11T13:41:00.000Z',
    });
    const app = Fastify({ logger: false });
    await app.register(agentOrderIntentRoutes, { service });

    const res = await app.inject({
      method: 'POST',
      url: '/agent/order-intents/preview',
      payload: {
        ticker: '005930',
        side: 'buy',
        quantity: 1,
        reason: 'please buy live',
        requestedMode: 'live',
      },
    });

    expect(res.statusCode).toBe(423);
    expect(res.json()).toEqual({
      success: false,
      error: {
        code: 'live_execution_locked',
        message: 'Live order execution is disabled until a fresh explicit approval policy is present.',
      },
      data: {
        auditRef: 'audit-live-block',
      },
    });
  });

  it('redacts secret-like text from agent reasons before preview and audit exposure', async () => {
    const service = createOrderIntentService({
      idFactory: () => 'intent-redacted',
      auditIdFactory: () => 'audit-redacted',
      now: () => '2026-05-11T13:40:00.000Z',
    });
    const app = Fastify({ logger: false });
    await app.register(agentOrderIntentRoutes, { service });
    const sessionValue = ['session', 'value'].join('-');
    const accountValue = ['1234', '5678'].join('');
    const orderValue = ['raw', 'order', 'no'].join('-');
    const redactedSession = ['SESSION', '[REDACTED]'].join('=');
    const redactedAccount = ['accountNo', '[REDACTED]'].join('=');
    const redactedOrder = ['orderNo', '[REDACTED]'].join('=');
    const sensitiveReason = [
      'news_detected',
      ['SESSION', sessionValue].join('='),
      ['accountNo', accountValue].join('='),
      ['orderNo', orderValue].join('='),
    ].join(' ');

    const res = await app.inject({
      method: 'POST',
      url: '/agent/order-intents/preview',
      payload: {
        ticker: '005930',
        side: 'buy',
        cashAmount: 100000,
        reason: sensitiveReason,
        requestedMode: 'simulated',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        preview: {
          id: 'intent-redacted',
          reason: `news_detected ${redactedSession} ${redactedAccount} ${redactedOrder}`,
        },
      },
    });

    const previews = await app.inject({ method: 'GET', url: '/agent/order-intents?limit=5' });
    expect(previews.body).toContain(redactedSession);
    expect(previews.body).not.toContain(sessionValue);
    expect(previews.body).not.toContain(accountValue);
    expect(previews.body).not.toContain(orderValue);

    const audit = await app.inject({ method: 'GET', url: '/agent/order-intents/audit?limit=5' });
    expect(audit.body).not.toContain(sessionValue);
    expect(audit.body).not.toContain(accountValue);
    expect(audit.body).not.toContain(orderValue);
  });

  it('rejects secret-like optional identifiers before truncating them', async () => {
    const service = createOrderIntentService({
      now: () => '2026-05-11T13:40:00.000Z',
    });
    const app = Fastify({ logger: false });
    await app.register(agentOrderIntentRoutes, { service });
    const accountPair = ['accountNo', ['1234', '5678'].join('')].join('=');

    const res = await app.inject({
      method: 'POST',
      url: '/agent/order-intents/preview',
      payload: {
        ticker: '005930',
        side: 'buy',
        cashAmount: 100000,
        reason: 'news_detected candidate',
        agentId: `${'agent-'.repeat(20)}${accountPair}`,
        requestedMode: 'simulated',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      success: false,
      error: {
        code: 'invalid_order_intent',
        message: 'Invalid order intent agentId',
      },
    });
    expect(res.body).not.toContain('accountNo');
    expect(res.body).not.toContain(accountPair);
  });

  it('does not echo sensitive service errors from preview creation', async () => {
    const app = Fastify({ logger: false });
    const service = {
      ...createOrderIntentService(),
      createPreview() {
        throw new Error('store failed near SESSION=[test-session] accountNo=[test-account] orderNo=[test-order]');
      },
    };
    await app.register(agentOrderIntentRoutes, { service });

    const res = await app.inject({
      method: 'POST',
      url: '/agent/order-intents/preview',
      payload: {
        ticker: '005930',
        side: 'buy',
        cashAmount: 100000,
        reason: 'news_detected candidate',
        requestedMode: 'simulated',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      success: false,
      error: {
        code: 'invalid_order_intent',
        message: 'Invalid order intent request',
      },
    });
    expect(res.body).not.toContain('SESSION');
    expect(res.body).not.toContain('[test-session]');
    expect(res.body).not.toContain('accountNo');
    expect(res.body).not.toContain('[test-account]');
    expect(res.body).not.toContain('orderNo');
    expect(res.body).not.toContain('[test-order]');
  });

  it('does not echo sensitive service errors from read-only snapshots', async () => {
    const endpoints = [
      {
        url: '/agent/order-intents?limit=5',
        method: 'snapshotPreviews',
        fallbackMessage: 'Order intent snapshot failed',
      },
      {
        url: '/agent/order-intents/audit?limit=5',
        method: 'snapshotAudit',
        fallbackMessage: 'Order intent audit snapshot failed',
      },
      {
        url: '/agent/order-intents/approval-challenges?limit=5',
        method: 'snapshotApprovalChallenges',
        fallbackMessage: 'Order intent approval challenge snapshot failed',
      },
      {
        url: '/agent/order-intents/live-policy',
        method: 'snapshotLivePolicy',
        fallbackMessage: 'Order intent live policy snapshot failed',
      },
      {
        url: '/agent/order-intents/paper-ledger?limit=5',
        method: 'snapshotPaperLedger',
        fallbackMessage: 'Order intent paper ledger snapshot failed',
      },
      {
        url: '/agent/order-intents/reconciliation?limit=5',
        method: 'snapshotReconciliation',
        fallbackMessage: 'Order intent reconciliation snapshot failed',
      },
    ] as const;

    for (const endpoint of endpoints) {
      const app = Fastify({ logger: false });
      const service = {
        ...createOrderIntentService(),
        [endpoint.method]() {
          throw new Error(
            'snapshot failed near SESSION=[test-session] accountNo=[test-account] orderNo=[test-order]',
          );
        },
      };
      await app.register(agentOrderIntentRoutes, { service });

      const res = await app.inject({ method: 'GET', url: endpoint.url });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({
        success: false,
        error: {
          code: 'order_intent_snapshot_failed',
          message: endpoint.fallbackMessage,
        },
      });
      expect(res.body).not.toContain('SESSION');
      expect(res.body).not.toContain('[test-session]');
      expect(res.body).not.toContain('accountNo');
      expect(res.body).not.toContain('[test-account]');
      expect(res.body).not.toContain('orderNo');
      expect(res.body).not.toContain('[test-order]');
      await app.close();
    }
  });

  it('exposes the disabled live policy without enabling execution', async () => {
    const service = createOrderIntentService({
      now: () => '2026-05-11T13:42:00.000Z',
    });
    const app = Fastify({ logger: false });
    await app.register(agentOrderIntentRoutes, { service });

    const res = await app.inject({
      method: 'GET',
      url: '/agent/order-intents/live-policy',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: {
        policy: {
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
            expect.objectContaining({ code: 'decision_engine', status: 'partial' }),
            expect.objectContaining({ code: 'strategy_policy', status: 'partial' }),
            expect.objectContaining({ code: 'risk_policy', status: 'partial' }),
            expect.objectContaining({ code: 'paper_trading_ledger', status: 'partial' }),
            expect.objectContaining({ code: 'simulation_result_view', status: 'partial' }),
            expect.objectContaining({ code: 'toss_order_execution', status: 'locked' }),
            expect.objectContaining({ code: 'live_approval_executor', status: 'locked' }),
            expect.objectContaining({ code: 'execution_reconciliation', status: 'partial' }),
            expect.objectContaining({ code: 'agent_performance_audit', status: 'partial' }),
            expect.objectContaining({ code: 'intent_explanation', status: 'partial' }),
            expect.objectContaining({ code: 'provider_freshness', status: 'partial' }),
            expect.objectContaining({ code: 'event_dedupe', status: 'partial' }),
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
        },
      },
    });
    expect(res.body).not.toContain('SESSION');
    expect(res.body).not.toContain('approval_key');
    expect(res.body).not.toContain('accountNo');
  });

  it('exposes preview-only paper ledger entries without booking live execution', async () => {
    const service = createOrderIntentService({
      idFactory: (() => {
        const ids = ['intent-buy', 'intent-sell'];
        return () => ids.shift() ?? 'intent-extra';
      })(),
      auditIdFactory: (() => {
        const ids = ['audit-buy', 'audit-sell'];
        return () => ids.shift() ?? 'audit-extra';
      })(),
      now: (() => {
        const values = ['2026-05-11T13:42:00.000Z', '2026-05-11T13:43:00.000Z'];
        return () => values.shift() ?? '2026-05-11T13:43:00.000Z';
      })(),
    });
    const app = Fastify({ logger: false });
    await app.register(agentOrderIntentRoutes, { service });

    await app.inject({
      method: 'POST',
      url: '/agent/order-intents/preview',
      payload: {
        ticker: '005930',
        side: 'buy',
        market: 'KR',
        cashAmount: 500000,
        reason: 'paper buy preview',
        requestedMode: 'paper',
      },
    });
    await app.inject({
      method: 'POST',
      url: '/agent/order-intents/preview',
      payload: {
        ticker: '005930',
        side: 'sell',
        market: 'KR',
        quantity: 2,
        reason: 'paper sell preview',
        requestedMode: 'paper',
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/agent/order-intents/paper-ledger?limit=10',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        returnedCount: 2,
        items: [
          {
            id: 'paper-preview:intent-sell',
            intentId: 'intent-sell',
            ticker: '005930',
            side: 'sell',
            status: 'preview_only',
            booked: false,
            positionDelta: -2,
            cashDeltaKrw: null,
          },
          {
            id: 'paper-preview:intent-buy',
            intentId: 'intent-buy',
            ticker: '005930',
            side: 'buy',
            status: 'preview_only',
            booked: false,
            positionDelta: null,
            cashDeltaKrw: -500000,
          },
        ],
        summary: {
          entryCount: 2,
          bookedCount: 0,
          previewOnlyCount: 2,
          cashDeltaKrw: -500000,
          byTicker: [
            {
              ticker: '005930',
              previewCount: 2,
              positionDelta: -2,
              cashDeltaKrw: -500000,
              lastPreviewAt: '2026-05-11T13:43:00.000Z',
            },
          ],
        },
      },
    });
    expect(res.body).not.toContain('SESSION');
    expect(res.body).not.toContain('accountNo');
    expect(res.body).not.toContain('approval_key');
  });

  it('exposes a preview-only performance review without inventing execution results', async () => {
    const service = createOrderIntentService({
      idFactory: (() => {
        const ids = ['intent-buy', 'intent-sell'];
        return () => ids.shift() ?? 'intent-extra';
      })(),
      auditIdFactory: (() => {
        const ids = ['audit-buy', 'audit-sell'];
        return () => ids.shift() ?? 'audit-extra';
      })(),
      now: (() => {
        const values = ['2026-05-11T13:42:00.000Z', '2026-05-11T13:43:00.000Z'];
        return () => values.shift() ?? '2026-05-11T13:43:00.000Z';
      })(),
    });
    const app = Fastify({ logger: false });
    await app.register(agentOrderIntentRoutes, { service });

    await app.inject({
      method: 'POST',
      url: '/agent/order-intents/preview',
      payload: {
        ticker: '005930',
        side: 'buy',
        market: 'KR',
        cashAmount: 500000,
        reason: 'paper buy preview',
        requestedMode: 'paper',
      },
    });
    await app.inject({
      method: 'POST',
      url: '/agent/order-intents/preview',
      payload: {
        ticker: '005930',
        side: 'sell',
        market: 'KR',
        quantity: 2,
        reason: 'paper sell preview',
        requestedMode: 'paper',
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/agent/order-intents/performance-review?limit=10',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        returnedCount: 2,
        liveMutationEnabled: false,
        source: 'paper_ledger_preview_only',
        summary: {
          previewOnlyCount: 2,
          bookedCount: 0,
          pendingReviewCount: 2,
          buyPreviewCount: 1,
          sellPreviewCount: 1,
          liveSubmittedCount: 0,
          reviewedTickerCount: 1,
          reviewStatus: 'needs_market_result',
          latestPreviewAt: '2026-05-11T13:43:00.000Z',
        },
        items: [
          {
            id: 'performance-review:paper-preview:intent-sell',
            intentId: 'intent-sell',
            ticker: '005930',
            side: 'sell',
            outcomeStatus: 'pending_market_result',
            booked: false,
            liveMutationEnabled: false,
            reviewLabel: '시장 결과 대기',
          },
          {
            id: 'performance-review:paper-preview:intent-buy',
            intentId: 'intent-buy',
            ticker: '005930',
            side: 'buy',
            outcomeStatus: 'pending_market_result',
            booked: false,
            liveMutationEnabled: false,
            reviewLabel: '시장 결과 대기',
          },
        ],
      },
    });
    expect(res.body).not.toContain('SESSION');
    expect(res.body).not.toContain('accountNo');
    expect(res.body).not.toContain('approval_key');
    expect(res.body).not.toContain('orderNo');
  });

  it('exposes a confirm-token gate while keeping live execution locked', async () => {
    const service = createOrderIntentService({
      idFactory: () => 'intent-route-confirm',
      auditIdFactory: (() => {
        const ids = ['audit-preview', 'audit-challenge', 'audit-confirm'];
        return () => ids.shift() ?? 'audit-extra';
      })(),
      approvalChallengeIdFactory: () => 'challenge-route',
      now: (() => {
        const values = [
          '2026-05-11T13:50:00.000Z',
          '2026-05-11T13:50:05.000Z',
          '2026-05-11T13:50:20.000Z',
        ];
        return () => values.shift() ?? '2026-05-11T13:50:20.000Z';
      })(),
    });
    const app = Fastify({ logger: false });
    await app.register(agentOrderIntentRoutes, { service });

    const preview = await app.inject({
      method: 'POST',
      url: '/agent/order-intents/preview',
      payload: {
        ticker: '005930',
        side: 'buy',
        cashAmount: 500000,
        reason: 'news_detected candidate',
        requestedMode: 'simulated',
      },
    });
    expect(preview.statusCode).toBe(200);

    const challenge = await app.inject({
      method: 'POST',
      url: '/agent/order-intents/intent-route-confirm/approval-challenge',
      payload: {
        operatorId: 'local-user',
        expiresInMs: 60_000,
      },
    });

    expect(challenge.statusCode).toBe(200);
    expect(challenge.json()).toMatchObject({
      success: true,
      data: {
        challenge: {
          id: 'challenge-route',
          intentId: 'intent-route-confirm',
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
          liveExecutionLocked: true,
          auditRef: 'audit-challenge',
        },
      },
    });

    const confirmed = await app.inject({
      method: 'POST',
      url: '/agent/order-intents/approval-challenges/challenge-route/confirm',
      payload: {
        confirmationText: 'CONFIRM 005930 BUY LIVE',
      },
    });

    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toMatchObject({
      success: true,
      data: {
        liveExecutionLocked: true,
        execution: null,
        lockedExecutionProof: {
          provider: 'toss',
          mode: 'dry_run_locked',
          status: 'blocked',
          reason: 'live_execution_locked',
          liveMutationEnabled: false,
          challengeId: 'challenge-route',
          intentId: 'intent-route-confirm',
          intentHash: expect.stringMatching(/^[a-f0-9]{16}$/),
          orderSummary: expect.objectContaining({
            ticker: '005930',
            side: 'buy',
            cashAmount: 500000,
            liveExecutionLocked: true,
          }),
          killSwitch: 'engaged',
          checkedAt: '2026-05-11T13:50:20.000Z',
        },
        challenge: {
          id: 'challenge-route',
          status: 'confirmed_live_locked',
          liveExecutionLocked: true,
        },
      },
    });

    const challenges = await app.inject({
      method: 'GET',
      url: '/agent/order-intents/approval-challenges?limit=5',
    });
    expect(challenges.statusCode).toBe(200);
    expect(challenges.json()).toMatchObject({
      success: true,
      data: {
        returnedCount: 1,
        items: [
          {
            id: 'challenge-route',
            status: 'confirmed_live_locked',
            confirmationText: 'CONFIRM 005930 BUY LIVE',
            intentHash: expect.stringMatching(/^[a-f0-9]{16}$/),
            orderSummary: expect.objectContaining({
              ticker: '005930',
              side: 'buy',
              cashAmount: 500000,
            }),
            killSwitch: 'engaged',
          },
        ],
      },
    });
    expect(challenges.body).not.toContain('SESSION');
    expect(challenges.body).not.toContain('approval_key');

    const reconciliation = await app.inject({
      method: 'GET',
      url: '/agent/order-intents/reconciliation?limit=5',
    });
    expect(reconciliation.statusCode).toBe(200);
    expect(reconciliation.json()).toMatchObject({
      success: true,
      data: {
        returnedCount: 1,
        liveMutationEnabled: false,
        source: 'local_locked_execution_proof',
        summary: {
          checkedCount: 1,
          liveSubmittedCount: 0,
          blockedCount: 1,
          pendingAccountSnapshotCount: 0,
        },
        items: [
          {
            id: 'reconcile:challenge-route',
            intentId: 'intent-route-confirm',
            challengeId: 'challenge-route',
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
            checkedAt: '2026-05-11T13:50:20.000Z',
          },
        ],
      },
    });
    expect(reconciliation.body).not.toContain('SESSION');
    expect(reconciliation.body).not.toContain('approval_key');
    expect(reconciliation.body).not.toContain('accountNo');
    expect(reconciliation.body).not.toContain('orderNo');
  });
});
