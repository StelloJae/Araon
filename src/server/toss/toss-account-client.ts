import type { TossSession, TossSessionStore } from './toss-session-store.js';

export interface TossAccountSummaryItem {
  readonly ref: string;
  readonly displayName: string;
  readonly name: string | null;
  readonly type: string | null;
  readonly markets: readonly string[];
  readonly primary: boolean;
}

export interface TossAccountListPayload {
  readonly provider: 'toss';
  readonly fetchedAt: string;
  readonly accounts: readonly TossAccountSummaryItem[];
}

export interface TossAccountClient {
  listAccounts(): Promise<TossAccountListPayload>;
}

export interface TossAccountClientOptions {
  readonly sessionStore: TossSessionStore;
  readonly fetchImpl?: typeof fetch;
  readonly apiBaseUrl?: string;
  readonly now?: () => Date;
}

const DEFAULT_API_BASE_URL = 'https://wts-api.tossinvest.com';
const DEFAULT_BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

export function createTossAccountClient(
  options: TossAccountClientOptions,
): TossAccountClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl = trimTrailingSlash(options.apiBaseUrl ?? DEFAULT_API_BASE_URL);
  const now = options.now ?? (() => new Date());

  async function listAccounts(): Promise<TossAccountListPayload> {
    const session = await options.sessionStore.load();
    if (session === null) throw new Error('Toss session is required');
    const data = await requestJson({
      apiBaseUrl,
      fetchImpl,
      session,
      path: '/api/v1/account/list',
    });
    return {
      provider: 'toss',
      fetchedAt: now().toISOString(),
      accounts: mapAccounts(data),
    };
  }

  return { listAccounts };
}

function mapAccounts(data: unknown): TossAccountSummaryItem[] {
  const result = readRecord(data, 'result');
  const primaryKey = readString(result, 'primaryKey');
  const accountList = readArray(result, 'accountList');
  return accountList.map((item, index) => {
    const record = typeof item === 'object' && item !== null
      ? item as Record<string, unknown>
      : {};
    const rawKey = readString(record, 'key');
    return {
      ref: rawKey !== null && primaryKey !== null && rawKey === primaryKey
        ? 'primary'
        : `account-${index + 1}`,
      displayName: readString(record, 'displayName') ?? readString(record, 'name') ?? 'Toss account',
      name: readString(record, 'name'),
      type: readString(record, 'type'),
      markets: readStringArray(record, 'markets'),
      primary: rawKey !== null && primaryKey !== null && rawKey === primaryKey,
    };
  });
}

async function requestJson(input: {
  apiBaseUrl: string;
  fetchImpl: typeof fetch;
  session: TossSession;
  path: string;
}): Promise<unknown> {
  const headers = new Headers();
  headers.set('User-Agent', DEFAULT_BROWSER_UA);
  headers.set('Referer', 'https://www.tossinvest.com/');
  headers.set('Origin', 'https://www.tossinvest.com');
  headers.set('Cookie', cookieHeader(input.session.cookies));
  const res = await input.fetchImpl(`${input.apiBaseUrl}${input.path}`, {
    method: 'GET',
    headers,
  });
  if (!res.ok) {
    throw new Error(`Toss account HTTP ${res.status}`);
  }
  return res.json() as Promise<unknown>;
}

function readRecord(value: unknown, key: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return {};
  const child = (value as Record<string, unknown>)[key];
  return typeof child === 'object' && child !== null
    ? child as Record<string, unknown>
    : {};
}

function readArray(value: Record<string, unknown>, key: string): unknown[] {
  const child = value[key];
  return Array.isArray(child) ? child : [];
}

function readString(value: Record<string, unknown>, key: string): string | null {
  const child = value[key];
  return typeof child === 'string' && child.trim().length > 0
    ? child.trim()
    : null;
}

function readStringArray(value: Record<string, unknown>, key: string): string[] {
  return readArray(value, key)
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function cookieHeader(cookies: Readonly<Record<string, string>>): string {
  return Object.entries(cookies)
    .filter(([, value]) => value.length > 0)
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join('; ');
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}
