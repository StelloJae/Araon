/**
 * KIS official index industry / KRX sector flag → app sector mapping.
 *
 * Pure module — no DB access, no side effects. Given the parsed
 * KIS classification block for one stock, returns an AutoSectorName plus a
 * `reason` describing how the mapping was decided.
 *
 * Display grouping uses KIS official index industry codes only. Legacy KRX
 * sector-index flags remain parseable as auxiliary metadata, but they are not
 * mixed in as a fallback for screen grouping.
 *
 * Legacy KRX flag metadata mapping policy (deliberately conservative):
 *   - 0 flags Y                       → 기타 (unmapped)
 *   - 1 non-financial flag Y          → that sector (mapped)
 *   - financial flags only (any 1+)   → 금융 (mapped)
 *   - financial + non-financial mix   → 기타 (ambiguous)
 *   - 2+ non-financial flags          → 기타 (ambiguous)
 *
 * "Financial" = krxBank ∪ krxSecurities ∪ krxInsurance.
 *
 * No 추정 of investment themes (AI / 2차전지 / 방산 / 로봇 / 인터넷). KIS
 * publishes those nowhere in the mst rear payload, so we never make them up.
 */

import type { KrxSectorMembership } from '../kis/kis-master-fetcher.js';
import type { AutoSectorName } from '@shared/types.js';

export type { AutoSectorName };

export type MappingReason = 'mapped' | 'unmapped' | 'ambiguous';

export type KrxFlagSectorName =
  | '반도체'
  | '자동차'
  | '바이오'
  | '금융'
  | '에너지화학'
  | '철강'
  | '미디어통신'
  | '건설'
  | '조선'
  | '운송'
  | '기타';

export interface MappingResult {
  sector: AutoSectorName;
  reason: MappingReason;
  /** Always empty for official index matches. */
  matchedFlags: ReadonlyArray<keyof KrxSectorMembership>;
}

export interface KrxFlagMappingResult {
  sector: KrxFlagSectorName;
  reason: MappingReason;
  /** Names of the KRX flags that fired (Y). Empty if reason='unmapped'. */
  matchedFlags: ReadonlyArray<keyof KrxSectorMembership>;
}

export interface StoredKisClassification {
  market: 'KOSPI' | 'KOSDAQ';
  indexIndustryLarge: string | null;
  indexIndustryMiddle: string | null;
  indexIndustrySmall: string | null;
  krxSectorFlags: string | null;
}

const FINANCIAL_FLAGS = ['krxBank', 'krxSecurities', 'krxInsurance'] as const;
type FinancialFlag = (typeof FINANCIAL_FLAGS)[number];

const NON_FINANCIAL_FLAG_TO_SECTOR: ReadonlyMap<
  keyof KrxSectorMembership,
  KrxFlagSectorName
> = new Map<keyof KrxSectorMembership, KrxFlagSectorName>([
    ['krxAuto', '자동차'],
    ['krxSemiconductor', '반도체'],
    ['krxBio', '바이오'],
    ['krxEnergyChem', '에너지화학'],
    ['krxSteel', '철강'],
    ['krxMediaTel', '미디어통신'],
    ['krxConstruction', '건설'],
    ['krxShip', '조선'],
    ['krxTransport', '운송'],
  ]);

function isFinancial(flag: keyof KrxSectorMembership): flag is FinancialFlag {
  return (FINANCIAL_FLAGS as readonly string[]).includes(flag as string);
}

function getActiveFlags(
  flags: KrxSectorMembership,
): Array<keyof KrxSectorMembership> {
  const active: Array<keyof KrxSectorMembership> = [];
  for (const [key, val] of Object.entries(flags) as Array<
    [keyof KrxSectorMembership, 'Y' | 'N' | null]
  >) {
    if (val === 'Y') active.push(key);
  }
  return active;
}

const UNMAPPED: KrxFlagMappingResult = {
  sector: '기타',
  reason: 'unmapped',
  matchedFlags: [],
};

const KOSPI_MIDDLE_INDEX_INDUSTRY_TO_SECTOR: ReadonlyMap<string, AutoSectorName> =
  new Map<string, AutoSectorName>([
    ['0005', '음식료품'],
    ['0006', '섬유의복'],
    ['0007', '종이목재'],
    ['0008', '화학'],
    ['0009', '의약품'],
    ['0010', '비금속광물'],
    ['0011', '철강금속'],
    ['0012', '기계'],
    ['0013', '전기전자'],
    ['0014', '의료정밀'],
    ['0015', '운수장비'],
    ['0024', '증권'],
    ['0025', '보험'],
  ]);

