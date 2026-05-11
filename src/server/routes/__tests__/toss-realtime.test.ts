import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { tossRealtimeRoutes } from '../toss-realtime.js';
import type {
  TossRealtimeService,
  TossRealtimeStatus,
} from '../../toss/toss-realtime-service.js';

function realtimeStatus(): TossRealtimeStatus {
  return {
    state: 'idle',
    startedAt: null,
    updatedAt: null,
    stoppedAt: null,
    eventCount: 0,
    priceRefreshEventCount: 0,
    eventTypes: [],
    reconnectCount: 0,
    lastEventType: null,
    lastStockCode: null,
    lastEventAt: null,
    lastPriceRefreshAt: null,
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
});
