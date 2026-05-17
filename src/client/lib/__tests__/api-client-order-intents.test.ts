import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAgentOrderIntentPreview,
  getAgentOrderIntentLivePolicy,
} from '../api-client';

describe('Order intent API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a local simulated preview through the gated order-intent endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: {
        preview: {
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
          lifecycle: [
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
      },
    })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createAgentOrderIntentPreview({
      ticker: '005930',
      side: 'buy',
      market: 'KR',
      cashAmount: 500000,
      requestedMode: 'simulated',
      reason: 'news_detected candidate',
      triggerEventId: 'event-1',
      agentId: 'agent-1',
    });

    expect(fetchMock).toHaveBeenCalledWith('/agent/order-intents/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker: '005930',
        side: 'buy',
        market: 'KR',
        cashAmount: 500000,
        requestedMode: 'simulated',
        reason: 'news_detected candidate',
        triggerEventId: 'event-1',
        agentId: 'agent-1',
      }),
    });
    expect(result.preview.ticker).toBe('005930');
    expect(result.preview.liveExecutionLocked).toBe(true);
    expect(JSON.stringify(result)).not.toContain(['SESSION', ''].join('='));
    expect(JSON.stringify(result)).not.toContain('accountNo');
  });

  it('reads the disabled live policy snapshot without exposing execution material', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
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
            {
              code: 'decision_engine',
              status: 'not_ready',
              severity: 'blocking',
              label: '의사결정 엔진',
              detail: '자동 매매 판단 엔진은 아직 준비되지 않았습니다.',
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
      },
    })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getAgentOrderIntentLivePolicy();

    expect(fetchMock).toHaveBeenCalledWith('/agent/order-intents/live-policy');
    expect(result.policy.liveExecutionEnabled).toBe(false);
    expect(result.policy.killSwitch).toBe('engaged');
    expect(result.policy.missingConstraints).toContain('kill_switch_release');
    expect(result.policy.automationReadinessGaps).toContainEqual(
      expect.objectContaining({ code: 'decision_engine', status: 'not_ready' }),
    );
    expect(JSON.stringify(result)).not.toContain('approval_key');
    expect(JSON.stringify(result)).not.toContain('accountNo');
  });
});
