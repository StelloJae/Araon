import type { TossSession, TossSessionStore } from './toss-session-store.js';

export interface TossSettlementBucket {
  readonly date: string | null;
  readonly krw: number;
  readonly usd: number;
}

export interface TossAccountMarketSummary {
  readonly market: string;
  readonly pendingBuyOrderAmount: number;
  readonly evaluatedAmount: number;
  readonly principalAmount: number;
  readonly evaluatedProfitAmount: number;
  readonly profitRate: number;
  readonly totalAssetAmount: number;
  readonly orderableAmountKrw: number;
  readonly orderableAmountUsd: number;
}

export interface TossAccountSummaryPayload {
  readonly provider: 'toss';
  readonly fetchedAt: string;
  readonly totalAssetAmount: number;
  readonly evaluatedProfitAmount: number;
  readonly profitRate: number;
  readonly orderableAmountKrw: number;
  readonly orderableAmountUsd: number;
  readonly withdrawable: {
    readonly kr: readonly TossSettlementBucket[];
    readonly us: readonly TossSettlementBucket[];
  };
  readonly markets: Readonly<Record<string, TossAccountMarketSummary>>;
}

export interface TossAccountSummaryClient {
  getSummary(): Promise<TossAccountSummaryPayload>;
}

export interface TossAccountSummaryClientOptions {
  readonly sessionStore: TossSessionStore;
  readonly fetchImpl?: typeof fetch;
  readonly apiBaseUrl?: string;
  readonly certBaseUrl?: string;
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

export function createTossAccountSummaryClient(
  options: TossAccountSummaryClientOptions,
): TossAccountSummaryClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl = trimTrailingSlash(options.apiBaseUrl ?? DEFAULT_API_BASE_URL);
  const certBaseUrl = trimTrailingSlash(options.certBaseUrl ?? DEFAULT_CERT_BASE_URL);
  const now = options.now ?? (() => new Date());

  async function getSummary(): Promise<TossAccountSummaryPayload> {
    const session = await options.sessionStore.load();
    if (session === null) throw new Error('Toss session is required');
    const [overview, orderable, withdrawableKr, withdrawableUs] = await Promise.all([
      requestJson({ fetchImpl, session, url: `${certBaseUrl}/api/v3/my-assets/summaries/markets/all/overview` }),
      requestJson({ fetchImpl, session, url: `${certBaseUrl}/api/v1/dashboard/common/cached-orderable-amount` }),
      requestJson({ fetchImpl, session, url: `${apiBaseUrl}/api/v1/my-assets/summaries/markets/kr/withdrawable-amount` }),
      requestJson({ fetchImpl, session, url: `${apiBaseUrl}/api/v1/my-assets/summaries/markets/us/withdrawable-amount` }),
    ]);

    return mapSummary({
      fetchedAt: now().toISOString(),
      overview,
      orderable,
      withdrawableKr,
      withdrawableUs,
    });
  }

  return { getSummary };
}

function mapSummary(input: {
  fetchedAt: string;
  overview: unknown;
  orderable: unknown;
  withdrawableKr: unknown;
  withdrawableUs: unknown;
}): TossAccountSummaryPayload {
  const overviewResult = readRecord(input.overview, 'result');
  const orderableResult = readRecord(input.orderable, 'result');
  const orderableKr = readMoney(orderableResult, 'orderableAmountKr');
  const orderableUs = readMoney(orderableResult, 'orderableAmountUs');
  return {
    provider: 'toss',
    fetchedAt: input.fetchedAt,
    totalAssetAmount: readNumber(overviewResult, 'totalAssetAmount') ?? 0,
    evaluatedProfitAmount: readNumber(overviewResult, 'evaluatedProfitAmount') ?? 0,
    profitRate: readNumber(overviewResult, 'profitRate') ?? 0,
    orderableAmountKrw: orderableKr.krw ?? 0,
    orderableAmountUsd: orderableUs.usd ?? 0,
    withdrawable: {
      kr: mapWithdrawable(input.withdrawableKr),
      us: mapWithdrawable(input.withdrawableUs),
    },
    markets: mapMarkets(readRecord(overviewResult, 'overviewByMarket')),
  };
}

function mapMarkets(markets: Record<string, unknown>): Record<string, TossAccountMarketSummary> {
  return Object.fromEntries(
    Object.entries(markets).map(([key, value]) => {
      const record = typeof value === 'object' && value !== null
        ? value as Record<string, unknown>
        : {};
      const orderable = readMoney(record, 'orderableAmount');
      return [key, {
        market: readString(record, 'market') ?? key,
        pendingBuyOrderAmount: readNumber(record, 'pendingBuyOrderAmount') ?? 0,
        evaluatedAmount: readNumber(record, 'evaluatedAmount') ?? 0,
        principalAmount: readNumber(record, 'principalAmount') ?? 0,
        evaluatedProfitAmount: readNumber(record, 'evaluatedProfitAmount') ?? 0,
        profitRate: readNumber(record, 'profitRate') ?? 0,
        totalAssetAmount: readNumber(record, 'totalAssetAmount') ?? 0,
        orderableAmountKrw: orderable.krw ?? 0,
        orderableAmountUsd: orderable.usd ?? 0,
      }];
    }),
  );
}

function mapWithdrawable(data: unknown): TossSettlementBucket[] {
  const result = readRecord(data, 'result');
  const buckets: TossSettlementBucket[] = [];
  for (let index = 0; index < 10; index += 1) {
    const amount = readRecordOrNull(result, `amount${index}`);
    if (amount === null) continue;
    buckets.push({
      date: readString(result, `date${index}`),
      krw: readNumber(amount, 'krw') ?? 0,
      usd: readNumber(amount, 'usd') ?? 0,
    });
  }
  return buckets;
}

async function requestJson(input: {
  fetchImpl: typeof fetch;
  session: TossSession;
  url: string;
}): Promise<unknown> {
  const headers = new Headers();
  headers.set('Accept', 'application/json');
  headers.set('User-Agent', DEFAULT_BROWSER_UA);
  headers.set('Referer', 'https://www.tossinvest.com/account');
  headers.set('Origin', 'https://www.tossinvest.com');
  headers.set('Cookie', cookieHeader(input.session.cookies));
  const res = await input.fetchImpl(input.url, {
    method: 'GET',
    headers,
  });
  if (!res.ok) {
    throw new Error(`Toss account summary HTTP ${res.status}`);
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

function readRecordOrNull(value: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const child = value[key];
  return typeof child === 'object' && child !== null
    ? child as Record<string, unknown>
    : null;
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

function cookieHeader(cookies: Readonly<Record<string, string>>): string {
  return Object.entries(cookies)
    .filter(([, value]) => value.length > 0)
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join('; ');
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}
