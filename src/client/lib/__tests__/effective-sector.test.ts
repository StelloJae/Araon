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
    const result = getEffectiveSector('반도체', '전기전자');
    const expected: EffectiveSector = { name: '반도체', source: 'manual' };
    expect(result).toEqual(expected);
  });

  it('returns manual even when autoSector is null', () => {
    expect(getEffectiveSector('AI/소프트웨어', null)).toEqual({
      name: 'AI/소프트웨어',
      source: 'manual',
    });
  });

  it('falls through to official KIS industry when manual is null', () => {
    const auto: AutoSectorName = '전기전자';
    expect(getEffectiveSector(null, auto)).toEqual({
      name: '전기전자',
      source: 'kis-industry',
    });
  });

  it('falls through to official KIS industry when manual is "기타"', () => {
    expect(getEffectiveSector('기타', '전기전자')).toEqual({
      name: '전기전자',
      source: 'kis-industry',
    });
  });

  it('falls through to official KIS industry when manual is "미분류"', () => {
    expect(getEffectiveSector('미분류', '운수장비')).toEqual({
      name: '운수장비',
      source: 'kis-industry',
    });
  });

  it('returns unclassified when manual is null and official industry is "기타"', () => {
    expect(getEffectiveSector(null, '기타')).toEqual({
      name: EFFECTIVE_SECTOR_FALLBACK_NAME,
      source: 'unclassified',
    });
  });

  it('returns unclassified when both inputs are null', () => {
    expect(getEffectiveSector(null, null)).toEqual({
      name: EFFECTIVE_SECTOR_FALLBACK_NAME,
      source: 'unclassified',
    });
  });

  it('returns unclassified when both inputs are undefined-ish', () => {
    expect(getEffectiveSector(undefined, undefined)).toEqual({
      name: EFFECTIVE_SECTOR_FALLBACK_NAME,
      source: 'unclassified',
    });
  });

  it('returns unclassified when manual is "기타" and official industry is also "기타"', () => {
    expect(getEffectiveSector('기타', '기타')).toEqual({
      name: EFFECTIVE_SECTOR_FALLBACK_NAME,
      source: 'unclassified',
    });
  });

  it('treats empty manual string as missing (falls through)', () => {
    expect(getEffectiveSector('', '전기전자')).toEqual({
      name: '전기전자',
      source: 'kis-industry',
    });
  });

  it('manual takes precedence even when autoSector and instrument type also have real values', () => {
    expect(getEffectiveSector('금융', '전기전자', 'etf')).toEqual({
      name: '금융',
      source: 'manual',
    });
  });

  it('uses instrument type before official KIS industry when manual is missing', () => {
    expect(getEffectiveSector(null, '전기전자', 'etf')).toEqual({
      name: 'ETF',
      source: 'instrument',
    });
    expect(getEffectiveSector(null, '기타', 'etn')).toEqual({
      name: 'ETN',
      source: 'instrument',
    });
  });

  it('falls through from equity or missing instrument type to official KIS industry', () => {
    expect(getEffectiveSector(null, '전기전자', 'equity')).toEqual({
      name: '전기전자',
      source: 'kis-industry',
    });
    expect(getEffectiveSector(null, '운수장비', null)).toEqual({
      name: '운수장비',
      source: 'kis-industry',
    });
  });

  it('describeSectorSource returns Korean labels for each source', () => {
    expect(describeSectorSource('manual')).toBe('사용자 테마 분류');
    expect(describeSectorSource('kis-industry')).toBe('KIS 공식 지수업종 기반');
    expect(describeSectorSource('instrument')).toBe('상품 유형 기반');
    expect(describeSectorSource('unclassified')).toBe('미분류');
  });

  it('all official KIS industry values map cleanly when manual is missing', () => {
    const cases: ReadonlyArray<[AutoSectorName, 'kis-industry' | 'unclassified']> = [
      ['전기전자', 'kis-industry'],
      ['운수장비', 'kis-industry'],
      ['서비스업', 'kis-industry'],
      ['일반전기전자', 'kis-industry'],
      ['기타', 'unclassified'],
    ];
    for (const [auto, expectedSource] of cases) {
      const r = getEffectiveSector(null, auto);
      expect(r.source).toBe(expectedSource);
      if (expectedSource === 'kis-industry') {
        expect(r.name).toBe(auto);
      } else {
        expect(r.name).toBe(EFFECTIVE_SECTOR_FALLBACK_NAME);
      }
    }
  });
});
