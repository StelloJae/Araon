import type { TossSession, TossSessionStore } from './toss-session-store.js';

export type TossTransactionsMarket = 'kr' | 'us';
export type TossTransactionsFilter = 'all' | 'trade' | 'cash' | 'inout' | 'cash-alt';

export interface TossTransactionItem {
  readonly ref: string;
  readonly market: TossTransactionsMarket;
  readonly category: string;
  readonly type: string;
  readonly code: string;
  readonly displayName: string;
  readonly displayType: string;
  readonly summary: string | null;
  readonly symbol: string;
  readonly name: string;
  readonly currency: 'KRW' | 'USD';
  readonly quantity: number;
  readonly amount: number;
  readonly adjustedAmount: number;
  readonly commissionAmount: number;
  readonly taxAmount: number;
  readonly balanceAmount: number;
  readonly date: string | null;
  readonly dateTime: string | null;
  readonly orderDate: string | null;
  readonly settlementDate: string | null;
  readonly tradeType: string;
  readonly referenceType: string | null;
}

export interface TossTransactionsRange {
  readonly market: TossTransactionsMarket;
  readonly from: string;
  readonly to: string;
  readonly filter: TossTransactionsFilter;
  readonly size: number;
  readonly number: number;
}

export interface TossTransactionsNextPage {
  readonly number: number;
  readonly size: number;
  readonly filters: string;
  readonly type: string;
}

export interface TossTransactionsPayload {
  readonly provider: 'toss';
  readonly fetchedAt: string;
  readonly market: TossTransactionsMarket;
  readonly range: TossTransactionsRange;
  readonly lastPage: boolean;
  readonly next: TossTransactionsNextPage | null;
  readonly items: readonly TossTransactionItem[];
}

export interface TossTransactionsOptions {
  readonly market?: TossTransactionsMarket;
  readonly from?: string;
  readonly to?: string;
  readonly filter?: TossTransactionsFilter;
  readonly size?: number;
  readonly number?: number;
}

export interface TossTransactionSettlementBucket {
  readonly date: string | null;
  readonly krw: number;
  readonly usd: number;
}

export interface TossTransactionSettlementEstimate {
  readonly date: string | null;
  readonly buyAmount: number;
  readonly sellAmount: number;
}

export interface TossTransactionWithdrawableBottomSheetEntry {
  readonly title: string;
  readonly krw: number;
  readonly usd: number;
}

export interface TossTransactionsOverviewPayload {
  readonly provider: 'toss';
  readonly fetchedAt: string;
  readonly market: TossTransactionsMarket;
  readonly orderableAmountKrw: number;
  readonly orderableAmountUsd: number;
  readonly withdrawable: readonly TossTransactionSettlementBucket[];
  readonly displayWithdrawable: readonly TossTransactionSettlementBucket[];
  readonly deposit: readonly TossTransactionSettlementBucket[];
  readonly estimateSettlement: readonly TossTransactionSettlementEstimate[];
  readonly withdrawableBottomSheet: readonly TossTransactionWithdrawableBottomSheetEntry[];
}

export interface TossTransactionsClient {
  listTransactions(options?: TossTransactionsOptions): Promise<TossTransactionsPayload>;
  getOverview(market?: TossTransactionsMarket): Promise<TossTransactionsOverviewPayload>;
}

export interface TossTransactionsClientOptions {
  readonly sessionStore: TossSessionStore;
  readonly fetchImpl?: typeof fetch;
  readonly apiBaseUrl?: string;
  readonly now?: () => Date;
}

const DEFAULT_API_BASE_URL = 'https://wts-api.tossinvest.com';
const DEFAULT_BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';
const FILTER_CODES: Record<TossTransactionsFilter, string> = {
  all: '0',
  trade: '1',
  cash: '2',
  inout: '3',
  'cash-alt': '6',
};

