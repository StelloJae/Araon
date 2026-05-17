import type { TossSession, TossSessionStore } from './toss-session-store.js';

export interface TossWatchlistItem {
  readonly ref: string;
  readonly groupRef: string;
  readonly groupName: string;
  readonly productCode: string;
  readonly symbol: string;
  readonly name: string;
  readonly currency: string;
  readonly base: number;
  readonly last: number;
}

export interface TossWatchlistGroup {
  readonly ref: string;
  readonly name: string;
  readonly items: readonly TossWatchlistItem[];
}

export interface TossWatchlistPayload {
  readonly provider: 'toss';
  readonly fetchedAt: string;
  readonly groups: readonly TossWatchlistGroup[];
  readonly items: readonly TossWatchlistItem[];
}

export interface TossWatchlistMutationResult {
  readonly provider: 'toss';
  readonly productCode: string;
  readonly mutatedAt: string;
  readonly action: 'added' | 'removed' | 'unchanged';
}

export interface TossWatchlistClient {
  listWatchlist(): Promise<TossWatchlistPayload>;
  addProductToWatchlist?(
    input: { readonly productCode: string },
  ): Promise<TossWatchlistMutationResult>;
  removeProductFromWatchlist?(
    input: { readonly productCode: string },
  ): Promise<TossWatchlistMutationResult>;
}

export interface TossWatchlistClientOptions {
  readonly sessionStore: TossSessionStore;
  readonly fetchImpl?: typeof fetch;
  readonly apiBaseUrl?: string;
  readonly certBaseUrl?: string;
  readonly now?: () => Date;
}

const DEFAULT_API_BASE_URL = 'https://wts-api.tossinvest.com';
const DEFAULT_CERT_BASE_URL = 'https://wts-cert-api.tossinvest.com';
const DEFAULT_BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

export function createTossWatchlistClient(
  options: TossWatchlistClientOptions,
): TossWatchlistClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl = trimTrailingSlash(options.apiBaseUrl ?? DEFAULT_API_BASE_URL);
  const certBaseUrl = trimTrailingSlash(options.certBaseUrl ?? DEFAULT_CERT_BASE_URL);
  const now = options.now ?? (() => new Date());

  async function loadSession(): Promise<TossSession> {
    const session = await options.sessionStore.load();
    if (session === null) throw new Error('Toss session is required');
    return session;
  }

  async function listWatchlist(): Promise<TossWatchlistPayload> {
    const session = await loadSession();
    const accountKey = await loadPrimaryAccountKey({ apiBaseUrl, fetchImpl, session });
    const data = await requestJson({
      certBaseUrl,
      fetchImpl,
      session,
      accountKey,
    });
    let groups = mapWatchlistGroupsSafe(data);
    if (groups.length === 0) {
      groups = await listWatchlistFromNewWatchlistsEndpoint({
        certBaseUrl,
        fetchImpl,
        session,
      });
    }
    return {
      provider: 'toss',
      fetchedAt: now().toISOString(),
      groups,
      items: groups.flatMap((group) => group.items),
    };
  }

  async function addProductToWatchlist(input: {
    readonly productCode: string;
  }): Promise<TossWatchlistMutationResult> {
    const session = await loadSession();
    const item = watchlistRequestItem(input.productCode);
    let groups = await listMutationGroups({
      certBaseUrl,
      fetchImpl,
      session,
      includeItemInfo: false,
    });
    let target: TossMutationGroup | undefined = groups.find((group) => !isRecentGroup(group));

    if (target === undefined) {
      const created = await requestCertJson({
        certBaseUrl,
        fetchImpl,
        session,
        method: 'POST',
        path: '/api/v1/new-watchlists/groups',
        body: { name: '기본' },
      });
      const createdGroup = parseCreatedGroup(created);
      if (createdGroup !== null) {
        target = createdGroup;
      } else {
        groups = await listMutationGroups({
          certBaseUrl,
          fetchImpl,
          session,
          includeItemInfo: false,
        });
        target = groups.find((group) => !isRecentGroup(group));
      }
    }

    if (target === undefined) {
      throw new Error('Toss watchlist group not found');
    }

    await requestCertJson({
      certBaseUrl,
      fetchImpl,
      session,
      method: 'POST',
      path: '/api/v1/new-watchlists/items',
      body: { watchlistIds: [target.id], items: [item] },
    });
    return {
      provider: 'toss',
      productCode: input.productCode,
      mutatedAt: now().toISOString(),
      action: 'added',
    };
  }

  async function removeProductFromWatchlist(input: {
    readonly productCode: string;
  }): Promise<TossWatchlistMutationResult> {
    const session = await loadSession();
    const item = watchlistRequestItem(input.productCode);
    let groups = await listMutationGroups({
      certBaseUrl,
      fetchImpl,
      session,
      includeItemInfo: true,
    });
    let target = groups.find((group) =>
      group.items.some((candidate) => candidate.code === input.productCode),
    );

    if (target === undefined) {
      groups = await listMutationGroupsFromWatchlistsEndpoint({
        certBaseUrl,
        fetchImpl,
        session,
      });
      target = groups.find((group) =>
        group.items.some((candidate) => candidate.code === input.productCode),
      );
    }

    if (target === undefined) {
      return {
        provider: 'toss',
        productCode: input.productCode,
        mutatedAt: now().toISOString(),
        action: 'unchanged',
      };
    }

    await requestCertJson({
      certBaseUrl,
      fetchImpl,
      session,
      method: 'POST',
      path: '/api/v1/new-watchlists/items/remove',
      body: { watchlistId: target.id, items: [item] },
    });
    return {
      provider: 'toss',
      productCode: input.productCode,
      mutatedAt: now().toISOString(),
      action: 'removed',
    };
  }

  return { listWatchlist, addProductToWatchlist, removeProductFromWatchlist };
}

