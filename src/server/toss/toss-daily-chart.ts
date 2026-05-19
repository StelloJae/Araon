import type { PriceCandle } from '@shared/types.js';
import {
  normalizeTossProductCode,
  tickerFromTossProductCode,
} from './toss-public-client.js';

const DEFAULT_INFO_BASE_URL = 'https://wts-info-api.tossinvest.com';
const DEFAULT_BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';
const MAX_COUNT_PER_REQUEST = 150;
const MAX_PAGES = 5;

export interface FetchTossDailyCandlesOptions {
  ticker: string;
  fromYmd: string;
  toYmd: string;
  now?: () => Date;
  fetchFn?: typeof fetch;
  infoBaseUrl?: string;
}

interface TossChartEnvelope {
  result?: {
    code?: unknown;
    nextDateTime?: unknown;
    candles?: unknown;
  };
}

interface TossChartCandleRow {
  dt?: unknown;
  open?: unknown;
  high?: unknown;
  low?: unknown;
  close?: unknown;
  volume?: unknown;
}

export function mapTossDailyChartRows(
  ticker: string,
  rows: readonly unknown[],
  nowIso: string,
  fromYmd?: string,
  toYmd?: string,
): PriceCandle[] {
  const candles: PriceCandle[] = [];

  for (const raw of rows) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as TossChartCandleRow;
    const ymd = ymdFromTossDateTime(readString(row.dt));
    if (ymd === null) continue;
    if (fromYmd !== undefined && ymd < fromYmd) continue;
    if (toYmd !== undefined && ymd > toYmd) continue;

    const bucketAt = bucketAtFromTossDateTime(readString(row.dt));
    const open = readNumber(row.open);
    const high = readNumber(row.high);
    const low = readNumber(row.low);
    const close = readNumber(row.close);
    const volume = readNumber(row.volume);
    if (
      bucketAt === null ||
      open === null ||
      high === null ||
      low === null ||
      close === null ||
      volume === null
    ) {
      continue;
    }

    candles.push({
      ticker,
      interval: '1d',
      bucketAt,
      session: 'regular',
      open,
      high,
      low,
      close,
      volume: Math.max(0, Math.trunc(volume)),
      sampleCount: 1,
      source: 'toss-daily',
      isPartial: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  return candles.sort((a, b) => a.bucketAt.localeCompare(b.bucketAt));
}

export async function fetchTossDailyCandles({
  ticker,
  fromYmd,
  toYmd,
  now = () => new Date(),
  fetchFn = fetch,
  infoBaseUrl = DEFAULT_INFO_BASE_URL,
}: FetchTossDailyCandlesOptions): Promise<PriceCandle[]> {
  const productCode = normalizeTossProductCode(ticker);
  if (productCode === null || !/^A\d{6}$/.test(productCode)) {
    throw new Error('Toss daily candles require a Korean stock ticker');
  }
  const normalizedTicker = tickerFromTossProductCode(productCode);
  if (normalizedTicker === null) {
    throw new Error('Toss daily candles require a Korean stock ticker');
  }

  const nowIso = now().toISOString();
  const count = countForRange(fromYmd, toYmd);
  const seenCursors = new Set<string>();
  let cursor: string | null = tossChartCursorFromYmd(toYmd);
  const allRows: unknown[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    if (cursor === null || seenCursors.has(cursor)) break;
    seenCursors.add(cursor);
    const envelope = await fetchChartPage({
      fetchFn,
      infoBaseUrl,
      productCode,
      count,
      cursor,
    });
    const rows = Array.isArray(envelope.result?.candles) ? envelope.result.candles : [];
    if (rows.length === 0) break;
    allRows.push(...rows);

    const validYmds = rows
      .map((row) => {
        if (typeof row !== 'object' || row === null) return null;
        return ymdFromTossDateTime(readString((row as TossChartCandleRow).dt));
      })
      .filter((ymd): ymd is string => ymd !== null)
      .sort();
    const oldestYmd = validYmds[0] ?? null;
    if (oldestYmd === null || oldestYmd <= fromYmd) break;

    cursor = readString(envelope.result?.nextDateTime);
  }

  return mapTossDailyChartRows(normalizedTicker, allRows, nowIso, fromYmd, toYmd);
}

async function fetchChartPage({
  fetchFn,
  infoBaseUrl,
  productCode,
  count,
  cursor,
}: {
  fetchFn: typeof fetch;
  infoBaseUrl: string;
  productCode: string;
  count: number;
  cursor: string;
}): Promise<TossChartEnvelope> {
  const url = new URL(`/api/v1/c-chart/kr-s/${productCode}/day:1`, normalizeBase(infoBaseUrl));
  url.searchParams.set('count', String(count));
  url.searchParams.set('from', cursor);
  url.searchParams.set('session', 'all');
  url.searchParams.set('investMode', 'integrated');
  url.searchParams.set('useAdjustedRate', 'true');

  const response = await fetchFn(url.toString(), {
    headers: {
      accept: 'application/json',
      'user-agent': DEFAULT_BROWSER_USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`Toss daily candle request failed: ${response.status}`);
  }
  return response.json() as Promise<TossChartEnvelope>;
}

function countForRange(fromYmd: string, toYmd: string): number {
  const from = ymdToUtcMs(fromYmd);
  const to = ymdToUtcMs(toYmd);
  if (from === null || to === null || to < from) return 31;
  const days = Math.floor((to - from) / (24 * 60 * 60 * 1000)) + 1;
  return Math.min(MAX_COUNT_PER_REQUEST, Math.max(1, days + 15));
}

function tossChartCursorFromYmd(ymd: string): string | null {
  if (!/^\d{8}$/.test(ymd)) return null;
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T00:00:00+09:00`;
}

function ymdToUtcMs(ymd: string): number | null {
  if (!/^\d{8}$/.test(ymd)) return null;
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(4, 6)) - 1;
  const day = Number(ymd.slice(6, 8));
  const ms = Date.UTC(year, month, day, 0, 0, 0, 0);
  return Number.isNaN(ms) ? null : ms;
}

function ymdFromTossDateTime(value: string | null): string | null {
  if (value === null) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
  if (match === null) return null;
  return `${match[1]}${match[2]}${match[3]}`;
}

function bucketAtFromTossDateTime(value: string | null): string | null {
  if (value === null) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
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
