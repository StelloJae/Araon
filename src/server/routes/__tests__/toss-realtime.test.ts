import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { tossRealtimeRoutes } from '../toss-realtime.js';
import type {
  TossRealtimeService,
  TossRealtimeStatus,
} from '../../toss/toss-realtime-service.js';
import type { TossSseRefreshResultStore } from '../../toss/toss-sse-refresh-result-store.js';

function realtimeStatus(): TossRealtimeStatus {
  return {
    state: 'idle',
    startedAt: null,
    updatedAt: null,
    stoppedAt: null,
    eventCount: 0,
    priceRefreshEventCount: 0,
    userNotificationEventCount: 0,
    priceRefreshDispatchCount: 0,
    priceRefreshDispatchFailureCount: 0,
    refreshHintCount: 0,
    refreshHintDispatchCount: 0,
    refreshHintDispatchFailureCount: 0,
    refreshHints: [],
    eventTypes: [],
    reconnectCount: 0,
    lastEventType: null,
    lastStockCode: null,
    lastEventAt: null,
    lastPriceRefreshAt: null,
    lastUserNotificationAt: null,
    lastPriceRefreshDispatchAt: null,
    lastRefreshHintAt: null,
    lastRefreshHintResource: null,
    lastRefreshHintTicker: null,
    lastError: null,
    thinNotificationOnly: true,
  };
}

function makeRealtimeService(): TossRealtimeService {
  return {
    start: vi.fn(async () => ({
      ...realtimeStatus(),
      state: 'connecting',
      startedAt: '2026-05-11T06:00:00.000Z',
      updatedAt: '2026-05-11T06:00:00.000Z',
    })),
    stop: vi.fn(async () => ({
      ...realtimeStatus(),
      state: 'stopped',
      updatedAt: '2026-05-11T06:00:01.000Z',
      stoppedAt: '2026-05-11T06:00:01.000Z',
    })),
    status: vi.fn(() => realtimeStatus()),
  };
}

describe('toss realtime routes', () => {
  it('returns sanitized status and controls the read-only Toss SSE service', async () => {
    const realtimeService = makeRealtimeService();
    const app = Fastify({ logger: false });
    await app.register(tossRealtimeRoutes, { realtimeService });

    const status = await app.inject({ method: 'GET', url: '/toss/realtime/status' });
    const start = await app.inject({ method: 'POST', url: '/toss/realtime/start' });
    const stop = await app.inject({ method: 'POST', url: '/toss/realtime/stop' });

    expect(status.json()).toEqual({ success: true, data: realtimeStatus() });
    expect(start.json()).toMatchObject({
      success: true,
      data: { state: 'connecting', thinNotificationOnly: true },
    });
    expect(stop.json()).toMatchObject({
      success: true,
      data: { state: 'stopped' },
    });
    expect(realtimeService.start).toHaveBeenCalledTimes(1);
    expect(realtimeService.stop).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(status.json())).not.toContain('SESSION');
  });

  it('returns recent sanitized SSE-triggered REST refresh results for UI polling', async () => {
    const realtimeService = makeRealtimeService();
    const refreshResultStore: TossSseRefreshResultStore = {
      record: vi.fn(),
      snapshot: vi.fn(() => ({
        items: [
          {
            id: 'refresh-result-1',
            resource: 'portfolio-positions',
            ticker: '005930',
            sourceType: 'share-holdings',
            receivedAt: '2026-05-11T06:00:01.000Z',
            result: 'refreshed',
            reason: 'Toss SSE share-holdings thin notification',
            recordedAt: '2026-05-11T06:00:02.000Z',
            error: null,
          },
        ],
        returnedCount: 1,
      })),
    };
    const app = Fastify({ logger: false });
    await app.register(tossRealtimeRoutes, { realtimeService, refreshResultStore });

    const res = await app.inject({
      method: 'GET',
      url: '/toss/realtime/refresh-results?limit=5',
    });

    expect(res.statusCode).toBe(200);
    expect(refreshResultStore.snapshot).toHaveBeenCalledWith(5);
    expect(res.json()).toEqual({
      success: true,
      data: {
        items: [
          {
            id: 'refresh-result-1',
            resource: 'portfolio-positions',
            ticker: '005930',
            sourceType: 'share-holdings',
            receivedAt: '2026-05-11T06:00:01.000Z',
            result: 'refreshed',
            reason: 'Toss SSE share-holdings thin notification',
            recordedAt: '2026-05-11T06:00:02.000Z',
            error: null,
          },
        ],
        returnedCount: 1,
      },
    });
    expect(res.body).not.toContain('SESSION');
    expect(res.body).not.toContain('accountNo');
  });

  it('does not expose raw Toss realtime service errors', async () => {
    const realtimeService = makeRealtimeService();
    realtimeService.start = vi.fn(async () => {
      throw new Error('SSE start failed with SESSION=[test-session] accountNo=[test-account]-no');
    });
    const app = Fastify({ logger: false });
    await app.register(tossRealtimeRoutes, { realtimeService });

    const res = await app.inject({ method: 'POST', url: '/toss/realtime/start' });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({
      success: false,
      error: {
        code: 'TOSS_REALTIME_REQUEST_FAILED',
        message: 'Toss realtime request failed',
      },
    });
    expect(res.body).not.toContain('[test-session]');
    expect(res.body).not.toContain('[test-account]-no');
  });
});
