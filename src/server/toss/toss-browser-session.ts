import type { TossSession } from './toss-session-store.js';

export const TOSS_LOGIN_URL = 'https://www.tossinvest.com/account';
export const TOSS_ORIGIN = 'https://www.tossinvest.com';

export const TOSS_REQUIRED_COOKIE_NAMES = [
  'SESSION',
  'XSRF-TOKEN',
  'UTK',
  'LTK',
  'FTK',
  'browserSessionId',
] as const;

export const TOSS_REQUIRED_LOCAL_STORAGE_KEYS = [
  'WTS-DEVICE-ID',
  'login-method',
] as const;

const PERSISTENT_SESSION_MIN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface TossBrowserCookie {
  readonly name: string;
  readonly value: string;
  readonly domain?: string;
  readonly expires?: number;
}

export interface TossBrowserState {
  readonly url: string;
  readonly cookies: readonly TossBrowserCookie[];
  readonly localStorage: Readonly<Record<string, string>>;
  readonly sessionStorage: Readonly<Record<string, string>>;
}

export interface TossBrowserSessionAssessment {
  readonly initialAuthDone: boolean;
  readonly persistent: boolean;
  readonly missingCookies: readonly string[];
  readonly missingLocalStorageKeys: readonly string[];
  readonly cookieCount: number;
  readonly localStorageKeyCount: number;
  readonly sessionStorageKeyCount: number;
  readonly expiresAt: string | null;
}

export function assessTossBrowserSession(
  state: TossBrowserState,
  now: Date = new Date(),
): TossBrowserSessionAssessment {
  const cookies = tossCookieRecord(state.cookies);
  const localStorage = state.localStorage;
  const missingCookies = TOSS_REQUIRED_COOKIE_NAMES.filter(
    (name) => !truthyString(cookies[name]),
  );
  const missingLocalStorageKeys = TOSS_REQUIRED_LOCAL_STORAGE_KEYS.filter(
    (name) => !truthyString(localStorage[name]),
  );
  const expiresAt = sessionCookieExpiresAt(state.cookies);
  const initialAuthDone =
    missingCookies.length === 0 &&
    missingLocalStorageKeys.length === 0 &&
    !state.url.includes('/signin');

  return {
    initialAuthDone,
    persistent: isPersistentSessionExpiresAt(expiresAt, now),
    missingCookies,
    missingLocalStorageKeys,
    cookieCount: Object.keys(cookies).length,
    localStorageKeyCount: Object.keys(localStorage).length,
    sessionStorageKeyCount: Object.keys(state.sessionStorage).length,
    expiresAt,
  };
}

export function tossSessionFromBrowserState(
  state: TossBrowserState,
  now: Date = new Date(),
): TossSession {
  const assessment = assessTossBrowserSession(state, now);
  if (!assessment.initialAuthDone) {
    throw new Error('Captured Toss browser state is not authenticated');
  }
  return {
    provider: 'toss',
    cookies: tossCookieRecord(state.cookies),
    localStorage: { ...state.localStorage },
    sessionStorage: { ...state.sessionStorage },
    retrievedAt: now.toISOString(),
    expiresAt: assessment.expiresAt,
    serverExpiresAt: null,
    persistent: assessment.persistent,
  };
}

function tossCookieRecord(
  cookies: readonly TossBrowserCookie[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const cookie of cookies) {
    if (!isTossCookie(cookie)) continue;
    if (!truthyString(cookie.name) || !truthyString(cookie.value)) continue;
    out[cookie.name] = cookie.value;
  }
  return out;
}

function sessionCookieExpiresAt(
  cookies: readonly TossBrowserCookie[],
): string | null {
  const cookie = cookies.find(
    (item) => item.name === 'SESSION' && isTossCookie(item),
  );
  if (cookie?.expires === undefined || cookie.expires <= 0) {
    return null;
  }
  return new Date(Math.trunc(cookie.expires * 1000)).toISOString();
}

function isPersistentSessionExpiresAt(
  expiresAt: string | null,
  now: Date,
): boolean {
  if (expiresAt === null) return false;
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) return false;
  return expiresAtMs - now.getTime() >= PERSISTENT_SESSION_MIN_TTL_MS;
}

function isTossCookie(cookie: TossBrowserCookie): boolean {
  const domain = cookie.domain ?? '';
  return domain === '' || domain === 'tossinvest.com' || domain.endsWith('.tossinvest.com');
}

function truthyString(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0;
}
