import type {
  Price,
  TossRealtimeRankingItem,
  TossRealtimeRankingMarket,
  TossRealtimeRankingResponse,
  TossRealtimeRankingTimestampStatus,
} from '@shared/types.js';

const DEFAULT_INFO_BASE_URL = 'https://wts-info-api.tossinvest.com';
const DEFAULT_REFRESH_INTERVAL_MS = 15_000;
const MAX_RANKING_LIMIT = 100;
const FRESH_RANKING_MAX_AGE_MS = 10 * 60_000;
const DEFAULT_BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

export interface TossRealtimeRankingOptions {
  limit?: number;
  market?: TossRealtimeRankingMarket;
  now?: () => Date;
  fetchFn?: typeof fetch;
  infoBaseUrl?: string;
}

export interface TossQuoteBatchOptions {
  tickers: readonly string[];
  now?: () => Date;
  fetchFn?: typeof fetch;
  infoBaseUrl?: string;
}

export interface TossStockSearchOptions {
  query: string;
  limit?: number;
  fetchFn?: typeof fetch;
  infoBaseUrl?: string;
}

export interface TossStockByTickerOptions {
  ticker: string;
  fetchFn?: typeof fetch;
  infoBaseUrl?: string;
}

export interface TossStockSearchItem {
  ticker: string;
  productCode: string;
  name: string;
  market: 'KOSPI' | 'KOSDAQ';
  matchType: string | null;
  source: 'toss-public-search';
}

interface TossEnvelope<T> {
  result?: T;
}

interface TossRankingResult {
  dateTime?: unknown;
  data?: unknown;
}

interface TossRankingRow {
  code?: unknown;
  symbol?: unknown;
  name?: unknown;
  currency?: unknown;
  market?: {
    displayName?: unknown;
  };
}

interface TossPriceRow {
  productCode?: unknown;
  currency?: unknown;
  base?: unknown;
  close?: unknown;
  volume?: unknown;
}

interface TossSearchResult {
  stocks?: unknown;
}

interface TossSearchRow {
  stockCode?: unknown;
  stockName?: unknown;
  matchType?: unknown;
}

interface TossStockInfoRow {
  code?: unknown;
  symbol?: unknown;
  name?: unknown;
  currency?: unknown;
  market?: {
    code?: unknown;
    displayName?: unknown;
  };
}

interface RankedStock {
  rank: number;
  productCode: string;
  ticker: string;
  name: string;
  market: string;
  currency: string;
}

export async function fetchTossRealtimeRanking({
  limit,
  market = 'kr',
  now = () => new Date(),
  fetchFn = fetch,
  infoBaseUrl = DEFAULT_INFO_BASE_URL,
}: TossRealtimeRankingOptions = {}): Promise<TossRealtimeRankingResponse> {
  const requestedLimit = clampLimit(limit);
  const current = now();
  const rankingUrl = new URL('/api/v1/rankings/realtime/stock', normalizeBase(infoBaseUrl));
  rankingUrl.searchParams.set('size', String(requestedLimit));

  const rankingEnvelope = await fetchJson<TossEnvelope<TossRankingResult>>(fetchFn, rankingUrl);
  const rankingResult = rankingEnvelope.result ?? {};
  const rankingDateTime = readString(rankingResult.dateTime);
  const rankedStocks = parseRankingRows(rankingResult.data)
    .filter((item) => matchesMarket(item, market))
    .slice(0, requestedLimit);
  const prices = await fetchPriceMap(fetchFn, infoBaseUrl, rankedStocks.map((item) => item.productCode));

  const items = rankedStocks.map<TossRealtimeRankingItem>((item) => {
    const price = prices.get(item.productCode);
    const close = price?.close ?? null;
    const base = price?.base ?? null;
    return {
      rank: item.rank,
      ticker: item.ticker,
      productCode: item.productCode,
      name: item.name,
      market: item.market,
      currency: price?.currency ?? item.currency,
      price: close,
      changeAbs: close !== null && base !== null ? close - base : null,
      changePct: close !== null && base !== null && base !== 0
        ? ((close - base) / base) * 100
        : null,
      volume: price?.volume ?? null,
    };
  });

  const pricedCount = items.filter((item) => item.price !== null).length;
  const rankingTimestampStatus = classifyRankingTimestamp(rankingDateTime, current);
  const partial = pricedCount < items.length || rankingTimestampStatus !== 'fresh';
  const status: TossRealtimeRankingResponse['status'] =
    items.length === 0 ? 'empty' : partial ? 'partial' : 'ready';

  return {
    generatedAt: current.toISOString(),
    fetchedAt: current.toISOString(),
    rankingDateTime,
    rankingTimestampStatus,
    source: 'toss-public-realtime-ranking',
    sourceLabel: '토스 실시간 인기',
    status,
    message: buildMessage(rankingTimestampStatus, pricedCount, items.length),
    refreshIntervalMs: DEFAULT_REFRESH_INTERVAL_MS,
    coverage: {
      requestedLimit,
      returnedCount: items.length,
      pricedCount,
      market,
    },
    items,
  };
}

