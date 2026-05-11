import { describe, expect, it, vi } from 'vitest';

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
      retryBaseMs: 1,
      retryMaxMs: 1,
    });

    await service.start();

    expect(service.status()).toMatchObject({
      eventCount: 3,
      priceRefreshEventCount: 2,
      lastPriceRefreshAt: '2026-05-11T06:00:01.000Z',
      eventTypes: [
        { type: 'price-refresh', count: 2 },
        { type: 'watchlist-refresh', count: 1 },
      ],
    });
    expect(JSON.stringify(service.status())).not.toContain('redacted');

    await service.stop();
  });
});
