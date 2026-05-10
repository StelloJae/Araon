import { describe, expect, it } from 'vitest';

import { buildKisGovernorObservationReport } from '../kis-governor-observation.js';

describe('buildKisGovernorObservationReport', () => {
  it('summarizes sanitized KIS governor, TOP100, and backfill observations', () => {
    const report = buildKisGovernorObservationReport({
      targetUrl: 'http://127.0.0.1:3000',
      startedAt: '2026-05-10T10:00:00.000Z',
      finishedAt: '2026-05-10T10:01:00.000Z',
      durationMs: 60_000,
      intervalMs: 10_000,
      samples: [
        sample({
          kisOutboundLimiter: {
            configured: true,
            currentState: 'recovering',
            queueDepth: 2,
            currentAllowedRps: 3,
            lastThrottleAt: '2026-05-10T10:00:10.000Z',
            lastThrottleClass: 'polling',
            lastThrottleCode: 'EGW00201',
            recoveryAttemptCount: 1,
            profiles: [{ observedRecoveryMs: 861 }],
            aimd: {
              enabled: true,
              mode: 'active',
              currentPollingMinStartGapMs: 920,
              currentPollingRecoveryRatePerSec: 3,
              lastDecision: {
                action: 'increase_gap',
                reason: 'repeated_throttle',
              },
              observationWindow: { classification: 'regular_market' },
            },
          },
          marketTopMovers: {
            configured: true,
            status: 'partial',
            cooldownActive: false,
            inflight: false,
            lastFetchedAt: '2026-05-10T10:00:05.000Z',
            lastErrorCode: null,
            coverage: { guaranteedTop100: false },
          },
          backfill: {
            running: true,
            cooldownActive: false,
            lastAttempted: 2,
            lastSucceeded: 1,
            lastFailed: 0,
          },
        }),
        sample({
          kisOutboundLimiter: {
            configured: true,
            currentState: 'normal',
            queueDepth: 0,
            currentAllowedRps: 15,
            lastThrottleAt: '2026-05-10T10:00:10.000Z',
            lastThrottleClass: 'polling',
            lastThrottleCode: 'EGW00201',
            recoveryAttemptCount: 0,
            profiles: [{ observedRecoveryMs: 861 }],
            aimd: {
              enabled: true,
              mode: 'active',
              currentPollingMinStartGapMs: 920,
              currentPollingRecoveryRatePerSec: 3,
              lastDecision: {
                action: 'hold',
                reason: 'clean_window',
              },
              observationWindow: { classification: 'regular_market' },
            },
          },
          marketTopMovers: {
            configured: true,
            status: 'ready',
            cooldownActive: false,
            inflight: false,
            lastFetchedAt: '2026-05-10T10:00:25.000Z',
            lastErrorCode: null,
            coverage: { guaranteedTop100: true },
          },
          backfill: {
            running: false,
            cooldownActive: false,
            lastAttempted: 2,
            lastSucceeded: 2,
            lastFailed: 0,
          },
        }),
      ],
    });

    expect(report.ok).toBe(true);
    expect(report.kisOutboundLimiter.stateCounts).toEqual({ recovering: 1, normal: 1 });
    expect(report.kisOutboundLimiter.maxQueueDepth).toBe(2);
    expect(report.kisOutboundLimiter.observedRecoveryMs).toEqual({
      count: 2,
      min: 861,
      max: 861,
      last: 861,
    });
    expect(report.marketTopMovers.statusCounts).toEqual({ partial: 1, ready: 1 });
    expect(report.marketTopMovers.guaranteedTop100Samples).toBe(1);
    expect(report.backfill.maxLastSucceeded).toBe(2);
    expect(JSON.stringify(report)).not.toContain('bodyText');
  });

  it('flags HTTP and sensitive-value issues without echoing raw bodies', () => {
    const report = buildKisGovernorObservationReport({
      targetUrl: 'http://127.0.0.1:3000',
      startedAt: '2026-05-10T10:00:00.000Z',
      finishedAt: '2026-05-10T10:01:00.000Z',
      durationMs: 60_000,
      intervalMs: 10_000,
      samples: [
        {
          endpoint: '/runtime/data-health',
          sampledAt: '2026-05-10T10:00:00.000Z',
          status: 200,
          bodyText: JSON.stringify({
            success: true,
            data: {
              kisOutboundLimiter: { configured: false, currentState: 'unconfigured' },
              secretKey: 'redacted-placeholder-value',
            },
          }),
        },
      ],
    });

    expect(report.ok).toBe(false);
    expect(report.issueCount).toBe(1);
    expect(report.issues[0]?.code).toBe('RAW_SECRET_VALUE');
    expect(JSON.stringify(report)).not.toContain('redacted-placeholder-value');
  });
});

function sample(data: Record<string, unknown>) {
  return {
    endpoint: '/runtime/data-health',
    sampledAt: '2026-05-10T10:00:00.000Z',
    status: 200,
    bodyText: JSON.stringify({ success: true, data }),
  };
}
