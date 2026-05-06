/**
 * Effective sector classification used by row pills, detail modal, and
 * SectionStack grouping.
 *
 * Priority: manual sector (set by user via theme catalog) > instrument type
 * (ETF/ETN/REIT/fund) > KIS official index industry > unclassified
 * ('미분류'). Manual classification is never overwritten by automatic
 * classification — once a user puts a ticker in a real theme, that wins.
 *
 * Pure function. No store access, no side effects.
 */

import type { AutoSectorName, InstrumentType } from '@shared/types';

export const EFFECTIVE_SECTOR_FALLBACK_NAME = '미분류';

export type EffectiveSectorSource =
  | 'manual'
  | 'kis-industry'
  | 'instrument'
  | 'unclassified';

export interface EffectiveSector {
  /** Display name for pill / label. */
  name: string;
  /** Where this classification came from. */
  source: EffectiveSectorSource;
}

const FALLBACK: EffectiveSector = {
  name: EFFECTIVE_SECTOR_FALLBACK_NAME,
  source: 'unclassified',
};

function normalizeManual(name: string | null | undefined): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed === '기타' || trimmed === '미분류') {
    return null;
  }
  return trimmed;
}

function isUsableKisIndustry(
  officialIndustryName: AutoSectorName | null | undefined,
): officialIndustryName is Exclude<AutoSectorName, '기타'> {
  return (
    officialIndustryName !== null &&
    officialIndustryName !== undefined &&
    officialIndustryName !== '기타'
  );
}

export function getEffectiveSector(
  manualSectorName: string | null | undefined,
  officialIndustryName: AutoSectorName | null | undefined,
  instrumentType?: InstrumentType | null,
): EffectiveSector {
  const manual = normalizeManual(manualSectorName);
  if (manual !== null) {
    return { name: manual, source: 'manual' };
  }
  const instrumentSector = instrumentSectorName(instrumentType);
  if (instrumentSector !== null) {
    return { name: instrumentSector, source: 'instrument' };
  }
  if (isUsableKisIndustry(officialIndustryName)) {
    return { name: officialIndustryName, source: 'kis-industry' };
  }
  return FALLBACK;
}

function instrumentSectorName(
  instrumentType: InstrumentType | null | undefined,
): string | null {
  switch (instrumentType) {
    case 'etf':
      return 'ETF';
    case 'etn':
      return 'ETN';
    case 'reit':
      return '리츠';
    case 'fund':
      return '펀드';
    case 'other':
      return '기타상품';
    case 'equity':
    case null:
    case undefined:
      return null;
  }
}

/**
 * Human-readable Korean label for a sector source — used as the tooltip
 * (`title` attribute) on row pills and the detail-modal sector cell so
 * users can tell apart manual / KIS official industry / unclassified labels.
 */
export function describeSectorSource(source: EffectiveSectorSource): string {
  switch (source) {
    case 'manual':
      return '사용자 테마 분류';
    case 'kis-industry':
      return 'KIS 공식 지수업종 기반';
    case 'instrument':
      return '상품 유형 기반';
    case 'unclassified':
      return '미분류';
  }
}
