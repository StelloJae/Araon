import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAgentOrderIntentPreview,
  getAgentOrderIntentPaperLedger,
  getAgentOrderIntentPerformanceReview,
  getAgentOrderIntentReconciliation,
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
              status: 'partial',
              severity: 'blocking',
              label: '의사결정 엔진',
              detail: '모의 미리보기용 deterministic 판단은 가능하지만 자동 매매 엔진은 아직 준비되지 않았습니다.',
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
      expect.objectContaining({ code: 'decision_engine', status: 'partial' }),
    );
    expect(JSON.stringify(result)).not.toContain('approval_key');
    expect(JSON.stringify(result)).not.toContain('accountNo');
  });

  it('reads the preview-only paper ledger snapshot', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: {
        items: [
          {
            id: 'paper-preview:intent-1',
            intentId: 'intent-1',
            ticker: '005930',
            side: 'buy',
            market: 'KR',
            status: 'preview_only',
            booked: false,
            positionDelta: null,
            cashDeltaKrw: -500000,
            note: '실제 원장에 기록하지 않는 모의 변화량입니다.',
            createdAt: '2026-05-11T07:10:00.000Z',
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
              ticker: '005930',
              previewCount: 1,
              positionDelta: 0,
              cashDeltaKrw: -500000,
              lastPreviewAt: '2026-05-11T07:10:00.000Z',
            },
          ],
        },
      },
    })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getAgentOrderIntentPaperLedger(5);

    expect(fetchMock).toHaveBeenCalledWith('/agent/order-intents/paper-ledger?limit=5');
    expect(result.returnedCount).toBe(1);
    expect(result.summary.bookedCount).toBe(0);
    expect(result.items[0]?.status).toBe('preview_only');
    expect(JSON.stringify(result)).not.toContain('SESSION');
    expect(JSON.stringify(result)).not.toContain('accountNo');
    expect(JSON.stringify(result)).not.toContain('approval_key');
  });

  it('reads the preview-only performance review snapshot', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: {
        items: [
          {
            id: 'performance-review:paper-preview:intent-1',
            intentId: 'intent-1',
            ticker: '005930',
            side: 'buy',
            market: 'KR',
            outcomeStatus: 'pending_market_result',
            booked: false,
            liveMutationEnabled: false,
            reviewLabel: '시장 결과 대기',
            reason: '실제 체결 없이 모의 미리보기만 기록했습니다.',
            createdAt: '2026-05-11T07:10:00.000Z',
            reviewedAt: '2026-05-11T07:13:00.000Z',
          },
        ],
        returnedCount: 1,
        liveMutationEnabled: false,
        source: 'paper_ledger_preview_only',
        generatedAt: '2026-05-11T07:13:00.000Z',
        summary: {
          previewOnlyCount: 1,
          bookedCount: 0,
          pendingReviewCount: 1,
          buyPreviewCount: 1,
          sellPreviewCount: 0,
          liveSubmittedCount: 0,
          reviewedTickerCount: 1,
          latestPreviewAt: '2026-05-11T07:10:00.000Z',
          reviewStatus: 'needs_market_result',
        },
      },
    })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getAgentOrderIntentPerformanceReview(5);

    expect(fetchMock).toHaveBeenCalledWith('/agent/order-intents/performance-review?limit=5');
    expect(result.returnedCount).toBe(1);
    expect(result.liveMutationEnabled).toBe(false);
    expect(result.summary.bookedCount).toBe(0);
    expect(result.summary.liveSubmittedCount).toBe(0);
    expect(result.items[0]?.outcomeStatus).toBe('pending_market_result');
    expect(JSON.stringify(result)).not.toContain('SESSION');
    expect(JSON.stringify(result)).not.toContain('accountNo');
    expect(JSON.stringify(result)).not.toContain('orderNo');
    expect(JSON.stringify(result)).not.toContain('approval_key');
  });

  it('reads the locked read-only reconciliation snapshot', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: {
        items: [
          {
            id: 'reconcile:challenge-1',
            intentId: 'intent-1',
            challengeId: 'challenge-1',
            ticker: '005930',
            side: 'buy',
            status: 'not_submitted_live_locked',
            reason: 'live_execution_locked',
            liveMutationEnabled: false,
            execution: null,
            intentHash: '0123456789abcdef',
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
            checkedAt: '2026-05-11T07:13:00.000Z',
          },
        ],
        returnedCount: 1,
        liveMutationEnabled: false,
        source: 'local_locked_execution_proof',
        generatedAt: '2026-05-11T07:13:00.000Z',
        summary: {
          checkedCount: 1,
          liveSubmittedCount: 0,
          blockedCount: 1,
          pendingAccountSnapshotCount: 0,
        },
      },
    })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getAgentOrderIntentReconciliation(5);

    expect(fetchMock).toHaveBeenCalledWith('/agent/order-intents/reconciliation?limit=5');
    expect(result.returnedCount).toBe(1);
    expect(result.liveMutationEnabled).toBe(false);
    expect(result.summary.liveSubmittedCount).toBe(0);
    expect(result.items[0]?.execution).toBeNull();
    expect(result.items[0]?.status).toBe('not_submitted_live_locked');
    expect(JSON.stringify(result)).not.toContain('SESSION');
    expect(JSON.stringify(result)).not.toContain('accountNo');
    expect(JSON.stringify(result)).not.toContain('orderNo');
    expect(JSON.stringify(result)).not.toContain('approval_key');
  });
});
