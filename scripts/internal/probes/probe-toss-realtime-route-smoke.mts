/**
 * Toss app-level realtime route smoke.
 *
 * Purpose:
 * - Observe the running local Araon server's Toss realtime status and
 *   `/toss/realtime/refresh-results` audit surface.
 * - Reuse this when waiting for a real Toss SSE thin notification to produce
 *   a REST refresh audit row.
 * - Print only lifecycle counters, resource/result names, and ticker presence.
 *   It does not print raw SSE payloads, raw REST payloads, account/order IDs,
 *   session/cookie/storage values, or ticker values.
 *
 * Usage:
 *   npx tsx scripts/internal/probes/probe-toss-realtime-route-smoke.mts
 *   npx tsx scripts/internal/probes/probe-toss-realtime-route-smoke.mts --duration-ms=120000
 *   npx tsx scripts/internal/probes/probe-toss-realtime-route-smoke.mts --start-if-idle=true
 */

import {
  runTossRealtimeRouteSmoke,
  type TossRealtimeRouteRefreshResults,
  type TossRealtimeRouteStatus,
} from '../../../src/server/toss/toss-realtime-route-smoke.js';

interface ApiEnvelope<T> {
  readonly success: boolean;
  readonly data?: T;
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:3000';
const DEFAULT_DURATION_MS = 60_000;
const DEFAULT_INTERVAL_MS = 5_000;
const MIN_DURATION_MS = 0;
const MAX_DURATION_MS = 10 * 60_000;
const MIN_INTERVAL_MS = 500;
const MAX_INTERVAL_MS = 60_000;

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

function booleanArg(name: string): boolean {
  const raw = argValue(name);
  return raw === 'true' || raw === '1' || process.argv.includes(`--${name}`);
}

function boundedIntegerArg(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = argValue(name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function endpoint(path: string): URL {
  const rawBase = argValue('base-url') ?? DEFAULT_BASE_URL;
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  return new URL(path, base);
}

async function fetchData<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(endpoint(path), init);
  if (!response.ok) {
    throw new Error('TOSS_REALTIME_ROUTE_SMOKE_HTTP_FAILED');
  }
  const envelope = await response.json() as ApiEnvelope<T>;
  if (envelope.success !== true || envelope.data === undefined) {
    throw new Error('TOSS_REALTIME_ROUTE_SMOKE_ROUTE_FAILED');
  }
  return envelope.data;
}

async function main(): Promise<void> {
  const report = await runTossRealtimeRouteSmoke({
    getStatus: () => fetchData<TossRealtimeRouteStatus>('/toss/realtime/status'),
    getRefreshResults: () => fetchData<TossRealtimeRouteRefreshResults>(
      '/toss/realtime/refresh-results?limit=5',
    ),
    startRealtime: () => fetchData<TossRealtimeRouteStatus>(
      '/toss/realtime/start',
      { method: 'POST' },
    ),
    startIfIdle: booleanArg('start-if-idle'),
    durationMs: boundedIntegerArg(
      'duration-ms',
      DEFAULT_DURATION_MS,
      MIN_DURATION_MS,
      MAX_DURATION_MS,
    ),
    intervalMs: boundedIntegerArg(
      'interval-ms',
      DEFAULT_INTERVAL_MS,
      MIN_INTERVAL_MS,
      MAX_INTERVAL_MS,
    ),
  });

  console.log(JSON.stringify(report, null, 2));
  if (report.outcome === 'failed') {
    process.exitCode = 1;
  } else if (report.outcome === 'session_required' || report.outcome === 'not_running') {
    process.exitCode = 2;
  } else {
    process.exitCode = 0;
  }
}

main().catch(() => {
  console.error(JSON.stringify({
    provider: 'toss-app-realtime-routes',
    outcome: 'failed',
    errorCode: 'TOSS_REALTIME_ROUTE_SMOKE_FAILED',
  }));
  process.exitCode = 1;
});
