import { createHash } from 'node:crypto';
import type { TossSession, TossSessionStore } from './toss-session-store.js';

export interface TossNewsItem {
  readonly id: string;
  readonly ticker: string;
  readonly source: 'toss-asset-news';
  readonly sectionType: string;
  readonly title: string;
  readonly agencyName: string | null;
  readonly newsType: string | null;
  readonly publishedAt: string | null;
  readonly firstSeenAt: string;
  readonly relevance: number;
  readonly confidence: number;
  readonly isNew: true;
}

export interface TossAssetNewsParseInput {
  readonly raw: unknown;
  readonly ticker: string;
  readonly name: string;
  readonly firstSeenAt: string;
}

export interface TossNewsRefreshInput {
  readonly ticker: string;
  readonly name: string;
  readonly now: Date;
}

export interface TossNewsClient {
  refresh(input: TossNewsRefreshInput): Promise<readonly TossNewsItem[]>;
}

export interface TossNewsClientOptions {
  readonly sessionStore: TossSessionStore;
  readonly fetchImpl?: typeof fetch;
  readonly certBaseUrl?: string;
}

export interface SessionGatedTossNewsServiceOptions {
  readonly sessionStore: TossSessionStore;
  readonly client: TossNewsClient;
}

type MatchKind = 'related-stock' | 'title';

const NEWS_SOURCE = 'toss-asset-news';
const DEFAULT_CERT_BASE_URL = 'https://wts-cert-api.tossinvest.com';
const DEFAULT_BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

export function createTossNewsClient(options: TossNewsClientOptions): TossNewsClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const certBaseUrl = trimTrailingSlash(options.certBaseUrl ?? DEFAULT_CERT_BASE_URL);

  async function refresh(input: TossNewsRefreshInput): Promise<readonly TossNewsItem[]> {
    const session = await options.sessionStore.load();
    if (session === null) throw new Error('Toss session is required');
    const raw = await requestAssetSections({
      certBaseUrl,
      fetchImpl,
      session,
    });
    return parseTossAssetNewsItems({
      raw,
      ticker: input.ticker,
      name: input.name,
      firstSeenAt: input.now.toISOString(),
    });
  }

  return { refresh };
}

export function createSessionGatedTossNewsService(
  options: SessionGatedTossNewsServiceOptions,
): TossNewsClient {
  async function refresh(input: TossNewsRefreshInput): Promise<readonly TossNewsItem[]> {
    const status = await options.sessionStore.status();
    if (!isUsableTossNewsSession(status.state)) return [];
    return options.client.refresh(input);
  }

  return { refresh };
}

function isUsableTossNewsSession(state: Awaited<ReturnType<TossSessionStore['status']>>['state']): boolean {
  return state === 'persistent' || state === 'session_scoped' || state === 'expiring';
}

