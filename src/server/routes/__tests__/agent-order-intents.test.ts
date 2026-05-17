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
          auditRef: 'audit-1',
          lifecycle: [
            expect.objectContaining({ code: 'candidate_observed', status: 'complete' }),
            expect.objectContaining({ code: 'evidence_collected', status: 'complete' }),
            expect.objectContaining({ code: 'strategy_evaluated', status: 'not_ready' }),
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
            expect.objectContaining({ code: 'decision_engine', status: 'not_ready' }),
            expect.objectContaining({ code: 'strategy_policy', status: 'not_ready' }),
            expect.objectContaining({ code: 'risk_policy', status: 'not_ready' }),
            expect.objectContaining({ code: 'paper_trading_ledger', status: 'not_ready' }),
            expect.objectContaining({ code: 'simulation_result_view', status: 'not_ready' }),
            expect.objectContaining({ code: 'toss_order_execution', status: 'locked' }),
            expect.objectContaining({ code: 'live_approval_executor', status: 'locked' }),
            expect.objectContaining({ code: 'execution_reconciliation', status: 'not_ready' }),
            expect.objectContaining({ code: 'agent_performance_audit', status: 'not_ready' }),
            expect.objectContaining({ code: 'intent_explanation', status: 'partial' }),
            expect.objectContaining({ code: 'provider_freshness', status: 'not_ready' }),
            expect.objectContaining({ code: 'event_dedupe', status: 'not_ready' }),
          ],
          generatedAt: '2026-05-11T13:42:00.000Z',
        },
      },
    });
    expect(res.body).not.toContain('SESSION');
    expect(res.body).not.toContain('approval_key');
    expect(res.body).not.toContain('accountNo');
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
          },
        ],
      },
    });
    expect(challenges.body).not.toContain('SESSION');
    expect(challenges.body).not.toContain('approval_key');
  });
});
