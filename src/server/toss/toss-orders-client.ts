import type { TossSession, TossSessionStore } from './toss-session-store.js';

export interface TossPendingOrderItem {
  readonly ref: string;
  readonly symbol: string;
  readonly name: string;
  readonly market: string;
  readonly side: string;
  readonly status: string;
  readonly quantity: number;
  readonly originalQuantity: number;
  readonly price: number;
  readonly orderedDate: string | null;
  readonly submittedAt: string | null;
}

export interface TossPendingOrdersPayload {
  readonly provider: 'toss';
  readonly fetchedAt: string;
  readonly orders: readonly TossPendingOrderItem[];
}

export type TossOrdersMarket = 'kr' | 'us' | 'all';

export interface TossCompletedOrderItem {
  readonly ref: string;
  readonly symbol: string;
  readonly name: string;
  readonly market: string;
  readonly side: string;
  readonly status: string;
  readonly quantity: number;
  readonly filledQuantity: number;
  readonly price: number;
  readonly averageExecutionPrice: number;
  readonly orderedDate: string | null;
  readonly submittedAt: string | null;
}

export interface TossCompletedOrdersRange {
  readonly market: TossOrdersMarket;
  readonly from: string;
  readonly to: string;
  readonly size: number;
  readonly number: number;
}

export interface TossCompletedOrdersPayload {
  readonly provider: 'toss';
  readonly fetchedAt: string;
  readonly range: TossCompletedOrdersRange;
  readonly orders: readonly TossCompletedOrderItem[];
}

export type TossOrderDetailKind = 'pending' | 'completed';

export interface TossOrderDetailPayload {
  readonly provider: 'toss';
  readonly fetchedAt: string;
  readonly ref: string;
  readonly kind: TossOrderDetailKind;
  readonly range?: TossCompletedOrdersRange;
  readonly order: TossPendingOrderItem | TossCompletedOrderItem;
}

export interface TossCompletedOrdersOptions {
  readonly market?: TossOrdersMarket;
  readonly from?: string;
  readonly to?: string;
  readonly size?: number;
  readonly number?: number;
}

export interface TossOrdersClient {
  listPendingOrders(): Promise<TossPendingOrdersPayload>;
  listCompletedOrders(options?: TossCompletedOrdersOptions): Promise<TossCompletedOrdersPayload>;
  getOrder(ref: string, options?: TossCompletedOrdersOptions): Promise<TossOrderDetailPayload>;
}

export interface TossOrdersClientOptions {
  readonly sessionStore: TossSessionStore;
  readonly fetchImpl?: typeof fetch;
  readonly certBaseUrl?: string;
  readonly now?: () => Date;
}

const DEFAULT_CERT_BASE_URL = 'https://wts-cert-api.tossinvest.com';
const DEFAULT_BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

export function createTossOrdersClient(
  options: TossOrdersClientOptions,
): TossOrdersClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const certBaseUrl = trimTrailingSlash(options.certBaseUrl ?? DEFAULT_CERT_BASE_URL);
  const now = options.now ?? (() => new Date());

  async function listPendingOrders(): Promise<TossPendingOrdersPayload> {
    const session = await options.sessionStore.load();
    if (session === null) throw new Error('Toss session is required');
    const data = await requestJson({
      fetchImpl,
      session,
      url: `${certBaseUrl}/api/v1/trading/orders/histories/all/pending`,
    });
    return {
      provider: 'toss',
      fetchedAt: now().toISOString(),
      orders: mapPendingOrders(data),
    };
  }

  async function listCompletedOrders(
    completedOptions: TossCompletedOrdersOptions = {},
  ): Promise<TossCompletedOrdersPayload> {
    const session = await options.sessionStore.load();
    if (session === null) throw new Error('Toss session is required');
    const range = normalizeCompletedRange(completedOptions, now());
    const marketEntries = range.market === 'all' ? ['us', 'kr'] : [range.market];
    const responses = await Promise.all(marketEntries.map(async (market) => ({
      market,
      data: await requestJson({
        fetchImpl,
        session,
        url: completedOrdersUrl(certBaseUrl, market, range),
      }),
    })));
    const orders = responses
      .flatMap(({ market, data }) => mapCompletedOrders(data, market))
      .sort((left, right) => (right.submittedAt ?? '').localeCompare(left.submittedAt ?? ''))
      .map((order, index) => ({
        ...order,
        ref: `completed-order-${index + 1}`,
      }));
    return {
      provider: 'toss',
      fetchedAt: now().toISOString(),
      range,
      orders,
    };
  }

  async function getOrder(
    ref: string,
    completedOptions: TossCompletedOrdersOptions = {},
  ): Promise<TossOrderDetailPayload> {
    const pending = await listPendingOrders();
    const pendingOrder = pending.orders.find((order) => order.ref === ref);
    if (pendingOrder !== undefined) {
      return {
        provider: 'toss',
        fetchedAt: pending.fetchedAt,
        ref,
        kind: 'pending',
        order: pendingOrder,
      };
    }

    const completed = await listCompletedOrders(completedOptions);
    const completedOrder = completed.orders.find((order) => order.ref === ref);
    if (completedOrder !== undefined) {
      return {
        provider: 'toss',
        fetchedAt: completed.fetchedAt,
        ref,
        kind: 'completed',
        range: completed.range,
        order: completedOrder,
      };
    }

    throw new Error('Toss order ref was not found');
  }

  return { listPendingOrders, listCompletedOrders, getOrder };
}

