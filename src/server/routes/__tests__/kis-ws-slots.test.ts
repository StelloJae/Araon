import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { WS_MAX_SUBSCRIPTIONS } from '@shared/kis-constraints.js';

import { createOrderIntentService } from '../../agent/order-intent-service.js';
import { createAgentEventQueue } from '../../agent/agent-event-queue.js';
import { kisWsSlotsRoutes } from '../kis-ws-slots.js';
import type { TossPortfolioPositionsPayload } from '../../toss/toss-portfolio-client.js';
import { createKisWsSlotStateStore } from '../../realtime/kis-ws-slot-state.js';

describe('KIS WS slot routes', () => {
  it('returns a sanitized slot allocator preview from local watchlist data', async () => {
    const app = Fastify({ logger: false });
    await app.register(kisWsSlotsRoutes, {
      favoriteRepo: {
        findAll: () => [
          { ticker: '005930', tier: 'realtime', addedAt: '2026-05-11T05:00:00.000Z' },
          { ticker: '000660', tier: 'polling', addedAt: '2026-05-11T05:01:00.000Z' },
        ],
      },
      runtimeRef: {
        get: () => ({
          status: 'started',
          runtime: {
            bridge: {
              getRealtimeTickers: () => ['000660'],
            },
          },
        }),
      },
      now: () => '2026-05-11T06:00:00.000Z',
    });

    const res = await app.inject({ method: 'GET', url: '/runtime/realtime/kis-ws-slots' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        enabled: true,
        provider: 'kis',
        perProfileCap: WS_MAX_SUBSCRIPTIONS,
        activeCount: 2,
        fallbackCount: 0,
        churnCooldownMs: 30_000,
        diff: {
          subscribe: ['005930'],
          unsubscribe: [],
        },
        candidates: expect.arrayContaining([
          expect.objectContaining({
            ticker: '005930',
            state: 'subscribed',
            source: 'user_pin',
            reason: '사용자 고정 realtime',
            score: 1,
            pinned: true,
          }),
          expect.objectContaining({
            ticker: '000660',
            state: 'subscribed',
            source: 'manual_watchlist',
            reason: '사용자 관심종목',
            score: expect.any(Number),
            pinned: false,
          }),
        ]),
      },
    });
    expect(res.body).not.toContain('approval');
    expect(res.body).not.toContain('appSecret');
  });

  it('adds KR order-intent previews as agent candidate slot inputs', async () => {
    const orderIntentService = createOrderIntentService({
      idFactory: () => 'intent-1',
      auditIdFactory: () => 'audit-1',
      now: () => '2026-05-11T05:58:00.000Z',
    });
    orderIntentService.createPreview({
      ticker: 'A000660',
      side: 'buy',
      market: 'KR',
      cashAmount: 500000,
      reason: 'news_detected candidate',
      requestedMode: 'simulated',
      agentId: 'agent-alpha',
    });

    const app = Fastify({ logger: false });
    await app.register(kisWsSlotsRoutes, {
      favoriteRepo: {
        findAll: () => [
          { ticker: '005930', tier: 'polling', addedAt: '2026-05-11T05:00:00.000Z' },
        ],
      },
      runtimeRef: {
        get: () => ({ status: 'stopped' }),
      },
      orderIntentService,
      now: () => '2026-05-11T06:00:00.000Z',
    });

    const res = await app.inject({ method: 'GET', url: '/runtime/realtime/kis-ws-slots' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        activeCount: 2,
        candidates: expect.arrayContaining([
          expect.objectContaining({
            ticker: '000660',
            state: 'subscribed',
            source: 'agent_candidate',
            reason: 'agent order-intent 후보',
            pinned: false,
          }),
        ]),
      },
    });
    expect(res.body).not.toContain('agent-alpha');
    expect(res.body).not.toContain('intent-1');
    expect(res.body).not.toContain('audit-1');
  });

  it('adds the current screen ticker without outranking manual watchlist slots', async () => {
    const app = Fastify({ logger: false });
    await app.register(kisWsSlotsRoutes, {
      favoriteRepo: {
        findAll: () => [
          { ticker: '005930', tier: 'polling', addedAt: '2026-05-11T05:00:00.000Z' },
        ],
      },
      runtimeRef: {
        get: () => ({ status: 'stopped' }),
      },
      now: () => '2026-05-11T06:00:00.000Z',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/runtime/realtime/kis-ws-slots?currentTicker=A000660',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        activeCount: 2,
        candidates: [
          expect.objectContaining({
            ticker: '005930',
            state: 'subscribed',
            source: 'manual_watchlist',
          }),
          expect.objectContaining({
            ticker: '000660',
            state: 'subscribed',
            source: 'current_view',
            reason: '현재 화면',
            score: 0.9,
            ttlMs: 300_000,
            pinned: false,
          }),
        ],
      },
    });
  });

  it('uses cached Toss KR holdings as the highest-priority slot inputs', async () => {
    const portfolioSnapshot: TossPortfolioPositionsPayload = {
      provider: 'toss',
      fetchedAt: '2026-05-11T05:59:30.000Z',
      positions: [
        {
          productCode: '005930',
          symbol: '005930',
          name: '삼성전자',
          marketType: 'KR',
          marketCode: 'KRX',
          quantity: 3,
          averagePrice: 65000,
          currentPrice: 70000,
          marketValue: 210000,
          unrealizedPnl: 15000,
          profitRate: 7.6923,
          dailyProfitLoss: 1200,
          dailyProfitRate: 0.57,
          averagePriceUsd: 0,
          currentPriceUsd: 0,
          marketValueUsd: 0,
          unrealizedPnlUsd: 0,
          profitRateUsd: 0,
          dailyProfitLossUsd: 0,
          dailyProfitRateUsd: 0,
        },
        {
          productCode: 'US0378331005',
          symbol: 'AAPL',
          name: 'Apple',
          marketType: 'US',
          marketCode: 'NASDAQ',
          quantity: 1,
          averagePrice: 200,
          currentPrice: 210,
          marketValue: 210,
          unrealizedPnl: 10,
          profitRate: 5,
          dailyProfitLoss: 1,
          dailyProfitRate: 0.5,
          averagePriceUsd: 200,
          currentPriceUsd: 210,
          marketValueUsd: 210,
          unrealizedPnlUsd: 10,
          profitRateUsd: 5,
          dailyProfitLossUsd: 1,
          dailyProfitRateUsd: 0.5,
        },
      ],
    };
    const app = Fastify({ logger: false });
    await app.register(kisWsSlotsRoutes, {
      favoriteRepo: {
        findAll: () => [
          { ticker: '035420', tier: 'polling', addedAt: '2026-05-11T05:00:00.000Z' },
        ],
      },
      runtimeRef: {
        get: () => ({ status: 'stopped' }),
      },
      portfolioPositions: {
        snapshot: () => portfolioSnapshot,
      },
      now: () => '2026-05-11T06:00:00.000Z',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/runtime/realtime/kis-ws-slots?currentTicker=A000660',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        activeCount: 3,
        candidates: [
          expect.objectContaining({
            ticker: '005930',
            state: 'subscribed',
            source: 'holding',
            reason: '토스 보유종목',
            score: 1,
            ttlMs: null,
            lastSeenAt: '2026-05-11T05:59:30.000Z',
            pinned: false,
          }),
          expect.objectContaining({
            ticker: '035420',
            source: 'manual_watchlist',
          }),
          expect.objectContaining({
            ticker: '000660',
            source: 'current_view',
          }),
        ],
      },
    });
    expect(res.body).not.toContain('AAPL');
    expect(res.body).not.toContain('US0378331005');
    expect(res.body).not.toContain('accountNo');
  });

  it('adds recent news and disclosure agent events as temporary slot inputs', async () => {
    const queue = createAgentEventQueue({
      idFactory: () => 'evt-news',
      now: () => '2026-05-11T05:59:00.000Z',
    });
    queue.enqueue({
      type: 'news_detected',
      ticker: 'A000660',
      source: 'naver-news',
      publishedAt: '2026-05-11T05:58:30.000Z',
      relevance: 0.8,
      confidence: 0.9,
      reason: 'article_id=raw-provider-id should not leak',
      dedupeKey: 'news:000660:raw-provider-id',
      payloadRef: 'news:article_id=raw-provider-id',
    });
    queue.enqueue({
      type: 'disclosure_detected',
      ticker: '005930',
      source: 'opendart',
      publishedAt: '2026-05-11T05:58:45.000Z',
      firstSeenAt: '2026-05-11T05:58:45.000Z',
      relevance: 0.7,
      confidence: 0.85,
      reason: 'rcpNo=20260511000001 should not leak',
      dedupeKey: 'dart:005930:20260511000001',
      payloadRef: 'dart:rcpNo=20260511000001',
    });

    const app = Fastify({ logger: false });
    await app.register(kisWsSlotsRoutes, {
      favoriteRepo: { findAll: () => [] },
      runtimeRef: {
        get: () => ({ status: 'stopped' }),
      },
      agentEventQueue: queue,
      now: () => '2026-05-11T06:00:00.000Z',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/runtime/realtime/kis-ws-slots',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        activeCount: 2,
        candidates: expect.arrayContaining([
          expect.objectContaining({
            ticker: '000660',
            source: 'recent_news',
            reason: '최근 뉴스 이벤트',
            ttlMs: 540_000,
          }),
          expect.objectContaining({
            ticker: '005930',
            source: 'recent_disclosure',
            reason: '최근 공시 이벤트',
            ttlMs: 525_000,
          }),
        ]),
      },
    });
    expect(res.body).not.toContain('raw-provider-id');
    expect(res.body).not.toContain('rcpNo=');
    expect(res.body).not.toContain('evt-news');
  });

  it('adds cached TOP100 rotation samples as lowest-priority slot inputs', async () => {
    const app = Fastify({ logger: false });
    await app.register(kisWsSlotsRoutes, {
      favoriteRepo: { findAll: () => [] },
      runtimeRef: {
        get: () => ({ status: 'stopped' }),
      },
      marketTopMoversService: {
        snapshot: () => ({
          rotationCandidates: [
            {
              ticker: 'A010130',
              name: '고려아연',
              direction: 'gainers',
              rank: 1,
              reason: 'TOP100 상승 #1',
              score: 1,
              ttlMs: 240_000,
              lastSeenAt: '2026-05-11T05:59:30.000Z',
            },
          ],
        }),
      },
      now: () => '2026-05-11T06:00:00.000Z',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/runtime/realtime/kis-ws-slots',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        activeCount: 1,
        candidates: [
          expect.objectContaining({
            ticker: '010130',
            source: 'top100_rotation',
            reason: 'TOP100 상승 #1',
            ttlMs: 240_000,
            pinned: false,
          }),
        ],
      },
    });
  });

  it('does not echo sensitive slot preview source errors', async () => {
    const fakeSessionValue = `session-${'value'}`;
    const fakeRawAccount = `raw-${'account'}`;
    const fakeRawApproval = `raw-${'approval'}`;
    const app = Fastify({ logger: false });
    await app.register(kisWsSlotsRoutes, {
      favoriteRepo: { findAll: () => [] },
      runtimeRef: {
        get: () => ({ status: 'stopped' }),
      },
      portfolioPositions: {
        snapshot() {
          throw new Error(
            [
              'portfolio failed near',
              `SESSION${'='}${fakeSessionValue}`,
              `accountNo${'='}${fakeRawAccount}`,
              `approval_key${'='}${fakeRawApproval}`,
            ].join(' '),
          );
        },
      },
      now: () => '2026-05-11T06:00:00.000Z',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/runtime/realtime/kis-ws-slots',
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      success: false,
      error: {
        code: 'KIS_WS_SLOTS_PREVIEW_FAILED',
        message: 'KIS WS slot preview failed',
      },
    });
    expect(res.body).not.toContain('SESSION');
    expect(res.body).not.toContain(fakeSessionValue);
    expect(res.body).not.toContain('accountNo');
    expect(res.body).not.toContain(fakeRawAccount);
    expect(res.body).not.toContain('approval_key');
    expect(res.body).not.toContain(fakeRawApproval);
  });

  it('exposes the last automatic rebalance status without raw material', async () => {
    const fakeSessionValue = `session-${'value'}`;
    const fakeSession = `SESSION${'='}${fakeSessionValue}`;
    const slotState = createKisWsSlotStateStore();
    slotState.recordRebalance({
      requestedAt: '2026-05-11T06:01:00.000Z',
      reason: `agent-event:news_detected ${fakeSession}`,
      outcome: 'rebalanced',
      activeCount: 1,
      fallbackCount: 0,
      diff: {
        subscribe: ['A000660'],
        unsubscribe: [],
      },
    });
    const app = Fastify({ logger: false });
    await app.register(kisWsSlotsRoutes, {
      favoriteRepo: { findAll: () => [] },
      runtimeRef: {
        get: () => ({ status: 'stopped' }),
      },
      kisWsSlotState: slotState,
      now: () => '2026-05-11T06:02:00.000Z',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/runtime/realtime/kis-ws-slots',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        lastRebalance: {
          requestedAt: '2026-05-11T06:01:00.000Z',
          reason: 'agent-event:news_detected',
          outcome: 'rebalanced',
          activeCount: 1,
          fallbackCount: 0,
          diff: {
            subscribe: ['000660'],
            unsubscribe: [],
          },
        },
      },
    });
    expect(res.body).not.toContain('SESSION');
    expect(res.body).not.toContain(fakeSessionValue);
  });
});
