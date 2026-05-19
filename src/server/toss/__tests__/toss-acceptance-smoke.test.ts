import { describe, expect, it, vi } from 'vitest';

import { runTossAcceptanceSmoke } from '../toss-acceptance-smoke.js';
import type { TossAuthenticatedReadSmokeReport } from '../toss-authenticated-read-smoke.js';
import type { TossLoginCaptureSmokeReport } from '../toss-login-capture-smoke.js';
import type { TossRealtimeSmokeReport } from '../toss-realtime-smoke.js';

function loginReport(
  outcome: TossLoginCaptureSmokeReport['outcome'],
): TossLoginCaptureSmokeReport {
  return {
    provider: 'toss',
    generatedAt: '2026-05-12T01:00:00.000Z',
    outcome,
    timeoutMs: 60_000,
    pollIntervalMs: 1000,
    sessionBefore: {
      configured: outcome === 'already_configured',
      state: outcome === 'already_configured' ? 'persistent' : 'logged_out',
      persistent: outcome === 'already_configured',
      effectiveExpiresAt: outcome === 'already_configured' ? '2026-05-19T00:00:00.000Z' : null,
      expiresInMs: outcome === 'already_configured' ? 604_800_000 : null,
    },
    sessionAfter: {
      configured: outcome === 'succeeded' || outcome === 'already_configured',
      state: outcome === 'succeeded' || outcome === 'already_configured' ? 'persistent' : 'logged_out',
      persistent: outcome === 'succeeded' || outcome === 'already_configured',
      effectiveExpiresAt: outcome === 'succeeded' || outcome === 'already_configured'
        ? '2026-05-19T00:00:00.000Z'
        : null,
      expiresInMs: outcome === 'succeeded' || outcome === 'already_configured'
        ? 604_800_000
        : null,
    },
    login: {
      state: outcome === 'succeeded'
        ? 'succeeded'
        : outcome === 'timeout'
          ? 'waiting_for_qr'
          : outcome === 'failed'
            ? 'failed'
            : 'idle',
      startedAt: null,
      updatedAt: null,
      finishedAt: null,
      message: null,
      persistent: outcome === 'succeeded',
      cookieCount: outcome === 'succeeded' ? 5 : 0,
      localStorageKeyCount: outcome === 'succeeded' ? 2 : 0,
      sessionStorageKeyCount: outcome === 'succeeded' ? 1 : 0,
      expiresAt: null,
      missingCookieCount: 0,
      missingLocalStorageKeyCount: 0,
      errorCode: outcome === 'failed' ? 'TOSS_LOGIN_CAPTURE_SMOKE_FAILED' : null,
    },
  };
}

function readReport(
  outcome: TossAuthenticatedReadSmokeReport['outcome'],
): TossAuthenticatedReadSmokeReport {
  return {
    provider: 'toss',
    generatedAt: '2026-05-12T01:00:01.000Z',
    outcome,
    session: {
      configured: true,
      state: 'persistent',
      persistent: true,
      effectiveExpiresAt: '2026-05-19T00:00:00.000Z',
      expiresInMs: 604_800_000,
    },
    surfaces: [
      {
        id: 'account-summary',
        label: 'Toss account summary',
        status: outcome === 'ok' ? 'ok' : 'failed',
        ...(outcome === 'ok'
          ? { counts: { markets: 1 } }
          : { errorCode: 'TOSS_SMOKE_SURFACE_FAILED' as const }),
      },
    ],
  };
}

