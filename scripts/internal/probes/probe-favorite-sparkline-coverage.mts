/**
 * Read-only favorite sparkline coverage probe.
 *
 * Purpose:
 * - Check that user-facing KR watchlist/holding rows have enough real
 *   price-history points to render a sparkline.
 * - Keep watchlist values redacted: output only aggregate counts and hashed
 *   row ids, never raw product codes, tickers, account/session data, or orders.
 *
 * Usage:
 *   npx tsx scripts/internal/probes/probe-favorite-sparkline-coverage.mts
 *   npx tsx scripts/internal/probes/probe-favorite-sparkline-coverage.mts --base-url=http://127.0.0.1:3000 --require-complete
 */

import { createHash } from 'node:crypto';

const DEFAULT_BASE_URL = 'http://127.0.0.1:3000';
const DEFAULT_MIN_POINTS = 2;

interface WatchlistEnvelope {
  success?: boolean;
  data?: {
    items?: WatchlistItem[];
  };
}

interface WatchlistItem {
  krTicker?: unknown;
  chartEligible?: unknown;
  quoteEligible?: unknown;
  holding?: unknown;
  watchlistMember?: unknown;
  watchSurfaceMember?: unknown;
}

interface PriceHistoryEnvelope {
  success?: boolean;
  data?: {
    items?: PriceHistoryItem[];
  };
}

interface PriceHistoryItem {
  price?: unknown;
  source?: unknown;
}

interface RowResult {
  rowId: string;
  status: 'renderable' | 'flat' | 'missing' | 'failed';
  pointCount: number;
  uniquePriceCount: number;
  sourceCount: number;
}

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function redactedRowId(ticker: string): string {
  return createHash('sha256').update(`araon-watchlist:${ticker}`).digest('hex').slice(0, 12);
}

function readKrTicker(item: WatchlistItem): string | null {
  return typeof item.krTicker === 'string' && /^\d{6}$/.test(item.krTicker)
    ? item.krTicker
    : null;
}

function isUserFacingRow(item: WatchlistItem): boolean {
  return item.watchSurfaceMember === true ||
    item.watchlistMember === true ||
    item.holding === true;
}

function isCoveredKrRow(item: WatchlistItem): item is WatchlistItem & { krTicker: string } {
  return (
    isUserFacingRow(item) &&
    item.chartEligible === true &&
    item.quoteEligible === true &&
    readKrTicker(item) !== null
  );
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`request failed: ${response.status}`);
  }
  return await response.json() as T;
}

async function checkTicker(baseUrl: string, ticker: string, minPoints: number): Promise<RowResult> {
  try {
    const encoded = encodeURIComponent(ticker);
    const url = `${baseUrl}/stocks/${encoded}/price-history?range=1d&includeCandleSeed=true`;
    const body = await getJson<PriceHistoryEnvelope>(url);
    const items = Array.isArray(body.data?.items) ? body.data.items : [];
    const prices = items
      .map((item) => (typeof item.price === 'number' && Number.isFinite(item.price) ? item.price : null))
      .filter((price): price is number => price !== null && price > 0);
    const sources = new Set(
      items
        .map((item) => (typeof item.source === 'string' ? item.source : null))
        .filter((source): source is string => source !== null && source.length > 0),
    );
    const uniquePriceCount = new Set(prices).size;
    const status =
      prices.length < minPoints
        ? 'missing'
        : uniquePriceCount <= 1
          ? 'flat'
          : 'renderable';
    return {
      rowId: redactedRowId(ticker),
      status,
      pointCount: prices.length,
      uniquePriceCount,
      sourceCount: sources.size,
    };
  } catch {
    return {
      rowId: redactedRowId(ticker),
      status: 'failed',
      pointCount: 0,
      uniquePriceCount: 0,
      sourceCount: 0,
    };
  }
}

async function main(): Promise<void> {
  const baseUrl = normalizeBaseUrl(argValue('base-url') ?? DEFAULT_BASE_URL);
  const minPoints = Number(argValue('min-points') ?? DEFAULT_MIN_POINTS);
  const minRenderablePoints = Number.isFinite(minPoints) && minPoints > 0
    ? Math.trunc(minPoints)
    : DEFAULT_MIN_POINTS;

  const watchlist = await getJson<WatchlistEnvelope>(`${baseUrl}/watchlist`);
  const items = Array.isArray(watchlist.data?.items) ? watchlist.data.items : [];
  const eligibleTickers = Array.from(
    new Set(items.filter(isCoveredKrRow).map((item) => readKrTicker(item)).filter(Boolean)),
  ) as string[];

  const rows = await Promise.all(
    eligibleTickers.map((ticker) => checkTicker(baseUrl, ticker, minRenderablePoints)),
  );
  const counts = {
    checked: rows.length,
    renderable: rows.filter((row) => row.status === 'renderable').length,
    flat: rows.filter((row) => row.status === 'flat').length,
    missing: rows.filter((row) => row.status === 'missing').length,
    failed: rows.filter((row) => row.status === 'failed').length,
    skippedNonKrOrUnsupported: items.length - eligibleTickers.length,
  };
  const complete =
    counts.checked > 0 &&
    counts.renderable === counts.checked &&
    counts.flat === 0 &&
    counts.missing === 0 &&
    counts.failed === 0;
  const report = {
    provider: 'favorite-sparkline-coverage',
    baseUrl,
    minRenderablePoints,
    rawWatchlistValuesExposed: false,
    complete,
    counts,
    rows,
  };

  console.log(JSON.stringify(report, null, 2));
  if (hasFlag('require-complete') && !complete) {
    process.exitCode = 1;
  }
}

main().catch(() => {
  console.error(JSON.stringify({
    provider: 'favorite-sparkline-coverage',
    outcome: 'failed',
    rawWatchlistValuesExposed: false,
  }));
  process.exitCode = 1;
});
