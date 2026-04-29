/**
 * Effective sector classification used by row pills, detail modal, and
 * SectionStack grouping.
 *
 * Priority: manual sector (set by user via theme catalog) > KIS-derived
 * autoSector > fallback ('기타'). Manual classification is never overwritten
 * by autoSector — once a user puts a ticker in a theme, that wins.
 *
 * Pure function. No store access, no side effects.
 */

import type { AutoSectorName } from '@shared/types';

export const EFFECTIVE_SECTOR_FALLBACK_NAME = '기타';

export type EffectiveSectorSource = 'manual' | 'auto' | 'fallback';

export interface EffectiveSector {
  /** Display name for pill / label. */
  name: string;
  /** Where this classification came from. */
  source: EffectiveSectorSource;
}

const FALLBACK: EffectiveSector = {
  name: EFFECTIVE_SECTOR_FALLBACK_NAME,
  source: 'fallback',
};

function isUsableManual(name: string | null | undefined): name is string {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name !== EFFECTIVE_SECTOR_FALLBACK_NAME
  );
}

function isUsableAuto(
  auto: AutoSectorName | null | undefined,
): auto is Exclude<AutoSectorName, '기타'> {
  return auto !== null && auto !== undefined && auto !== '기타';
}

export function getEffectiveSector(
  manualSectorName: string | null | undefined,
  autoSector: AutoSectorName | null | undefined,
): EffectiveSector {
  if (isUsableManual(manualSectorName)) {
    return { name: manualSectorName, source: 'manual' };
  }
  if (isUsableAuto(autoSector)) {
    return { name: autoSector, source: 'auto' };
  }
  return FALLBACK;
}

/**
 * Human-readable Korean label for a sector source — used as the tooltip
 * (`title` attribute) on row pills and the detail-modal sector cell so
 * users can tell apart manual / auto / fallback classifications.
 */
export function describeSectorSource(source: EffectiveSectorSource): string {
  switch (source) {
    case 'manual':
      return '사용자 테마 분류';
    case 'auto':
      return 'KRX 업종 기반 자동 분류';
    case 'fallback':
      return '자동 분류 결과 없음';
  }
}
