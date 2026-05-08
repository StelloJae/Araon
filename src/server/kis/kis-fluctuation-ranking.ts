import type {
  MarketTopMoverDirection,
  MarketTopMoverItem,
} from '@shared/types.js';

import type { KisRestClient } from './kis-rest-client.js';

const FLUCTUATION_PATH = '/uapi/domestic-stock/v1/ranking/fluctuation';
const FLUCTUATION_TR_ID = 'FHPST01700000';
const MAX_RANKING_COUNT = 100;
const KIS_ALL_RANKING_COUNT = '0';
const MAX_RANKING_PAGES = 10;
const KIS_CONTINUATION_DELAY_MS = 100;

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
  restClient: Pick<KisRestClient, 'request' | 'requestWithMeta'>;
  now?: Date;
  pageDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export async function fetchKisFluctuationRanking({
  direction,
  count,
  restClient,
  now: _now = new Date(),
  pageDelayMs = KIS_CONTINUATION_DELAY_MS,
  sleep = defaultSleep,
}: FetchKisFluctuationRankingInput): Promise<MarketTopMoverItem[]> {
  const safeCount = clampCount(count);
  const rows: unknown[] = [];
  let trCont = '';
  for (let page = 0; page < MAX_RANKING_PAGES; page += 1) {
    const response = await restClient.requestWithMeta<KisFluctuationResponse>({
      method: 'GET',
      path: FLUCTUATION_PATH,
      trId: FLUCTUATION_TR_ID,
      endpointClass: 'ranking',
      ...(trCont.length > 0 ? { headers: { tr_cont: trCont } } : {}),
      query: {
        fid_cond_mrkt_div_code: 'J',
        fid_cond_scr_div_code: '20170',
        fid_input_iscd: '0000',
        fid_rank_sort_cls_code: direction === 'gainers' ? '0' : '1',
        fid_input_cnt_1: KIS_ALL_RANKING_COUNT,
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

    if (Array.isArray(response.payload.output)) {
      rows.push(...response.payload.output);
    }

    const items = filterAndSortByDirection(mapKisFluctuationRows(rows), direction);
    if (items.length >= safeCount || response.headers.trCont !== 'M') {
      return items.slice(0, safeCount);
    }
    trCont = 'N';
    if (pageDelayMs > 0) {
      await sleep(pageDelayMs);
    }
  }

  return filterAndSortByDirection(mapKisFluctuationRows(rows), direction).slice(0, safeCount);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function clampCount(count: number): number {
  if (!Number.isFinite(count)) return MAX_RANKING_COUNT;
  return Math.min(MAX_RANKING_COUNT, Math.max(1, Math.trunc(count)));
}

function filterAndSortByDirection(
  items: MarketTopMoverItem[],
  direction: MarketTopMoverDirection,
): MarketTopMoverItem[] {
  const filtered = items.filter((item) =>
    direction === 'gainers' ? item.changePct > 0 : item.changePct < 0,
  );
  filtered.sort((a, b) =>
    direction === 'gainers' ? b.changePct - a.changePct : a.changePct - b.changePct,
  );
  return filtered.map((item, index) => ({ ...item, rank: index + 1 }));
}

function parseFiniteNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseOptionalNumber(value: unknown): number | null {
  return parseFiniteNumber(value);
}
