/**
 * Toss QR login capture smoke.
 *
 * Purpose:
 * - Start the browser-assisted Toss QR login capture flow.
 * - Wait until the user approves QR login and a persistent session is saved.
 * - Print only sanitized status/count metadata.
 *
 * This probe opens Chrome unless a usable Toss session already exists. Do not
 * run it unless the user is ready to scan and approve the Toss QR login.
 *
 * Usage:
 *   npx tsx scripts/internal/probes/probe-toss-login-capture.mts
 *   npx tsx scripts/internal/probes/probe-toss-login-capture.mts --timeout-ms=600000
 *   npx tsx scripts/internal/probes/probe-toss-login-capture.mts --require-existing-session=true
 */

import { createTossCdpLoginService } from '../../../src/server/toss/toss-cdp-login-service.js';
import { runTossLoginCaptureSmoke } from '../../../src/server/toss/toss-login-capture-smoke.js';
import { createFileTossSessionStore } from '../../../src/server/toss/toss-session-store.js';

const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const MIN_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_POLL_INTERVAL_MS = 1000;
const MIN_POLL_INTERVAL_MS = 250;
const MAX_POLL_INTERVAL_MS = 5000;

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

function booleanArg(name: string): boolean | undefined {
  const raw = argValue(name);
  if (raw === undefined) return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return undefined;
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

async function main(): Promise<void> {
  const sessionStore = createFileTossSessionStore();
  const loginService = createTossCdpLoginService({ sessionStore });

  const report = await runTossLoginCaptureSmoke({
    sessionStatus: () => sessionStore.status(),
    loginService,
    timeoutMs: boundedIntegerArg('timeout-ms', DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS),
    pollIntervalMs: boundedIntegerArg(
      'poll-interval-ms',
      DEFAULT_POLL_INTERVAL_MS,
      MIN_POLL_INTERVAL_MS,
      MAX_POLL_INTERVAL_MS,
    ),
    requireExistingSession: booleanArg('require-existing-session') === true,
    headless: booleanArg('headless'),
  });

  console.log(JSON.stringify(report, null, 2));
  if (report.outcome === 'already_configured' || report.outcome === 'succeeded') {
    process.exitCode = 0;
  } else if (report.outcome === 'session_required') {
    process.exitCode = 2;
  } else if (report.outcome === 'timeout') {
    process.exitCode = 2;
  } else {
    process.exitCode = 1;
  }
}

main().catch(() => {
  console.error(JSON.stringify({
    provider: 'toss',
    outcome: 'failed',
    errorCode: 'TOSS_LOGIN_CAPTURE_SMOKE_FAILED',
  }));
  process.exitCode = 1;
});
