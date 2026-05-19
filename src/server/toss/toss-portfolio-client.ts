import type { TossSession, TossSessionStore } from './toss-session-store.js';
import {
  resolveTossProductIconUrl,
  type TossProductIconCache,
} from './toss-product-icon.js';

export interface TossPortfolioPosition {
  readonly productCode: string;
  readonly symbol: string;
  readonly name: string;
  readonly iconUrl?: string | null;
  readonly marketType: string;
  readonly marketCode: string;
  readonly quantity: number;
  readonly averagePrice: number;
  readonly currentPrice: number;
  readonly marketValue: number;
  readonly unrealizedPnl: number;
  readonly profitRate: number;
  readonly dailyProfitLoss: number;
  readonly dailyProfitRate: number;
  readonly averagePriceUsd: number;
  readonly currentPriceUsd: number;
  readonly marketValueUsd: number;
  readonly unrealizedPnlUsd: number;
  readonly profitRateUsd: number;
  readonly dailyProfitLossUsd: number;
  readonly dailyProfitRateUsd: number;
}

export interface TossPortfolioPositionsPayload {
  readonly provider: 'toss';
  readonly fetchedAt: string;
  readonly positions: readonly TossPortfolioPosition[];
}

export interface TossPortfolioClient {
  listPositions(): Promise<TossPortfolioPositionsPayload>;
}

export interface TossPortfolioSnapshotStore {
  save(payload: TossPortfolioPositionsPayload): void;
  snapshot(): TossPortfolioPositionsPayload | null;
  clear(): void;
}

export interface TossPortfolioClientOptions {
  readonly sessionStore: TossSessionStore;
  readonly fetchImpl?: typeof fetch;
  readonly apiBaseUrl?: string;
  readonly certBaseUrl?: string;
  readonly iconCache?: TossProductIconCache;
  readonly now?: () => Date;
}

interface MoneyPair {
  readonly krw: number | null;
  readonly usd: number | null;
}

const DEFAULT_API_BASE_URL = 'https://wts-api.tossinvest.com';
const DEFAULT_CERT_BASE_URL = 'https://wts-cert-api.tossinvest.com';
const DEFAULT_BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

export function createTossPortfolioClient(
  options: TossPortfolioClientOptions,
): TossPortfolioClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl = trimTrailingSlash(options.apiBaseUrl ?? DEFAULT_API_BASE_URL);
  const certBaseUrl = trimTrailingSlash(options.certBaseUrl ?? DEFAULT_CERT_BASE_URL);
  const iconCache = options.iconCache;
  const now = options.now ?? (() => new Date());

  async function listPositions(): Promise<TossPortfolioPositionsPayload> {
    const session = await options.sessionStore.load();
    if (session === null) throw new Error('Toss session is required');
    const accountKey = await loadPrimaryAccountKey({ apiBaseUrl, fetchImpl, session });
    const data = await requestJson({
      certBaseUrl,
      fetchImpl,
      session,
      accountKey,
      path: '/api/v2/dashboard/asset/sections/all',
      type: 'SORTED_OVERVIEW',
    });
    return {
      provider: 'toss',
      fetchedAt: now().toISOString(),
      positions: mapPositions(data, iconCache),
    };
  }

  return { listPositions };
}

export function createTossPortfolioSnapshotStore(): TossPortfolioSnapshotStore {
  let latest: TossPortfolioPositionsPayload | null = null;
  return {
    save(payload) {
      latest = payload;
    },
    snapshot() {
      return latest;
    },
    clear() {
      latest = null;
    },
  };
}

export function createCachingTossPortfolioClient(
  client: TossPortfolioClient,
  snapshotStore: TossPortfolioSnapshotStore,
): TossPortfolioClient {
  return {
    async listPositions() {
      const payload = await client.listPositions();
      snapshotStore.save(payload);
      return payload;
    },
  };
}