export async function fetchTossQuoteBatch({
  tickers,
  now = () => new Date(),
  fetchFn = fetch,
  infoBaseUrl = DEFAULT_INFO_BASE_URL,
}: TossQuoteBatchOptions): Promise<Price[]> {
  const productCodes = normalizeRequestedProductCodes(tickers);
  const prices = await fetchPriceMap(fetchFn, infoBaseUrl, productCodes);
  const fetchedAt = now().toISOString();
  const out: Price[] = [];
  for (const productCode of productCodes) {
    const row = prices.get(productCode);
    const ticker = tickerFromTossProductCode(productCode);
    if (row === undefined || ticker === null || row.close === null) continue;
    const changeAbs = row.base !== null ? row.close - row.base : null;
    out.push({
      ticker,
      price: row.close,
      changeRate: row.base !== null && row.base !== 0
        ? ((row.close - row.base) / row.base) * 100
        : 0,
      changeAbs,
      volume: row.volume ?? 0,
      updatedAt: fetchedAt,
      isSnapshot: false,
      source: 'rest',
    });
  }
  return out;
}

export async function fetchTossStockSearch({
  query,
  limit,
  fetchFn = fetch,
  infoBaseUrl = DEFAULT_INFO_BASE_URL,
}: TossStockSearchOptions): Promise<TossStockSearchItem[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  const safeLimit = clampSearchLimit(limit);
  const searchUrl = new URL('/api/v2/search/stocks', normalizeBase(infoBaseUrl));
  const envelope = await fetchJson<TossEnvelope<TossSearchResult>>(fetchFn, searchUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: trimmed }),
  });
  const searchRows = parseSearchRows(envelope.result?.stocks).slice(0, safeLimit * 2);
  const productCodes = searchRows
    .map((row) => row.productCode)
    .filter((code): code is string => code !== null);
  const infoMap = await fetchStockInfoMap(fetchFn, infoBaseUrl, productCodes);
  const out: TossStockSearchItem[] = [];
  for (const row of searchRows) {
    if (row.productCode === null) continue;
    const info = infoMap.get(row.productCode);
    if (info === undefined) continue;
    const item = mapStockInfoToSearchItem(info, row.matchType);
    if (item === null) continue;
    out.push(item);
    if (out.length >= safeLimit) break;
  }
  return out;
}

export async function fetchTossStockByTicker({
  ticker,
  fetchFn = fetch,
  infoBaseUrl = DEFAULT_INFO_BASE_URL,
}: TossStockByTickerOptions): Promise<TossStockSearchItem | null> {
  const productCode = normalizeTossProductCode(ticker);
  if (productCode === null) return null;
  const infoMap = await fetchStockInfoMap(fetchFn, infoBaseUrl, [productCode]);
  const info = infoMap.get(productCode);
  return info === undefined ? null : mapStockInfoToSearchItem(info, null);
}

