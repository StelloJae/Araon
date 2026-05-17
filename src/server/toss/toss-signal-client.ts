import { createHash } from 'node:crypto';
import type { TossSession, TossSessionStore } from './toss-session-store.js';

export interface TossSignalItem {
  readonly id: string;
  readonly ticker: string;
  readonly source: TossSignalSource;
  readonly title: string;
  readonly publishedAt: string | null;
  readonly firstSeenAt: string;
  readonly relevance: number | null;
  readonly confidence: number;
  readonly isNew: true;
}

export interface TossSignalRefreshInput {
  readonly ticker: string;
  readonly name: string;
  readonly now: Date;
}

export interface TossSignalRequestBodyInput {
  readonly ticker: string;
  readonly productCode: string;
  readonly name: string;
}

export interface TossSignalClient {
  refresh(input: TossSignalRefreshInput): Promise<readonly TossSignalItem[]>;
}

export interface TossSignalClientOptions {
  readonly fetchFn?: typeof fetch;
  readonly infoBaseUrl?: string;
  readonly now?: () => Date;
  readonly endpointPath?: TossSignalEndpointPath;
  readonly sessionStore?: Pick<TossSessionStore, 'load'>;
  readonly requestBody?: (input: TossSignalRequestBodyInput) => unknown;
}

export type TossSignalRequestBodyFactory = (input: TossSignalRequestBodyInput) => unknown;

export type TossSignalEndpointPath =
  | '/api/v2/dashboard/wts/overview/signals'
  | '/api/v1/dashboard/intelligences/all';

export type TossSignalSource =
  | 'toss-overview-signals'
  | 'toss-dashboard-intelligences';

export interface TossSignalCapturedRequestBodyInput {
  readonly rawBody: string;
  readonly ticker: string;
  readonly productCode?: string;
  readonly name: string;
  readonly allowStaticBody?: boolean;
}

export interface TossSignalCapturedRequestBodyTemplate {
  readonly templateJson: string;
  readonly placeholderCounts: {
    readonly productCode: number;
    readonly ticker: number;
    readonly name: number;
  };
}

interface TossEnvelope {
  readonly result?: unknown;
}

const DEFAULT_INFO_BASE_URL = 'https://wts-info-api.tossinvest.com';
const DEFAULT_SIGNAL_ENDPOINT_PATH: TossSignalEndpointPath =
  '/api/v2/dashboard/wts/overview/signals';
const DEFAULT_BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';
const SENSITIVE_TEMPLATE_KEYS = new Set([
  'accountno',
  'accountnumber',
  'appkey',
  'appsecret',
  'approvalkey',
  'authorization',
  'browsersessionid',
  'cookie',
  'cookies',
  'deviceid',
  'ftk',
  'ltk',
  'orderno',
  'referenceid',
  'session',
  'sessionid',
  'utk',
]);
const SENSITIVE_TEMPLATE_VALUE_RE =
  /\b(?:SESSION|UTK|LTK|FTK|browserSessionId|deviceId|accountNo|orderNo|referenceId)\s*=/i;