function mapPendingOrders(data: unknown): TossPendingOrderItem[] {
  const result = readArray(readRecord(data, 'result'));
  return result.map((item, index) => mapPendingOrderItem(
    typeof item === 'object' && item !== null
      ? item as Record<string, unknown>
      : {},
    index,
  ));
}

function mapPendingOrderItem(
  item: Record<string, unknown>,
  index: number,
): TossPendingOrderItem {
  const symbol = readString(item, 'symbol') ?? readString(item, 'stockCode') ?? '';
  const quantity = readNumber(item, 'pendingQuantity') ?? readNumber(item, 'quantity') ?? 0;
  return {
    ref: `pending-order-${index + 1}`,
    symbol,
    name: readString(item, 'stockName') ?? '',
    market: (readString(item, 'marketDivision') ?? '').toLowerCase(),
    side: readString(item, 'tradeType') ?? '',
    status: readString(item, 'status') ?? '',
    quantity: quantity === 0 ? readNumber(item, 'quantity') ?? 0 : quantity,
    originalQuantity: readNumber(item, 'quantity') ?? quantity,
    price: readNumber(item, 'orderPrice') ?? 0,
    orderedDate: readString(item, 'orderedDate'),
    submittedAt: readString(item, 'orderedAt') ?? readString(item, 'createdAt'),
  };
}

function mapCompletedOrders(
  data: unknown,
  market: string,
): TossCompletedOrderItem[] {
  const body = readArray(readRecord(readRecord(data, 'result'), 'body'));
  return body.map((item) => mapCompletedOrderItem(
    typeof item === 'object' && item !== null
      ? item as Record<string, unknown>
      : {},
    market,
  ));
}

function mapCompletedOrderItem(
  item: Record<string, unknown>,
  market: string,
): TossCompletedOrderItem {
  const symbol = readString(item, 'symbol') ?? readString(item, 'stockCode') ?? '';
  const orderPrice = readRecord(item, 'orderPrice');
  const averageExecutionPrice = readRecord(item, 'averageExecutionPrice');
  return {
    ref: 'completed-order-pending-sort',
    symbol,
    name: readString(item, 'stockName') ?? '',
    market,
    side: readString(item, 'tradeType') ?? '',
    status: readString(item, 'status') ?? '',
    quantity: readNumber(item, 'orderQuantity') ?? 0,
    filledQuantity: readNumber(item, 'executedQuantity') ?? 0,
    price: typeof orderPrice === 'object' && orderPrice !== null
      ? readNumber(orderPrice as Record<string, unknown>, 'krw') ?? 0
      : 0,
    averageExecutionPrice: typeof averageExecutionPrice === 'object' && averageExecutionPrice !== null
      ? readNumber(averageExecutionPrice as Record<string, unknown>, 'krw') ?? 0
      : 0,
    orderedDate: readString(item, 'userOrderDate'),
    submittedAt: readString(item, 'lastExecutedAt')
      ?? readString(item, 'version')
      ?? readString(item, 'orderedAt'),
  };
}

function normalizeCompletedRange(
  options: TossCompletedOrdersOptions,
  now: Date,
): TossCompletedOrdersRange {
  const market = options.market ?? 'all';
  const to = options.to ?? formatYmd(now);
  const from = options.from ?? formatYmd(new Date(now.getFullYear(), now.getMonth(), 1));
  return {
    market,
    from,
    to,
    size: options.size ?? 50,
    number: options.number ?? 1,
  };
}

function completedOrdersUrl(
  certBaseUrl: string,
  market: string,
  range: TossCompletedOrdersRange,
): string {
  const query = new URLSearchParams({
    'range.from': range.from,
    'range.to': range.to,
    size: String(range.size),
    number: String(range.number),
  });
  return `${certBaseUrl}/api/v2/trading/my-orders/markets/${market}/by-date/completed?${query.toString()}`;
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
    throw new Error(`Toss orders HTTP ${res.status}`);
  }
  return res.json() as Promise<unknown>;
}

function readRecord(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return {};
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