export function parseTossAssetNewsItems(input: TossAssetNewsParseInput): TossNewsItem[] {
  const ticker = normalizeTicker(input.ticker);
  if (ticker === null) return [];
  const productCode = `A${ticker}`;
  const nameToken = normalizeMatchText(input.name);
  const tickerToken = normalizeMatchText(ticker);
  const items: TossNewsItem[] = [];
  const seen = new Set<string>();

  for (const section of assetSections(input.raw)) {
    const sectionType = normalizeSectionType(readString(section, 'type') ?? 'UNKNOWN');
    const data = readRecordOrJson(section['data']);
    for (const card of newsCards(data)) {
      const title = readString(card, 'title');
      if (title === null) continue;
      const matchKind = matchNewsCard({
        card,
        productCode,
        nameToken,
        tickerToken,
        title,
      });
      if (matchKind === null) continue;

      const rawNewsId = readString(card, 'newsId') ?? readString(card, 'id') ?? '';
      const publishedAt = normalizeTimestamp(
        readString(card, 'createdAt')
          ?? readString(card, 'publishedAt')
          ?? readString(card, 'updatedAt'),
      );
      const dedupeBasis = [
        NEWS_SOURCE,
        ticker,
        rawNewsId,
        title,
        publishedAt ?? '',
      ].join('|');
      const id = `toss-news:${shortHash(dedupeBasis)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({
        id,
        ticker,
        source: NEWS_SOURCE,
        sectionType,
        title,
        agencyName: readString(card, 'agencyName'),
        newsType: readString(card, 'newsType'),
        publishedAt,
        firstSeenAt: input.firstSeenAt,
        relevance: matchKind === 'related-stock' ? 0.82 : 0.72,
        confidence: matchKind === 'related-stock' ? 0.78 : 0.7,
        isNew: true,
      });
    }
  }

  return items;
}

function assetSections(raw: unknown): Record<string, unknown>[] {
  const root = asRecord(raw);
  if (root === null) return [];
  const result = asRecord(root['result']) ?? root;
  return readArray(result, 'sections')
    .map(asRecord)
    .filter((section): section is Record<string, unknown> => section !== null);
}

function newsCards(data: Record<string, unknown>): Record<string, unknown>[] {
  const cards: Record<string, unknown>[] = [];
  for (const key of ['news', 'totalNews', 'items', 'cards']) {
    for (const item of readArray(data, key)) {
      const card = asRecord(item);
      if (card !== null) cards.push(card);
    }
  }
  return cards;
}

function matchNewsCard(input: {
  readonly card: Record<string, unknown>;
  readonly productCode: string;
  readonly nameToken: string;
  readonly tickerToken: string;
  readonly title: string;
}): MatchKind | null {
  if (matchesRelatedStock(input.card, input.productCode, input.nameToken, input.tickerToken)) {
    return 'related-stock';
  }
  const titleToken = normalizeMatchText(input.title);
  if (input.nameToken.length > 1 && titleToken.includes(input.nameToken)) return 'title';
  if (input.tickerToken.length > 0 && titleToken.includes(input.tickerToken)) return 'title';
  return null;
}

function matchesRelatedStock(
  card: Record<string, unknown>,
  productCode: string,
  nameToken: string,
  tickerToken: string,
): boolean {
  for (const item of readArray(card, 'relatedStocks')) {
    const related = asRecord(item);
    if (related === null) continue;
    const relatedProductCode = normalizeProductCode(
      readString(related, 'stockCode')
        ?? readString(related, 'productCode')
        ?? readString(related, 'code'),
    );
    if (relatedProductCode === productCode) return true;

    const relatedTicker = normalizeTicker(
      readString(related, 'ticker')
        ?? readString(related, 'symbol'),
    );
    if (relatedTicker !== null && normalizeMatchText(relatedTicker) === tickerToken) return true;

    const relatedName = normalizeMatchText(readString(related, 'name') ?? readString(related, 'stockName') ?? '');
    if (nameToken.length > 1 && relatedName === nameToken) return true;
  }
  return false;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : null;
}

function readRecordOrJson(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  if (record !== null) return record;
  if (typeof value !== 'string') return {};
  try {
    return asRecord(JSON.parse(value)) ?? {};
  } catch {
    return {};
  }
}

function readArray(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeTicker(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim().toUpperCase();
  const ticker = trimmed.startsWith('A') ? trimmed.slice(1) : trimmed;
  return /^\d{6}$/.test(ticker) ? ticker : null;
}

function normalizeProductCode(value: string | null): string | null {
  const ticker = normalizeTicker(value);
  return ticker === null ? null : `A${ticker}`;
}

function normalizeTimestamp(value: string | null): string | null {
  if (value === null) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function normalizeMatchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s"'“”‘’·.,!?:;…~\-_/\\|()[\]{}<>《》〈〉「」『』【】]+/g, '');
}

function normalizeSectionType(value: string): string {
  const normalized = value.trim().replace(/[^\w.-]/g, '_').slice(0, 64);
  return normalized.length > 0 ? normalized : 'UNKNOWN';
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

async function requestAssetSections(input: {
  readonly certBaseUrl: string;
  readonly fetchImpl: typeof fetch;
  readonly session: TossSession;
}): Promise<unknown> {
  const headers = new Headers();
  headers.set('User-Agent', DEFAULT_BROWSER_UA);
  headers.set('Referer', 'https://www.tossinvest.com/');
  headers.set('Origin', 'https://www.tossinvest.com');
  headers.set('Content-Type', 'application/json');
  headers.set('Cookie', cookieHeader(input.session.cookies));
  const res = await input.fetchImpl(`${input.certBaseUrl}/api/v2/dashboard/asset/sections/all`, {
    method: 'POST',
    headers,
    body: '{}',
  });
  if (!res.ok) {
    throw new Error(`Toss news HTTP ${res.status}`);
  }
  return res.json() as Promise<unknown>;
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
