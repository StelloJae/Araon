import type { StockNewsItem, StockNewsPage } from '@shared/types.js';
import iconv from 'iconv-lite';
import type { StockNewsRepository } from '../db/repositories.js';

type ParsedStockNewsItem = Omit<StockNewsItem, 'id' | 'isNew'>;

export interface StockNewsFeedService {
  list(ticker: string, options?: { limit?: number; offset?: number }): StockNewsItem[];
  page(ticker: string, options?: { limit?: number; offset?: number }): StockNewsPage;
  refresh(input: { ticker: string; name?: string; now: Date }): Promise<StockNewsItem[]>;
}

export interface CreateStockNewsFeedServiceOptions {
  repo: Pick<
    StockNewsRepository,
    'listByTicker' | 'countByTicker' | 'upsertMany' | 'recordFetchStatus' | 'getFetchStatus'
  >;
  fetchHtml?: (url: string) => Promise<string>;
  searchNews?: (input: { ticker: string; name: string; now: Date }) => Promise<StockSearchNewsResult[]>;
}

const NAVER_FINANCE_NEWS_URL = 'https://finance.naver.com/item/news_news.naver';
const NAVER_SEARCH_NEWS_URL = 'https://openapi.naver.com/v1/search/news.json';

export interface StockSearchNewsResult {
  title: string;
  url: string;
  description: string | null;
  publishedAt: string | null;
}

export interface CreateNaverSearchNewsProviderOptions {
  clientId?: string;
  clientSecret?: string;
  fetchJson?: (url: string, init: RequestInit) => Promise<unknown>;
}

export function createStockNewsFeedService(
  options: CreateStockNewsFeedServiceOptions,
): StockNewsFeedService {
  const fetchHtml = options.fetchHtml ?? defaultFetchHtml;

  function list(ticker: string, listOptions: { limit?: number; offset?: number } = {}): StockNewsItem[] {
    return options.repo.listByTicker(ticker, listOptions);
  }

  function page(ticker: string, pageOptions: { limit?: number; offset?: number } = {}): StockNewsPage {
    const limit = Math.max(1, Math.min(pageOptions.limit ?? 5, 50));
    const offset = Math.max(0, pageOptions.offset ?? 0);
    const total = options.repo.countByTicker(ticker);
    return {
      items: options.repo.listByTicker(ticker, { limit, offset }),
      pagination: {
        limit,
        offset,
        total,
        hasNext: offset + limit < total,
        hasPrev: offset > 0,
      },
      fetchStatus: options.repo.getFetchStatus(ticker),
    };
  }

  async function refresh(input: { ticker: string; name?: string; now: Date }): Promise<StockNewsItem[]> {
    const url = `${NAVER_FINANCE_NEWS_URL}?code=${encodeURIComponent(input.ticker)}&page=&clusterId=`;
    const fetchedAt = input.now.toISOString();
    const parsedItems: ParsedStockNewsItem[] = [];
    const errors: unknown[] = [];
    try {
      const existingIdentityKeys = new Set(
        options.repo.listByTicker(input.ticker, 100).flatMap((item) => newsIdentityKeys(item)),
      );
      try {
        const html = await fetchHtml(url);
        parsedItems.push(...parseNaverFinanceNews(html, input.ticker, fetchedAt));
      } catch (err: unknown) {
        errors.push(err);
      }
      if (options.searchNews !== undefined) {
        try {
          const name = input.name?.trim() || input.ticker;
          const searchItems = await options.searchNews({ ticker: input.ticker, name, now: input.now });
          parsedItems.push(
            ...searchItems
              .filter((item) => isRelevantSearchNewsResult(item, input.ticker, name))
              .map((item) => ({
                ticker: input.ticker,
                source: 'naver-search' as const,
                title: item.title,
                url: normalizeNewsUrl(item.url),
                description: item.description,
                publishedAt: item.publishedAt,
                fetchedAt,
              })),
          );
        } catch (err: unknown) {
          errors.push(err);
        }
      }
      if (parsedItems.length === 0 && errors.length > 0) {
        throw errors[0];
      }
      options.repo.recordFetchStatus({
        ticker: input.ticker,
        lastFetchStatus: 'success',
        lastFetchErrorCode: null,
        lastFetchedAt: fetchedAt,
        updatedAt: fetchedAt,
      });
      if (parsedItems.length === 0) return options.repo.listByTicker(input.ticker);
      return options.repo.upsertMany(dedupeNewsItems(parsedItems)).map((item) => ({
        ...item,
        isNew: !newsIdentityKeys(item).some((key) => existingIdentityKeys.has(key)),
      }));
    } catch (err: unknown) {
      options.repo.recordFetchStatus({
        ticker: input.ticker,
        lastFetchStatus: 'failed',
        lastFetchErrorCode: sanitizeNewsFetchErrorCode(err),
        lastFetchedAt: fetchedAt,
        updatedAt: fetchedAt,
      });
      throw err;
    }
  }

  return { list, page, refresh };
}

