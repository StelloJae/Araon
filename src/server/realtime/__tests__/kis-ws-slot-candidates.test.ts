import { describe, expect, it } from 'vitest';

import type { Favorite } from '@shared/types.js';
import type { AgentEvent } from '../../agent/agent-event-queue.js';
import type { OrderIntentPreview } from '../../agent/order-intent-service.js';
import type { TossPortfolioPositionsPayload } from '../../toss/toss-portfolio-client.js';
import type { TossWatchlistPayload } from '../../toss/toss-watchlist-client.js';
import { buildKisWsSlotCandidates } from '../kis-ws-slot-candidates.js';

describe('KIS WS slot candidate builder', () => {
  it('builds sanitized candidates from account, screen, agent, and watchlist inputs', () => {
    const favorites: Favorite[] = [
      { ticker: '005930', tier: 'realtime', addedAt: '2026-05-11T05:00:00.000Z' },
      { ticker: '035420', tier: 'polling', addedAt: '2026-05-11T05:01:00.000Z' },
    ];
    const portfolioSnapshot: TossPortfolioPositionsPayload = {
      provider: 'toss',
      fetchedAt: '2026-05-11T05:59:30.000Z',
      positions: [
        portfolioPosition({ productCode: '000660', symbol: '000660', marketType: 'KR', marketCode: 'KRX' }),
        portfolioPosition({ productCode: 'US0378331005', symbol: 'AAPL', marketType: 'US', marketCode: 'NASDAQ' }),
      ],
    };
    const watchlistSnapshot: TossWatchlistPayload = {
      provider: 'toss',
      fetchedAt: '2026-05-11T05:59:40.000Z',
      groups: [],
      items: [
        {
          ref: 'watchlist-item-1',
          groupRef: 'watchlist-group-1',
          groupName: '관심',
          productCode: 'A129920',
          symbol: '129920',
          name: '대성하이텍',
          currency: 'KRW',
          base: 0,
          last: 0,
        },
        {
          ref: 'watchlist-item-2',
          groupRef: 'watchlist-group-1',
          groupName: '관심',
          productCode: 'US0378331005',
          symbol: 'AAPL',
          name: 'Apple',
          currency: 'USD',
          base: 0,
          last: 0,
        },
      ],
    };
    const agentEvents: AgentEvent[] = [
      {
        id: 'evt-news',
        type: 'news_detected',
        ticker: 'A042660',
        source: 'naver-news',
        publishedAt: '2026-05-11T05:58:30.000Z',
        firstSeenAt: '2026-05-11T05:59:00.000Z',
        freshnessMs: 30_000,
        relevance: 0.8,
        confidence: 0.9,
        reason: 'provider payload should not leak',
        dedupeKey: 'news:042660:provider-payload',
        payloadRef: 'news:provider-payload',
        createdAt: '2026-05-11T05:59:00.000Z',
      },
    ];
    const orderIntentPreviews: OrderIntentPreview[] = [
      orderIntentPreview({
        ticker: 'A247540',
        createdAt: '2026-05-11T05:58:00.000Z',
        expiresAt: '2026-05-11T06:03:00.000Z',
      }),
    ];
    const topMoverRotationCandidates = [
      {
        ticker: 'A010130',
        name: '고려아연',
        direction: 'gainers' as const,
        rank: 1,
        reason: 'TOP100 상승 #1',
        score: 1,
        ttlMs: 240_000,
        lastSeenAt: '2026-05-11T05:59:30.000Z',
      },
    ];

    const candidates = buildKisWsSlotCandidates({
      favorites,
      portfolioSnapshot,
      watchlistSnapshot,
      currentTicker: 'A005380',
      agentEvents,
      orderIntentPreviews,
      topMoverRotationCandidates,
      marketPhase: 'open',
      now: '2026-05-11T06:00:00.000Z',
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        ticker: '000660',
        source: 'holding',
        reason: '토스 보유종목',
        score: 1,
        ttlMs: null,
        lastSeenAt: '2026-05-11T05:59:30.000Z',
      }),
      expect.objectContaining({
        ticker: '129920',
        source: 'manual_watchlist',
        reason: 'Toss 즐겨찾기',
        score: 0.92,
        lastSeenAt: '2026-05-11T05:59:40.000Z',
      }),
      expect.objectContaining({
        ticker: '005930',
        source: 'user_pin',
        reason: '사용자 고정 realtime',
        score: 1,
        pinned: true,
      }),
      expect.objectContaining({
        ticker: '035420',
        source: 'manual_watchlist',
        reason: '사용자 관심종목',
        pinned: false,
      }),
      expect.objectContaining({
        ticker: '247540',
        source: 'agent_candidate',
        reason: 'agent order-intent 후보',
        ttlMs: 180_000,
      }),
      expect.objectContaining({
        ticker: '005380',
        source: 'current_view',
        reason: '현재 화면',
        score: 0.9,
        ttlMs: 300_000,
      }),
      expect.objectContaining({
        ticker: '042660',
        source: 'recent_news',
        reason: '최근 뉴스 이벤트',
        score: 0.8,
        ttlMs: 540_000,
      }),
      expect.objectContaining({
        ticker: '010130',
        source: 'top100_rotation',
        reason: 'TOP100 상승 #1',
        score: 1,
        ttlMs: 240_000,
      }),
    ]);
    expect(JSON.stringify(candidates)).not.toContain('AAPL');
    expect(JSON.stringify(candidates)).not.toContain('US0378331005');
    expect(JSON.stringify(candidates)).not.toContain('provider-payload');
  });

  it('suppresses TOP100 rotation samples outside the open market phase', () => {
    const candidates = buildKisWsSlotCandidates({
      topMoverRotationCandidates: [
        {
          ticker: '010130',
          direction: 'gainers',
          rank: 1,
          reason: 'TOP100 상승 #1',
          score: 1,
          ttlMs: 240_000,
          lastSeenAt: '2026-05-11T05:59:30.000Z',
        },
      ],
      marketPhase: 'closed',
      now: '2026-05-11T06:00:00.000Z',
    });

    expect(candidates).toEqual([]);
  });

  it('ignores non-KR favorites instead of letting them break KIS WS planning', () => {
    const favorites: Favorite[] = [
      { ticker: 'AAPL', tier: 'realtime', addedAt: '2026-05-11T05:00:00.000Z' },
      { ticker: '0011T0', tier: 'realtime', addedAt: '2026-05-11T05:00:30.000Z' },
      { ticker: 'A005930', tier: 'polling', addedAt: '2026-05-11T05:01:00.000Z' },
    ];

    const candidates = buildKisWsSlotCandidates({
      favorites,
      now: '2026-05-11T06:00:00.000Z',
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      ticker: '005930',
      source: 'manual_watchlist',
      reason: '사용자 관심종목',
    });
    expect(JSON.stringify(candidates)).not.toContain('AAPL');
    expect(JSON.stringify(candidates)).not.toContain('0011T0');
  });

  it('drops expired order-intent previews from KIS WS candidates', () => {
    const candidates = buildKisWsSlotCandidates({
      orderIntentPreviews: [
        orderIntentPreview({
          ticker: 'A247540',
          createdAt: '2026-05-11T05:50:00.000Z',
          expiresAt: '2026-05-11T05:55:00.000Z',
        }),
        orderIntentPreview({
          ticker: 'A005930',
          createdAt: '2026-05-11T05:59:00.000Z',
          expiresAt: '2026-05-11T06:04:00.000Z',
        }),
      ],
      now: '2026-05-11T06:00:00.000Z',
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        ticker: '005930',
        source: 'agent_candidate',
        ttlMs: 240_000,
      }),
    ]);
    expect(JSON.stringify(candidates)).not.toContain('247540');
  });
});

