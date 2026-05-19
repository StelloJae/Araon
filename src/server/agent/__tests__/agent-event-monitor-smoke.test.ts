import { describe, expect, it, vi } from 'vitest';

import type {
  AgentEventMonitorRunResult,
  AgentEventMonitorStatus,
} from '../agent-event-monitor.js';
import { runAgentEventMonitorSmoke } from '../agent-event-monitor-smoke.js';

describe('agent event monitor smoke', () => {
  it('reports status-only provider metadata without watched tickers or raw errors', async () => {
    const runTick = vi.fn();
    const report = await runAgentEventMonitorSmoke({
      getStatus: async () => statusFixture(),
      runTick,
      now: () => new Date('2026-05-12T02:00:00.000Z'),
    });

    expect(report).toMatchObject({
      provider: 'araon-agent-event-monitor',
      generatedAt: '2026-05-12T02:00:00.000Z',
      outcome: 'ok',
      tick: null,
      status: {
        enabled: true,
        running: false,
        watchedTickerCount: 2,
        candidateCount: 2,
        providers: {
          news: {
            enabled: true,
            reason: 'refresh-ready',
            lastOutcome: 'failed',
            lastInsertedEvents: 0,
            lastErrorCode: 'NEWS_PROVIDER_FAILED',
          },
          tossNews: {
            enabled: true,
            reason: 'session-gated',
            lastOutcome: 'refreshed',
            lastInsertedEvents: 2,
            lastErrorCode: null,
          },
          tossSignal: {
            enabled: false,
            reason: 'request-body-template-missing',
          },
          disclosure: {
            enabled: true,
            reason: 'dart-configured',
          },
        },
        tossSignal: {
          endpointPath: '/api/v2/dashboard/wts/overview/signals',
          shapeProbeHosts: ['wts-info-api.tossinvest.com', 'wts-cert-api.tossinvest.com'],
          bodyContract: 'capture_required',
          captureRequired: true,
          externalCallsEnabled: false,
          rawTemplateExposed: false,
          semanticPolicy: {
            emptyResponse: 'supported_empty_not_actionable',
            eventEmission: 'non_empty_items_only',
            agentEventType: 'toss_signal_detected',
            rawPayloadExposed: false,
          },
          nextAction: 'user-assisted-capture-required',
        },
      },
    });
    expect(runTick).not.toHaveBeenCalled();
    expect(JSON.stringify(report)).not.toContain('005930');
    expect(JSON.stringify(report)).not.toContain('삼성전자');
    expect(JSON.stringify(report)).not.toContain('raw SESSION');
  });

  it('runs a manual tick only when requested and returns count-only results', async () => {
    const runTick = vi.fn(async (): Promise<AgentEventMonitorRunResult> => ({
      state: 'completed',
      reason: 'manual',
      tickers: ['005930', '000660'],
      refreshedNews: 2,
      refreshedTossNews: 1,
      refreshedTossSignals: 0,
      refreshedDisclosures: 1,
      skippedRefreshes: 3,
      insertedEvents: 4,
    }));

    const report = await runAgentEventMonitorSmoke({
      getStatus: async () => statusFixture(),
      runTick,
      runTickEnabled: true,
      now: () => new Date('2026-05-12T02:00:00.000Z'),
    });

    expect(runTick).toHaveBeenCalledWith('manual-smoke');
    expect(report.outcome).toBe('ok');
    expect(report.tick).toEqual({
      requested: true,
      externalCallsMayRun: true,
      state: 'completed',
      reason: 'manual',
      nextAction: 'none',
      tickerCount: 2,
      refreshedNews: 2,
      refreshedTossNews: 1,
      refreshedTossSignals: 0,
      refreshedDisclosures: 1,
      skippedRefreshes: 3,
      insertedEvents: 4,
      errorCode: null,
    });
    expect(JSON.stringify(report)).not.toContain('005930');
    expect(JSON.stringify(report)).not.toContain('000660');
  });

  it('refreshes status after a manual tick so provider observations reflect that tick', async () => {
    const before = statusFixture({
      providerObservations: {
        ...statusFixture().providerObservations,
        news: {
          lastAttemptedAt: null,
          lastDurationMs: null,
          lastOutcome: null,
          lastInsertedEvents: 0,
          lastErrorCode: null,
        },
      },
    });
    const after = statusFixture({
      cycleCount: 4,
      providerObservations: {
        ...statusFixture().providerObservations,
        news: {
          lastAttemptedAt: '2026-05-12T02:00:01.000Z',
          lastDurationMs: 147,
          lastOutcome: 'refreshed',
          lastInsertedEvents: 15,
          lastErrorCode: null,
        },
      },
    });
    const getStatus = vi.fn()
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);

    const report = await runAgentEventMonitorSmoke({
      getStatus,
      runTick: async () => ({
        state: 'completed',
        reason: 'manual',
        tickers: ['005930'],
        refreshedNews: 1,
        refreshedTossNews: 1,
        refreshedTossSignals: 0,
        refreshedDisclosures: 0,
        skippedRefreshes: 0,
        insertedEvents: 15,
      }),
      runTickEnabled: true,
      now: () => new Date('2026-05-12T02:00:00.000Z'),
    });

    expect(getStatus).toHaveBeenCalledTimes(2);
    expect(report.outcome).toBe('ok');
    expect(report.status?.providers.news).toMatchObject({
      lastAttemptedAt: '2026-05-12T02:00:01.000Z',
      lastDurationMs: 147,
      lastOutcome: 'refreshed',
      lastInsertedEvents: 15,
    });
  });

  it('tells operators to restart with the monitor env gate when a tick is requested while disabled', async () => {
    const runTick = vi.fn(async (): Promise<AgentEventMonitorRunResult> => ({
      state: 'disabled',
      reason: 'manual',
      tickers: [],
      refreshedNews: 0,
      refreshedTossNews: 0,
      refreshedTossSignals: 0,
      refreshedDisclosures: 0,
      skippedRefreshes: 0,
      insertedEvents: 0,
    }));

    const report = await runAgentEventMonitorSmoke({
      getStatus: async () => statusFixture({ enabled: false }),
      runTick,
      runTickEnabled: true,
      now: () => new Date('2026-05-12T02:00:00.000Z'),
    });

    expect(report.tick).toMatchObject({
      requested: true,
      externalCallsMayRun: false,
      state: 'disabled',
      nextAction: 'set_env_and_restart',
    });
  });

  it('sanitizes tick failures and keeps status evidence', async () => {
    const report = await runAgentEventMonitorSmoke({
      getStatus: async () => statusFixture(),
      runTick: async () => {
        throw new Error('raw SESSION=secret accountNo=1234');
      },
      runTickEnabled: true,
      now: () => new Date('2026-05-12T02:00:00.000Z'),
    });

    expect(report.outcome).toBe('partial');
    expect(report.errorCode).toBe('AGENT_EVENT_MONITOR_SMOKE_TICK_FAILED');
    expect(report.tick).toEqual({
      requested: true,
      externalCallsMayRun: true,
      state: 'failed',
      reason: 'manual-smoke',
      nextAction: 'inspect_tick_failure',
      tickerCount: 0,
      refreshedNews: 0,
      refreshedTossNews: 0,
      refreshedTossSignals: 0,
      refreshedDisclosures: 0,
      skippedRefreshes: 0,
      insertedEvents: 0,
      errorCode: 'AGENT_EVENT_MONITOR_SMOKE_TICK_FAILED',
    });
    expect(JSON.stringify(report)).not.toContain('SESSION');
    expect(JSON.stringify(report)).not.toContain('accountNo');
    expect(JSON.stringify(report)).not.toContain('1234');
  });

  it('treats a requested tick without a runner as a partial smoke', async () => {
    const report = await runAgentEventMonitorSmoke({
      getStatus: async () => statusFixture(),
      runTickEnabled: true,
      now: () => new Date('2026-05-12T02:00:00.000Z'),
    });

    expect(report.outcome).toBe('partial');
    expect(report.errorCode).toBe('AGENT_EVENT_MONITOR_SMOKE_TICK_FAILED');
    expect(report.tick?.state).toBe('failed');
  });
});