export function parseNaverFinanceNews(
  html: string,
  ticker: string,
  fetchedAt: string,
): ParsedStockNewsItem[] {
  const items: ParsedStockNewsItem[] = [];
  const seen = new Set<string>();
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const item = parseNaverFinanceNewsRow(rowMatch[1] ?? '', ticker, fetchedAt);
    if (item === null || seen.has(item.url)) continue;
    seen.add(item.url);
    items.push(item);
  }
  if (items.length > 0) return items.slice(0, 20);

  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(html)) !== null) {
    const item = parseNaverFinanceAnchor(match[1] ?? '', match[2] ?? '', ticker, fetchedAt, null, null);
    if (item === null || seen.has(item.url)) continue;
    seen.add(item.url);
    items.push(item);
  }
  return items.slice(0, 10);
}

function parseNaverFinanceNewsRow(
  rowHtml: string,
  ticker: string,
  fetchedAt: string,
): ParsedStockNewsItem | null {
  const anchor = rowHtml.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
  if (anchor === null) return null;
  const provider = cleanText(rowHtml.match(/<td\b[^>]*class=["'][^"']*\binfo\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? '');
  const dateText = cleanText(rowHtml.match(/<td\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? '');
  return parseNaverFinanceAnchor(
    anchor[1] ?? '',
    anchor[2] ?? '',
    ticker,
    fetchedAt,
    provider.length > 0 ? provider : null,
    parseNaverFinanceDate(dateText),
  );
}

function parseNaverFinanceAnchor(
  href: string,
  rawTitle: string,
  ticker: string,
  fetchedAt: string,
  provider: string | null,
  publishedAt: string | null,
): ParsedStockNewsItem | null {
  if (!href.includes('/item/news_read.naver') && !href.includes('/item/news_read.nhn')) {
    return null;
  }
  const title = cleanText(rawTitle);
  if (title.length === 0) return null;
  return {
    ticker,
    source: 'naver-finance',
    title,
    url: normalizeNaverFinanceNewsUrl(href),
    description: provider,
    publishedAt,
    fetchedAt,
  };
}

function normalizeNaverFinanceNewsUrl(href: string): string {
  return normalizeNewsUrl(
    href.startsWith('http') ? href : `https://finance.naver.com${href.startsWith('/') ? '' : '/'}${href}`,
  );
}

function parseNaverFinanceDate(value: string): string | null {
  const match = value.match(/(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})/);
  if (match === null) return null;
  const [, year, month, day, hour, minute] = match;
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:00+09:00`).toISOString();
}

async function defaultFetchHtml(url: string): Promise<string> {
  const ticker = new URL(url).searchParams.get('code') ?? '';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Araon local watchlist monitor)',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      Referer: ticker.length === 6
        ? `https://finance.naver.com/item/news.naver?code=${encodeURIComponent(ticker)}`
        : 'https://finance.naver.com/',
    },
  });
  if (!res.ok) {
    throw new Error(`news feed fetch failed: ${res.status}`);
  }
  const contentType = res.headers.get('content-type') ?? '';
  const body = Buffer.from(await res.arrayBuffer());
  return /euc-kr|ks_c_5601|cp949/i.test(contentType)
    ? iconv.decode(body, 'euc-kr')
    : new TextDecoder('utf-8').decode(body);
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ');
}

