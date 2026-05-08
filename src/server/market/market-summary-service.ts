import iconv from 'iconv-lite';
import type {
  MarketTapeIndicator,
  MarketTapeIndicatorId,
  MarketTapeSummary,
} from '@shared/types.js';

const NAVER_INDEX_URL = 'https://finance.naver.com/sise/sise_index.naver';
const NAVER_MARKET_INDEX_URL = 'https://finance.naver.com/marketindex/';
const DEFAULT_TTL_MS = 5 * 60_000;

interface ParsedNumberMove {
  value: number;
  change: number | null;
  changePct: number | null;
}

interface ParsedMarketIndexPage {
  usdKrw: ParsedNumberMove | null;
  wti: ParsedNumberMove | null;
}

type FetchText = (url: string) => Promise<string>;

export interface MarketSummaryService {
  getSummary(): Promise<MarketTapeSummary>;
}

export interface CreateMarketSummaryServiceOptions {
  fetchText?: FetchText;
  now?: () => Date;
  ttlMs?: number;
}

export function createMarketSummaryService(
  options: CreateMarketSummaryServiceOptions = {},
): MarketSummaryService {
  const fetchText = options.fetchText ?? fetchNaverEucKrText;
  const now = options.now ?? (() => new Date());
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  let cache: { expiresAt: number; summary: MarketTapeSummary } | null = null;

  return {
    async getSummary() {
      const current = now();
      if (cache !== null && cache.expiresAt > current.getTime()) {
        return cache.summary;
      }

      const generatedAt = current.toISOString();
      const [kospi, kosdaq, marketIndex] = await Promise.allSettled([
        fetchText(`${NAVER_INDEX_URL}?code=KOSPI`).then(parseNaverIndexPage),
        fetchText(`${NAVER_INDEX_URL}?code=KOSDAQ`).then(parseNaverIndexPage),
        fetchText(NAVER_MARKET_INDEX_URL).then(parseNaverMarketIndexPage),
      ]);

      const indicators: MarketTapeIndicator[] = [
        toIndicator('kospi', 'KOSPI', 'pt', settledValue(kospi)),
        toIndicator('kosdaq', 'KOSDAQ', 'pt', settledValue(kosdaq)),
        toIndicator('usdkrw', 'USD/KRW', '원', settledValue(marketIndex)?.usdKrw ?? null),
        toIndicator('wti', 'WTI', '$', settledValue(marketIndex)?.wti ?? null),
      ];

      const summary: MarketTapeSummary = {
        generatedAt,
        source: 'naver-finance',
        indicators,
      };
      cache = { expiresAt: current.getTime() + ttlMs, summary };
      return summary;
    },
  };
}

export function parseNaverIndexPage(html: string): ParsedNumberMove | null {
  const value = parseNumber(capture(html, /id=["']now_value["'][^>]*>\s*([^<]+)/i));
  if (value === null) return null;
  const fluc = capture(html, /id=["']change_value_and_rate["'][^>]*>([\s\S]*?)<\/span>\s*<\/div>/i);
  const changeAbs = parseNumber(capture(fluc ?? '', /<span[^>]*>\s*([^<]+)\s*<\/span>/i));
  const pct = parseNumber(capture(fluc ?? '', /([+-]?\d[\d,.]*)\s*%/i));
  const sign = pct !== null && pct < 0 ? -1 : 1;
  return {
    value,
    change: changeAbs === null ? null : Math.abs(changeAbs) * sign,
    changePct: pct,
  };
}

export function parseNaverMarketIndexPage(html: string): ParsedMarketIndexPage {
  return {
    usdKrw: parseMarketIndexBlock(html, '미국 USD'),
    wti: parseMarketIndexBlock(html, 'WTI'),
  };
}

async function fetchNaverEucKrText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 AraonLocal/1.0',
    },
  });
  if (!res.ok) {
    throw new Error(`market summary fetch failed: ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return iconv.decode(buffer, 'euc-kr');
}

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null;
}

function toIndicator(
  id: MarketTapeIndicatorId,
  label: string,
  unit: MarketTapeIndicator['unit'],
  parsed: ParsedNumberMove | null,
): MarketTapeIndicator {
  return {
    id,
    label,
    value: parsed?.value ?? null,
    change: parsed?.change ?? null,
    changePct: parsed?.changePct ?? null,
    unit,
    status: parsed === null ? 'unavailable' : 'ready',
  };
}

function parseMarketIndexBlock(html: string, label: string): ParsedNumberMove | null {
  const labelIdx = html.indexOf(label);
  if (labelIdx < 0) return null;
  const start = html.lastIndexOf('<a ', labelIdx);
  const end = html.indexOf('</a>', labelIdx);
  if (start < 0 || end < 0) return null;
  const block = html.slice(start, end);
  const value = parseNumber(capture(block, /class=["']value["'][^>]*>\s*([^<]+)/i));
  if (value === null) return null;
  const changeAbs = parseNumber(capture(block, /class=["']change["'][^>]*>\s*([^<]+)/i));
  const isDown = block.includes('point_dn') || block.includes('하락');
  const sign = isDown ? -1 : 1;
  return {
    value,
    change: changeAbs === null ? null : Math.abs(changeAbs) * sign,
    changePct: null,
  };
}

function capture(input: string, regex: RegExp): string | null {
  return regex.exec(input)?.[1]?.trim() ?? null;
}

function parseNumber(value: string | null): number | null {
  if (value === null) return null;
  const normalized = value.replace(/,/g, '').trim();
  if (normalized.length === 0) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