function realtimeReport(
  outcome: TossRealtimeSmokeReport['outcome'],
): TossRealtimeSmokeReport {
  return {
    provider: 'toss',
    generatedAt: '2026-05-12T01:00:02.000Z',
    outcome,
    durationMs: 1000,
    session: {
      configured: true,
      state: 'persistent',
      persistent: true,
      effectiveExpiresAt: '2026-05-19T00:00:00.000Z',
      expiresInMs: 604_800_000,
    },
    realtime: {
      started: outcome !== 'session_required',
      state: outcome === 'failed' ? 'failed' : 'connected',
      eventCount: 0,
      priceRefreshEventCount: 0,
      userNotificationEventCount: 0,
      refreshHintCount: 0,
      reconnectCount: 0,
      eventTypes: [],
      refreshHints: [],
      lastEventType: null,
      lastStockCode: null,
      lastRefreshHintResource: null,
      lastRefreshHintTicker: null,
      lastError: outcome === 'ok' ? null : 'TOSS_REALTIME_SMOKE_FAILED',
      thinNotificationOnly: true,
    },
  };
}

describe('toss acceptance smoke', () => {
  it('stops before read and SSE probes when login does not complete', async () => {
    const runAuthenticatedRead = vi.fn();
    const runRealtime = vi.fn();

    const report = await runTossAcceptanceSmoke({
      runLoginCapture: vi.fn(async () => loginReport('timeout')),
      runAuthenticatedRead,
      runRealtime,
      now: () => new Date('2026-05-12T01:00:00.000Z'),
    });

    expect(report.outcome).toBe('login_incomplete');
    expect(report.stages.login.outcome).toBe('timeout');
    expect(report.stages.authenticatedRead).toBeNull();
    expect(report.stages.realtime).toBeNull();
    expect(runAuthenticatedRead).not.toHaveBeenCalled();
    expect(runRealtime).not.toHaveBeenCalled();
  });

  it('runs read and SSE probes after a successful or existing login', async () => {
    const report = await runTossAcceptanceSmoke({
      runLoginCapture: vi.fn(async () => loginReport('succeeded')),
      runAuthenticatedRead: vi.fn(async () => readReport('ok')),
      runRealtime: vi.fn(async () => realtimeReport('ok')),
      now: () => new Date('2026-05-12T01:00:00.000Z'),
    });

    expect(report.outcome).toBe('ok');
    expect(report.stages.authenticatedRead?.outcome).toBe('ok');
    expect(report.stages.realtime?.outcome).toBe('ok');
    expect(JSON.stringify(report)).not.toContain('SESSION');
    expect(JSON.stringify(report)).not.toContain('accountNo');
  });

  it('marks the combined smoke partial when a downstream probe is partial', async () => {
    const report = await runTossAcceptanceSmoke({
      runLoginCapture: vi.fn(async () => loginReport('already_configured')),
      runAuthenticatedRead: vi.fn(async () => readReport('partial')),
      runRealtime: vi.fn(async () => realtimeReport('ok')),
      now: () => new Date('2026-05-12T01:00:00.000Z'),
    });

    expect(report.outcome).toBe('partial');
    expect(report.stages.login.outcome).toBe('already_configured');
    expect(report.stages.authenticatedRead?.outcome).toBe('partial');
  });

  it('sanitizes orchestrator exceptions', async () => {
    const report = await runTossAcceptanceSmoke({
      runLoginCapture: vi.fn(async () => loginReport('succeeded')),
      runAuthenticatedRead: vi.fn(async () => {
        throw new Error(`failed near ${['SESSION', 'raw'].join('=')} ${['accountNo', '1234'].join('=')}`);
      }),
      runRealtime: vi.fn(async () => realtimeReport('ok')),
      now: () => new Date('2026-05-12T01:00:00.000Z'),
    });

    expect(report.outcome).toBe('failed');
    expect(report.errorCode).toBe('TOSS_ACCEPTANCE_SMOKE_FAILED');
    expect(report.stages.authenticatedRead).toBeNull();
    expect(report.stages.realtime).toBeNull();
    expect(JSON.stringify(report)).not.toContain('SESSION');
    expect(JSON.stringify(report)).not.toContain('accountNo');
    expect(JSON.stringify(report)).not.toContain('1234');
  });
});