async function listWatchlistFromNewWatchlistsEndpoint(input: {
  certBaseUrl: string;
  fetchImpl: typeof fetch;
  session: TossSession;
}): Promise<TossWatchlistGroup[]> {
  const data = await requestCertJson({
    certBaseUrl: input.certBaseUrl,
    fetchImpl: input.fetchImpl,
    session: input.session,
    method: 'GET',
    path: '/api/v1/new-watchlists',
    query: { includeItemInfo: true },
  });
  return mapWatchlistsFallback(data);
}

function mapWatchlistsFallback(data: unknown): TossWatchlistGroup[] {
  const result = readRoot(data);
  let itemIndex = 0;
  return readArray(result, 'watchlists')
    .map((watchlist) => {
      const watchlistRecord = typeof watchlist === 'object' && watchlist !== null
        ? watchlist as Record<string, unknown>
        : {};
      return { watchlistRecord, items: readArray(watchlistRecord, 'items') };
    })
    .filter((entry) => !isRecentWatchlist(entry.watchlistRecord))
    .map(({ watchlistRecord, items }, index) => {
      const name = readString(watchlistRecord, 'name') ?? '';
      return {
        ref: `watchlist-group-${index + 1}`,
        name,
        items: items.map((item) => {
          const itemRecord = typeof item === 'object' && item !== null
            ? item as Record<string, unknown>
            : {};
          const productCode = readString(itemRecord, 'code') ?? '';
          itemIndex += 1;
          return {
            ref: `watchlist-item-${itemIndex}`,
            groupRef: `watchlist-group-${index + 1}`,
            groupName: name,
            productCode,
            symbol: productCode,
            name: readString(itemRecord, 'name') ?? '',
            currency: inferCurrency(productCode),
            base: 0,
            last: 0,
          };
        }),
      };
    })
    .filter((entry) => entry.items.length > 0);
}

function isRecentWatchlist(watchlistRecord: Record<string, unknown>): boolean {
  const type = readString(watchlistRecord, 'type');
  if (type === null) return false;
  const normalized = type.toUpperCase();
  return normalized.includes('RECENT');
}

function inferCurrency(productCode: string): string {
  return productCode.startsWith('US') ? 'USD' : 'KRW';
}

interface TossMutationGroup {
  readonly id: string | number;
  readonly name: string;
  readonly type: string | null;
  readonly items: readonly { readonly code: string }[];
}

