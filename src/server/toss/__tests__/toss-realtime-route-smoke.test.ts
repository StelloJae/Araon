import { describe, expect, it, vi } from 'vitest';

import {
  runTossRealtimeRouteSmoke,
  type TossRealtimeRouteRefreshResults,
  type TossRealtimeRouteStatus,
} from '../toss-realtime-route-smoke.js';

describe('toss realtime route smoke', () => {
  it('observes app-level realtime routes and reports refresh audit rows without tickers', async () => {
    const sleep = vi.fn(async () => undefined);
    const getStatus = vi.fn<() => Promise<TossRealtimeRouteStatus>>()
      .mockResolvedValueOnce(status({ state: 'idle' }))
      .mockResolvedValueOnce(status({
        eventCount: 1,
        refreshHintCount: 1,
        refreshHintDispatchCount: 1,
        lastEventType: 'share-holdings',
        lastStockCode: '005930',
        lastRefreshHintResource: 'portfolio-positions',
        lastRefreshHintTicker: '005930',
      }));
    const getRefreshResults = vi.fn<() => Promise<TossRealtimeRouteRefreshResults>>()
      .mockResolvedValueOnce({ returnedCount: 0, items: [] })
      .mockResolvedValueOnce({
        returnedCount: 1,
        items: [
          {
            resource: 'portfolio-positions',
            ticker: '005930',
            result: 'refreshed',
            error: null,
          },
        ],
      });
    const startRealtime = vi.fn(async () => status({ state: 'connected' }));

    const report = await runTossRealtimeRouteSmoke({
      getStatus,
      getRefreshResults,
      startRealtime,
      startIfIdle: true,
      durationMs: 10_000,
      intervalMs: 5_000,
      sleep,
      now: () => new Date('2026-05-12T04:00:00.000Z'),
    });

    expect(startRealtime).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(5_000);
    expect(report).toMatchObject({
      provider: 'toss-app-realtime-routes',
      generatedAt: '2026-05-12T04:00:00.000Z',
      outcome: 'refresh_observed',
      startedRealtime: true,
      sampleCount: 2,
      final: {
        state: 'connected',
        eventCount: 1,
        refreshHintCount: 1,
        refreshHintDispatchCount: 1,
        refreshResultCount: 1,
        lastEventType: 'share-holdings',
        lastRefreshHintResource: 'portfolio-positions',
        latestRefreshResult: {
          resource: 'portfolio-positions',
          tickerPresent: true,
          result: 'refreshed',
          error: null,
        },
        thinNotificationOnly: true,
      },
    });
    expect(JSON.stringify(report)).not.toContain('005930');
    expect(JSON.stringify(report)).not.toContain('SESSION');
  });

  it('keeps a connected no-event observation distinct from completed refresh proof', async () => {
    const report = await runTossRealtimeRouteSmoke({
      getStatus: async () => status({ state: 'connected' }),
      getRefreshResults: async () => ({ returnedCount: 0, items: [] }),
      durationMs: 0,
      sleep: async () => undefined,
      now: () => new Date('2026-05-12T04:00:00.000Z'),
    });

    expect(report.outcome).toBe('connected_no_event');
    expect(report.final).toMatchObject({
      state: 'connected',
      eventCount: 0,
      refreshResultCount: 0,
      latestRefreshResult: null,
      thinNotificationOnly: true,
    });
  });

  it('does not count pre-existing refresh rows as a new SSE refresh observation', async () => {
    const getRefreshResults = vi.fn<() => Promise<TossRealtimeRouteRefreshResults>>()
      .mockResolvedValue({
        returnedCount: 1,
        items: [
          {
            id: 'refresh-result-existing',
            resource: 'user-notifications',
            ticker: null,
            result: 'ignored',
            error: null,
          },
        ],
      });

    const report = await runTossRealtimeRouteSmoke({
      getStatus: async () => status({ state: 'connected' }),
      getRefreshResults,
      durationMs: 0,
      sleep: async () => undefined,
      now: () => new Date('2026-05-12T04:00:00.000Z'),
    });

    expect(report.outcome).toBe('connected_no_event');
    expect(report.final.refreshResultCount).toBe(0);
    expect(report.final.latestRefreshResult).toBeNull();
  });

  it('does not treat newly observed ignored rows as completed REST refresh proof', async () => {
    const sleep = vi.fn(async () => undefined);
    const getStatus = vi.fn<() => Promise<TossRealtimeRouteStatus>>()
      .mockResolvedValueOnce(status({ state: 'connected' }))
      .mockResolvedValueOnce(status({
        eventCount: 1,
        refreshHintCount: 1,
        refreshHintDispatchCount: 1,
        lastEventType: 'web-push',
        lastStockCode: 'A005930',
        lastRefreshHintResource: 'user-notifications',
        lastRefreshHintTicker: '005930',
      }));
    const getRefreshResults = vi.fn<() => Promise<TossRealtimeRouteRefreshResults>>()
      .mockResolvedValueOnce({ returnedCount: 0, items: [] })
      .mockResolvedValueOnce({
        returnedCount: 1,
        items: [
          {
            id: 'refresh-result-2',
            resource: 'user-notifications',
            ticker: '005930',
            result: 'ignored',
            error: null,
          },
        ],
      });

    const report = await runTossRealtimeRouteSmoke({
      getStatus,
      getRefreshResults,
      durationMs: 10_000,
      intervalMs: 5_000,
      sleep,
      now: () => new Date('2026-05-12T04:00:00.000Z'),
    });

    expect(report.outcome).toBe('event_observed_without_refresh');
    expect(report.final).toMatchObject({
      eventCount: 1,
      refreshHintCount: 1,
      refreshResultCount: 1,
      lastEventType: 'web-push',
      lastRefreshHintResource: 'user-notifications',
      latestRefreshResult: {
        resource: 'user-notifications',
        tickerPresent: true,
        result: 'ignored',
        error: null,
      },
    });
    expect(JSON.stringify(report)).not.toContain('005930');
    expect(JSON.stringify(report)).not.toContain('SESSION');
  });

  it('sanitizes route failures and session-required states', async () => {
    const sessionRequired = await runTossRealtimeRouteSmoke({
      getStatus: async () => status({
        state: 'failed',
        lastError: 'TOSS_SESSION_REQUIRED',
      }),
      getRefreshResults: async () => ({ returnedCount: 0, items: [] }),
      durationMs: 0,
      sleep: async () => undefined,
      now: () => new Date('2026-05-12T04:00:00.000Z'),
    });
    expect(sessionRequired.outcome).toBe('session_required');

    const failed = await runTossRealtimeRouteSmoke({
      getStatus: async () => {
        throw new Error('raw SESSION=secret accountNo=1234');
      },
      getRefreshResults: async () => ({ returnedCount: 0, items: [] }),
      durationMs: 0,
      sleep: async () => undefined,
      now: () => new Date('2026-05-12T04:00:00.000Z'),
    });
    expect(failed.outcome).toBe('failed');
    expect(failed.errorCode).toBe('TOSS_REALTIME_ROUTE_SMOKE_FAILED');
    expect(JSON.stringify(failed)).not.toContain('SESSION');
    expect(JSON.stringify(failed)).not.toContain('accountNo');
    expect(JSON.stringify(failed)).not.toContain('1234');
  });
});

function status(update: Partial<TossRealtimeRouteStatus> = {}): TossRealtimeRouteStatus {
  return {
    state: 'connected',
    eventCount: 0,
    priceRefreshEventCount: 0,
    userNotificationEventCount: 0,
    refreshHintCount: 0,
    refreshHintDispatchCount: 0,
    refreshHintDispatchFailureCount: 0,
    refreshHints: [],
    eventTypes: [],
    reconnectCount: 0,
    lastEventType: null,
    lastStockCode: null,
    lastRefreshHintResource: null,
    lastRefreshHintTicker: null,
    lastError: null,
    thinNotificationOnly: true,
    ...update,
  };
}
