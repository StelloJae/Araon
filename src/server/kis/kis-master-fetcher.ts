/**
 * Fetches and parses KIS KOSPI/KOSDAQ master files (`*.mst`) for the local
 * KRX universe used by master search and 자동 sector 분류 (B1a).
 *
 * Sources (publicly downloadable, no auth):
 *   - https://new.real.download.dws.co.kr/common/master/kospi_code.mst.zip
 *   - https://new.real.download.dws.co.kr/common/master/kosdaq_code.mst.zip
 *
 * On-disk format (per row, CP949):
 *   Head (variable width, padded with spaces):
 *     [0..8]   단축코드 (ticker, fixed 9 chars, right-padded)
 *     [9..20]  표준코드 (12 chars, e.g. "KR7005930003")
 *     [21..]   한글종목명 (variable, padded)
 *   Rear (fixed width):
 *     KOSPI  → 228 chars (70 fields)
 *     KOSDAQ → 222 chars (63 fields)
 *
 * Layout offsets and field names are ported verbatim from KIS official
 * `kis_kospi_code_mst.py` / `kis_kosdaq_code_mst.py` samples.
 *
 * IMPORTANT — `+1` rear shift:
 *   The Python sample reads `row[-228:]` (or 222) which includes the trailing
 *   `'\n'` from the file. `pd.read_fwf` then strips that newline, so the
 *   field offsets KIS publishes are computed against `data[-227:]` (or 221),
 *   one char SHIFTED to the right relative to pure data. We split lines on
 *   `/\r?\n/` and slice pure data, so we apply the `+1` shift internally
 *   when matching field offsets to KIS's field_specs.
 *
 *   Empirically validated against live mst (2026-04-27) for:
 *     005380 현대차    → KRX자동차 = Y
 *     068270 셀트리온  → KRX바이오 = Y
 *     105560 KB금융    → KRX은행   = Y
 *     042700 한미반도체 → KRX반도체 = Y
 *     000660 SK하이닉스 → KRX반도체 = Y
 *
 * Anything beyond classification (전일거래량 / 액면가 / 시가총액 / ROE /
 * 매출액 …) is parsed but currently discarded — left available for future
 * features without re-touching this module.
 */

import iconv from 'iconv-lite';
import AdmZip from 'adm-zip';
import { createChildLogger } from '@shared/logger.js';

const log = createChildLogger('kis-master-fetcher');

const KOSPI_URL = 'https://new.real.download.dws.co.kr/common/master/kospi_code.mst.zip';
const KOSDAQ_URL = 'https://new.real.download.dws.co.kr/common/master/kosdaq_code.mst.zip';

const KOSPI_REAR_WIDTH = 228;
const KOSDAQ_REAR_WIDTH = 222;

const TICKER_FIELD = 9;
const STANDARD_CODE_FIELD = 12;

export class KisMasterFetchError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'KisMasterFetchError';
  }
}

// === Public types =============================================================

export type YNFlag = 'Y' | 'N';

export interface KrxSectorMembership {
  krxAuto: YNFlag | null;
  krxSemiconductor: YNFlag | null;
  krxBio: YNFlag | null;
  krxBank: YNFlag | null;
  krxEnergyChem: YNFlag | null;
  krxSteel: YNFlag | null;
  krxMediaTel: YNFlag | null;
  krxConstruction: YNFlag | null;
  krxSecurities: YNFlag | null;
  krxShip: YNFlag | null;
  krxInsurance: YNFlag | null;
  krxTransport: YNFlag | null;
}

export interface MasterStockClassification {
  /** "ST" = regular stock; "BC"/"EF"/"EN"/etc = fund / ETF / ETN / REIT. */
  securityGroupCode: string | null;
  /** Numeric size code as a string ("1"/"2"/"3" or other KIS-defined). */
  marketCapSize: string | null;
  /** Index industry codes (4 digits each, raw). */
  indexIndustryLarge: string | null;
  indexIndustryMiddle: string | null;
  indexIndustrySmall: string | null;
  /** KRX sector index membership flags. */
  krxSector: KrxSectorMembership;
  /** Listing date as YYYYMMDD if present, else null. */
  listedAt: string | null;
}

export interface MasterStockRow {
  ticker: string;
  name: string;
  market: 'KOSPI' | 'KOSDAQ';
  standardCode: string | null;
  /**
   * @deprecated Kept null for backward compatibility. Replaced by
   * `classification.marketCapSize` in B1a.
   */
  marketCapTier: string | null;
  /** B1a — full classification block. Always present (fields may be null). */
  classification: MasterStockClassification;
}

// === KIS official field specs =================================================
// Widths and column names are ported verbatim from
// koreainvestment/open-trading-api stocks_info samples (2025-07-09 commit).