function decodeHtml(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&middot;', '·')
    .replaceAll('&hellip;', '…')
    .replaceAll('&uarr;', '↑')
    .replaceAll('&darr;', '↓')
    .replaceAll('&#39;', "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function cleanText(value: string): string {
  return decodeHtml(stripTags(value)).trim().replace(/\s+/g, ' ');
}

function dedupeNewsItems(items: ParsedStockNewsItem[]): ParsedStockNewsItem[] {
  const seen = new Set<string>();
  const result: ParsedStockNewsItem[] = [];
  for (const item of items) {
    const normalized = { ...item, url: normalizeNewsUrl(item.url) };
    const keys = newsIdentityKeys(normalized);
    if (keys.some((key) => seen.has(key))) continue;
    for (const key of keys) seen.add(key);
    result.push(normalized);
  }
  return result.slice(0, 120);
}

function newsIdentityKeys(
  item: Pick<StockNewsItem, 'ticker' | 'title' | 'url' | 'publishedAt' | 'fetchedAt'>,
): string[] {
  const keys = [`url:${normalizeNewsUrl(item.url)}`];
  const clusterKey = newsTitleClusterKey(item);
  if (clusterKey !== null) keys.push(`cluster:${clusterKey}`);
  return keys;
}

function newsTitleClusterKey(
  item: Pick<StockNewsItem, 'ticker' | 'title' | 'publishedAt' | 'fetchedAt'>,
): string | null {
  const title = normalizeNewsClusterTitle(item.title);
  const day = newsDateBucket(item.publishedAt ?? item.fetchedAt);
  if (title.length < 8 || day === null) return null;
  return `${item.ticker}:${day}:${title}`;
}

function normalizeNewsClusterTitle(value: string): string {
  return cleanText(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/^\s*[\[({【][^\])}】]{1,12}[\])}】]\s*/g, '')
    .replace(/[\s"'“”‘’·.,!?:;…~\-_/\\|()[\]{}<>《》〈〉「」『』【】]+/g, '');
}

function newsDateBucket(value: string | null): string | null {
  if (value === null) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

function isRelevantSearchNewsResult(
  item: StockSearchNewsResult,
  ticker: string,
  name: string,
): boolean {
  const haystack = normalizeSearchMatchText(`${item.title} ${item.description ?? ''}`);
  const tickerToken = normalizeSearchMatchText(ticker);
  const nameToken = normalizeSearchMatchText(name);
  return (tickerToken.length > 0 && haystack.includes(tickerToken))
    || (nameToken.length > 1 && haystack.includes(nameToken));
}

function normalizeSearchMatchText(value: string): string {
  return cleanText(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s"'“”‘’·.,!?:;…~\-_/\\|()[\]{}<>《》〈〉「」『』【】]+/g, '');
}

function normalizeNewsUrl(value: string): string {
  const raw = value.trim();
  if (raw.length === 0) return raw;
  try {
    const url = new URL(raw);
    const officeId = url.searchParams.get('office_id')
      ?? url.searchParams.get('officeId')
      ?? url.searchParams.get('oid');
    const articleId = url.searchParams.get('article_id')
      ?? url.searchParams.get('articleId')
      ?? url.searchParams.get('aid');
    if (officeId !== null && articleId !== null && isNaverNewsHost(url.hostname)) {
      return canonicalNaverArticleUrl(officeId, articleId);
    }

    const pathMatch = url.pathname.match(/\/(?:mnews\/)?article\/([^/]+)\/([^/]+)/);
    if (pathMatch !== null && isNaverNewsHost(url.hostname)) {
      const [, pathOfficeId, pathArticleId] = pathMatch;
      if (pathOfficeId !== undefined && pathArticleId !== undefined) {
        return canonicalNaverArticleUrl(pathOfficeId, pathArticleId);
      }
    }

    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|wbraid$|gbraid$)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function isNaverNewsHost(hostname: string): boolean {
  return hostname === 'news.naver.com' || hostname === 'n.news.naver.com' || hostname === 'finance.naver.com';
}

function canonicalNaverArticleUrl(officeId: string, articleId: string): string {
  return `https://n.news.naver.com/mnews/article/${encodeURIComponent(officeId)}/${encodeURIComponent(articleId)}`;
}

export function createNaverSearchNewsProvider(
  options: CreateNaverSearchNewsProviderOptions,
): ((input: { ticker: string; name: string; now: Date }) => Promise<StockSearchNewsResult[]>) | undefined {
  const clientId = options.clientId?.trim();
  const clientSecret = options.clientSecret?.trim();
  if (!clientId || !clientSecret) return undefined;
  const fetchJson = options.fetchJson ?? defaultFetchJson;
  return async ({ ticker, name }) => {
    const query = `${name} ${ticker}`;
    const url = `${NAVER_SEARCH_NEWS_URL}?query=${encodeURIComponent(query)}&display=100&start=1&sort=date`;
    const data = await fetchJson(url, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });
    return parseNaverSearchResponse(data).slice(0, 100);
  };
}

async function defaultFetchJson(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`naver search fetch failed: ${res.status}`);
  }
  return res.json();
}

function parseNaverSearchResponse(data: unknown): StockSearchNewsResult[] {
  if (typeof data !== 'object' || data === null || !Array.isArray((data as { items?: unknown }).items)) {
    return [];
  }
  return (data as { items: Array<Record<string, unknown>> }).items
    .map((item) => {
      const title = cleanText(String(item.title ?? ''));
      const url = String(item.originallink ?? item.link ?? '').trim();
      if (title.length === 0 || url.length === 0) return null;
      const pubDate = String(item.pubDate ?? '');
      const parsedDate = Date.parse(pubDate);
      return {
        title,
        url,
        description: cleanText(String(item.description ?? '')) || null,
        publishedAt: Number.isNaN(parsedDate) ? null : new Date(parsedDate).toISOString(),
      };
    })
    .filter((item): item is StockSearchNewsResult => item !== null);
}

export function sanitizeNewsFetchErrorCode(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const status = message.match(/\b([45]\d{2})\b/)?.[1];
  if (status !== undefined) return `HTTP_${status}`;
  if (/timeout/i.test(message)) return 'TIMEOUT';
  if (/network|fetch/i.test(message)) return 'NETWORK_ERROR';
  return 'FETCH_FAILED';
}