function mapPositions(
  data: unknown,
  iconCache: TossProductIconCache | undefined,
): TossPortfolioPosition[] {
  const result = readRecord(data, 'result');
  const sections = readArray(result, 'sections');
  const overview = sections
    .map((section) => typeof section === 'object' && section !== null
      ? section as Record<string, unknown>
      : {})
    .find((section) => readString(section, 'type') === 'SORTED_OVERVIEW');
  if (overview === undefined) {
    throw new Error('Toss portfolio overview not found');
  }

  const overviewData = readRecordOrJson(overview['data']);
  return readArray(overviewData, 'products').flatMap((product) => {
    const productRecord = typeof product === 'object' && product !== null
      ? product as Record<string, unknown>
      : {};
    const marketType = readString(productRecord, 'marketType') ?? '';
    return readArray(productRecord, 'items').map((item) =>
      mapPositionItem(
        typeof item === 'object' && item !== null
          ? item as Record<string, unknown>
          : {},
        marketType,
        iconCache,
      ),
    );
  });
}

function mapPositionItem(
  item: Record<string, unknown>,
  marketType: string,
  iconCache: TossProductIconCache | undefined,
): TossPortfolioPosition {
  const stockCode = readString(item, 'stockCode') ?? '';
  const stockSymbol = readString(item, 'stockSymbol');
  const currentPrice = readMoney(item, 'currentPrice');
  const purchasePrice = readMoney(item, 'purchasePrice');
  const evaluatedAmount = readMoney(item, 'evaluatedAmount');
  const profitLossAmount = readMoney(item, 'profitLossAmount');
  const profitLossRate = readMoney(item, 'profitLossRate');
  const dailyProfitLossAmount = readMoney(item, 'dailyProfitLossAmount');
  const dailyProfitLossRate = readMoney(item, 'dailyProfitLossRate');
  const iconUrl = resolveTossProductIconUrl({
    record: item,
    productCode: stockCode,
    symbol: stockSymbol,
    cache: iconCache,
  });

  return {
    productCode: stockCode,
    symbol: stockSymbol ?? stockCode,
    name: readString(item, 'stockName') ?? '',
    ...(iconUrl !== null ? { iconUrl } : {}),
    marketType,
    marketCode: readString(item, 'marketCode') ?? '',
    quantity: readNumber(item, 'quantity') ?? 0,
    averagePrice: coalesceMoney(purchasePrice),
    currentPrice: coalesceMoney(currentPrice),
    marketValue: coalesceMoney(evaluatedAmount),
    unrealizedPnl: coalesceMoney(profitLossAmount),
    profitRate: coalesceMoney(profitLossRate),
    dailyProfitLoss: coalesceMoney(dailyProfitLossAmount),
    dailyProfitRate: coalesceMoney(dailyProfitLossRate),
    averagePriceUsd: purchasePrice.usd ?? 0,
    currentPriceUsd: currentPrice.usd ?? 0,
    marketValueUsd: evaluatedAmount.usd ?? 0,
    unrealizedPnlUsd: profitLossAmount.usd ?? 0,
    profitRateUsd: profitLossRate.usd ?? 0,
    dailyProfitLossUsd: dailyProfitLossAmount.usd ?? 0,
    dailyProfitRateUsd: dailyProfitLossRate.usd ?? 0,
  };
}

async function requestJson(input: {
  certBaseUrl: string;
  fetchImpl: typeof fetch;
  session: TossSession;
  accountKey: string;
  path: string;
  type: string;
}): Promise<unknown> {
  const headers = new Headers();
  headers.set('Accept', 'application/json');
  headers.set('User-Agent', DEFAULT_BROWSER_UA);
  headers.set('Referer', 'https://www.tossinvest.com/account');
  headers.set('Content-Type', 'application/json');
  headers.set('X-Tossinvest-Account', input.accountKey);
  headers.set('Cookie', cookieHeader(input.session.cookies));
  const res = await input.fetchImpl(`${input.certBaseUrl}${input.path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ types: [input.type] }),
  });
  if (!res.ok) {
    throw new Error(`Toss portfolio HTTP ${res.status}`);
  }
  return res.json() as Promise<unknown>;
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

function readMoney(value: Record<string, unknown>, key: string): MoneyPair {
  const money = readRecord(value, key);
  return {
    krw: readNumber(money, 'krw'),
    usd: readNumber(money, 'usd'),
  };
}

function coalesceMoney(value: MoneyPair): number {
  return value.krw ?? value.usd ?? 0;
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