interface FieldSpec {
  readonly name: string;
  readonly width: number;
}

const KOSPI_FIELD_SPECS: readonly FieldSpec[] = [
  { name: '그룹코드', width: 2 },
  { name: '시가총액규모', width: 1 },
  { name: '지수업종대분류', width: 4 },
  { name: '지수업종중분류', width: 4 },
  { name: '지수업종소분류', width: 4 },
  { name: '제조업', width: 1 },
  { name: '저유동성', width: 1 },
  { name: '지배구조지수종목', width: 1 },
  { name: 'KOSPI200섹터업종', width: 1 },
  { name: 'KOSPI100', width: 1 },
  { name: 'KOSPI50', width: 1 },
  { name: 'KRX', width: 1 },
  { name: 'ETP', width: 1 },
  { name: 'ELW발행', width: 1 },
  { name: 'KRX100', width: 1 },
  { name: 'KRX자동차', width: 1 },
  { name: 'KRX반도체', width: 1 },
  { name: 'KRX바이오', width: 1 },
  { name: 'KRX은행', width: 1 },
  { name: 'SPAC', width: 1 },
  { name: 'KRX에너지화학', width: 1 },
  { name: 'KRX철강', width: 1 },
  { name: '단기과열', width: 1 },
  { name: 'KRX미디어통신', width: 1 },
  { name: 'KRX건설', width: 1 },
  { name: 'Non1', width: 1 },
  { name: 'KRX증권', width: 1 },
  { name: 'KRX선박', width: 1 },
  { name: 'KRX섹터_보험', width: 1 },
  { name: 'KRX섹터_운송', width: 1 },
  { name: 'SRI', width: 1 },
  { name: '기준가', width: 9 },
  { name: '매매수량단위', width: 5 },
  { name: '시간외수량단위', width: 5 },
  { name: '거래정지', width: 1 },
  { name: '정리매매', width: 1 },
  { name: '관리종목', width: 1 },
  { name: '시장경고', width: 2 },
  { name: '경고예고', width: 1 },
  { name: '불성실공시', width: 1 },
  { name: '우회상장', width: 1 },
  { name: '락구분', width: 2 },
  { name: '액면변경', width: 2 },
  { name: '증자구분', width: 2 },
  { name: '증거금비율', width: 3 },
  { name: '신용가능', width: 1 },
  { name: '신용기간', width: 3 },
  { name: '전일거래량', width: 12 },
  { name: '액면가', width: 12 },
  { name: '상장일자', width: 8 },
  { name: '상장주수', width: 15 },
  { name: '자본금', width: 21 },
  { name: '결산월', width: 2 },
  { name: '공모가', width: 7 },
  { name: '우선주', width: 1 },
  { name: '공매도과열', width: 1 },
  { name: '이상급등', width: 1 },
  { name: 'KRX300', width: 1 },
  { name: 'KOSPI', width: 1 },
  { name: '매출액', width: 9 },
  { name: '영업이익', width: 9 },
  { name: '경상이익', width: 9 },
  { name: '당기순이익', width: 5 },
  { name: 'ROE', width: 9 },
  { name: '기준년월', width: 8 },
  { name: '시가총액', width: 9 },
  { name: '그룹사코드', width: 3 },
  { name: '회사신용한도초과', width: 1 },
  { name: '담보대출가능', width: 1 },
  { name: '대주가능', width: 1 },
];

