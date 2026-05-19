import { describe, expect, it, vi } from 'vitest';

import { createAgentEventQueue } from '../../agent/agent-event-queue.js';
import { createTossRealtimeService } from '../toss-realtime-service.js';
import type { TossSseClient, TossSseEvent } from '../toss-sse-client.js';
import type { TossSessionStore } from '../toss-session-store.js';

function makeSessionStore(): TossSessionStore {
  return {
    load: vi.fn(async () => ({
      provider: 'toss',
      cookies: { SESSION: 'redacted' },
      localStorage: {},
      sessionStorage: {},
      retrievedAt: '2026-05-11T06:00:00.000Z',
      expiresAt: null,
      serverExpiresAt: null,
      persistent: true,
    })),
    save: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
    status: vi.fn(async () => ({
      configured: true,
      state: 'persistent',
      provider: 'toss',
      persistent: true,
      cookieCount: 1,
      localStorageKeyCount: 0,
      sessionStorageKeyCount: 0,
      retrievedAt: '2026-05-11T06:00:00.000Z',
      expiresAt: null,
      serverExpiresAt: null,
      expiresInMs: null,
    })),
  };
}

function event(type: string, stockCode: string | null): TossSseEvent {
  return {
    id: null,
    name: null,
    type,
    key: null,
    stockCode,
    receivedAt: '2026-05-11T06:00:01.000Z',
  };
}

