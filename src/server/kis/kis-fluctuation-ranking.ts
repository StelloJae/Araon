import type {
  MarketTopMoverDirection,
  MarketTopMoverItem,
} from '@shared/types.js';

import type { KisRestClient } from './kis-rest-client.js';

const FLUCTUATION_PATH = '/uapi/domestic-stock/v1/ranking/fluctuation';
const FLUCTUATION_TR_ID = 'FHPST01700000';
const OVERTIME_FLUCTUATION_PATH = '/uapi/domestic-stock/v1/ranking/overtime-fluctuation';
const OVERTIME_FLUCTUATION_TR_ID = 'FHPST02340000';
const MAX_RANKING_COUNT = 100;

interface KisFluctuationRow {
  data_rank?: unknown;
  stck_shrn_iscd?: unknown;
  hts_kor_isnm?: unknown;
  stck_prpr?: unknown;
  prdy_vrss?: unknown;
  prdy_ctrt?: unknown;
  acml_vol?: unknown;
}

interface KisFluctuationResponse {
  output?: unknown;
  output2?: unknown;
}

export interface FetchKisFluctuationRankingInput {
  direction: MarketTopMoverDirection;
  count: number;
  restClient: Pick<KisRestClient, 'request'>;
  now?: Date;
}

export async function fetchKisFluctuationRanking({
  direction,
  count,
  restClient,
  now = new Date(),
}: FetchKisFluctuationRankingInput): Promise<MarketTopMoverItem[]> {
  const safeCount = clampCount(count);
  if (isOvertimeWindow(now)) {
    const payload = await restClient.request<KisFluctuationResponse>({
      method: 'GET',
      path: OVERTIME_FLUCTUATION_PATH,
      trId: OVERTIME_FLUCTUATION_TR_ID,
      endpointClass: 'ranking',
      query: {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_MRKT_CLS_CODE: '',
        FID_COND_SCR_DIV_CODE: '20234',
        FID_INPUT_ISCD: '0000',
        FID_DIV_CLS_CODE: direction === 'gainers' ? '2' : '5',
        FID_INPUT_PRICE_1: '',
        FID_INPUT_PRICE_2: '',
        FID_VOL_CNT: '',
        FID_TRGT_CLS_CODE: '',
        FID_TRGT_EXLS_CLS_CODE: '',
      },
    });

    const rows = Array.isArray(payload.output2) ? payload.output2 : [];
    return mapKisOvertimeFluctuationRows(rows).slice(0, safeCount);
  }

  const payload = await restClient.request<KisFluctuationResponse>({
    method: 'GET',
    path: FLUCTUATION_PATH,
    trId: FLUCTUATION_TR_ID,
    endpointClass: 'ranking',
    query: {
      fid_cond_mrkt_div_code: 'J',
      fid_cond_scr_div_code: '20170',
      fid_input_iscd: '0000',
      fid_rank_sort_cls_code: direction === 'gainers' ? '0' : '3',
      fid_input_cnt_1: String(safeCount),
      fid_prc_cls_code: '0',
      fid_input_price_1: '',
      fid_input_price_2: '',
      fid_vol_cnt: '',
      fid_trgt_cls_code: '0',
      fid_trgt_exls_cls_code: '0',
      fid_div_cls_code: '0',
      fid_rsfl_rate1: '',
      fid_rsfl_rate2: '',
    },
  });

  const rows = Array.isArray(payload.output) ? payload.output : [];
  return mapKisFluctuationRows(rows).slice(0, safeCount);
}

export function mapKisFluctuationRows(rows: unknown[]): MarketTopMoverItem[] {
  const items: MarketTopMoverItem[] = [];
  for (const raw of rows) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as KisFluctuationRow;
    const rank = parseFiniteNumber(row.data_rank);
    const ticker = typeof row.stck_shrn_iscd === 'string' ? row.stck_shrn_iscd.trim() : '';
    const name = typeof row.hts_kor_isnm === 'string' ? row.hts_kor_isnm.trim() : '';
    const price = parseFiniteNumber(row.stck_prpr);
    const changePct = parseFiniteNumber(row.prdy_ctrt);
    if (
      rank === null ||
      !/^\d{6}$/.test(ticker) ||
      name.length === 0 ||
      price === null ||
      changePct === null
    ) {
      continue;
    }

    items.push({
      rank,
      ticker,
      name,
      price,
      changeAbs: parseOptionalNumber(row.prdy_vrss),
      changePct,
      volume: parseOptionalNumber(row.acml_vol),
    });
  }
  return items;
}

export function mapKisOvertimeFluctuationRows(rows: unknown[]): MarketTopMoverItem[] {
  const items: MarketTopMoverItem[] = [];
  for (const [index, raw] of rows.entries()) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as Record<string, unknown>;
    const ticker = typeof row['mksc_shrn_iscd'] === 'string'
      ? row['mksc_shrn_iscd'].trim()
      : '';
    const name = typeof row['hts_kor_isnm'] === 'string' ? row['hts_kor_isnm'].trim() : '';
    const price = parseFiniteNumber(row['ovtm_untp_prpr'] ?? row['stck_prpr']);
    const changePct = parseFiniteNumber(row['ovtm_untp_prdy_ctrt']);
    if (!/^\d{6}$/.test(ticker) || name.length === 0 || price === null || changePct === null) {
      continue;
    }

    items.push({
      rank: index + 1,
      ticker,
      name,
      price,
      changeAbs: parseOptionalNumber(row['ovtm_untp_prdy_vrss']),
      changePct,
      volume: parseOptionalNumber(row['ovtm_untp_vol'] ?? row['acml_vol']),
    });
  }
  return items;
}

function isOvertimeWindow(now: Date): boolean {
  const minutes = kstMinutes(now);
  return (
    (minutes >= 8 * 60 && minutes < 8 * 60 + 50) ||
    (minutes >= 15 * 60 + 30 && minutes < 20 * 60)
  );
}

function kstMinutes(now: Date): number {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

function clampCount(count: number): number {
  if (!Number.isFinite(count)) return MAX_RANKING_COUNT;
  return Math.min(MAX_RANKING_COUNT, Math.max(1, Math.trunc(count)));
}

function parseFiniteNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseOptionalNumber(value: unknown): number | null {
  return parseFiniteNumber(value);
}
