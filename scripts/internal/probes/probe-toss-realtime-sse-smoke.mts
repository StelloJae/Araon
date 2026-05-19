/**
 * Toss realtime SSE smoke.
 *
 * Purpose:
 * - Run after user-assisted QR login has saved a Toss session.
 * - Observe Toss EventSource/SSE briefly and print only sanitized counters.
 * - Confirm this path is thin notification + REST refresh hints, not WebSocket.
 *
 * Safe no-session behavior:
 * - If no Toss session is persisted, no Toss network calls are made.
 *
 * Usage:
 *   npx tsx scripts/internal/probes/probe-toss-realtime-sse-smoke.mts
 *   npx tsx scripts/internal/probes/probe-toss-realtime-sse-smoke.mts --duration-ms=30000
 */

import { runTossRealtimeSmoke } from '../../../src/server/toss/toss-realtime-smoke.js';
import { createTossRealtimeService } from '../../../src/server/toss/toss-realtime-service.js';
import { createFileTossSessionStore } from '../../../src/server/toss/toss-session-store.js';

const DEFAULT_DURATION_MS = 30_000;
const MIN_DURATION_MS = 1_000;
const MAX_DURATION_MS = 120_000;

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

function durationMsFromArgs(): number {
  const raw = argValue('duration-ms');
  if (raw === undefined) return DEFAULT_DURATION_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_DURATION_MS;
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, Math.trunc(parsed)));
}

async function main(): Promise<void> {
  const sessionStore = createFileTossSessionStore();
  const realtimeService = createTossRealtimeService({
    sessionStore,
    onRefreshHint: async () => undefined,
    onPriceRefresh: async () => undefined,
    onUserNotification: async () => undefined,
  });

  const report = await runTossRealtimeSmoke({
    sessionStatus: () => sessionStore.status(),
    realtimeService,
    durationMs: durationMsFromArgs(),
  });

  console.log(JSON.stringify(report, null, 2));
  if (report.outcome === 'session_required') {
    process.exitCode = 2;
  } else if (report.outcome !== 'ok') {
    process.exitCode = 1;
  }
}

main().catch(() => {
  console.error(JSON.stringify({
    provider: 'toss',
    outcome: 'failed',
    errorCode: 'TOSS_REALTIME_SMOKE_FAILED',
  }));
  process.exitCode = 1;
});
