import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAraonServer,
  shouldAutoRefreshLegacyKisMaster,
  shouldUseLegacyKisChartFallback,
  shouldUseLegacyKisPollingFallback,
  shouldUseLegacyKisQuoteFallback,
  type AraonServer,
} from '../app.js';
import { closeDb } from '../db/database.js';
import { clearConfiguredDataDirForTests } from '../runtime-paths.js';

const tmpRoots: string[] = [];
let server: AraonServer | null = null;

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'araon-launcher-'));
  tmpRoots.push(dir);
  return dir;
}

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (server !== null) {
    await server.close();
    server = null;
  } else {
    closeDb();
  }
  clearConfiguredDataDirForTests();
  await Promise.all(tmpRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('launcher routes', () => {
  it('keeps legacy KIS master auto refresh disabled unless explicitly enabled', () => {
    expect(shouldAutoRefreshLegacyKisMaster({})).toBe(false);
    expect(shouldAutoRefreshLegacyKisMaster({ ARAON_KIS_MASTER_AUTO_REFRESH: '0' })).toBe(false);
    expect(shouldAutoRefreshLegacyKisMaster({ ARAON_KIS_MASTER_AUTO_REFRESH: '1' })).toBe(true);
  });

  it('keeps legacy KIS chart REST helper disabled unless explicitly enabled', () => {
    expect(shouldUseLegacyKisChartFallback({})).toBe(false);
    expect(shouldUseLegacyKisChartFallback({ ARAON_KIS_CHART_FALLBACK_ENABLED: '0' })).toBe(false);
    expect(shouldUseLegacyKisChartFallback({ ARAON_KIS_CHART_FALLBACK_ENABLED: '1' })).toBe(true);
  });

  it('keeps legacy KIS quote fallback disabled unless explicitly enabled', () => {
    expect(shouldUseLegacyKisQuoteFallback({})).toBe(false);
    expect(shouldUseLegacyKisQuoteFallback({ ARAON_KIS_QUOTE_FALLBACK_ENABLED: '0' })).toBe(false);
    expect(shouldUseLegacyKisQuoteFallback({ ARAON_KIS_QUOTE_FALLBACK_ENABLED: '1' })).toBe(true);
  });

  it('keeps legacy KIS polling fallback disabled unless explicitly enabled', () => {
    expect(shouldUseLegacyKisPollingFallback({})).toBe(false);
    expect(shouldUseLegacyKisPollingFallback({ ARAON_KIS_POLLING_FALLBACK_ENABLED: '0' })).toBe(false);
    expect(shouldUseLegacyKisPollingFallback({ ARAON_KIS_POLLING_FALLBACK_ENABLED: '1' })).toBe(true);
  });

  it('keeps clean first-run external calls blocked until credentials exist', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected external fetch'));
    server = await createAraonServer({ dataDir: await makeTempDir() });
    await server.start({ port: 0 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const settings = await server.app.inject({ method: 'GET', url: '/settings' });
    const credentials = await server.app.inject({ method: 'GET', url: '/credentials/status' });
    const realtime = await server.app.inject({ method: 'GET', url: '/runtime/realtime/status' });
    const masterRefresh = await server.app.inject({ method: 'POST', url: '/master/refresh' });

    expect(settings.json().data).toMatchObject({
      websocketEnabled: true,
      applyTicksToPriceStore: true,
      backgroundDailyBackfillEnabled: true,
    });
    expect(credentials.json().data).toEqual({
      configured: false,
      isPaper: null,
      runtime: 'unconfigured',
    });
    expect(realtime.json().data).toMatchObject({
      configured: false,
      runtimeStatus: 'unconfigured',
      canApplyTicksToPriceStore: false,
      subscribedTickerCount: 0,
    });
    expect(masterRefresh.statusCode).toBe(409);
    expect(masterRefresh.json().error.code).toBe('MASTER_REFRESH_REQUIRES_CREDENTIALS');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps launcher heartbeat disabled by default and exposes no credential material', async () => {
    server = await createAraonServer({ dataDir: await makeTempDir() });

    const res = await server.app.inject({ method: 'GET', url: '/runtime/launcher/status' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: {
        enabled: false,
        exitWhenBrowserCloses: false,
        heartbeatIntervalMs: 5000,
        heartbeatTimeoutMs: 20000,
        activeTabCount: 0,
      },
    });
    expect(res.body).not.toContain('appKey');
    expect(res.body).not.toContain('appSecret');
    expect(res.body).not.toContain('accessToken');
    expect(res.body).not.toContain('approvalKey');
  });

  it('wires Toss session extension without external calls when no session exists', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected external fetch'));
    server = await createAraonServer({ dataDir: await makeTempDir() });

    const res = await server.app.inject({
      method: 'POST',
      url: '/toss/auth/session/extend',
      payload: { timeoutMs: 30_000 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        state: 'failed',
        serverExpiresAt: null,
        approvalState: null,
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.body).not.toContain('SESSION');
    expect(res.body).not.toContain('UTK');
  });

  it('wires the read-only agent event queue for future UI and agent consumers', async () => {
    server = await createAraonServer({ dataDir: await makeTempDir() });

    const res = await server.app.inject({ method: 'GET', url: '/agent/events' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: {
        items: [],
        returnedCount: 0,
      },
    });
  });

  it('restores sanitized agent events from the local audit log after restart', async () => {
    const dataDir = await makeTempDir();
    server = await createAraonServer({ dataDir });

    const added = await server.app.inject({
      method: 'POST',
      url: '/stocks',
      payload: {
        ticker: '005930',
        name: '삼성전자',
        market: 'KOSPI',
      },
    });
    expect(added.statusCode).toBe(201);

    const created = await server.app.inject({
      method: 'POST',
      url: '/stocks/005930/signals',
      payload: {
        name: '삼성전자',
        signalType: 'overheat',
        source: 'realtime-momentum',
        signalPrice: 900000,
        signalAt: '2026-05-11T06:00:30.000Z',
        baselinePrice: 861400,
        baselineAt: '2026-05-11T06:00:00.000Z',
        momentumPct: 4.48,
        momentumWindow: '30s',
        dailyChangePct: 1.2,
        volume: 1200,
        volumeSurgeRatio: 2.5,
        volumeBaselineStatus: 'ready',
      },
    });
    expect(created.statusCode).toBe(201);

    await server.close();
    server = null;
    closeDb();
    server = await createAraonServer({ dataDir });

    const restored = await server.app.inject({ method: 'GET', url: '/agent/events?limit=5' });

    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({
      success: true,
      data: {
        returnedCount: 1,
        items: [
          {
            type: 'market_movement_detected',
            ticker: '005930',
            source: 'realtime-momentum',
            publishedAt: '2026-05-11T06:00:30.000Z',
            freshnessMs: expect.any(Number),
            relevance: 1,
            confidence: 0.9,
            payloadRef: expect.stringMatching(/^stock-signal:/),
          },
        ],
      },
    });
    expect(restored.body).not.toContain('signalPrice');
    expect(restored.body).not.toContain('baselinePrice');
    expect(restored.body).not.toContain('SESSION');

    const deliveries = await server.app.inject({
      method: 'GET',
      url: '/agent/event-alert-deliveries?limit=5',
    });

    expect(deliveries.statusCode).toBe(200);
    expect(deliveries.json()).toMatchObject({
      success: true,
      data: {
        returnedCount: 0,
        items: [],
      },
    });
    expect(deliveries.body).not.toContain('signalPrice');
    expect(deliveries.body).not.toContain('baselinePrice');
    expect(deliveries.body).not.toContain('SESSION');
  });

  it(
    'delivers fresh agent event alerts after the 10s minimum delay',
    async () => {
      server = await createAraonServer({ dataDir: await makeTempDir() });

      const added = await server.app.inject({
        method: 'POST',
        url: '/stocks',
        payload: {
          ticker: '005930',
          name: '삼성전자',
          market: 'KOSPI',
        },
      });
      expect(added.statusCode).toBe(201);

      const created = await server.app.inject({
        method: 'POST',
        url: '/stocks/005930/signals',
        payload: {
          name: '삼성전자',
          signalType: 'overheat',
          source: 'realtime-momentum',
          signalPrice: 900000,
          signalAt: '2026-05-11T06:00:00.000Z',
          baselinePrice: 861400,
          baselineAt: '2026-05-11T06:00:00.000Z',
          momentumPct: 4.48,
          momentumWindow: '30s',
          dailyChangePct: 1.2,
          volume: 1200,
          volumeSurgeRatio: 2.5,
          volumeBaselineStatus: 'ready',
        },
      });
      expect(created.statusCode).toBe(201);

      const earlyDeliveries = await server.app.inject({
        method: 'GET',
        url: '/agent/event-alert-deliveries?limit=5',
      });
      expect(earlyDeliveries.statusCode).toBe(200);
      expect(earlyDeliveries.json()).toMatchObject({
        success: true,
        data: {
          returnedCount: 0,
        },
      });
      expect(
        (
          await server.app.inject({
            method: 'GET',
            url: '/agent/events?limit=5',
          })
        ).json().data.returnedCount,
      ).toBe(1);

      await new Promise((resolve) => setTimeout(resolve, 10_500));

      const lateDeliveries = await server.app.inject({
        method: 'GET',
        url: '/agent/event-alert-deliveries?limit=5',
      });
      expect(lateDeliveries.statusCode).toBe(200);
      expect(lateDeliveries.json()).toMatchObject({
        success: true,
        data: {
          returnedCount: 1,
          items: [
            {
              eventId: expect.any(String),
              ticker: '005930',
              eventType: 'market_movement_detected',
              channel: 'browser-sse',
              target: 'local-ui',
              status: 'skipped_no_client',
              clientCount: 0,
              reason: 'agent-event SSE notification',
            },
          ],
        },
      });
    },
    20_000,
  );

  it('keeps agent event monitor disabled by default', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected external fetch'));
    server = await createAraonServer({ dataDir: await makeTempDir() });
    await server.start({ port: 0 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const res = await server.app.inject({ method: 'GET', url: '/agent/event-monitor/status' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        enabled: false,
        running: false,
        cycleCount: 0,
        watchedTickers: [],
        providers: {
          news: true,
          tossNews: true,
          tossSignal: false,
        },
        providerStates: {
          tossNews: {
            enabled: true,
            reason: 'session-gated',
          },
        },
        tossSignalContract: {
          bodyContract: 'capture_required',
          captureRequired: true,
          externalCallsEnabled: false,
          rawTemplateExposed: false,
          shapeProbeCandidates: [
            {
              host: 'wts-info-api.tossinvest.com',
              purpose: 'shape_probe_only',
              rawPayloadExposed: false,
              rawSessionExposed: false,
            },
            {
              host: 'wts-cert-api.tossinvest.com',
              purpose: 'shape_probe_only',
              rawPayloadExposed: false,
              rawSessionExposed: false,
            },
          ],
        },
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps manual agent event monitor ticks disabled by default without external calls', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected external fetch'));
    server = await createAraonServer({ dataDir: await makeTempDir() });

    const res = await server.app.inject({ method: 'POST', url: '/agent/event-monitor/tick' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        state: 'disabled',
        reason: 'manual',
        tickers: [],
        refreshedNews: 0,
        refreshedTossNews: 0,
        refreshedTossSignals: 0,
        refreshedDisclosures: 0,
        insertedEvents: 0,
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.body).not.toContain('SESSION');
    expect(res.body).not.toContain('UTK');
    expect(res.body).not.toContain('accountNo');
  });

  it('wires the agent event monitor provider cooldown from env', async () => {
    const previousEnabled = process.env['ARAON_AGENT_EVENT_MONITOR_ENABLED'];
    const previousCooldown = process.env['ARAON_AGENT_EVENT_MONITOR_PROVIDER_COOLDOWN_MS'];
    process.env['ARAON_AGENT_EVENT_MONITOR_ENABLED'] = '1';
    process.env['ARAON_AGENT_EVENT_MONITOR_PROVIDER_COOLDOWN_MS'] = '45000';
    try {
      server = await createAraonServer({ dataDir: await makeTempDir() });

      const res = await server.app.inject({ method: 'GET', url: '/agent/event-monitor/status' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        success: true,
        data: {
          enabled: true,
          providerCooldownMs: 45_000,
          lastSkippedRefreshes: 0,
        },
      });
    } finally {
      if (previousEnabled === undefined) {
        delete process.env['ARAON_AGENT_EVENT_MONITOR_ENABLED'];
      } else {
        process.env['ARAON_AGENT_EVENT_MONITOR_ENABLED'] = previousEnabled;
      }
      if (previousCooldown === undefined) {
        delete process.env['ARAON_AGENT_EVENT_MONITOR_PROVIDER_COOLDOWN_MS'];
      } else {
        process.env['ARAON_AGENT_EVENT_MONITOR_PROVIDER_COOLDOWN_MS'] = previousCooldown;
      }
    }
  });

  it('wires the Toss signal provider only when a request body template is configured', async () => {
    const previousEnabled = process.env['ARAON_AGENT_EVENT_MONITOR_ENABLED'];
    const previousTemplate = process.env['ARAON_TOSS_SIGNAL_REQUEST_BODY_TEMPLATE'];
    const previousEndpoint = process.env['ARAON_TOSS_SIGNAL_ENDPOINT_PATH'];
    process.env['ARAON_AGENT_EVENT_MONITOR_ENABLED'] = '1';
    process.env['ARAON_TOSS_SIGNAL_REQUEST_BODY_TEMPLATE'] = JSON.stringify({
      dashboardContext: 'stock-detail',
    });
    process.env['ARAON_TOSS_SIGNAL_ENDPOINT_PATH'] = '/api/v1/dashboard/intelligences/all';
    try {
      server = await createAraonServer({ dataDir: await makeTempDir() });

      const res = await server.app.inject({ method: 'GET', url: '/agent/event-monitor/status' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        success: true,
        data: {
          enabled: true,
          providers: {
            news: true,
            tossNews: true,
            tossSignal: true,
          },
          tossSignalContract: {
            bodyContract: 'configured',
            captureRequired: false,
            externalCallsEnabled: true,
            rawTemplateExposed: false,
            endpoint: {
              path: '/api/v1/dashboard/intelligences/all',
            },
            shapeProbeCandidates: [
              {
                host: 'wts-info-api.tossinvest.com',
                purpose: 'shape_probe_only',
                rawPayloadExposed: false,
                rawSessionExposed: false,
              },
              {
                host: 'wts-cert-api.tossinvest.com',
                purpose: 'shape_probe_only',
                rawPayloadExposed: false,
                rawSessionExposed: false,
              },
            ],
          },
        },
      });
    } finally {
      if (previousEnabled === undefined) {
        delete process.env['ARAON_AGENT_EVENT_MONITOR_ENABLED'];
      } else {
        process.env['ARAON_AGENT_EVENT_MONITOR_ENABLED'] = previousEnabled;
      }
      if (previousTemplate === undefined) {
        delete process.env['ARAON_TOSS_SIGNAL_REQUEST_BODY_TEMPLATE'];
      } else {
        process.env['ARAON_TOSS_SIGNAL_REQUEST_BODY_TEMPLATE'] = previousTemplate;
      }
      if (previousEndpoint === undefined) {
        delete process.env['ARAON_TOSS_SIGNAL_ENDPOINT_PATH'];
      } else {
        process.env['ARAON_TOSS_SIGNAL_ENDPOINT_PATH'] = previousEndpoint;
      }
    }
  });

  it('wires the agent event monitor watch sources from env without full-market scope', async () => {
    const previousEnabled = process.env['ARAON_AGENT_EVENT_MONITOR_ENABLED'];
    const previousSources = process.env['ARAON_AGENT_EVENT_MONITOR_WATCH_SOURCES'];
    process.env['ARAON_AGENT_EVENT_MONITOR_ENABLED'] = '1';
    process.env['ARAON_AGENT_EVENT_MONITOR_WATCH_SOURCES'] = 'favorite,agent_event';
    try {
      server = await createAraonServer({ dataDir: await makeTempDir() });

      const res = await server.app.inject({ method: 'GET', url: '/agent/event-monitor/status' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        success: true,
        data: {
          enabled: true,
          watchPolicy: {
            sources: ['favorite', 'agent_event'],
            fullMarket: false,
          },
        },
      });
    } finally {
      if (previousEnabled === undefined) {
        delete process.env['ARAON_AGENT_EVENT_MONITOR_ENABLED'];
      } else {
        process.env['ARAON_AGENT_EVENT_MONITOR_ENABLED'] = previousEnabled;
      }
      if (previousSources === undefined) {
        delete process.env['ARAON_AGENT_EVENT_MONITOR_WATCH_SOURCES'];
      } else {
        process.env['ARAON_AGENT_EVENT_MONITOR_WATCH_SOURCES'] = previousSources;
      }
    }
  });

  it('wires locked order-intent preview without requiring credentials', async () => {
    server = await createAraonServer({ dataDir: await makeTempDir() });

    const res = await server.app.inject({
      method: 'POST',
      url: '/agent/order-intents/preview',
      payload: {
        ticker: '005930',
        side: 'buy',
        quantity: 1,
        reason: 'local preview smoke',
        requestedMode: 'simulated',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        preview: {
          ticker: '005930',
          executionMode: 'simulated',
          liveExecutionLocked: true,
        },
      },
    });
    expect(res.body).not.toContain('SESSION');
    expect(res.body).not.toContain('approval_key');

    const intentId = res.json().data.preview.id as string;
    const challenge = await server.app.inject({
      method: 'POST',
      url: `/agent/order-intents/${encodeURIComponent(intentId)}/approval-challenge`,
      payload: {
        operatorId: 'local-user',
        expiresInMs: 60_000,
      },
    });
    expect(challenge.statusCode).toBe(200);
    expect(challenge.json()).toMatchObject({
      success: true,
      data: {
        challenge: {
          ticker: '005930',
          status: 'pending_confirmation',
          confirmationText: 'CONFIRM 005930 BUY LIVE',
          liveExecutionLocked: true,
        },
      },
    });

    const challengeId = challenge.json().data.challenge.id as string;
    const confirmed = await server.app.inject({
      method: 'POST',
      url: `/agent/order-intents/approval-challenges/${encodeURIComponent(challengeId)}/confirm`,
      payload: {
        confirmationText: 'CONFIRM 005930 BUY LIVE',
      },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toMatchObject({
      success: true,
      data: {
        liveExecutionLocked: true,
        execution: null,
        challenge: {
          ticker: '005930',
          status: 'confirmed_live_locked',
        },
      },
    });
    expect(confirmed.body).not.toContain('SESSION');
    expect(confirmed.body).not.toContain('approval_key');
  });

  it('wires the optional KIS WS slot preview without requiring credentials', async () => {
    server = await createAraonServer({ dataDir: await makeTempDir() });

    const res = await server.app.inject({
      method: 'GET',
      url: '/runtime/realtime/kis-ws-slots',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        enabled: false,
        provider: 'kis',
        perProfileCap: 40,
        activeCount: 0,
        fallbackCount: 0,
        candidates: [],
      },
    });
    expect(res.body).not.toContain('approval');
    expect(res.body).not.toContain('appSecret');
  });

  it('wires Toss account routes without external calls when no Toss session exists', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected external fetch'));
    server = await createAraonServer({ dataDir: await makeTempDir() });

    const res = await server.app.inject({ method: 'GET', url: '/toss/account/list' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      success: false,
      error: { code: 'TOSS_SESSION_REQUIRED' },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.body).not.toContain('accountNo');
  });

  it('wires Toss account summary routes without external calls when no Toss session exists', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected external fetch'));
    server = await createAraonServer({ dataDir: await makeTempDir() });

    const res = await server.app.inject({ method: 'GET', url: '/toss/account/summary' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      success: false,
      error: { code: 'TOSS_SESSION_REQUIRED' },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.body).not.toContain('accountNo');
  });

  it('wires Toss portfolio routes without external calls when no Toss session exists', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected external fetch'));
    server = await createAraonServer({ dataDir: await makeTempDir() });

    const res = await server.app.inject({ method: 'GET', url: '/toss/portfolio/positions' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      success: false,
      error: { code: 'TOSS_SESSION_REQUIRED' },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.body).not.toContain('accountNo');
  });

  it('wires Toss pending orders routes without external calls when no Toss session exists', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected external fetch'));
    server = await createAraonServer({ dataDir: await makeTempDir() });

    const res = await server.app.inject({ method: 'GET', url: '/toss/orders/pending' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      success: false,
      error: { code: 'TOSS_SESSION_REQUIRED' },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.body).not.toContain('orderNo');
  });

  it('wires Toss completed orders routes without external calls when no Toss session exists', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected external fetch'));
    server = await createAraonServer({ dataDir: await makeTempDir() });

    const res = await server.app.inject({ method: 'GET', url: '/toss/orders/completed' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      success: false,
      error: { code: 'TOSS_SESSION_REQUIRED' },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.body).not.toContain('orderNo');
  });

  it('wires Toss order detail routes without external calls when no Toss session exists', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected external fetch'));
    server = await createAraonServer({ dataDir: await makeTempDir() });

    const res = await server.app.inject({ method: 'GET', url: '/toss/orders/pending-order-1' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      success: false,
      error: { code: 'TOSS_SESSION_REQUIRED' },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.body).not.toContain('orderNo');
    expect(res.body).not.toContain('pending-order-1');
  });

  it('wires Toss transaction ledger routes without external calls when no Toss session exists', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected external fetch'));
    server = await createAraonServer({ dataDir: await makeTempDir() });

    const res = await server.app.inject({ method: 'GET', url: '/toss/transactions' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      success: false,
      error: { code: 'TOSS_SESSION_REQUIRED' },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.body).not.toContain('referenceId');
  });

  it('wires Toss transaction overview routes without external calls when no Toss session exists', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected external fetch'));
    server = await createAraonServer({ dataDir: await makeTempDir() });

    const res = await server.app.inject({
      method: 'GET',
      url: '/toss/transactions/overview?market=kr',
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      success: false,
      error: { code: 'TOSS_SESSION_REQUIRED' },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.body).not.toContain('referenceId');
  });

  it('wires Toss watchlist routes without external calls when no Toss session exists', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected external fetch'));
    server = await createAraonServer({ dataDir: await makeTempDir() });

    const res = await server.app.inject({ method: 'GET', url: '/toss/watchlist' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      success: false,
      error: { code: 'TOSS_SESSION_REQUIRED' },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.body).not.toContain('parentListId');
  });

  it('accepts launcher heartbeats only when enabled', async () => {
    const setInterval = vi.fn(() => 1 as unknown as ReturnType<typeof globalThis.setInterval>);
    const clearInterval = vi.fn();
    server = await createAraonServer({
      dataDir: await makeTempDir(),
      launcher: {
        enabled: true,
        setInterval,
        clearInterval,
      },
    });

    const heartbeat = await server.app.inject({
      method: 'POST',
      url: '/runtime/launcher/heartbeat',
      payload: { tabId: 'tab-a' },
    });
    expect(heartbeat.statusCode).toBe(200);
    expect(heartbeat.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        enabled: true,
        activeTabCount: 1,
      }),
    });

    const closing = await server.app.inject({
      method: 'POST',
      url: '/runtime/launcher/heartbeat',
      payload: { tabId: 'tab-a', closing: true },
    });
    expect(closing.json().data.activeTabCount).toBe(0);
  });
});
