import { describe, expect, it } from 'vitest';
import type { AutoSectorName } from '@shared/types';
import {
  describeSectorSource,
  getEffectiveSector,
  EFFECTIVE_SECTOR_FALLBACK_NAME,
  type EffectiveSector,
} from '../effective-sector';

describe('getEffectiveSector', () => {
  it('returns manual when manual name is present and not 기타', () => {
    const result = getEffectiveSector('반도체', '자동차');
    const expected: EffectiveSector = { name: '반도체', source: 'manual' };
    expect(result).toEqual(expected);
  });

  it('returns manual even when autoSector is null', () => {
    expect(getEffectiveSector('AI/소프트웨어', null)).toEqual({
      name: 'AI/소프트웨어',
      source: 'manual',
    });
  });

  it('falls through to autoSector when manual is null', () => {
    const auto: AutoSectorName = '반도체';
    expect(getEffectiveSector(null, auto)).toEqual({
      name: '반도체',
      source: 'auto',
    });
  });

  it('falls through to autoSector when manual is "기타"', () => {
    expect(getEffectiveSector('기타', '바이오')).toEqual({
      name: '바이오',
      source: 'auto',
    });
  });

  it('returns fallback when manual is null and autoSector is "기타"', () => {
    expect(getEffectiveSector(null, '기타')).toEqual({
      name: EFFECTIVE_SECTOR_FALLBACK_NAME,
      source: 'fallback',
    });
  });

  it('returns fallback when both inputs are null', () => {
    expect(getEffectiveSector(null, null)).toEqual({
      name: EFFECTIVE_SECTOR_FALLBACK_NAME,
      source: 'fallback',
    });
  });

  it('returns fallback when both inputs are undefined-ish', () => {
    expect(getEffectiveSector(undefined, undefined)).toEqual({
      name: EFFECTIVE_SECTOR_FALLBACK_NAME,
      source: 'fallback',
    });
  });

  it('returns fallback when manual is "기타" and autoSector is also "기타"', () => {
    expect(getEffectiveSector('기타', '기타')).toEqual({
      name: EFFECTIVE_SECTOR_FALLBACK_NAME,
      source: 'fallback',
    });
  });

  it('treats empty manual string as missing (falls through)', () => {
    expect(getEffectiveSector('', '반도체')).toEqual({
      name: '반도체',
      source: 'auto',
    });
  });

  it('manual takes precedence even when autoSector also has a real value', () => {
    expect(getEffectiveSector('금융', '반도체')).toEqual({
      name: '금융',
      source: 'manual',
    });
  });

  it('describeSectorSource returns Korean labels for each source', () => {
    expect(describeSectorSource('manual')).toBe('사용자 테마 분류');
    expect(describeSectorSource('auto')).toBe('KIS 공식 업종 자동 분류');
    expect(describeSectorSource('fallback')).toBe('자동 분류 결과 없음');
  });

  it('all autoSector values map cleanly when manual is missing', () => {
    const cases: ReadonlyArray<[AutoSectorName, 'auto' | 'fallback']> = [
      ['반도체', 'auto'],
      ['자동차', 'auto'],
      ['바이오', 'auto'],
      ['금융', 'auto'],
      ['에너지화학', 'auto'],
      ['철강', 'auto'],
      ['전기전자', 'auto'],
      ['미디어통신', 'auto'],
      ['건설', 'auto'],
      ['조선', 'auto'],
      ['운송', 'auto'],
      ['기타', 'fallback'],
    ];
    for (const [auto, expectedSource] of cases) {
      const r = getEffectiveSector(null, auto);
      expect(r.source).toBe(expectedSource);
      if (expectedSource === 'auto') {
        expect(r.name).toBe(auto);
      } else {
        expect(r.name).toBe(EFFECTIVE_SECTOR_FALLBACK_NAME);
      }
    }
  });
});