export function createTossTransactionsClient(
  options: TossTransactionsClientOptions,
): TossTransactionsClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl = trimTrailingSlash(options.apiBaseUrl ?? DEFAULT_API_BASE_URL);
  const now = options.now ?? (() => new Date());

  async function listTransactions(
    transactionsOptions: TossTransactionsOptions = {},
  ): Promise<TossTransactionsPayload> {
    const session = await options.sessionStore.load();
    if (session === null) throw new Error('Toss session is required');
    const range = normalizeRange(transactionsOptions, now());
    const data = await requestJson({
      fetchImpl,
      session,
      url: transactionsUrl(apiBaseUrl, range),
    });
    return {
      provider: 'toss',
      fetchedAt: now().toISOString(),
      market: range.market,
      range,
      ...mapTransactions(data, range),
    };
  }

  async function getOverview(
    market: TossTransactionsMarket = 'kr',
  ): Promise<TossTransactionsOverviewPayload> {
    const session = await options.sessionStore.load();
    if (session === null) throw new Error('Toss session is required');
    const data = await requestJson({
      fetchImpl,
      session,
      url: transactionsOverviewUrl(apiBaseUrl, market),
    });
    return {
      provider: 'toss',
      fetchedAt: now().toISOString(),
      market,
      ...mapTransactionsOverview(data),
    };
  }

  return { listTransactions, getOverview };
}

function mapTransactions(
  data: unknown,
  range: TossTransactionsRange,
): Pick<TossTransactionsPayload, 'items' | 'lastPage' | 'next'> {
  const result = readRecord(data, 'result');
  const pagingParam = readRecord(result, 'pagingParam');
  const lastPage = readBoolean(result, 'lastPage') ?? false;
  const items = readArray(readChild(result, 'body')).map((item, index) => mapTransactionItem(
    typeof item === 'object' && item !== null
      ? item as Record<string, unknown>
      : {},
    range.market,
    index,
  ));
  return {
    items,
    lastPage,
    next: lastPage
      ? null
      : {
        number: (readNumber(pagingParam, 'number') ?? range.number) + 1,
        size: readNumber(pagingParam, 'size') ?? range.size,
        filters: scalarToString(readChild(pagingParam, 'filters')),
        type: scalarToString(readChild(pagingParam, 'type')),
      },
  };
}

function mapTransactionItem(
  item: Record<string, unknown>,
  market: TossTransactionsMarket,
  index: number,
): TossTransactionItem {
  const transactionType = readRecord(item, 'transactionType');
  const compositeKey = readRecord(item, 'compositeKey');
  const type = readString(item, 'type') ?? '';
  return {
    ref: `transaction-${index + 1}`,
    market,
    category: transactionCategory(type),
    type,
    code: readString(transactionType, 'code') ?? '',
    displayName: readString(transactionType, 'displayName') ?? '',
    displayType: readString(item, 'displayType') ?? '',
    summary: readString(item, 'summary'),
    symbol: readString(item, 'stockCode') ?? '',
    name: readString(item, 'stockName') ?? '',
    currency: market === 'us' ? 'USD' : 'KRW',
    quantity: readNumber(item, 'quantity') ?? 0,
    amount: readNumber(item, 'amount') ?? 0,
    adjustedAmount: readNumber(item, 'adjustedAmount') ?? 0,
    commissionAmount: readNumber(item, 'commissionAmount') ?? 0,
    taxAmount: readNumber(item, 'totalTaxAmount') ?? 0,
    balanceAmount: readNumber(item, 'balanceAmount') ?? 0,
    date: readString(item, 'date'),
    dateTime: readString(item, 'dateTime'),
    orderDate: readString(compositeKey, 'orderDate'),
    settlementDate: readString(item, 'settlementDate'),
    tradeType: readString(compositeKey, 'tradeType') ?? '',
    referenceType: readString(item, 'referenceType'),
  };
}

function transactionCategory(type: string): string {
  if (type === '1') return 'trade';
  if (type === '2') return 'cash';
  return 'other';
}

function normalizeRange(
  options: TossTransactionsOptions,
  now: Date,
): TossTransactionsRange {
  const to = options.to ?? formatYmd(now);
  const from = options.from ?? formatYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));
  return {
    market: options.market ?? 'kr',
    from,
    to,
    filter: options.filter ?? 'all',
    size: options.size ?? 50,
    number: options.number ?? 0,
  };
}