async function fetchPriceMap(
  fetchFn: typeof fetch,
  infoBaseUrl: string,
  productCodes: string[],
): Promise<Map<string, { currency: string; base: number | null; close: number | null; volume: number | null }>> {
  if (productCodes.length === 0) return new Map();
  const priceUrl = new URL('/api/v1/product/stock-prices', normalizeBase(infoBaseUrl));
  priceUrl.searchParams.set('meta', 'true');
  priceUrl.searchParams.set('productCodes', productCodes.join(','));

  const envelope = await fetchJson<TossEnvelope<unknown>>(fetchFn, priceUrl);
  const rows = Array.isArray(envelope.result) ? envelope.result : [];
  const out = new Map<string, { currency: string; base: number | null; close: number | null; volume: number | null }>();
  for (const raw of rows) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as TossPriceRow;
    const productCode = readString(row.productCode);
    if (productCode === null) continue;
    out.set(productCode, {
      currency: readString(row.currency) ?? '',
      base: readNumber(row.base),
      close: readNumber(row.close),
      volume: readNumber(row.volume),
    });
  }
  return out;
}

async function fetchStockInfoMap(
  fetchFn: typeof fetch,
  infoBaseUrl: string,
  productCodes: readonly string[],
): Promise<Map<string, TossStockInfoRow>> {
  const unique = Array.from(new Set(productCodes.filter((code) => /^A\d{6}$/.test(code))));
  if (unique.length === 0) return new Map();
  const url = new URL('/api/v1/stock-infos', normalizeBase(infoBaseUrl));
  url.searchParams.set('codes', unique.join(','));
  const envelope = await fetchJson<TossEnvelope<unknown>>(fetchFn, url);
  const rows = Array.isArray(envelope.result) ? envelope.result : [];
  const out = new Map<string, TossStockInfoRow>();
  for (const raw of rows) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as TossStockInfoRow;
    const code = readString(row.code);
    if (code === null) continue;
    out.set(code, row);
  }
  return out;
}

function parseSearchRows(rawRows: unknown): Array<{
  productCode: string | null;
  matchType: string | null;
}> {
  if (!Array.isArray(rawRows)) return [];
  const out: Array<{ productCode: string | null; matchType: string | null }> = [];
  const seen = new Set<string>();
  for (const raw of rawRows) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as TossSearchRow;
    const productCode = normalizeTossProductCode(readString(row.stockCode) ?? '');
    if (productCode === null || seen.has(productCode)) continue;
    seen.add(productCode);
    out.push({
      productCode,
      matchType: readString(row.matchType),
    });
  }
  return out;
}

function mapStockInfoToSearchItem(
  row: TossStockInfoRow,
  matchType: string | null,
): TossStockSearchItem | null {
  const productCode = readString(row.code);
  const ticker = readString(row.symbol) ?? tickerFromTossProductCode(productCode ?? '');
  const name = readString(row.name);
  const market = mapTossMarket(row.market);
  if (
    productCode === null ||
    ticker === null ||
    name === null ||
    market === null ||
    row.currency !== 'KRW'
  ) {
    return null;
  }
  return {
    ticker,
    productCode,
    name,
    market,
    matchType,
    source: 'toss-public-search',
  };
}

function mapTossMarket(market: TossStockInfoRow['market']): 'KOSPI' | 'KOSDAQ' | null {
  const code = readString(market?.code)?.toUpperCase() ?? '';
  const displayName = readString(market?.displayName) ?? '';
  if (code === 'KSP' || /코스피|KOSPI/i.test(displayName)) return 'KOSPI';
  if (code === 'KDQ' || /코스닥|KOSDAQ/i.test(displayName)) return 'KOSDAQ';
  return null;
}

