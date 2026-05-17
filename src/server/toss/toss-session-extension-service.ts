import type { TossSession, TossSessionStore } from './toss-session-store.js';

export type TossSessionExtensionState =
  | 'succeeded'
  | 'failed'
  | 'timeout'
  | 'rejected';

export type TossSessionExpiryRefreshState =
  | 'succeeded'
  | 'failed';

export interface TossSessionExtensionResult {
  readonly state: TossSessionExtensionState;
  readonly requestedAt: string;
  readonly finishedAt: string;
  readonly serverExpiresAt: string | null;
  readonly approvalState: string | null;
}

export interface TossSessionExpiryRefreshResult {
  readonly state: TossSessionExpiryRefreshState;
  readonly checkedAt: string;
  readonly serverExpiresAt: string | null;
}

export interface TossSessionExtensionService {
  extend(input?: TossSessionExtensionInput): Promise<TossSessionExtensionResult>;
  refreshServerExpiry(): Promise<TossSessionExpiryRefreshResult>;
}

export interface TossSessionExtensionInput {
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
}

export interface TossSessionExtensionServiceOptions {
  readonly sessionStore: TossSessionStore;
  readonly fetchImpl?: typeof fetch;
  readonly apiBaseUrl?: string;
  readonly now?: () => Date;
  readonly sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_API_BASE_URL = 'https://wts-api.tossinvest.com';
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;

export function createTossSessionExtensionService(
  options: TossSessionExtensionServiceOptions,
): TossSessionExtensionService {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl = trimTrailingSlash(options.apiBaseUrl ?? DEFAULT_API_BASE_URL);
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? defaultSleep;

  async function extend(input: TossSessionExtensionInput = {}): Promise<TossSessionExtensionResult> {
    const requestedAt = now().toISOString();
    const session = await options.sessionStore.load();
    if (session === null) {
      return {
        state: 'failed',
        requestedAt,
        finishedAt: now().toISOString(),
        serverExpiresAt: null,
        approvalState: null,
      };
    }

    const timeoutMs = normalizePositiveInt(input.timeoutMs, DEFAULT_TIMEOUT_MS);
    const pollIntervalMs = normalizePositiveInt(input.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS);
    const deadline = Date.now() + timeoutMs;

    const txId = await requestExtensionDoc({ apiBaseUrl, fetchImpl, session });
    let approvalState: string | null = null;
    while (Date.now() <= deadline) {
      approvalState = await getExtensionStatus({ apiBaseUrl, fetchImpl, session, txId });
      if (approvalState === 'COMPLETED') {
        await finalizeExtension({ apiBaseUrl, fetchImpl, session, txId });
        const serverExpiresAt = await getServerExpiresAt({ apiBaseUrl, fetchImpl, session });
        await options.sessionStore.save({
          ...session,
          serverExpiresAt,
        });
        return {
          state: 'succeeded',
          requestedAt,
          finishedAt: now().toISOString(),
          serverExpiresAt,
          approvalState,
        };
      }
      if (approvalState === 'EXPIRED') {
        return {
          state: 'rejected',
          requestedAt,
          finishedAt: now().toISOString(),
          serverExpiresAt: session.serverExpiresAt,
          approvalState,
        };
      }
      await sleep(pollIntervalMs);
    }

    return {
      state: 'timeout',
      requestedAt,
      finishedAt: now().toISOString(),
      serverExpiresAt: session.serverExpiresAt,
      approvalState,
    };
  }

  async function refreshServerExpiry(): Promise<TossSessionExpiryRefreshResult> {
    const checkedAt = now().toISOString();
    const session = await options.sessionStore.load();
    if (session === null) {
      return {
        state: 'failed',
        checkedAt,
        serverExpiresAt: null,
      };
    }
    try {
      const serverExpiresAt = await getServerExpiresAt({ apiBaseUrl, fetchImpl, session });
      await options.sessionStore.save({
        ...session,
        serverExpiresAt,
      });
      return {
        state: 'succeeded',
        checkedAt,
        serverExpiresAt,
      };
    } catch {
      return {
        state: 'failed',
        checkedAt,
        serverExpiresAt: session.serverExpiresAt,
      };
    }
  }

  return { extend, refreshServerExpiry };
}

async function requestExtensionDoc(input: {
  apiBaseUrl: string;
  fetchImpl: typeof fetch;
  session: TossSession;
}): Promise<string> {
  const data = await requestJson(input, '/api/v1/wts-login-extend/doc/request', {
    method: 'POST',
    body: '{}',
  });
  const txId = readNestedString(data, ['result', 'txId']);
  if (txId === null) throw new Error('Toss session extension request failed');
  return txId;
}

async function getExtensionStatus(input: {
  apiBaseUrl: string;
  fetchImpl: typeof fetch;
  session: TossSession;
  txId: string;
}): Promise<string> {
  const data = await requestJson(
    input,
    `/api/v1/wts-login-extend/doc/${encodeURIComponent(input.txId)}/status`,
  );
  const status = readNestedString(data, ['result']);
  if (status === null) throw new Error('Toss session extension status failed');
  return status;
}

async function finalizeExtension(input: {
  apiBaseUrl: string;
  fetchImpl: typeof fetch;
  session: TossSession;
  txId: string;
}): Promise<void> {
  await requestJson(
    input,
    `/api/v1/wts-login-extend/${encodeURIComponent(input.txId)}/state`,
    {
      method: 'POST',
      body: '{}',
    },
  );
}

async function getServerExpiresAt(input: {
  apiBaseUrl: string;
  fetchImpl: typeof fetch;
  session: TossSession;
}): Promise<string> {
  const data = await requestJson(input, '/api/v1/session/expired-at');
  const value = readNestedString(data, ['result']);
  if (value === null) throw new Error('Toss session expiry lookup failed');
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error('Toss session expiry lookup failed');
  return new Date(parsed).toISOString();
}

async function requestJson(
  input: {
    apiBaseUrl: string;
    fetchImpl: typeof fetch;
    session: TossSession;
  },
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set('User-Agent', DEFAULT_BROWSER_UA);
  headers.set('Referer', 'https://www.tossinvest.com/');
  headers.set('Origin', 'https://www.tossinvest.com');
  headers.set('Cookie', cookieHeader(input.session.cookies));
  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await input.fetchImpl(`${input.apiBaseUrl}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    throw new Error(`Toss session extension HTTP ${res.status}`);
  }
  return res.json() as Promise<unknown>;
}

const DEFAULT_BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

function cookieHeader(cookies: Readonly<Record<string, string>>): string {
  return Object.entries(cookies)
    .filter(([, value]) => value.length > 0)
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join('; ');
}

function readNestedString(value: unknown, path: readonly string[]): string | null {
  let current = value;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' && current.trim().length > 0
    ? current.trim()
    : null;
}

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.trunc(value);
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
