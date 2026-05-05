import { z } from 'zod';
import type { PriceCandle } from '@shared/types.js';
import { KisRestError, type KisRestClient } from './kis-rest-client.js';

const DAILY_CHART_PATH = '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice';
const DAILY_CHART_TR_ID = 'FHKST03010100';
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const rowSchema = z.object({
  stck_bsop_date: z.string(),
  stck_oprc: z.string(),
  stck_hgpr: z.string(),
  stck_lwpr: z.string(),
  stck_clpr: z.string(),
  acml_vol: z.string(),
});

const responseSchema = z.object({
  output2: z.array(z.unknown()).default([]),
});

export interface FetchKisDailyCandlesOptions {
  ticker: string;
  fromYmd: string;
  toYmd: string;
  restClient: Pick<KisRestClient, 'request'>;
  now?: () => Date;
}

export interface ClassifiedKisBackfillError {
  code: 'KIS_RATE_LIMITED' | 'KIS_UNAUTHORIZED' | 'KIS_TEMPORARY_FAILURE' | 'KIS_BACKFILL_FAILED';
  cooldownMs: number | null;
}

function parseFiniteNumber(value: string): number | null {
  const numeric = Number(value.replaceAll(',', ''));
  return Number.isFinite(numeric) ? numeric : null;
}

function dailyBucketAt(ymd: string): string | null {
  if (!/^\d{8}$/.test(ymd)) return null;
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(4, 6)) - 1;
  const day = Number(ymd.slice(6, 8));
  const utcMs = Date.UTC(year, month, day, 0, 0, 0, 0) - KST_OFFSET_MS;
  const date = new Date(utcMs);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function mapKisDailyItemChartRows(
  ticker: string,
  rows: readonly unknown[],
  nowIso: string,
): PriceCandle[] {
  const candles: PriceCandle[] = [];

  for (const raw of rows) {
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) continue;

    const bucketAt = dailyBucketAt(parsed.data.stck_bsop_date);
    const open = parseFiniteNumber(parsed.data.stck_oprc);
    const high = parseFiniteNumber(parsed.data.stck_hgpr);
    const low = parseFiniteNumber(parsed.data.stck_lwpr);
    const close = parseFiniteNumber(parsed.data.stck_clpr);
    const volume = parseFiniteNumber(parsed.data.acml_vol);

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
      source: 'kis-daily',
      isPartial: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  return candles.sort((a, b) => a.bucketAt.localeCompare(b.bucketAt));
}

export async function fetchKisDailyCandles(
  options: FetchKisDailyCandlesOptions,
): Promise<PriceCandle[]> {
  const raw = await options.restClient.request<unknown>({
    method: 'GET',
    path: DAILY_CHART_PATH,
    trId: DAILY_CHART_TR_ID,
    query: {
      FID_COND_MRKT_DIV_CODE: 'UN',
      FID_INPUT_ISCD: options.ticker,
      FID_INPUT_DATE_1: options.fromYmd,
      FID_INPUT_DATE_2: options.toYmd,
      FID_PERIOD_DIV_CODE: 'D',
      FID_ORG_ADJ_PRC: '0',
    },
  });
  const parsed = responseSchema.parse(raw);
  return mapKisDailyItemChartRows(
    options.ticker,
    parsed.output2,
    (options.now ?? (() => new Date()))().toISOString(),
  );
}

export function classifyKisDailyBackfillError(err: unknown): ClassifiedKisBackfillError {
  if (err instanceof KisRestError) {
    if (err.status === 429 || err.msgCd === 'EGW00201') {
      return { code: 'KIS_RATE_LIMITED', cooldownMs: 10 * 60 * 1000 };
    }
    if (err.status === 401 || err.status === 403) {
      return { code: 'KIS_UNAUTHORIZED', cooldownMs: null };
    }
    if (err.status >= 500) {
      return { code: 'KIS_TEMPORARY_FAILURE', cooldownMs: 5 * 60 * 1000 };
    }
  }
  return { code: 'KIS_BACKFILL_FAILED', cooldownMs: null };
}