describe('Toss realtime service', () => {
  it('tracks price-refresh and event-type counters without raw payload state', async () => {
    const onPriceRefresh = vi.fn(async () => undefined);
    const client = {
      listen: vi.fn(async (signal: AbortSignal, handler: (item: TossSseEvent) => void) => {
        handler(event('price-refresh', 'A005930'));
        handler(event('watchlist-refresh', null));
        handler(event('price-refresh', 'A000660'));
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
      }),
    } as Pick<TossSseClient, 'listen'>;
    const service = createTossRealtimeService({
      sessionStore: makeSessionStore(),
      createClient: () => client as TossSseClient,
      onPriceRefresh,
      retryBaseMs: 1,
      retryMaxMs: 1,
    });

    await service.start();

    expect(service.status()).toMatchObject({
      eventCount: 3,
      priceRefreshEventCount: 2,
      priceRefreshDispatchCount: 2,
      priceRefreshDispatchFailureCount: 0,
      lastPriceRefreshAt: '2026-05-11T06:00:01.000Z',
      lastPriceRefreshDispatchAt: '2026-05-11T06:00:01.000Z',
      eventTypes: [
        { type: 'price-refresh', count: 2 },
        { type: 'watchlist-refresh', count: 1 },
      ],
    });
    expect(onPriceRefresh).toHaveBeenCalledTimes(2);
    expect(onPriceRefresh).toHaveBeenNthCalledWith(1, {
      stockCode: 'A005930',
      receivedAt: '2026-05-11T06:00:01.000Z',
    });
    expect(JSON.stringify(service.status())).not.toContain('redacted');

    await service.stop();
  });

  it('normalizes price-refresh notifications into market movement agent events', async () => {
    const agentEvents = createAgentEventQueue({
      idFactory: () => 'evt-market-1',
      now: () => '2026-05-11T06:00:59.000Z',
    });
    const client = {
      listen: vi.fn(async (signal: AbortSignal, handler: (item: TossSseEvent) => void) => {
        handler(event('price-refresh', 'A005930'));
        handler(event('watchlist-refresh', null));
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
      }),
    } as Pick<TossSseClient, 'listen'>;
    const service = createTossRealtimeService({
      sessionStore: makeSessionStore(),
      createClient: () => client as TossSseClient,
      agentEventQueue: agentEvents,
      retryBaseMs: 1,
      retryMaxMs: 1,
    });

    await service.start();

    expect(agentEvents.snapshot()).toEqual([
      {
        id: 'evt-market-1',
        type: 'market_movement_detected',
        ticker: '005930',
        productCode: 'A005930',
        krTicker: '005930',
        market: null,
        displayName: null,
        source: 'toss-sse',
        publishedAt: null,
        firstSeenAt: '2026-05-11T06:00:01.000Z',
        freshnessMs: null,
        relevance: 0.6,
        confidence: 0.65,
        reason: 'Toss SSE price-refresh thin notification',
        dedupeKey: 'toss-sse:price-refresh:005930:2026-05-11T06:00:01.000Z',
        payloadRef: null,
        rawPayloadRedacted: true,
        relatedIds: {
          watchlistId: null,
          holdingId: null,
          orderIntentId: null,
          approvalId: null,
        },
        skipReason: null,
        createdAt: '2026-05-11T06:00:01.000Z',
      },
    ]);
    expect(JSON.stringify(agentEvents.snapshot())).not.toContain('redacted');

    await service.stop();
  });

  it('dispatches sanitized REST refresh hints for non-price thin notifications', async () => {
    const onRefreshHint = vi.fn(async () => undefined);
    const client = {
      listen: vi.fn(async (signal: AbortSignal, handler: (item: TossSseEvent) => void) => {
        handler(event('pending-order-refresh', null));
        handler(event('purchase-price-refresh', 'A005930'));
        handler(event('share-holdings', 'US20181228002'));
        handler(event('unknown-in-fixture', 'raw-secret-like-stock-code'));
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
      }),
    } as Pick<TossSseClient, 'listen'>;
    const service = createTossRealtimeService({
      sessionStore: makeSessionStore(),
      createClient: () => client as TossSseClient,
      onRefreshHint,
      retryBaseMs: 1,
      retryMaxMs: 1,
    });

    await service.start();

    expect(service.status()).toMatchObject({
      eventCount: 4,
      refreshHintCount: 5,
      refreshHintDispatchCount: 5,
      refreshHintDispatchFailureCount: 0,
      lastRefreshHintResource: 'account-summary',
      lastRefreshHintTicker: 'US20181228002',
      refreshHints: [
        { resource: 'account-summary', count: 2 },
        { resource: 'portfolio-positions', count: 2 },
        { resource: 'pending-orders', count: 1 },
      ],
    });
    expect(onRefreshHint).toHaveBeenCalledTimes(5);
    expect(onRefreshHint).toHaveBeenNthCalledWith(1, {
      resource: 'pending-orders',
      ticker: null,
      receivedAt: '2026-05-11T06:00:01.000Z',
      sourceType: 'pending-order-refresh',
      reason: 'Toss SSE pending-order-refresh thin notification',
    });
    expect(JSON.stringify(service.status())).not.toContain('raw-secret-like-stock-code');

    await service.stop();
  });

  it('tracks Toss web-push notification presence without exposing raw notification payload', async () => {
    const onUserNotification = vi.fn(async () => undefined);
    const rawProviderKey = `raw-${'content'}-key-should-not-leak`;
    const rawWebPushEvent: TossSseEvent = {
      id: null,
      name: null,
      type: 'web-push',
      key: rawProviderKey,
      stockCode: 'A005930',
      receivedAt: '2026-05-11T06:00:02.000Z',
    };
    const client = {
      listen: vi.fn(async (signal: AbortSignal, handler: (item: TossSseEvent) => void) => {
        handler(rawWebPushEvent);
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
      }),
    } as Pick<TossSseClient, 'listen'>;
    const service = createTossRealtimeService({
      sessionStore: makeSessionStore(),
      createClient: () => client as TossSseClient,
      onUserNotification,
      retryBaseMs: 1,
      retryMaxMs: 1,
    });

    await service.start();

    expect(service.status()).toMatchObject({
      eventCount: 1,
      userNotificationEventCount: 1,
      lastUserNotificationAt: '2026-05-11T06:00:02.000Z',
      refreshHints: [{ resource: 'user-notifications', count: 1 }],
      lastRefreshHintResource: 'user-notifications',
      lastRefreshHintTicker: '005930',
    });
    expect(JSON.stringify(service.status())).not.toContain(rawProviderKey);
    expect(onUserNotification).toHaveBeenCalledTimes(1);
    expect(onUserNotification).toHaveBeenCalledWith({
      id: 'toss-web-push:005930:2026-05-11T06:00:02.000Z',
      ticker: '005930',
      receivedAt: '2026-05-11T06:00:02.000Z',
      sourceType: 'web-push',
      reason: 'Toss SSE web-push notification received',
    });

    await service.stop();
  });

  it('keeps raw stream and refresh dispatch errors out of realtime status', async () => {
    const streamClient = {
      listen: vi.fn(async () => {
        throw new Error('SSE failed with SESSION=[test-session] accountNo=[test-account]-no');
      }),
    } as Pick<TossSseClient, 'listen'>;
    const streamService = createTossRealtimeService({
      sessionStore: makeSessionStore(),
      createClient: () => streamClient as TossSseClient,
      retryBaseMs: 10_000,
      retryMaxMs: 10_000,
    });

    await streamService.start();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(streamService.status().lastError).toBe('TOSS_REALTIME_STREAM_FAILED');
    expect(JSON.stringify(streamService.status())).not.toContain('[test-session]');
    expect(JSON.stringify(streamService.status())).not.toContain('[test-account]-no');
    await streamService.stop();

    const dispatchClient = {
      listen: vi.fn(async (signal: AbortSignal, handler: (item: TossSseEvent) => void) => {
        handler(event('price-refresh', 'A005930'));
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
      }),
    } as Pick<TossSseClient, 'listen'>;
    const dispatchService = createTossRealtimeService({
      sessionStore: makeSessionStore(),
      createClient: () => dispatchClient as TossSseClient,
      onPriceRefresh: vi.fn(async () => {
        throw new Error('quote refresh leaked UTK=[test-utk]');
      }),
      retryBaseMs: 1,
      retryMaxMs: 1,
    });

    await dispatchService.start();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dispatchService.status().lastError).toBe('TOSS_PRICE_REFRESH_DISPATCH_FAILED');
    expect(JSON.stringify(dispatchService.status())).not.toContain('utk-value');
    await dispatchService.stop();
  });
});