function portfolioPosition(input: {
  productCode: string;
  symbol: string;
  marketType: string;
  marketCode: string;
}) {
  return {
    productCode: input.productCode,
    symbol: input.symbol,
    name: input.symbol,
    marketType: input.marketType,
    marketCode: input.marketCode,
    quantity: 1,
    averagePrice: 1,
    currentPrice: 1,
    marketValue: 1,
    unrealizedPnl: 0,
    profitRate: 0,
    dailyProfitLoss: 0,
    dailyProfitRate: 0,
    averagePriceUsd: 0,
    currentPriceUsd: 0,
    marketValueUsd: 0,
    unrealizedPnlUsd: 0,
    profitRateUsd: 0,
    dailyProfitLossUsd: 0,
    dailyProfitRateUsd: 0,
  };
}

function orderIntentPreview(input: {
  ticker: string;
  createdAt: string;
  expiresAt: string;
}): OrderIntentPreview {
  return {
    id: 'intent-1',
    ticker: input.ticker,
    side: 'buy',
    market: 'KR',
    requestedMode: 'simulated',
    executionMode: 'simulated',
    status: 'preview_ready',
    liveExecutionLocked: true,
    quantity: null,
    cashAmount: 500_000,
    orderType: 'market',
    limitPrice: null,
    triggerEventId: null,
    agentId: null,
    reason: 'test preview',
    riskChecks: [],
    lifecycle: [],
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    auditRef: 'audit-1',
  };
}
