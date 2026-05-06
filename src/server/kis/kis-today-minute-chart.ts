import { z } from 'zod';
import type { PriceCandle } from '@shared/types.js';
import { KisRestError, type KisRestClient } from './kis-rest-client.js';

const TODAY_MINUTE_CHART_PATH = '/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice';
const TODAY_MINUTE_CHART_TR_ID = 'FHKST03010200';
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const rowSchema = z.object({
  stck_bsop_date: z.string(),
  stck_cntg_hour: z.string(),
  stck_prpr: z.string(),
  stck_oprc: z.string(),
  stck_hgpr: z.string(),
  stck_lwpr: z.string(),
  cntg_vol: z.string().optional(),
  acml_vol: z.string().optional(),
});

const responseSchema = z.object({
  output2: z.array(z.unknown()).default([]),
});

export interface FetchKisTodayMinuteCandlesOptions {
  ticker: string;
  toHms: string;
  restClient: Pick<KisRestClient, 'request'>;
  now?: () => Date;
}

export interface ClassifiedKisMinuteBackfillError {
  code:
    | 'KIS_RATE_LIMITED'
    | 'KIS_UNAUTHORIZED'
    | 'KIS_TEMPORARY_FAILURE'
    | 'KIS_MINUTE_BACKFILL_FAILED';
  cooldownMs: number | null;
}

function parseFiniteNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const numeric = Number(value.replaceAll(',', ''));
  return Number.isFinite(numeric) ? numeric : null;
}

function minuteBucketAt(ymd: string, hms: string): string | null {
  if (!/^\d{8}$/.test(ymd) || !/^\d{6}$/.test(hms)) return null;
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(4, 6)) - 1;
  const day = Number(ymd.slice(6, 8));
  const hour = Number(hms.slice(0, 2));
  const minute = Number(hms.slice(2, 4));
  const utcMs = Date.UTC(year, month, day, hour, minute, 0, 0) - KST_OFFSET_MS;
  const date = new Date(utcMs);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function mapKisTodayMinuteItemChartRows(
  ticker: string,
  rows: readonly unknown[],
  nowIso: string,
): PriceCandle[] {
  const candles: PriceCandle[] = [];

  for (const raw of rows) {
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) continue;

    const bucketAt = minuteBucketAt(
      parsed.data.stck_bsop_date,
      parsed.data.stck_cntg_hour,
    );
    const close = parseFiniteNumber(parsed.data.stck_prpr);
    const open = parseFiniteNumber(parsed.data.stck_oprc);
    const high = parseFiniteNumber(parsed.data.stck_hgpr);
    const low = parseFiniteNumber(parsed.data.stck_lwpr);
    const volume = parseFiniteNumber(parsed.data.cntg_vol ?? parsed.data.acml_vol);

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
      interval: '1m',
      bucketAt,
      session: 'regular',
      open,
      high,
      low,
      close,
      volume: Math.max(0, Math.trunc(volume)),
      sampleCount: 1,
      source: 'kis-time-today',
      isPartial: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  return candles.sort((a, b) => a.bucketAt.localeCompare(b.bucketAt));
}

export async function fetchKisTodayMinuteCandles(
  options: FetchKisTodayMinuteCandlesOptions,
): Promise<PriceCandle[]> {
  const raw = await options.restClient.request<unknown>({
    method: 'GET',
    path: TODAY_MINUTE_CHART_PATH,
    trId: TODAY_MINUTE_CHART_TR_ID,
    query: {
      FID_ETC_CLS_CODE: '',
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_INPUT_ISCD: options.ticker,
      FID_INPUT_HOUR_1: options.toHms,
      FID_PW_DATA_INCU_YN: 'Y',
    },
  });
  const parsed = responseSchema.parse(raw);
  return mapKisTodayMinuteItemChartRows(
    options.ticker,
    parsed.output2,
    (options.now ?? (() => new Date()))().toISOString(),
  );
}

export function classifyKisMinuteBackfillError(err: unknown): ClassifiedKisMinuteBackfillError {
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
  return { code: 'KIS_MINUTE_BACKFILL_FAILED', cooldownMs: null };
}
