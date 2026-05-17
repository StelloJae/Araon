import type {
  TossLoginService,
  TossLoginStartOptions,
  TossLoginStatus,
} from './toss-cdp-login-service.js';
import type { TossSessionSummary } from './toss-session-store.js';

export interface TossLoginCaptureSmokeOptions {
  readonly sessionStatus: () => Promise<TossSessionSummary>;
  readonly loginService: Pick<TossLoginService, 'start' | 'status' | 'cancel'>;
  readonly requireExistingSession?: boolean;
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
  readonly headless?: boolean;
  readonly now?: () => Date;
  readonly sleep?: (durationMs: number) => Promise<void>;
}

export interface TossLoginCaptureSmokeSessionSummary {
  readonly configured: boolean;
  readonly state: TossSessionSummary['state'];
  readonly persistent: boolean;
  readonly effectiveExpiresAt: string | null;
  readonly expiresInMs: number | null;
}

export interface TossLoginCaptureSmokeLoginSummary {
  readonly state: TossLoginStatus['state'];
  readonly startedAt: string | null;
  readonly updatedAt: string | null;
  readonly finishedAt: string | null;
  readonly message: string | null;
  readonly persistent: boolean;
  readonly cookieCount: number;
  readonly localStorageKeyCount: number;
  readonly sessionStorageKeyCount: number;
  readonly expiresAt: string | null;
  readonly missingCookieCount: number;
  readonly missingLocalStorageKeyCount: number;
  readonly errorCode: 'TOSS_LOGIN_CAPTURE_SMOKE_FAILED' | null;
}

export interface TossLoginCaptureSmokeReport {
  readonly provider: 'toss';
  readonly generatedAt: string;
  readonly outcome:
    | 'already_configured'
    | 'session_required'
    | 'succeeded'
    | 'timeout'
    | 'failed'
    | 'cancelled';
  readonly timeoutMs: number;
  readonly pollIntervalMs: number;
  readonly sessionBefore: TossLoginCaptureSmokeSessionSummary;
  readonly sessionAfter: TossLoginCaptureSmokeSessionSummary;
  readonly login: TossLoginCaptureSmokeLoginSummary;
}

const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const MIN_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_POLL_INTERVAL_MS = 1000;
const MIN_POLL_INTERVAL_MS = 250;
const MAX_POLL_INTERVAL_MS = 5000;

export async function runTossLoginCaptureSmoke(
  options: TossLoginCaptureSmokeOptions,
): Promise<TossLoginCaptureSmokeReport> {
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? delay;
  const timeoutMs = normalizeBoundedInteger(
    options.timeoutMs,
    DEFAULT_TIMEOUT_MS,
    MIN_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
  );
  const pollIntervalMs = normalizeBoundedInteger(
    options.pollIntervalMs,
    DEFAULT_POLL_INTERVAL_MS,
    MIN_POLL_INTERVAL_MS,
    MAX_POLL_INTERVAL_MS,
  );
  const generatedAt = now().toISOString();
  const sessionBefore = summarizeSession(await options.sessionStatus());

  if (isUsableSession(sessionBefore)) {
    return {
      provider: 'toss',
      generatedAt,
      outcome: 'already_configured',
      timeoutMs,
      pollIntervalMs,
      sessionBefore,
      sessionAfter: sessionBefore,
      login: summarizeLoginStatus(idleLoginStatus()),
    };
  }

  if (options.requireExistingSession === true) {
    return {
      provider: 'toss',
      generatedAt,
      outcome: 'session_required',
      timeoutMs,
      pollIntervalMs,
      sessionBefore,
      sessionAfter: sessionBefore,
      login: summarizeLoginStatus(idleLoginStatus()),
    };
  }

  try {
    await options.loginService.start(loginStartOptions(timeoutMs, options.headless));
    const deadline = Date.now() + timeoutMs;
    let status = options.loginService.status();
    while (!isTerminalLoginState(status.state) && Date.now() < deadline) {
      await sleep(pollIntervalMs);
      status = options.loginService.status();
    }
    const sessionAfter = summarizeSession(await options.sessionStatus());
    return {
      provider: 'toss',
      generatedAt,
      outcome: outcomeForStatus(status),
      timeoutMs,
      pollIntervalMs,
      sessionBefore,
      sessionAfter,
      login: summarizeLoginStatus(status),
    };
  } catch {
    return {
      provider: 'toss',
      generatedAt,
      outcome: 'failed',
      timeoutMs,
      pollIntervalMs,
      sessionBefore,
      sessionAfter: sessionBefore,
      login: failedLoginStatus(),
    };
  }
}

