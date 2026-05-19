import { describe, expect, it, vi } from 'vitest';

import { runTossRealtimeSmoke } from '../toss-realtime-smoke.js';
import type { TossRealtimeStatus } from '../toss-realtime-service.js';

const configuredSession = {
  configured: true,
  state: 'persistent' as const,
  provider: 'toss' as const,
  persistent: true,
  cookieCount: 2,
  localStorageKeyCount: 1,
  sessionStorageKeyCount: 0,
  retrievedAt: '2026-05-12T00:00:00.000Z',
  expiresAt: null,
  serverExpiresAt: '2026-05-19T00:00:00.000Z',
  effectiveExpiresAt: '2026-05-19T00:00:00.000Z',
  expiresInMs: 604_800_000,
};

const loggedOutSession = {
  configured: false,
  state: 'logged_out' as const,
  provider: null,
  persistent: false,
  cookieCount: 0,
  localStorageKeyCount: 0,
  sessionStorageKeyCount: 0,
  retrievedAt: null,
  expiresAt: null,
  serverExpiresAt: null,
  effectiveExpiresAt: null,
  expiresInMs: null,
};

function realtimeStatus(update: Partial<TossRealtimeStatus> = {}): TossRealtimeStatus {
  return {
    state: 'connected',
    startedAt: '2026-05-12T01:00:00.000Z',
    updatedAt: '2026-05-12T01:00:01.000Z',
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
    ...update,
  };
}

describe('toss realtime smoke', () => {
  it('skips the SSE service without a Toss session', async () => {
    const realtimeService = {
      start: vi.fn(),
      stop: vi.fn(),
      status: vi.fn(),
    };

    const report = await runTossRealtimeSmoke({
      sessionStatus: async () => loggedOutSession,
      realtimeService,
      durationMs: 30_000,
      sleep: vi.fn(),
      now: () => new Date('2026-05-12T01:00:00.000Z'),
    });

    expect(report).toMatchObject({
      provider: 'toss',
      generatedAt: '2026-05-12T01:00:00.000Z',
      outcome: 'session_required',
      durationMs: 30_000,
      session: {
        configured: false,
        state: 'logged_out',
        persistent: false,
        effectiveExpiresAt: null,
        expiresInMs: null,
      },
      realtime: {
        started: false,
        state: 'idle',
        eventCount: 0,
        refreshHintCount: 0,
        thinNotificationOnly: true,
        errorCode: 'TOSS_SESSION_REQUIRED',
      },
    });
    expect(realtimeService.start).not.toHaveBeenCalled();
    expect(realtimeService.stop).not.toHaveBeenCalled();
    expect(realtimeService.status).not.toHaveBeenCalled();
  });

  it('starts a bounded SSE observation and reports only sanitized counters', async () => {
    const sleep = vi.fn(async () => undefined);
    const realtimeService = {
      start: vi.fn(async () => realtimeStatus({ state: 'connected' })),
      stop: vi.fn(async () => realtimeStatus({ state: 'stopped', stoppedAt: '2026-05-12T01:00:31.000Z' })),
      status: vi.fn(() => realtimeStatus({
        eventCount: 3,
        priceRefreshEventCount: 1,
        userNotificationEventCount: 1,
        refreshHintCount: 2,
        refreshHints: [
          { resource: 'portfolio-positions', count: 1 },
          { resource: 'user-notifications', count: 1 },
        ],
        eventTypes: [
          { type: 'price-refresh', count: 1 },
          { type: 'web-push', count: 1 },
        ],
        lastEventType: 'web-push',
        lastStockCode: '005930',
        lastRefreshHintResource: 'user-notifications',
        lastRefreshHintTicker: '005930',
      })),
    };

    const report = await runTossRealtimeSmoke({
      sessionStatus: async () => configuredSession,
      realtimeService,
      durationMs: 30_000,
      sleep,
      now: () => new Date('2026-05-12T01:00:00.000Z'),
    });

    expect(report.outcome).toBe('ok');
    expect(report.realtime).toMatchObject({
      started: true,
      state: 'connected',
      eventCount: 3,
      priceRefreshEventCount: 1,
      userNotificationEventCount: 1,
      refreshHintCount: 2,
      lastEventType: 'web-push',
      lastStockCode: '005930',
      lastRefreshHintResource: 'user-notifications',
      lastRefreshHintTicker: '005930',
      thinNotificationOnly: true,
    });
    expect(report.realtime.eventTypes).toEqual([
      { type: 'price-refresh', count: 1 },
      { type: 'web-push', count: 1 },
    ]);
    expect(report.realtime.refreshHints).toEqual([
      { resource: 'portfolio-positions', count: 1 },
      { resource: 'user-notifications', count: 1 },
    ]);
    expect(sleep).toHaveBeenCalledWith(30_000);
    expect(realtimeService.start).toHaveBeenCalledTimes(1);
    expect(realtimeService.status).toHaveBeenCalledTimes(1);
    expect(realtimeService.stop).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(report)).not.toContain('SESSION');
  });

  it('sanitizes failed SSE startup errors', async () => {
    const realtimeService = {
      start: vi.fn(async () => {
        throw new Error(`SSE failed near ${['SESSION', 'raw'].join('=')} ${['accountNo', '1234'].join('=')}`);
      }),
      stop: vi.fn(),
      status: vi.fn(),
    };

    const report = await runTossRealtimeSmoke({
      sessionStatus: async () => configuredSession,
      realtimeService,
      durationMs: 30_000,
      sleep: vi.fn(),
      now: () => new Date('2026-05-12T01:00:00.000Z'),
    });

    expect(report.outcome).toBe('failed');
    expect(report.realtime).toMatchObject({
      started: false,
      state: 'failed',
      errorCode: 'TOSS_REALTIME_SMOKE_FAILED',
      thinNotificationOnly: true,
    });
    expect(JSON.stringify(report)).not.toContain('SESSION');
    expect(JSON.stringify(report)).not.toContain('accountNo');
    expect(JSON.stringify(report)).not.toContain('1234');
  });
});