const KOSDAQ_FIELD_SPECS: readonly FieldSpec[] = [
  { name: '증권그룹구분코드', width: 2 },
  { name: '시가총액규모', width: 1 },
  { name: '지수업종대분류', width: 4 },
  { name: '지수업종중분류', width: 4 },
  { name: '지수업종소분류', width: 4 },
  { name: '벤처기업', width: 1 },
  { name: '저유동성', width: 1 },
  { name: 'KRX', width: 1 },
  { name: 'ETP', width: 1 },
  { name: 'KRX100', width: 1 },
  { name: 'KRX자동차', width: 1 },
  { name: 'KRX반도체', width: 1 },
  { name: 'KRX바이오', width: 1 },
  { name: 'KRX은행', width: 1 },
  { name: 'SPAC', width: 1 },
  { name: 'KRX에너지화학', width: 1 },
  { name: 'KRX철강', width: 1 },
  { name: '단기과열', width: 1 },
  { name: 'KRX미디어통신', width: 1 },
  { name: 'KRX건설', width: 1 },
  { name: '투자주의환기', width: 1 },
  { name: 'KRX증권', width: 1 },
  { name: 'KRX선박', width: 1 },
  { name: 'KRX섹터_보험', width: 1 },
  { name: 'KRX섹터_운송', width: 1 },
  { name: 'KOSDAQ150', width: 1 },
  { name: '기준가', width: 9 },
  { name: '매매수량단위', width: 5 },
  { name: '시간외수량단위', width: 5 },
  { name: '거래정지', width: 1 },
  { name: '정리매매', width: 1 },
  { name: '관리종목', width: 1 },
  { name: '시장경고', width: 2 },
  { name: '경고예고', width: 1 },
  { name: '불성실공시', width: 1 },
  { name: '우회상장', width: 1 },
  { name: '락구분', width: 2 },
  { name: '액면변경', width: 2 },
  { name: '증자구분', width: 2 },
  { name: '증거금비율', width: 3 },
  { name: '신용가능', width: 1 },
  { name: '신용기간', width: 3 },
  { name: '전일거래량', width: 12 },
  { name: '액면가', width: 12 },
  { name: '상장일자', width: 8 },
  { name: '상장주수', width: 15 },
  { name: '자본금', width: 21 },
  { name: '결산월', width: 2 },
  { name: '공모가', width: 7 },
  { name: '우선주', width: 1 },
  { name: '공매도과열', width: 1 },
  { name: '이상급등', width: 1 },
  { name: 'KRX300', width: 1 },
  { name: '매출액', width: 9 },
  { name: '영업이익', width: 9 },
  { name: '경상이익', width: 9 },
  { name: '단기순이익', width: 5 },
  { name: 'ROE', width: 9 },
  { name: '기준년월', width: 8 },
  { name: '시가총액', width: 9 },
  { name: '그룹사코드', width: 3 },
  { name: '회사신용한도초과', width: 1 },
  { name: '담보대출가능', width: 1 },
  { name: '대주가능', width: 1 },
];

// === Parsing helpers ==========================================================

export function decodeMasterZip(zipBuffer: Buffer): string {
  let entries;
  try {
    entries = new AdmZip(zipBuffer).getEntries();
  } catch (err) {
    throw new KisMasterFetchError('failed to open KIS master zip', { cause: err });
  }
  if (entries.length === 0) {
    throw new KisMasterFetchError('KIS master zip is empty');
  }
  const entry = entries[0]!;
  const raw = entry.getData();
  return iconv.decode(raw, 'cp949');
}

/**
 * Slice fixed-width fields from the rear payload. The leading `+1` shift
 * (see file header) is applied here so callers pass pure-data rears.
 */
function parseRearFields(rear: string, specs: readonly FieldSpec[]): Map<string, string> {
  const out = new Map<string, string>();
  let offset = 1; // align with KIS field_specs (Python sees data[-(N-1):] effectively)
  for (const spec of specs) {
    if (offset >= rear.length) {
      out.set(spec.name, '');
      continue;
    }
    const end = Math.min(offset + spec.width, rear.length);
    out.set(spec.name, rear.slice(offset, end));
    offset = end;
  }
  return out;
}

function pickYN(raw: string | undefined): YNFlag | null {
  if (raw === undefined) return null;
  const t = raw.trim();
  if (t === 'Y') return 'Y';
  if (t === 'N') return 'N';
  return null;
}

