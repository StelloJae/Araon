/**
 * CSV text → Stock[] parser for the `/stocks/bulk` endpoint.
 *
 * Accepted column names (case-insensitive, flexible order when a header row
 * is present):
 *   종목코드  – 6-digit Korean equity ticker
 *   종목명    – display name
 *   섹터      – optional sector label
 *
 * When no header row is detected the parser assumes the column order is
 * `종목코드,종목명,섹터` (sector optional in 2-column CSVs).
 */

import { z } from 'zod';
import type { Stock } from '@shared/types.js';
import { createChildLogger } from '@shared/logger.js';

const log = createChildLogger('csv-parser');

// === Validation schema =========================================================

const tickerSchema = z.string().regex(/^\d{6}$/, 'ticker must be exactly 6 digits');

const marketSchema = z.enum(['KOSPI', 'KOSDAQ']).default('KOSPI');

// === Public types ==============================================================

export interface CsvParseError {
  line: number;
  reason: string;
}

export interface CsvParseResult {
  valid: Stock[];
  errors: CsvParseError[];
}

// === Header detection ==========================================================

const KNOWN_HEADER_COLS = ['종목코드', '종목명', '섹터', 'ticker', 'name', 'sector', 'market'];

function isHeaderRow(cols: string[]): boolean {
  return cols.some((c) => KNOWN_HEADER_COLS.includes(c.trim()));
}

interface ColumnMap {
  tickerIdx: number;
  nameIdx: number;
  marketIdx: number | null;
}

function buildColumnMap(headerCols: string[]): ColumnMap | null {
  const normalised = headerCols.map((c) => c.trim());

  const tickerIdx = normalised.findIndex((c) =>
    c === '종목코드' || c.toLowerCase() === 'ticker',
  );
  const nameIdx = normalised.findIndex((c) =>
    c === '종목명' || c.toLowerCase() === 'name',
  );
  const marketIdx = normalised.findIndex((c) =>
    c === '마켓' || c.toLowerCase() === 'market',
  );

  if (tickerIdx === -1 || nameIdx === -1) {
    return null;
  }

  return {
    tickerIdx,
    nameIdx,
    marketIdx: marketIdx === -1 ? null : marketIdx,
  };
}

// === Main parser ==============================================================

/**
 * Parse a CSV string into validated `Stock` objects.
 *
 * Lines that fail validation are accumulated in `errors` (1-based line number
 * relative to the original input including the header row). Valid rows are
 * returned in `valid`.
 */
export function parseStockCsv(input: string): CsvParseResult {
  const valid: Stock[] = [];
  const errors: CsvParseError[] = [];

  const rawLines = input.split(/\r?\n/);
  const nonEmpty = rawLines.map((l, i) => ({ raw: l, lineNo: i + 1 })).filter(({ raw }) => raw.trim().length > 0);

  if (nonEmpty.length === 0) {
    log.debug('csv-parser: empty input');
    return { valid, errors };
  }

  let columnMap: ColumnMap | null = null;
  let dataStart = 0;

  // nonEmpty is non-empty (guarded above), but noUncheckedIndexedAccess requires this check
  const firstEntry = nonEmpty[0];
  if (firstEntry === undefined) {
    return { valid, errors };
  }
  const firstCols = firstEntry.raw.split(',');

  if (isHeaderRow(firstCols)) {
    columnMap = buildColumnMap(firstCols);
    if (columnMap === null) {
      errors.push({
        line: firstEntry.lineNo,
        reason: 'header row detected but required columns (종목코드, 종목명) not found',
      });
      return { valid, errors };
    }
    dataStart = 1;
    log.debug({ columnMap }, 'csv-parser: header detected');
  } else {
    // Default positional mapping: 종목코드,종목명[,섹터]
    columnMap = { tickerIdx: 0, nameIdx: 1, marketIdx: null };
    log.debug('csv-parser: no header, using default column order');
  }

  for (let i = dataStart; i < nonEmpty.length; i++) {
    const entry = nonEmpty[i];
    if (entry === undefined) continue;
    const { raw, lineNo } = entry;
    const cols = raw.split(',');

    const rawTicker = cols[columnMap.tickerIdx]?.trim() ?? '';
    const rawName = cols[columnMap.nameIdx]?.trim() ?? '';
    const rawMarket = columnMap.marketIdx !== null ? (cols[columnMap.marketIdx]?.trim() ?? '') : '';

    const tickerResult = tickerSchema.safeParse(rawTicker);
    if (!tickerResult.success) {
      errors.push({
        line: lineNo,
        reason: `invalid ticker "${rawTicker}": ${tickerResult.error.issues[0]?.message ?? 'validation failed'}`,
      });
      continue;
    }

    if (rawName.length === 0) {
      errors.push({ line: lineNo, reason: 'name (종목명) is empty' });
      continue;
    }

    const marketResult = marketSchema.safeParse(rawMarket === '' ? undefined : rawMarket);
    const market = marketResult.success ? marketResult.data : 'KOSPI';

    valid.push({ ticker: tickerResult.data, name: rawName, market });
  }

  log.debug({ valid: valid.length, errors: errors.length }, 'csv-parser: done');
  return { valid, errors };
}