export function createTossSignalClient(
  options: TossSignalClientOptions = {},
): TossSignalClient {
  const fetchFn = options.fetchFn ?? fetch;
  const infoBaseUrl = normalizeBase(options.infoBaseUrl ?? DEFAULT_INFO_BASE_URL);
  const clock = options.now ?? (() => new Date());
  const endpointPath = options.endpointPath ?? DEFAULT_SIGNAL_ENDPOINT_PATH;

  async function refresh(input: TossSignalRefreshInput): Promise<readonly TossSignalItem[]> {
    const productCode = normalizeKrProductCode(input.ticker);
    if (productCode === null) return [];
    if (options.requestBody === undefined) {
      throw new Error('Toss signal request body contract is not configured');
    }

    const session = await loadRequiredSession(endpointPath, options.sessionStore);
    const url = new URL(endpointPath, infoBaseUrl);
    const body = options.requestBody({
      ticker: tickerFromProductCode(productCode),
      productCode,
      name: input.name,
    });
    const headers = new Headers();
    headers.set('accept', 'application/json');
    headers.set('content-type', 'application/json');
    headers.set('origin', 'https://www.tossinvest.com');
    headers.set('referer', `https://www.tossinvest.com/stocks/${productCode}`);
    headers.set('user-agent', DEFAULT_BROWSER_USER_AGENT);
    if (session !== null) headers.set('Cookie', cookieHeader(session.cookies));
    const res = await fetchFn(url.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Toss signal request failed: ${res.status}`);
    }
    const envelope = await res.json() as TossEnvelope;
    const firstSeenAt = (input.now ?? clock()).toISOString();
    return parseTossSignalItems({
      raw: envelope.result,
      productCode,
      firstSeenAt,
      source: tossSignalSourceForEndpoint(endpointPath),
    });
  }

  return { refresh };
}

async function loadRequiredSession(
  endpointPath: TossSignalEndpointPath,
  sessionStore: Pick<TossSessionStore, 'load'> | undefined,
): Promise<TossSession | null> {
  if (endpointPath !== '/api/v1/dashboard/intelligences/all') return null;
  const session = await sessionStore?.load();
  if (session === null || session === undefined) {
    throw new Error('Toss signal session is required');
  }
  return session;
}

export function createTossSignalRequestBodyTemplate(
  rawTemplate: string | undefined,
): TossSignalRequestBodyFactory | undefined {
  if (rawTemplate === undefined || rawTemplate.trim().length === 0) return undefined;
  let template: unknown;
  try {
    template = JSON.parse(rawTemplate);
  } catch {
    throw new Error('Invalid Toss signal request body template');
  }
  if (containsSensitiveTemplateField(template)) {
    throw new Error('Toss signal request body template contains sensitive fields');
  }
  return (input) => applyTemplate(template, input);
}

export function createTossSignalRequestBodyTemplateFromCapturedBody(
  input: TossSignalCapturedRequestBodyInput,
): TossSignalCapturedRequestBodyTemplate {
  let body: unknown;
  try {
    body = JSON.parse(input.rawBody);
  } catch {
    throw new Error('Invalid Toss signal request body candidate');
  }
  if (containsSensitiveTemplateField(body)) {
    throw new Error('Toss signal request body template contains sensitive fields');
  }

  const ticker = normalizeTicker(input.ticker);
  const productCode = input.productCode === undefined
    ? normalizeKrProductCode(input.ticker)
    : normalizeKrProductCode(input.productCode);
  if (ticker === null || productCode === null) {
    throw new Error('Invalid Toss signal request body candidate');
  }

  const counts = { productCode: 0, ticker: 0, name: 0 };
  const template = capturePlaceholders(body, {
    productCode,
    ticker,
    name: input.name,
    counts,
  });

  if (
    counts.productCode + counts.ticker + counts.name === 0 &&
    input.allowStaticBody !== true
  ) {
    throw new Error('Toss signal request body template lacks stock placeholders');
  }

  const templateJson = JSON.stringify(template);
  createTossSignalRequestBodyTemplate(templateJson);
  return {
    templateJson,
    placeholderCounts: counts,
  };
}

export function parseTossSignalItems(input: {
  readonly raw: unknown;
  readonly productCode: string;
  readonly firstSeenAt: string;
  readonly source?: TossSignalSource;
}): TossSignalItem[] {
  const targetTicker = tickerFromProductCode(input.productCode);
  const source = input.source ?? 'toss-overview-signals';
  const cards = signalCards(input.raw);
  const items: TossSignalItem[] = [];
  for (const card of cards) {
    const cardProductCode = normalizeKrProductCode(readStringFromKeys(card, [
      'productCode',
      'stockCode',
      'code',
      'symbol',
    ]));
    if (cardProductCode !== null && cardProductCode !== input.productCode) continue;

    const title = readStringFromKeys(card, [
      'title',
      'headline',
      'name',
      'summary',
      'text',
      'description',
      'content',
      'message',
      'reason',
    ]);
    if (title === null) continue;
    const publishedAt = normalizeTimestamp(readStringFromKeys(card, [
      'publishedAt',
      'createdAt',
      'basedAt',
      'dateTime',
      'updatedAt',
      'issuedAt',
    ]));
    const rawId = readStringFromKeys(card, ['id', 'signalId', 'cardId', 'intelligenceId', 'key']);
    const stableBasis = [
      source,
      targetTicker,
      rawId ?? '',
      title,
      publishedAt ?? '',
    ].join('|');

    items.push({
      id: `toss-signal:${shortHash(stableBasis)}`,
      ticker: targetTicker,
      source,
      title,
      publishedAt,
      firstSeenAt: input.firstSeenAt,
      relevance: clampScore(readNumberFromKeys(card, ['relevance', 'score', 'weight'])),
      confidence: clampScore(readNumberFromKeys(card, ['confidence', 'confidenceScore'])) ?? 0.65,
      isNew: true,
    });
  }
  return items;
}

export function tossSignalSourceForEndpoint(
  endpointPath: TossSignalEndpointPath,
): TossSignalSource {
  return endpointPath === '/api/v1/dashboard/intelligences/all'
    ? 'toss-dashboard-intelligences'
    : 'toss-overview-signals';
}

function signalCards(raw: unknown): Record<string, unknown>[] {
  const result = asRecord(raw);
  if (result === null) return [];
  return readSignalCardsFromRecord(result);
}

function readSignalCardsFromRecord(result: Record<string, unknown>): Record<string, unknown>[] {
  const intelligenceCards = readIntelligenceCards(result);
  if (intelligenceCards.length > 0) return intelligenceCards;
  const arrays = [
    result['signals'],
    result['cards'],
    result['items'],
  ];
  for (const value of arrays) {
    if (!Array.isArray(value)) continue;
    return value
      .map(asRecord)
      .filter((item): item is Record<string, unknown> => item !== null);
  }
  const nestedData = asRecord(result['data']);
  if (nestedData !== null) {
    const nestedCards = readSignalCardsFromRecord(nestedData);
    if (nestedCards.length > 0) return nestedCards;
  }
  const sectionCards = readSectionCards(result);
  if (sectionCards.length > 0) return sectionCards;
  return [];
}

function readSectionCards(result: Record<string, unknown>): Record<string, unknown>[] {
  for (const key of ['sections', 'groups', 'contents']) {
    const value = result[key];
    if (!Array.isArray(value)) continue;
    const cards = value
      .map(asRecord)
      .flatMap((section): Record<string, unknown>[] => (
        section === null ? [] : readSignalCardsFromRecord(section)
      ));
    if (cards.length > 0) return cards;
  }
  return [];
}

function readIntelligenceCards(result: Record<string, unknown>): Record<string, unknown>[] {
  const intelligences = result['intelligences'];
  if (!Array.isArray(intelligences)) return [];
  return intelligences
    .map(asRecord)
    .flatMap((item): Record<string, unknown>[] => {
      if (item === null) return [];
      const data = asRecord(item['data']);
      const intelligence = asRecord(data?.['intelligence']) ?? asRecord(item['intelligence']);
      return intelligence === null ? [] : [intelligence];
    });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : null;
}

function applyTemplate(value: unknown, input: TossSignalRequestBodyInput): unknown {
  if (typeof value === 'string') {
    return value
      .replaceAll('{{productCode}}', input.productCode)
      .replaceAll('{{ticker}}', input.ticker)
      .replaceAll('{{name}}', input.name);
  }
  if (Array.isArray(value)) return value.map((item) => applyTemplate(item, input));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, applyTemplate(child, input)]),
    );
  }
  return value;
}

function capturePlaceholders(
  value: unknown,
  input: {
    readonly productCode: string;
    readonly ticker: string;
    readonly name: string;
    readonly counts: {
      productCode: number;
      ticker: number;
      name: number;
    };
  },
): unknown {
  if (typeof value === 'string') {
    let next = value;
    next = replaceAndCount(next, input.productCode, '{{productCode}}', (count) => {
      input.counts.productCode += count;
    });
    next = replaceAndCount(next, input.ticker, '{{ticker}}', (count) => {
      input.counts.ticker += count;
    });
    next = replaceAndCount(next, input.name, '{{name}}', (count) => {
      input.counts.name += count;
    });
    return next;
  }
  if (Array.isArray(value)) {
    return value.map((item) => capturePlaceholders(item, input));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, capturePlaceholders(child, input)]),
    );
  }
  return value;
}

function replaceAndCount(
  value: string,
  needle: string,
  replacement: string,
  onCount: (count: number) => void,
): string {
  if (needle.length === 0 || !value.includes(needle)) return value;
  const pieces = value.split(needle);
  const count = pieces.length - 1;
  if (count > 0) onCount(count);
  return pieces.join(replacement);
}

function containsSensitiveTemplateField(value: unknown): boolean {
  if (typeof value === 'string') return SENSITIVE_TEMPLATE_VALUE_RE.test(value);
  if (Array.isArray(value)) return value.some((item) => containsSensitiveTemplateField(item));
  if (typeof value !== 'object' || value === null) return false;
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_TEMPLATE_KEYS.has(normalizeTemplateKey(key))) return true;
    if (containsSensitiveTemplateField(child)) return true;
  }
  return false;
}

function normalizeTemplateKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cookieHeader(cookies: Readonly<Record<string, string>>): string {
  return Object.entries(cookies)
    .filter(([, value]) => value.length > 0)
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join('; ');
}

function readStringFromKeys(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

function readNumberFromKeys(record: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value.replace(/,/g, ''));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function normalizeKrProductCode(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim().toUpperCase();
  const prefixed = /^A\d{6}$/.exec(trimmed);
  if (prefixed !== null) return trimmed;
  const ticker = /^\d{6}$/.exec(trimmed);
  return ticker === null ? null : `A${trimmed}`;
}

function normalizeTicker(value: string): string | null {
  const trimmed = value.trim().toUpperCase();
  const ticker = trimmed.startsWith('A') ? trimmed.slice(1) : trimmed;
  return /^\d{6}$/.test(ticker) ? ticker : null;
}

function tickerFromProductCode(productCode: string): string {
  return productCode.startsWith('A') ? productCode.slice(1) : productCode;
}

function normalizeTimestamp(value: string | null): string | null {
  if (value === null) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function clampScore(value: number | null): number | null {
  if (value === null) return null;
  return Math.max(0, Math.min(1, value));
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function normalizeBase(base: string): string {
  return base.endsWith('/') ? base : `${base}/`;
}