function statusFixture(
  overrides: Partial<AgentEventMonitorStatus> = {},
): AgentEventMonitorStatus {
  return {
    enabled: true,
    running: false,
    intervalMs: 30_000,
    maxTickersPerCycle: 5,
    providerCooldownMs: 10_000,
    dispatchPolicy: {
      mode: 'best_effort_after_first_seen',
      targetFirstSeenToDispatchMs: { min: 10_000, max: 30_000 },
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
      tossNews: true,
      tossSignal: false,
      disclosure: true,
    },
    providerPolicies: {
      news: providerPolicy(true),
      tossNews: providerPolicy(true),
      tossSignal: providerPolicy(false),
      disclosure: providerPolicy(true),
    },
    providerStates: {
      news: { enabled: true, reason: 'refresh-ready' },
      tossNews: { enabled: true, reason: 'session-gated' },
      tossSignal: { enabled: false, reason: 'request-body-template-missing' },
      disclosure: { enabled: true, reason: 'dart-configured' },
    },
    providerObservations: {
      news: {
        lastAttemptedAt: '2026-05-12T01:59:00.000Z',
        lastDurationMs: 120,
        lastOutcome: 'failed',
        lastInsertedEvents: 0,
        lastErrorCode: 'NEWS_PROVIDER_FAILED',
      },
      tossNews: {
        lastAttemptedAt: '2026-05-12T01:59:00.000Z',
        lastDurationMs: 240,
        lastOutcome: 'refreshed',
        lastInsertedEvents: 2,
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
        lastAttemptedAt: '2026-05-12T01:59:00.000Z',
        lastDurationMs: null,
        lastOutcome: 'skipped_cooldown',
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
    cycleCount: 3,
    watchedTickers: ['005930', '000660'],
    watchedCandidates: [
      {
        ticker: '005930',
        name: '삼성전자',
        source: 'favorite',
        reason: 'raw SESSION should not appear',
      },
      {
        ticker: '000660',
        name: 'SK하이닉스',
        source: 'tracked',
        reason: 'tracked ticker',
      },
    ],
    lastCycleAt: '2026-05-12T01:59:00.000Z',
    lastCycleDurationMs: 360,
    lastSkippedRefreshes: 1,
    lastErrorCode: null,
    ...overrides,
  };
}

function providerPolicy(enabled: boolean) {
  return {
    enabled,
    cooldownMs: 10_000,
    freshness: 'published_at_when_available' as const,
    firstSeen: 'araon_observed_at' as const,
  };
}