const KOSPI_LARGE_INDEX_INDUSTRY_TO_SECTOR: ReadonlyMap<string, AutoSectorName> =
  new Map<string, AutoSectorName>([
    ['0016', '유통업'],
    ['0017', '전기가스업'],
    ['0018', '건설업'],
    ['0019', '운수창고업'],
    ['0020', '통신업'],
    ['0021', '금융업'],
    ['0026', '서비스업'],
    ['0027', '제조업'],
    ['0028', '부동산업'],
    ['0029', 'IT서비스'],
    ['0030', '오락문화'],
  ]);

const KOSDAQ_MIDDLE_INDEX_INDUSTRY_TO_SECTOR: ReadonlyMap<string, AutoSectorName> =
  new Map<string, AutoSectorName>([
    ['1019', '음식료/담배'],
    ['1020', '섬유/의류'],
    ['1021', '종이/목재'],
    ['1022', '출판/매체복제'],
    ['1023', '화학'],
    ['1024', '제약'],
    ['1025', '비금속'],
    ['1026', '금속'],
    ['1027', '기계/장비'],
    ['1028', '일반전기전자'],
    ['1029', '의료/정밀기기'],
    ['1030', '운송장비/부품'],
    ['1031', '기타제조'],
  ]);

const KOSDAQ_LARGE_INDEX_INDUSTRY_TO_SECTOR: ReadonlyMap<string, AutoSectorName> =
  new Map<string, AutoSectorName>([
    ['1006', '기타서비스'],
    ['1009', '제조'],
    ['1010', '건설'],
    ['1011', '유통'],
    ['1013', '운송'],
    ['1014', '금융'],
    ['1015', '오락문화'],
  ]);

function normalizeIndexCode(code: string | null): string | null {
  if (code === null) return null;
  const normalized = code.trim();
  if (normalized.length === 0 || normalized === '0000') return null;
  return normalized;
}

function mappedSector(sector: AutoSectorName | undefined): MappingResult | null {
  if (sector === undefined) return null;
  return { sector, reason: 'mapped', matchedFlags: [] };
}

export function mapKisIndexIndustryToSector(input: {
  market: 'KOSPI' | 'KOSDAQ';
  indexIndustryLarge: string | null;
  indexIndustryMiddle: string | null;
  indexIndustrySmall?: string | null;
}): MappingResult | null {
  const large = normalizeIndexCode(input.indexIndustryLarge);
  const middle = normalizeIndexCode(input.indexIndustryMiddle);
  if (large === null && middle === null) return null;

  if (input.market === 'KOSPI') {
    if (middle !== null) {
      const sector = KOSPI_MIDDLE_INDEX_INDUSTRY_TO_SECTOR.get(middle);
      if (sector !== undefined) return mappedSector(sector);
    }
    return large === null
      ? null
      : mappedSector(KOSPI_LARGE_INDEX_INDUSTRY_TO_SECTOR.get(large));
  }

  if (middle !== null) {
    const sector = KOSDAQ_MIDDLE_INDEX_INDUSTRY_TO_SECTOR.get(middle);
    if (sector !== undefined) return mappedSector(sector);
  }
  return large === null
    ? null
    : mappedSector(KOSDAQ_LARGE_INDEX_INDUSTRY_TO_SECTOR.get(large));
}

export function mapKrxFlagsToSector(
  flags: KrxSectorMembership,
): KrxFlagMappingResult {
  const active = getActiveFlags(flags);
  if (active.length === 0) return UNMAPPED;

  const financial = active.filter(isFinancial);
  const nonFinancial = active.filter((f) => !isFinancial(f));

  // Pure-financial (1 or more flags, all financial) → 금융.
  if (financial.length > 0 && nonFinancial.length === 0) {
    return { sector: '금융', reason: 'mapped', matchedFlags: active };
  }

  // Single non-financial flag, no financial → mapped to that sector.
  if (financial.length === 0 && nonFinancial.length === 1) {
    const target = NON_FINANCIAL_FLAG_TO_SECTOR.get(nonFinancial[0]!);
    if (target !== undefined) {
      return { sector: target, reason: 'mapped', matchedFlags: active };
    }
    // Unknown non-financial flag (shouldn't happen with current spec).
    return { sector: '기타', reason: 'ambiguous', matchedFlags: active };
  }

  // Anything else (multiple non-financial, or financial + non-financial mix)
  // → 기타 with reason='ambiguous' so caller can flag it for inspection.
  return { sector: '기타', reason: 'ambiguous', matchedFlags: active };
}

/**
 * Convenience: parse the JSON-stringified `krx_sector_flags` column from
 * master_stocks and run the mapping. Returns null if the JSON is null,
 * malformed, or missing required keys.
 */
export function mapStoredKrxFlags(
  jsonOrNull: string | null,
): KrxFlagMappingResult | null {
  if (jsonOrNull === null || jsonOrNull.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonOrNull);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const flags = parsed as KrxSectorMembership;
  return mapKrxFlagsToSector(flags);
}

export function mapStoredKisClassification(
  classification: StoredKisClassification,
): MappingResult | null {
  return mapKisIndexIndustryToSector(classification);
}