function mapWatchlistGroups(data: unknown): TossWatchlistGroup[] {
  const result = readRecord(data, 'result');
  const sections = readArray(result, 'sections')
    .map((section) => typeof section === 'object' && section !== null
      ? section as Record<string, unknown>
      : {});
  const watchlistSection = sections.find(isWatchlistSection)
    ?? sections.find((section) => readArray(section, 'groups').length > 0 || readArray(readRecordOrJson(section['data']), 'groups').length > 0);
  if (watchlistSection === undefined) {
    throw new Error('Toss watchlist section not found');
  }

  const watchlistGroups = getWatchlistGroups(watchlistSection);
  let itemIndex = 0;
  return watchlistGroups.map((group, groupIndex) => {
    const groupRecord = typeof group === 'object' && group !== null
      ? group as Record<string, unknown>
      : {};
    const groupRef = `watchlist-group-${groupIndex + 1}`;
    const groupName = readString(groupRecord, 'name') ?? '';
    return {
      ref: groupRef,
      name: groupName,
      items: readArray(groupRecord, 'items').map((item) => {
        itemIndex += 1;
        return mapWatchlistItem(
          typeof item === 'object' && item !== null
            ? item as Record<string, unknown>
            : {},
          groupRef,
          groupName,
          itemIndex,
        );
      }),
    };
  });
}

function isWatchlistSection(section: Record<string, unknown>): boolean {
  const type = readString(section, 'type');
  if (type === null) return false;
  return type === 'WATCHLIST' || type.toUpperCase().includes('WATCHLIST');
}

function getWatchlistGroups(section: Record<string, unknown>): unknown[] {
  const directGroups = readArray(section, 'groups');
  if (directGroups.length > 0) return directGroups;
  const payload = readRecordOrJson(section['data']);
  return readArray(payload, 'groups');
}

function mapWatchlistGroupsSafe(data: unknown): TossWatchlistGroup[] {
  try {
    return mapWatchlistGroups(data);
  } catch (error) {
    if (error instanceof Error && error.message === 'Toss watchlist section not found') {
      return [];
    }
    throw error;
  }
}

function mapWatchlistItem(
  item: Record<string, unknown>,
  groupRef: string,
  groupName: string,
  index: number,
): TossWatchlistItem {
  const prices = readRecord(item, 'prices');
  const productCode = readString(item, 'stockCode') ?? readString(prices, 'code') ?? '';
  return {
    ref: `watchlist-item-${index}`,
    groupRef,
    groupName,
    productCode,
    symbol: productCode,
    name: readString(item, 'stockName') ?? '',
    currency: readString(prices, 'currency') ?? '',
    base: readNumber(prices, 'base') ?? 0,
    last: readNumber(prices, 'close') ?? 0,
  };
}

async function requestJson(input: {
  certBaseUrl: string;
  fetchImpl: typeof fetch;
  session: TossSession;
  accountKey: string;
}): Promise<unknown> {
  const headers = new Headers();
  headers.set('Accept', 'application/json');
  headers.set('User-Agent', DEFAULT_BROWSER_UA);
  headers.set('Referer', 'https://www.tossinvest.com/account');
  headers.set('Content-Type', 'application/json');
  headers.set('X-Tossinvest-Account', input.accountKey);
  headers.set('Cookie', cookieHeader(input.session.cookies));
  const res = await input.fetchImpl(`${input.certBaseUrl}/api/v2/dashboard/asset/sections/all`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ types: ['WATCHLIST'] }),
  });
  if (!res.ok) {
    throw new Error(`Toss watchlist HTTP ${res.status}`);
  }
  return res.json() as Promise<unknown>;
}

