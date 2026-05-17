import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

import { agentEventMonitorRoutes } from '../agent-event-monitor.js';
import type { AgentEventMonitor } from '../../agent/agent-event-monitor.js';

function buildMonitor(overrides: Partial<AgentEventMonitor> = {}): AgentEventMonitor {
  return {
    status: vi.fn(() => ({
      enabled: false,
      running: false,
      intervalMs: 30_000,
      maxTickersPerCycle: 5,
      providerCooldownMs: 10_000,
      dispatchPolicy: {
        mode: 'best_effort_after_first_seen',
        targetFirstSeenToDispatchMs: {
          min: 10_000,
          max: 30_000,
        },
        providerPublicationGuarantee: false,
        autoPollingRequiresOptIn: true,
        fullMarketPolling: false,
      },
      watchPolicy: {
        sources: ['favorite', 'agent_event', 'tracked'],
        fullMarket: false,
      },
      providers: {
        news: true,
        tossNews: false,
        tossSignal: false,
        disclosure: false,
      },
      providerPolicies: {
        news: {
          enabled: true,
          cooldownMs: 10_000,
          freshness: 'published_at_when_available',
          firstSeen: 'araon_observed_at',
        },
        tossNews: {
          enabled: false,
          cooldownMs: 10_000,
          freshness: 'published_at_when_available',
          firstSeen: 'araon_observed_at',
        },
        tossSignal: {
          enabled: false,
          cooldownMs: 10_000,
          freshness: 'published_at_when_available',
          firstSeen: 'araon_observed_at',
        },
        disclosure: {
          enabled: false,
          cooldownMs: 10_000,
          freshness: 'published_at_when_available',
          firstSeen: 'araon_observed_at',
        },
      },
      providerStates: {
        news: {
          enabled: true,
          reason: 'refresh-ready',
        },
        tossNews: {
          enabled: false,
          reason: 'session-required',
        },
        tossSignal: {
          enabled: false,
          reason: 'request-body-template-missing',
        },
        disclosure: {
          enabled: false,
          reason: 'disclosure-store-missing',
        },
      },
      providerObservations: {
        news: {
          lastAttemptedAt: null,
          lastDurationMs: null,
          lastOutcome: null,
          lastInsertedEvents: 0,
          lastErrorCode: null,
        },
        tossNews: {
          lastAttemptedAt: null,
          lastDurationMs: null,
          lastOutcome: null,
          lastInsertedEvents: 0,
          lastErrorCode: null,
        },
        tossSignal: {
          lastAttemptedAt: null,
          lastDurationMs: null,
          lastOutcome: null,
          lastInsertedEvents: 0,
          lastErrorCode: null,
        },
        disclosure: {
          lastAttemptedAt: null,
          lastDurationMs: null,
          lastOutcome: null,
          lastInsertedEvents: 0,
          lastErrorCode: null,
        },
      },
      tossSignalContract: {
        endpoint: {
          method: 'POST',
          host: 'wts-info-api.tossinvest.com',
          path: '/api/v2/dashboard/wts/overview/signals',
        },
        bodyContract: 'capture_required',
        captureRequired: true,
        externalCallsEnabled: false,
        requestBodyTemplateSource: 'ARAON_TOSS_SIGNAL_REQUEST_BODY_TEMPLATE',
        rawTemplateExposed: false,
        shapeProbeCandidates: [
          {
            method: 'GET',
            host: 'wts-info-api.tossinvest.com',
            path: '/api/v1/trading/analysis/productCode/{productCode}',
            purpose: 'shape_probe_only',
            rawPayloadExposed: false,
            rawSessionExposed: false,
          },
          {
            method: 'GET',
            host: 'wts-cert-api.tossinvest.com',
            path: '/api/v1/trading/analysis/productCode/{productCode}',
            purpose: 'shape_probe_only',
            rawPayloadExposed: false,
            rawSessionExposed: false,
          },
        ],
        semanticPolicy: {
          emptyResponse: 'supported_empty_not_actionable',
          eventEmission: 'non_empty_items_only',
          agentEventType: 'toss_signal_detected',
          rawPayloadExposed: false,
        },
        captureGuidance: {
          required: true,
          requiresUserLoginForCapture: true,
          requiresDevToolsForCapture: true,
          rawTemplateExposed: false,
          nextAction: 'user-assisted-capture-required',
        },
        reference: 'tossinvest-cli rpc-catalog',
      },
      cycleCount: 0,
      watchedTickers: [],
      watchedCandidates: [],
      lastCycleAt: null,
      lastCycleDurationMs: null,
      lastSkippedRefreshes: 0,
      lastErrorCode: null,
    })),
    runOnce: vi.fn(async (reason: string) => ({
      state: 'disabled',
      reason,
      tickers: [],
      refreshedNews: 0,
      refreshedTossNews: 0,
      refreshedTossSignals: 0,
      refreshedDisclosures: 0,
      skippedRefreshes: 0,
      insertedEvents: 0,
    })),
    start: vi.fn(),
    stop: vi.fn(),
    ...overrides,
  };
}