function transactionsUrl(apiBaseUrl: string, range: TossTransactionsRange): string {
  const query = new URLSearchParams({
    size: String(range.size),
    filters: FILTER_CODES[range.filter],
    'range.from': range.from,
    'range.to': range.to,
  });
  if (range.number > 0) {
    query.set('number', String(range.number));
  }
  return `${apiBaseUrl}/api/v3/my-assets/transactions/markets/${range.market}?${query.toString()}`;
}

function transactionsOverviewUrl(apiBaseUrl: string, market: TossTransactionsMarket): string {
  return `${apiBaseUrl}/api/v3/my-assets/transactions/markets/${market}/overview`;
}

function mapTransactionsOverview(
  data: unknown,
): Omit<TossTransactionsOverviewPayload, 'provider' | 'fetchedAt' | 'market'> {
  const result = readRecord(data, 'result');
  const orderableAmount = readRecord(result, 'orderableAmount');
  return {
    orderableAmountKrw: readNumber(orderableAmount, 'krw') ?? 0,
    orderableAmountUsd: readNumber(orderableAmount, 'usd') ?? 0,
    withdrawable: mapSettlementBuckets(readRecord(result, 'withdrawableAmount')),
    displayWithdrawable: mapSettlementBuckets(readRecord(result, 'displayWithdrawableAmount')),
    deposit: mapSettlementBuckets(readRecord(result, 'depositAmount')),
    estimateSettlement: mapSettlementEstimates(readRecord(result, 'estimateSettlementAmount')),
    withdrawableBottomSheet: readArray(readChild(result, 'withdrawableAmountBottomSheet')).map((item) => {
      const record = typeof item === 'object' && item !== null
        ? item as Record<string, unknown>
        : {};
      const amount = readRecord(record, 'amount');
      return {
        title: readString(record, 'title') ?? '',
        krw: readNumber(amount, 'krw') ?? 0,
        usd: readNumber(amount, 'usd') ?? 0,
      };
    }).filter((item) => item.title.length > 0 || item.krw !== 0 || item.usd !== 0),
  };
}

function mapSettlementBuckets(
  flat: Record<string, unknown>,
): TossTransactionSettlementBucket[] {
  const buckets: TossTransactionSettlementBucket[] = [];
  for (let index = 0; index < 4; index += 1) {
    const amount = readRecord(flat, `amount${index}`);
    const date = readString(flat, `date${index}`);
    const krw = readNumber(amount, 'krw') ?? 0;
    const usd = readNumber(amount, 'usd') ?? 0;
    if (date === null && krw === 0 && usd === 0) continue;
    buckets.push({ date, krw, usd });
  }
  return buckets;
}

function mapSettlementEstimates(
  flat: Record<string, unknown>,
): TossTransactionSettlementEstimate[] {
  const estimates: TossTransactionSettlementEstimate[] = [];
  for (let index = 1; index <= 4; index += 1) {
    const day = readRecord(flat, `day${index}`);
    const date = readString(day, 'settlementKorDate');
    const buyAmount = readNumber(day, 'buyAmount') ?? 0;
    const sellAmount = readNumber(day, 'sellAmount') ?? 0;
    if (date === null && buyAmount === 0 && sellAmount === 0) continue;
    estimates.push({ date, buyAmount, sellAmount });
  }
  return estimates;
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
    throw new Error(`Toss transactions HTTP ${res.status}`);
  }
  return res.json() as Promise<unknown>;
}

function readRecord(value: unknown, key: string): Record<string, unknown> {
  const child = readChild(value, key);
  return typeof child === 'object' && child !== null
    ? child as Record<string, unknown>
    : {};
}

function readChild(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function readBoolean(value: Record<string, unknown>, key: string): boolean | null {
  const child = value[key];
  return typeof child === 'boolean' ? child : null;
}

function scalarToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
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

function formatYmd(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