function loginStartOptions(
  timeoutMs: number,
  headless: boolean | undefined,
): TossLoginStartOptions {
  return {
    timeoutMs,
    ...(headless === undefined ? {} : { headless }),
  };
}

function summarizeSession(
  session: TossSessionSummary,
): TossLoginCaptureSmokeSessionSummary {
  return {
    configured: session.configured,
    state: session.state,
    persistent: session.persistent,
    effectiveExpiresAt: session.effectiveExpiresAt,
    expiresInMs: session.expiresInMs,
  };
}

function isUsableSession(session: TossLoginCaptureSmokeSessionSummary): boolean {
  return session.configured && session.state !== 'logged_out' && session.state !== 'expired';
}

function summarizeLoginStatus(
  status: TossLoginStatus,
): TossLoginCaptureSmokeLoginSummary {
  return {
    state: status.state,
    startedAt: status.startedAt,
    updatedAt: status.updatedAt,
    finishedAt: status.finishedAt,
    message: safeLoginMessage(status.message),
    persistent: status.persistent,
    cookieCount: status.cookieCount,
    localStorageKeyCount: status.localStorageKeyCount,
    sessionStorageKeyCount: status.sessionStorageKeyCount,
    expiresAt: status.expiresAt,
    missingCookieCount: status.missingCookieCount,
    missingLocalStorageKeyCount: status.missingLocalStorageKeyCount,
    errorCode: null,
  };
}

function safeLoginMessage(message: string | null): string | null {
  if (message === null) return null;
  if (SAFE_LOGIN_MESSAGES.has(message)) return message;
  return 'TOSS_LOGIN_CAPTURE_SMOKE_FAILED';
}

function failedLoginStatus(): TossLoginCaptureSmokeLoginSummary {
  return {
    state: 'failed',
    startedAt: null,
    updatedAt: null,
    finishedAt: null,
    message: 'TOSS_LOGIN_CAPTURE_SMOKE_FAILED',
    persistent: false,
    cookieCount: 0,
    localStorageKeyCount: 0,
    sessionStorageKeyCount: 0,
    expiresAt: null,
    missingCookieCount: 0,
    missingLocalStorageKeyCount: 0,
    errorCode: 'TOSS_LOGIN_CAPTURE_SMOKE_FAILED',
  };
}

function idleLoginStatus(): TossLoginStatus {
  return {
    state: 'idle',
    startedAt: null,
    updatedAt: null,
    finishedAt: null,
    message: null,
    persistent: false,
    cookieCount: 0,
    localStorageKeyCount: 0,
    sessionStorageKeyCount: 0,
    expiresAt: null,
    missingCookieCount: 0,
    missingLocalStorageKeyCount: 0,
  };
}

function outcomeForStatus(
  status: TossLoginStatus,
): TossLoginCaptureSmokeReport['outcome'] {
  switch (status.state) {
    case 'succeeded':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'idle':
    case 'starting':
    case 'waiting_for_qr':
    case 'waiting_for_persistent':
      return 'timeout';
  }
}

function isTerminalLoginState(state: TossLoginStatus['state']): boolean {
  return state === 'succeeded' || state === 'failed' || state === 'cancelled';
}

function normalizeBoundedInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

const SAFE_LOGIN_MESSAGES = new Set([
  'Toss login browser is starting',
  'Toss login capture cancelled',
  'QR login completed; waiting for persistent device confirmation',
  'Waiting for Toss QR login',
  'Toss persistent session captured',
  'Timed out before a persistent Toss session was captured',
  'TOSS_LOGIN_CAPTURE_FAILED',
  'TOSS_LOGIN_CAPTURE_SMOKE_FAILED',
]);
