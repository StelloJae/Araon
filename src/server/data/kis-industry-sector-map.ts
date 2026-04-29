/**
 * KIS KRX sector flag → app AutoSector mapping (B1b).
 *
 * Pure module — no DB access, no side effects. Given the parsed
 * `KrxSectorMembership` for one stock, returns one of a fixed list of
 * AutoSectorName values, plus a `reason` describing how the mapping was
 * decided.
 *
 * Policy (deliberately conservative):
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

export interface MappingResult {
  sector: AutoSectorName;
  reason: MappingReason;
  /** Names of the KRX flags that fired (Y). Empty if reason='unmapped'. */
  matchedFlags: ReadonlyArray<keyof KrxSectorMembership>;
}

const FINANCIAL_FLAGS = ['krxBank', 'krxSecurities', 'krxInsurance'] as const;
type FinancialFlag = (typeof FINANCIAL_FLAGS)[number];

const NON_FINANCIAL_FLAG_TO_SECTOR: ReadonlyMap<keyof KrxSectorMembership, AutoSectorName> =
  new Map<keyof KrxSectorMembership, AutoSectorName>([
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

const UNMAPPED: MappingResult = {
  sector: '기타',
  reason: 'unmapped',
  matchedFlags: [],
};

export function mapKrxFlagsToSector(flags: KrxSectorMembership): MappingResult {
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
export function mapStoredKrxFlags(jsonOrNull: string | null): MappingResult | null {
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
