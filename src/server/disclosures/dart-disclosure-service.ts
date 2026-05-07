import AdmZip from 'adm-zip';
import type { StockDisclosureItem } from '@shared/types.js';
import type {
  DartCorpCode,
  DartCorpCodeRepository,
  StockDisclosureRepository,
} from '../db/repositories.js';

export interface DartDisclosureService {
  isConfigured(): boolean;
  refreshTicker(input: { ticker: string; now: Date }): Promise<StockDisclosureItem[]>;
}

export interface CreateDartDisclosureServiceOptions {
  apiKey?: string;
  corpCodeRepo: Pick<DartCorpCodeRepository, 'findByTicker' | 'upsertMany'>;
  disclosureRepo: Pick<StockDisclosureRepository, 'upsertMany'>;
  fetchCorpCodeZip?: (apiKey: string) => Promise<Buffer>;
  fetchDisclosureList?: (
    input: { apiKey: string; corpCode: string; fromYmd: string; toYmd: string; pageCount: number },
  ) => Promise<DartDisclosureListResponse>;
}

interface DartDisclosureListResponse {
  status: string;
  message?: string;
  list?: DartDisclosureRow[];
}

interface DartDisclosureRow {
  corp_cls: string;
  corp_name: string;
  corp_code: string;
  stock_code: string;
  report_nm: string;
  rcept_no: string;
  flr_nm: string;
  rcept_dt: string;
  rm: string;
}

const DART_CORP_CODE_URL = 'https://opendart.fss.or.kr/api/corpCode.xml';
const DART_DISCLOSURE_LIST_URL = 'https://opendart.fss.or.kr/api/list.json';

export function createDartDisclosureService(
  options: CreateDartDisclosureServiceOptions,
): DartDisclosureService {
  const apiKey = options.apiKey?.trim() ?? '';
  const fetchCorpCodeZip = options.fetchCorpCodeZip ?? defaultFetchCorpCodeZip;
  const fetchDisclosureList = options.fetchDisclosureList ?? defaultFetchDisclosureList;

  async function ensureCorpCode(ticker: string, now: Date): Promise<DartCorpCode | null> {
    const existing = options.corpCodeRepo.findByTicker(ticker);
    if (existing !== null) return existing;
    const buffer = await fetchCorpCodeZip(apiKey);
    const rows = parseDartCorpCodeZip(buffer, now.toISOString());
    options.corpCodeRepo.upsertMany(rows);
    return rows.find((row) => row.ticker === ticker) ?? null;
  }

  return {
    isConfigured(): boolean {
      return apiKey.length > 0;
    },

    async refreshTicker(input: { ticker: string; now: Date }): Promise<StockDisclosureItem[]> {
      if (apiKey.length === 0) return [];
      const corp = await ensureCorpCode(input.ticker, input.now);
      if (corp === null) return [];
      const response = await fetchDisclosureList({
        apiKey,
        corpCode: corp.corpCode,
        fromYmd: formatYmd(new Date(input.now.getTime() - 90 * 24 * 60 * 60 * 1000)),
        toYmd: formatYmd(input.now),
        pageCount: 100,
      });
      if (response.status !== '000' && response.status !== '013') {
        throw new Error(`dart disclosure fetch failed: ${response.status}`);
      }
      const fetchedAt = input.now.toISOString();
      const items = (response.list ?? [])
        .filter((row) => row.stock_code === input.ticker)
        .map((row) => ({
          ticker: input.ticker,
          source: 'dart' as const,
          kind: 'filing' as const,
          title: row.report_nm,
          url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(row.rcept_no)}`,
          publishedAt: parseDartDate(row.rcept_dt),
          fetchedAt,
        }));
      return options.disclosureRepo.upsertMany(items);
    },
  };
}

export function parseDartCorpCodeZip(buffer: Buffer, updatedAt: string): DartCorpCode[] {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntries().find((candidate) => candidate.entryName.toLowerCase().endsWith('.xml'));
  if (entry === undefined) return [];
  const xml = entry.getData().toString('utf8');
  const result: DartCorpCode[] = [];
  const listRe = /<list>([\s\S]*?)<\/list>/g;
  let match: RegExpExecArray | null;
  while ((match = listRe.exec(xml)) !== null) {
    const block = match[1] ?? '';
    const ticker = readXmlText(block, 'stock_code');
    if (!/^\d{6}$/.test(ticker)) continue;
    result.push({
      ticker,
      corpCode: readXmlText(block, 'corp_code'),
      corpName: readXmlText(block, 'corp_name'),
      stockName: readXmlText(block, 'corp_name'),
      updatedAt,
    });
  }
  return result;
}

async function defaultFetchCorpCodeZip(apiKey: string): Promise<Buffer> {
  const url = `${DART_CORP_CODE_URL}?crtfc_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`dart corp code fetch failed: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function defaultFetchDisclosureList(
  input: { apiKey: string; corpCode: string; fromYmd: string; toYmd: string; pageCount: number },
): Promise<DartDisclosureListResponse> {
  const url = new URL(DART_DISCLOSURE_LIST_URL);
  url.searchParams.set('crtfc_key', input.apiKey);
  url.searchParams.set('corp_code', input.corpCode);
  url.searchParams.set('bgn_de', input.fromYmd);
  url.searchParams.set('end_de', input.toYmd);
  url.searchParams.set('sort', 'date');
  url.searchParams.set('sort_mth', 'desc');
  url.searchParams.set('page_count', String(input.pageCount));
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`dart disclosure fetch failed: ${res.status}`);
  }
  return res.json() as Promise<DartDisclosureListResponse>;
}

function readXmlText(block: string, tag: string): string {
  return block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1]?.trim() ?? '';
}

function formatYmd(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}${value.month}${value.day}`;
}

function parseDartDate(value: string): string | null {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match === null) return null;
  const [, year, month, day] = match;
  return new Date(`${year}-${month}-${day}T00:00:00+09:00`).toISOString();
}
