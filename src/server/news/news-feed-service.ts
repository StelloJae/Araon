import type { StockNewsItem } from '@shared/types.js';
import type { StockNewsRepository } from '../db/repositories.js';

type ParsedStockNewsItem = Omit<StockNewsItem, 'id'>;

export interface StockNewsFeedService {
  list(ticker: string): StockNewsItem[];
  refresh(input: { ticker: string; now: Date }): Promise<StockNewsItem[]>;
}

export interface CreateStockNewsFeedServiceOptions {
  repo: Pick<StockNewsRepository, 'listByTicker' | 'upsertMany'>;
  fetchHtml?: (url: string) => Promise<string>;
}

const NAVER_FINANCE_NEWS_URL = 'https://finance.naver.com/item/news_news.naver';

export function createStockNewsFeedService(
  options: CreateStockNewsFeedServiceOptions,
): StockNewsFeedService {
  const fetchHtml = options.fetchHtml ?? defaultFetchHtml;

  function list(ticker: string): StockNewsItem[] {
    return options.repo.listByTicker(ticker);
  }

  async function refresh(input: { ticker: string; now: Date }): Promise<StockNewsItem[]> {
    const url = `${NAVER_FINANCE_NEWS_URL}?code=${encodeURIComponent(input.ticker)}&page=1`;
    const html = await fetchHtml(url);
    const fetchedAt = input.now.toISOString();
    const items = parseNaverFinanceNews(html, input.ticker, fetchedAt);
    if (items.length === 0) return options.repo.listByTicker(input.ticker);
    return options.repo.upsertMany(items);
  }

  return { list, refresh };
}

export function parseNaverFinanceNews(
  html: string,
  ticker: string,
  fetchedAt: string,
): ParsedStockNewsItem[] {
  const items: ParsedStockNewsItem[] = [];
  const seen = new Set<string>();
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(html)) !== null) {
    const href = match[1] ?? '';
    const rawTitle = match[2] ?? '';
    if (!href.includes('/item/news_read.naver') && !href.includes('/item/news_read.nhn')) {
      continue;
    }
    const title = decodeHtml(stripTags(rawTitle)).trim().replace(/\s+/g, ' ');
    if (title.length === 0) continue;
    const url = href.startsWith('http')
      ? href
      : `https://finance.naver.com${href.startsWith('/') ? '' : '/'}${href}`;
    if (seen.has(url)) continue;
    seen.add(url);
    items.push({
      ticker,
      source: 'naver-finance',
      title,
      url,
      publishedAt: null,
      fetchedAt,
    });
  }
  return items.slice(0, 10);
}

async function defaultFetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Araon local watchlist monitor',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) {
    throw new Error(`news feed fetch failed: ${res.status}`);
  }
  return res.text();
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
    .replaceAll('&#39;', "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}
