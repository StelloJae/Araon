import type {
  MarketTopMoverDirection,
  MarketTopMoverItem,
  MarketTopMoversRankingDiagnostic,
  MarketTopMoversStopReason,
  MarketTopMoversSourcePhase,
} from '@shared/types.js';

const DEFAULT_CERT_BASE_URL = 'https://wts-cert-api.tossinvest.com';
const DEFAULT_BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';
const DEFAULT_DURATION = '1d';
const MAX_RANKING_COUNT = 100;

export type TossOverviewRankingMarket = 'all' | 'kr' | 'us';

export interface FetchTossOverviewRankingInput {
  direction: MarketTopMoverDirection;
  count: number;
  market?: TossOverviewRankingMarket;
  sourcePhase?: MarketTopMoversSourcePhase;
  fetchFn?: typeof fetch;
  certBaseUrl?: string;
  onDiagnostic?: (diagnostic: MarketTopMoversRankingDiagnostic) => void;
}

interface TossEnvelope<T> {
  result?: T;
}

interface TossOverviewRankingResult {
  products?: unknown;
}

interface TossOverviewRankingProduct {
  rank?: unknown;
  productCode?: unknown;
  name?: unknown;
  price?: {
    base?: unknown;
    close?: unknown;
    estimatedPrice?: unknown;
    marketVolume?: unknown;
    estimatedVolume?: unknown;
  };
}

export async function fetchTossOverviewRanking({
  direction,
  count,
  market = 'kr',
  sourcePhase = 'regular',
  fetchFn = fetch,
  certBaseUrl = DEFAULT_CERT_BASE_URL,
  onDiagnostic,
}: FetchTossOverviewRankingInput): Promise<MarketTopMoverItem[]> {
  const startedAt = Date.now();
  const safeCount = clampCount(count);
  try {
    const url = new URL('/api/v2/dashboard/wts/overview/ranking', normalizeBase(certBaseUrl));
    const body = {
      id: rankingIdFor(direction, sourcePhase),
      tag: market,
      duration: DEFAULT_DURATION,
      filters: [],
    };
    const response = await fetchFn(url.toString(), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        origin: 'https://www.tossinvest.com',
        referer: 'https://www.tossinvest.com/?market=kr&live-chart=heavy_soar&duration=1d',
        'user-agent': DEFAULT_BROWSER_USER_AGENT,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Toss overview ranking request failed: ${response.status}`);
    }
    const envelope = await response.json() as TossEnvelope<TossOverviewRankingResult>;
    const products = Array.isArray(envelope.result?.products) ? envelope.result.products : [];
    const items = mapTossOverviewRankingProducts(products).slice(0, safeCount);
    emitDiagnostic(onDiagnostic, {
      direction,
      pagesAttempted: 1,
      rowsReceived: products.length,
      rowsAccepted: items.length,
      rowsPerPage: [products.length],
      continuationValues: [null],
      stopReason: items.length >= safeCount
        ? 'complete'
        : stopReasonForPartial(products.length, items.length),
      durationMs: Date.now() - startedAt,
    });
    return items;
  } catch (err) {
    emitDiagnostic(onDiagnostic, {
      direction,
      pagesAttempted: 1,
      rowsReceived: 0,
      rowsAccepted: 0,
      rowsPerPage: [0],
      continuationValues: [null],
      stopReason: stopReasonForError(err),
      durationMs: Date.now() - startedAt,
    });
    throw err;
  }
}

export function mapTossOverviewRankingProducts(rawProducts: unknown[]): MarketTopMoverItem[] {
  const items: MarketTopMoverItem[] = [];
  for (const [index, raw] of rawProducts.entries()) {
    if (typeof raw !== 'object' || raw === null) continue;
    const product = raw as TossOverviewRankingProduct;
    const productCode = readString(product.productCode);
    const ticker = tickerFromProductCode(productCode);
    const name = readString(product.name);
    const base = readNumber(product.price?.base);
    const close = readNumber(product.price?.close ?? product.price?.estimatedPrice);
    if (ticker === null || name === null || base === null || close === null) continue;

    items.push({
      rank: readNumber(product.rank) ?? index + 1,
      ticker,
      name,
      price: close,
      changeAbs: close - base,
      changePct: base !== 0 ? ((close - base) / base) * 100 : 0,
      volume: readNumber(product.price?.marketVolume ?? product.price?.estimatedVolume),
    });
  }
  return items.map((item, index) => ({ ...item, rank: index + 1 }));
}

function rankingIdFor(
  direction: MarketTopMoverDirection,
  _sourcePhase: MarketTopMoversSourcePhase,
): 'heavy_soar' | 'heavy_descent' {
  return direction === 'gainers' ? 'heavy_soar' : 'heavy_descent';
}

function tickerFromProductCode(productCode: string | null): string | null {
  if (productCode === null) return null;
  const krMatch = /^A(\d{6})$/.exec(productCode);
  if (krMatch?.[1] !== undefined) return krMatch[1];
  return /^[A-Z0-9]{5,}$/.test(productCode) ? productCode : null;
}

function stopReasonForPartial(
  rowsReceived: number,
  rowsAccepted: number,
): MarketTopMoversStopReason {
  if (rowsReceived === 0 || rowsAccepted === 0) return 'no_continuation';
  return 'under_requested_limit';
}

function stopReasonForError(err: unknown): MarketTopMoversStopReason {
  const message = err instanceof Error ? err.message : String(err);
  if (/timeout/i.test(message)) return 'timeout';
  return 'malformed_response';
}

function emitDiagnostic(
  onDiagnostic: ((diagnostic: MarketTopMoversRankingDiagnostic) => void) | undefined,
  diagnostic: MarketTopMoversRankingDiagnostic,
): void {
  onDiagnostic?.({
    ...diagnostic,
    rowsPerPage: [...diagnostic.rowsPerPage],
    continuationValues: [...diagnostic.continuationValues],
  });
}

function clampCount(count: number): number {
  if (!Number.isFinite(count)) return MAX_RANKING_COUNT;
  return Math.min(MAX_RANKING_COUNT, Math.max(1, Math.trunc(count)));
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
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
