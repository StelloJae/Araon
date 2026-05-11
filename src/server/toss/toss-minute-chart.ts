import type { CandleSession, PriceCandle } from '@shared/types.js';
import {
  normalizeTossProductCode,
  tickerFromTossProductCode,
} from './toss-public-client.js';

const DEFAULT_INFO_BASE_URL = 'https://wts-info-api.tossinvest.com';
const DEFAULT_BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';
const DEFAULT_COUNT = 120;

export interface FetchTossMinuteCandlesOptions {
  ticker: string;
  dateYmd: string;
  toHms: string;
  source: 'toss-time-today' | 'toss-time-daily';
  now?: () => Date;
  fetchFn?: typeof fetch;
  infoBaseUrl?: string;
}

interface TossMinuteChartEnvelope {
  result?: {
    code?: unknown;
    candles?: unknown;
  };
}

interface TossMinuteChartCandleRow {
  dt?: unknown;
  open?: unknown;
  high?: unknown;
  low?: unknown;
  close?: unknown;
  volume?: unknown;
}

export function mapTossMinuteChartRows(
  ticker: string,
  rows: readonly unknown[],
  nowIso: string,
  source: 'toss-time-today' | 'toss-time-daily',
): PriceCandle[] {
  const candles: PriceCandle[] = [];

  for (const raw of rows) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as TossMinuteChartCandleRow;
    const dt = readString(row.dt);
    const bucketAt = bucketAtFromTossDateTime(dt);
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

    if (volume <= 0 && open === high && high === low && low === close) {
      continue;
    }

    candles.push({
      ticker,
      interval: '1m',
      bucketAt,
      session: sessionForTossDateTime(dt),
      open,
      high,
      low,
      close,
      volume: Math.max(0, Math.trunc(volume)),
      sampleCount: 1,
      source,
      isPartial: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  return candles.sort((a, b) => a.bucketAt.localeCompare(b.bucketAt));
}

export async function fetchTossMinuteCandles({
  ticker,
  dateYmd,
  toHms,
  source,
  now = () => new Date(),
  fetchFn = fetch,
  infoBaseUrl = DEFAULT_INFO_BASE_URL,
}: FetchTossMinuteCandlesOptions): Promise<PriceCandle[]> {
  const productCode = normalizeTossProductCode(ticker);
  if (
    productCode === null ||
    !/^A\d{6}$/.test(productCode) ||
    !/^\d{8}$/.test(dateYmd) ||
    !/^\d{6}$/.test(toHms)
  ) {
    throw new Error('Toss minute candles require a Korean stock ticker and KST cursor');
  }
  const normalizedTicker = tickerFromTossProductCode(productCode);
  if (normalizedTicker === null) {
    throw new Error('Toss minute candles require a Korean stock ticker and KST cursor');
  }

  const url = new URL(`/api/v1/c-chart/kr-s/${productCode}/min:1`, normalizeBase(infoBaseUrl));
  url.searchParams.set('count', String(DEFAULT_COUNT));
  url.searchParams.set('from', tossChartCursor(dateYmd, toHms));
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
    throw new Error(`Toss minute candle request failed: ${response.status}`);
  }
  const envelope = await response.json() as TossMinuteChartEnvelope;
  const rows = Array.isArray(envelope.result?.candles) ? envelope.result.candles : [];
  return mapTossMinuteChartRows(normalizedTicker, rows, now().toISOString(), source);
}

function tossChartCursor(dateYmd: string, toHms: string): string {
  return `${dateYmd.slice(0, 4)}-${dateYmd.slice(4, 6)}-${dateYmd.slice(6, 8)}T${toHms.slice(0, 2)}:${toHms.slice(2, 4)}:${toHms.slice(4, 6)}+09:00`;
}

function sessionForTossDateTime(value: string | null): CandleSession {
  if (value === null) return 'unknown';
  const match = /T(\d{2}):(\d{2})/.exec(value);
  if (match === null || match[1] === undefined || match[2] === undefined) return 'unknown';
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (minutes >= 8 * 60 && minutes < 8 * 60 + 50) return 'pre';
  if (minutes >= 9 * 60 && minutes < 15 * 60 + 30) return 'regular';
  if (minutes >= 15 * 60 + 30 && minutes < 20 * 60) return 'after';
  return 'unknown';
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