describe('agentEventMonitorRoutes', () => {
  it('exposes monitor status without starting provider polling', async () => {
    const app = Fastify();
    const monitor = buildMonitor();
    await app.register(agentEventMonitorRoutes, { monitor });

    const res = await app.inject({ method: 'GET', url: '/agent/event-monitor/status' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        enabled: false,
        running: false,
        watchedTickers: [],
        watchedCandidates: [],
        providers: {
          news: true,
          tossNews: false,
          tossSignal: false,
        },
        providerStates: {
          tossNews: {
            enabled: false,
            reason: 'session-required',
          },
        },
        tossSignalContract: {
          bodyContract: 'capture_required',
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
          semanticPolicy: {
            emptyResponse: 'supported_empty_not_actionable',
            eventEmission: 'non_empty_items_only',
            agentEventType: 'toss_signal_detected',
            rawPayloadExposed: false,
          },
          captureGuidance: {
            required: true,
            requiresUserLoginForCapture: true,
            requiresDevToolsForCapture: true,
            rawTemplateExposed: false,
            nextAction: 'user-assisted-capture-required',
          },
        },
      },
    });
    expect(monitor.runOnce).not.toHaveBeenCalled();
    await app.close();
  });

  it('runs one explicit tick through the injected monitor', async () => {
    const app = Fastify();
    const runOnce = vi.fn(async (reason: string) => ({
      state: 'completed' as const,
      reason,
      tickers: ['005930'],
      refreshedNews: 1,
      refreshedTossNews: 1,
      refreshedTossSignals: 1,
      refreshedDisclosures: 0,
      skippedRefreshes: 0,
      insertedEvents: 1,
    }));
    await app.register(agentEventMonitorRoutes, { monitor: buildMonitor({ runOnce }) });

    const res = await app.inject({ method: 'POST', url: '/agent/event-monitor/tick' });

    expect(res.statusCode).toBe(200);
    expect(runOnce).toHaveBeenCalledWith('manual');
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        state: 'completed',
        tickers: ['005930'],
        refreshedNews: 1,
        refreshedTossNews: 1,
        refreshedTossSignals: 1,
        insertedEvents: 1,
      },
    });
    await app.close();
  });

  it('sanitizes provider failures from manual tick responses', async () => {
    const app = Fastify();
    const runOnce = vi.fn(async () => {
      throw new Error('raw Toss response SESSION=[test-session] accountNo=[test-account]');
    });
    await app.register(agentEventMonitorRoutes, {
      monitor: buildMonitor({
        runOnce,
        status: vi.fn(() => ({
          ...buildMonitor().status(),
          lastErrorCode: 'TOSS_SIGNAL_REQUEST_FAILED',
        })),
      }),
    });

    const res = await app.inject({ method: 'POST', url: '/agent/event-monitor/tick' });

    expect(res.statusCode).toBe(502);
    expect(runOnce).toHaveBeenCalledWith('manual');
    expect(res.json()).toMatchObject({
      success: false,
      error: {
        code: 'TOSS_SIGNAL_REQUEST_FAILED',
        message: 'Agent event monitor tick failed',
      },
      data: {
        state: 'failed',
        reason: 'manual',
        lastErrorCode: 'TOSS_SIGNAL_REQUEST_FAILED',
      },
    });
    expect(res.body).not.toContain(['SESSION', ''].join('='));
    expect(res.body).not.toContain('[test-session]');
    expect(res.body).not.toContain('accountNo');
    await app.close();
  });

  it('does not echo sensitive status errors', async () => {
    const app = Fastify({ logger: false });
    await app.register(agentEventMonitorRoutes, {
      monitor: buildMonitor({
        status: vi.fn(() => {
          throw new Error('status failed near SESSION=[test-session] accountNo=[test-account]');
        }),
      }),
    });

    const res = await app.inject({ method: 'GET', url: '/agent/event-monitor/status' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      success: false,
      error: {
        code: 'AGENT_EVENT_MONITOR_STATUS_FAILED',
        message: 'Agent event monitor status failed',
      },
    });
    expect(res.body).not.toContain('SESSION');
    expect(res.body).not.toContain('[test-session]');
    expect(res.body).not.toContain('accountNo');
    expect(res.body).not.toContain('[test-account]');
    await app.close();
  });

  it('does not echo sensitive status errors while sanitizing failed manual ticks', async () => {
    const app = Fastify({ logger: false });
    const runOnce = vi.fn(async () => {
      throw new Error('raw Toss response SESSION=[test-session] accountNo=[test-account]');
    });
    await app.register(agentEventMonitorRoutes, {
      monitor: buildMonitor({
        runOnce,
        status: vi.fn(() => {
          throw new Error('status failed near orderNo=[test-order]');
        }),
      }),
    });

    const res = await app.inject({ method: 'POST', url: '/agent/event-monitor/tick' });

    expect(res.statusCode).toBe(502);
    expect(runOnce).toHaveBeenCalledWith('manual');
    expect(res.json()).toEqual({
      success: false,
      error: {
        code: 'AGENT_EVENT_MONITOR_TICK_FAILED',
        message: 'Agent event monitor tick failed',
      },
      data: {
        state: 'failed',
        reason: 'manual',
        lastErrorCode: 'AGENT_EVENT_MONITOR_TICK_FAILED',
      },
    });
    expect(res.body).not.toContain('SESSION');
    expect(res.body).not.toContain('[test-session]');
    expect(res.body).not.toContain('accountNo');
    expect(res.body).not.toContain('[test-account]');
    expect(res.body).not.toContain('orderNo');
    expect(res.body).not.toContain('[test-order]');
    await app.close();
  });

  it('starts and stops automatic monitor polling through sanitized control routes', async () => {
    const app = Fastify();
    const start = vi.fn();
    const stop = vi.fn();
    const baseStatus = buildMonitor().status();
    const status = vi.fn()
      .mockReturnValueOnce({ ...baseStatus, enabled: true, running: true })
      .mockReturnValueOnce({ ...baseStatus, enabled: true, running: false });
    await app.register(agentEventMonitorRoutes, {
      monitor: buildMonitor({ start, stop, status }),
    });

    const started = await app.inject({ method: 'POST', url: '/agent/event-monitor/start' });
    const stopped = await app.inject({ method: 'POST', url: '/agent/event-monitor/stop' });

    expect(started.statusCode).toBe(200);
    expect(stopped.statusCode).toBe(200);
    expect(start).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(started.json()).toMatchObject({
      success: true,
      data: {
        enabled: true,
        running: true,
      },
    });
    expect(stopped.json()).toMatchObject({
      success: true,
      data: {
        enabled: true,
        running: false,
      },
    });
    await app.close();
  });

  it('does not echo sensitive monitor control errors', async () => {
    const app = Fastify({ logger: false });
    const start = vi.fn(() => {
      throw new Error('start failed near SESSION=[test-session] accountNo=[test-account]');
    });
    await app.register(agentEventMonitorRoutes, {
      monitor: buildMonitor({ start }),
    });

    const res = await app.inject({ method: 'POST', url: '/agent/event-monitor/start' });

    expect(res.statusCode).toBe(502);
    expect(start).toHaveBeenCalledTimes(1);
    expect(res.json()).toEqual({
      success: false,
      error: {
        code: 'AGENT_EVENT_MONITOR_CONTROL_FAILED',
        message: 'Agent event monitor control failed',
      },
    });
    expect(res.body).not.toContain('SESSION');
    expect(res.body).not.toContain('[test-session]');
    expect(res.body).not.toContain('accountNo');
    expect(res.body).not.toContain('[test-account]');
    await app.close();
  });
});