export function normalizeTossProductCode(symbol: string): string | null {
  const normalized = symbol.trim().toUpperCase();
  if (normalized.length === 0) return null;
  if (/^\d{6}$/.test(normalized)) return `A${normalized}`;
  if (/^A\d{6}$/.test(normalized)) return normalized;
  if (/^[A-Z0-9]{5,}$/.test(normalized)) return normalized;
  return null;
}

export function tickerFromTossProductCode(productCode: string): string | null {
  const krMatch = /^A(\d{6})$/.exec(productCode);
  if (krMatch?.[1] !== undefined) return krMatch[1];
  return /^[A-Z0-9]{5,}$/.test(productCode) ? productCode : null;
}

function normalizeRequestedProductCodes(tickers: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const ticker of tickers) {
    const productCode = normalizeTossProductCode(ticker);
    if (productCode === null || seen.has(productCode)) continue;
    seen.add(productCode);
    out.push(productCode);
  }
  return out;
}

async function fetchJson<T>(
  fetchFn: typeof fetch,
  url: URL,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetchFn(url.toString(), {
    ...init,
    headers: {
      accept: 'application/json',
      'user-agent': DEFAULT_BROWSER_USER_AGENT,
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Toss public request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function parseRankingRows(rawRows: unknown): RankedStock[] {
  if (!Array.isArray(rawRows)) return [];
  const items: RankedStock[] = [];
  for (const [index, raw] of rawRows.entries()) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as TossRankingRow;
    const productCode = readString(row.code);
    const ticker = readString(row.symbol);
    const name = readString(row.name);
    if (productCode === null || ticker === null || name === null) continue;
    items.push({
      rank: index + 1,
      productCode,
      ticker,
      name,
      market: readString(row.market?.displayName) ?? '',
      currency: readString(row.currency) ?? '',
    });
  }
  return items;
}

function matchesMarket(item: RankedStock, market: TossRealtimeRankingMarket): boolean {
  if (market === 'all') return true;
  const isKr = item.productCode.startsWith('A')
    && /^\d{6}$/.test(item.ticker)
    && (item.currency === 'KRW' || /코스피|코스닥|KOSPI|KOSDAQ/i.test(item.market));
  return market === 'kr' ? isKr : !isKr;
}

function classifyRankingTimestamp(
  rankingDateTime: string | null,
  current: Date,
): TossRealtimeRankingTimestampStatus {
  if (rankingDateTime === null) return 'missing';
  const parsed = Date.parse(rankingDateTime);
  if (!Number.isFinite(parsed)) return 'missing';
  return Math.abs(current.getTime() - parsed) <= FRESH_RANKING_MAX_AGE_MS
    ? 'fresh'
    : 'stale';
}

function buildMessage(
  rankingTimestampStatus: TossRealtimeRankingTimestampStatus,
  pricedCount: number,
  itemCount: number,
): string {
  if (itemCount === 0) return '토스 공개 인기 랭킹을 가져왔지만 표시할 종목이 없습니다.';
  if (rankingTimestampStatus === 'stale') {
    return '토스 공개 인기 랭킹입니다. 랭킹 시각이 오래되어 가격만 별도 갱신했습니다.';
  }
  if (rankingTimestampStatus === 'missing') {
    return '토스 공개 인기 랭킹입니다. 랭킹 시각은 응답에 없고 가격은 별도 갱신했습니다.';
  }
  if (pricedCount < itemCount) {
    return `토스 공개 인기 랭킹입니다. 가격은 ${pricedCount}/${itemCount}개만 수신했습니다.`;
  }
  return '토스 공개 인기 랭킹입니다.';
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return MAX_RANKING_LIMIT;
  return Math.min(MAX_RANKING_LIMIT, Math.max(1, Math.trunc(limit)));
}

function clampSearchLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return 8;
  return Math.min(20, Math.max(1, Math.trunc(limit)));
}

function normalizeBase(base: string): string {
  return base.endsWith('/') ? base : `${base}/`;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