function pickStr(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

function extractClassification(
  fields: Map<string, string>,
  market: 'KOSPI' | 'KOSDAQ',
): MasterStockClassification {
  const groupKey = market === 'KOSPI' ? '그룹코드' : '증권그룹구분코드';
  return {
    securityGroupCode: pickStr(fields.get(groupKey)),
    marketCapSize: pickStr(fields.get('시가총액규모')),
    indexIndustryLarge: pickStr(fields.get('지수업종대분류')),
    indexIndustryMiddle: pickStr(fields.get('지수업종중분류')),
    indexIndustrySmall: pickStr(fields.get('지수업종소분류')),
    krxSector: {
      krxAuto: pickYN(fields.get('KRX자동차')),
      krxSemiconductor: pickYN(fields.get('KRX반도체')),
      krxBio: pickYN(fields.get('KRX바이오')),
      krxBank: pickYN(fields.get('KRX은행')),
      krxEnergyChem: pickYN(fields.get('KRX에너지화학')),
      krxSteel: pickYN(fields.get('KRX철강')),
      krxMediaTel: pickYN(fields.get('KRX미디어통신')),
      krxConstruction: pickYN(fields.get('KRX건설')),
      krxSecurities: pickYN(fields.get('KRX증권')),
      krxShip: pickYN(fields.get('KRX선박')),
      krxInsurance: pickYN(fields.get('KRX섹터_보험')),
      krxTransport: pickYN(fields.get('KRX섹터_운송')),
    },
    listedAt: pickStr(fields.get('상장일자')),
  };
}

const EMPTY_KRX_SECTOR: KrxSectorMembership = {
  krxAuto: null,
  krxSemiconductor: null,
  krxBio: null,
  krxBank: null,
  krxEnergyChem: null,
  krxSteel: null,
  krxMediaTel: null,
  krxConstruction: null,
  krxSecurities: null,
  krxShip: null,
  krxInsurance: null,
  krxTransport: null,
};

const EMPTY_CLASSIFICATION: MasterStockClassification = {
  securityGroupCode: null,
  marketCapSize: null,
  indexIndustryLarge: null,
  indexIndustryMiddle: null,
  indexIndustrySmall: null,
  krxSector: EMPTY_KRX_SECTOR,
  listedAt: null,
};

// === Parser ===================================================================

/**
 * Parse a CP949-decoded master file into rows.
 *
 * Uses fixed-width head slicing per KIS official sample:
 *   - [0..8]  ticker
 *   - [9..20] standardCode
 *   - [21..]  name (rest of head minus rear)
 *
 * This correctly handles non-6-digit tickers (펀드/리츠/ELW codes like
 * "F70900001") that the previous space-separated parser was mangling.
 */
export function parseMasterFile(
  text: string,
  market: 'KOSPI' | 'KOSDAQ',
): MasterStockRow[] {
  const rearWidth = market === 'KOSPI' ? KOSPI_REAR_WIDTH : KOSDAQ_REAR_WIDTH;
  const specs = market === 'KOSPI' ? KOSPI_FIELD_SPECS : KOSDAQ_FIELD_SPECS;

  const out: MasterStockRow[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine.length === 0) continue;
    if (rawLine.length <= rearWidth + TICKER_FIELD) continue; // too short

    const head = rawLine.slice(0, rawLine.length - rearWidth);
    const rear = rawLine.slice(rawLine.length - rearWidth);

    if (head.length < TICKER_FIELD + STANDARD_CODE_FIELD) continue;

    const ticker = head.slice(0, TICKER_FIELD).trimEnd();
    if (ticker.length === 0) continue;

    const stdCandidate = head.slice(TICKER_FIELD, TICKER_FIELD + STANDARD_CODE_FIELD).trim();
    // KR-prefixed ISIN (e.g. KR7005930003); reject anything else so a malformed
    // row doesn't poison the catalog with a bogus standardCode.
    const standardCode = /^KR[A-Z0-9]{10}$/.test(stdCandidate) ? stdCandidate : null;

    const name = head.slice(TICKER_FIELD + STANDARD_CODE_FIELD).trim();
    if (name.length === 0) continue;

    const fields = parseRearFields(rear, specs);
    const classification = extractClassification(fields, market);

    out.push({
      ticker,
      name,
      market,
      standardCode,
      marketCapTier: null,
      classification,
    });
  }

  return out;
}

// === Fetch + combine ==========================================================

export interface FetchMasterResult {
  kospi: MasterStockRow[];
  kosdaq: MasterStockRow[];
  /** Combined list, deduped by ticker (KOSPI wins on collision — rare). */
  combined: MasterStockRow[];
}

export interface FetchMasterDeps {
  /** Defaults to global `fetch` if omitted (used by tests to stub). */
  download?: (url: string) => Promise<Buffer>;
}

async function defaultDownload(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new KisMasterFetchError(`HTTP ${res.status} fetching ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function fetchMaster(deps: FetchMasterDeps = {}): Promise<FetchMasterResult> {
  const download = deps.download ?? defaultDownload;
  log.info({ kospiUrl: KOSPI_URL, kosdaqUrl: KOSDAQ_URL }, 'fetching KIS master files');

  let kospiZip: Buffer;
  let kosdaqZip: Buffer;
  try {
    [kospiZip, kosdaqZip] = await Promise.all([
      download(KOSPI_URL),
      download(KOSDAQ_URL),
    ]);
  } catch (err) {
    throw new KisMasterFetchError('failed to download KIS master files', { cause: err });
  }

  const kospiText = decodeMasterZip(kospiZip);
  const kosdaqText = decodeMasterZip(kosdaqZip);

  const kospi = parseMasterFile(kospiText, 'KOSPI');
  const kosdaq = parseMasterFile(kosdaqText, 'KOSDAQ');

  // Dedup by ticker (KOSPI wins on rare collision).
  const seen = new Set<string>();
  const combined: MasterStockRow[] = [];
  for (const row of [...kospi, ...kosdaq]) {
    if (seen.has(row.ticker)) continue;
    seen.add(row.ticker);
    combined.push(row);
  }

  log.info(
    { kospiCount: kospi.length, kosdaqCount: kosdaq.length, combined: combined.length },
    'KIS master parse complete',
  );

  return { kospi, kosdaq, combined };
}

// === Test-only exports ========================================================

export const __test__ = {
  parseRearFields,
  extractClassification,
  EMPTY_CLASSIFICATION,
  KOSPI_FIELD_SPECS,
  KOSDAQ_FIELD_SPECS,
};