async function requestCertJson(input: {
  certBaseUrl: string;
  fetchImpl: typeof fetch;
  session: TossSession;
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, string | boolean>;
  body?: unknown;
}): Promise<unknown> {
  const headers = new Headers();
  headers.set('Accept', 'application/json');
  headers.set('User-Agent', DEFAULT_BROWSER_UA);
  headers.set('Referer', 'https://www.tossinvest.com/watchlists');
  headers.set('Cookie', cookieHeader(input.session.cookies));
  const url = new URL(`${input.certBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, String(value));
  }

  const init: RequestInit = { method: input.method, headers };
  if (input.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    init.body = JSON.stringify(input.body);
  }

  const res = await input.fetchImpl(url, init);
  if (!res.ok) {
    throw new Error(`Toss watchlist mutation HTTP ${res.status}`);
  }
  return res.json() as Promise<unknown>;
}

async function listMutationGroups(input: {
  certBaseUrl: string;
  fetchImpl: typeof fetch;
  session: TossSession;
  includeItemInfo: boolean;
}): Promise<TossMutationGroup[]> {
  const data = await requestCertJson({
    certBaseUrl: input.certBaseUrl,
    fetchImpl: input.fetchImpl,
    session: input.session,
    method: 'GET',
    path: '/api/v1/new-watchlists/groups/simple',
    query: { includeItemInfo: input.includeItemInfo },
  });
  return parseMutationGroups(data);
}

async function listMutationGroupsFromWatchlistsEndpoint(input: {
  certBaseUrl: string;
  fetchImpl: typeof fetch;
  session: TossSession;
}): Promise<TossMutationGroup[]> {
  const data = await requestCertJson({
    certBaseUrl: input.certBaseUrl,
    fetchImpl: input.fetchImpl,
    session: input.session,
    method: 'GET',
    path: '/api/v1/new-watchlists',
    query: { includeItemInfo: true },
  });
  return parseMutationGroups(data);
}

function parseMutationGroups(data: unknown): TossMutationGroup[] {
  const root = readRoot(data);
  const groups: TossMutationGroup[] = [];
  for (const group of readArray(root, 'watchlists')) {
    const record = typeof group === 'object' && group !== null
      ? group as Record<string, unknown>
      : {};
    const id = readStringOrNumber(record, 'id');
    if (id === null) continue;
    const items: Array<{ readonly code: string }> = [];
    for (const item of readArray(record, 'items')) {
      const itemRecord = typeof item === 'object' && item !== null
        ? item as Record<string, unknown>
        : {};
      const code = readString(itemRecord, 'code')
        ?? readString(itemRecord, 'stockCode');
      if (code !== null) items.push({ code });
    }
    groups.push({
      id,
      name: readString(record, 'name') ?? '',
      type: readString(record, 'type'),
      items,
    });
  }
  return groups;
}

function parseCreatedGroup(data: unknown): TossMutationGroup | null {
  const root = readRoot(data);
  const id = readStringOrNumber(root, 'id');
  if (id === null) return null;
  return {
    id,
    name: readString(root, 'name') ?? '',
    type: readString(root, 'type'),
    items: [],
  };
}

function readRoot(data: unknown): Record<string, unknown> {
  if (typeof data !== 'object' || data === null) return {};
  const record = data as Record<string, unknown>;
  const result = record['result'];
  return typeof result === 'object' && result !== null
    ? result as Record<string, unknown>
    : record;
}

function readStringOrNumber(value: Record<string, unknown>, key: string): string | number | null {
  const child = value[key];
  if (typeof child === 'string' && child.trim().length > 0) return child.trim();
  if (typeof child === 'number' && Number.isFinite(child)) return child;
  return null;
}

function watchlistRequestItem(productCode: string): { code: string; itemType: 'STOCK' } {
  return { code: productCode, itemType: 'STOCK' };
}

function isRecentGroup(group: TossMutationGroup): boolean {
  const type = group.type?.toLowerCase() ?? '';
  return type.includes('recent') || type.includes('최근');
}

async function loadPrimaryAccountKey(input: {
  apiBaseUrl: string;
  fetchImpl: typeof fetch;
  session: TossSession;
}): Promise<string> {
  const headers = new Headers();
  headers.set('Accept', 'application/json');
  headers.set('User-Agent', DEFAULT_BROWSER_UA);
  headers.set('Referer', 'https://www.tossinvest.com/account');
  headers.set('Cookie', cookieHeader(input.session.cookies));
  const res = await input.fetchImpl(`${input.apiBaseUrl}/api/v1/account/list`, {
    method: 'GET',
    headers,
  });
  if (!res.ok) {
    throw new Error(`Toss account key HTTP ${res.status}`);
  }

  const data: unknown = await res.json();
  const result = readRecord(data, 'result');
  const primaryKey = readString(result, 'primaryKey');
  if (primaryKey !== null) return primaryKey;
  for (const item of readArray(result, 'accountList')) {
    const record = typeof item === 'object' && item !== null
      ? item as Record<string, unknown>
      : {};
    const key = readString(record, 'key');
    if (key !== null) return key;
  }
  throw new Error('Toss account key not found');
}

function readRecord(value: unknown, key: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return {};
  const child = (value as Record<string, unknown>)[key];
  return typeof child === 'object' && child !== null
    ? child as Record<string, unknown>
    : {};
}

function readRecordOrJson(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
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

function readNumber(value: Record<string, unknown>, key: string): number | null {
  const child = value[key];
  return typeof child === 'number' && Number.isFinite(child) ? child : null;
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
