import { describe, expect, it } from 'vitest';
import {
  mapKisIndexIndustryToSector,
  mapKrxFlagsToSector,
  mapStoredKisClassification,
  mapStoredKrxFlags,
  type AutoSectorName,
  type KrxFlagSectorName,
} from '../kis-industry-sector-map.js';
import type { KrxSectorMembership } from '../../kis/kis-master-fetcher.js';

function flags(overrides: Partial<KrxSectorMembership>): KrxSectorMembership {
  return {
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
    ...overrides,
  };
}

describe('mapKrxFlagsToSector — single flag mapping', () => {
  const cases: Array<[Partial<KrxSectorMembership>, KrxFlagSectorName]> = [
    [{ krxAuto: 'Y' }, '자동차'],
    [{ krxSemiconductor: 'Y' }, '반도체'],
    [{ krxBio: 'Y' }, '바이오'],
    [{ krxEnergyChem: 'Y' }, '에너지화학'],
    [{ krxSteel: 'Y' }, '철강'],
    [{ krxMediaTel: 'Y' }, '미디어통신'],
    [{ krxConstruction: 'Y' }, '건설'],
    [{ krxShip: 'Y' }, '조선'],
    [{ krxTransport: 'Y' }, '운송'],
  ];

  for (const [overrides, expected] of cases) {
    it(`single Y on ${Object.keys(overrides)[0]} → ${expected}`, () => {
      const r = mapKrxFlagsToSector(flags(overrides));
      expect(r.sector).toBe(expected);
      expect(r.reason).toBe('mapped');
      expect(r.matchedFlags).toEqual(Object.keys(overrides));
    });
  }
});

describe('mapKrxFlagsToSector — financial grouping', () => {
  it('krxBank alone → 금융', () => {
    const r = mapKrxFlagsToSector(flags({ krxBank: 'Y' }));
    expect(r.sector).toBe('금융');
    expect(r.reason).toBe('mapped');
  });

  it('krxSecurities alone → 금융', () => {
    const r = mapKrxFlagsToSector(flags({ krxSecurities: 'Y' }));
    expect(r.sector).toBe('금융');
    expect(r.reason).toBe('mapped');
  });

  it('krxInsurance alone → 금융', () => {
    const r = mapKrxFlagsToSector(flags({ krxInsurance: 'Y' }));
    expect(r.sector).toBe('금융');
    expect(r.reason).toBe('mapped');
  });

  it('Bank + Securities together → 금융 (multiple financial flags allowed)', () => {
    const r = mapKrxFlagsToSector(flags({ krxBank: 'Y', krxSecurities: 'Y' }));
    expect(r.sector).toBe('금융');
    expect(r.reason).toBe('mapped');
    expect(r.matchedFlags).toEqual(expect.arrayContaining(['krxBank', 'krxSecurities']));
  });

  it('all three financial flags together → 금융', () => {
    const r = mapKrxFlagsToSector(
      flags({ krxBank: 'Y', krxSecurities: 'Y', krxInsurance: 'Y' }),
    );
    expect(r.sector).toBe('금융');
    expect(r.reason).toBe('mapped');
  });
});

describe('mapKrxFlagsToSector — unmapped & ambiguous', () => {
  it('all flags N or null → 기타 (unmapped)', () => {
    const r = mapKrxFlagsToSector(flags({}));
    expect(r.sector).toBe('기타');
    expect(r.reason).toBe('unmapped');
    expect(r.matchedFlags).toEqual([]);
  });

  it('two non-financial flags → 기타 (ambiguous)', () => {
    const r = mapKrxFlagsToSector(
      flags({ krxAuto: 'Y', krxSemiconductor: 'Y' }),
    );
    expect(r.sector).toBe('기타');
    expect(r.reason).toBe('ambiguous');
  });

  it('financial + non-financial mix → 기타 (ambiguous)', () => {
    const r = mapKrxFlagsToSector(
      flags({ krxBank: 'Y', krxSemiconductor: 'Y' }),
    );
    expect(r.sector).toBe('기타');
    expect(r.reason).toBe('ambiguous');
  });

  it('explicit N flags do NOT count as active', () => {
    const r = mapKrxFlagsToSector(flags({ krxAuto: 'N', krxBank: 'N' }));
    expect(r.reason).toBe('unmapped');
  });
});

describe('mapStoredKrxFlags — JSON helper', () => {
  it('parses a JSON-stringified flags object', () => {
    const json = JSON.stringify(flags({ krxAuto: 'Y' }));
    const r = mapStoredKrxFlags(json);
    expect(r?.sector).toBe('자동차');
  });

  it('returns null for null input', () => {
    expect(mapStoredKrxFlags(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(mapStoredKrxFlags('')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(mapStoredKrxFlags('{not json')).toBeNull();
  });

  it('returns null for non-object JSON (e.g. JSON null literal)', () => {
    expect(mapStoredKrxFlags('null')).toBeNull();
  });
});

describe('mapKisIndexIndustryToSector — official KIS index industry', () => {
  it('maps KOSPI 0027/0013 to 전기전자', () => {
    const r = mapKisIndexIndustryToSector({
      market: 'KOSPI',
      indexIndustryLarge: '0027',
      indexIndustryMiddle: '0013',
      indexIndustrySmall: '0000',
    });
    expect(r?.sector).toBe('전기전자');
    expect(r?.reason).toBe('mapped');
  });

  it('maps KOSDAQ 1009/1028 to 일반전기전자', () => {
    const r = mapKisIndexIndustryToSector({
      market: 'KOSDAQ',
      indexIndustryLarge: '1009',
      indexIndustryMiddle: '1028',
      indexIndustrySmall: '0000',
    });
    expect(r?.sector).toBe('일반전기전자');
    expect(r?.reason).toBe('mapped');
  });

  it('returns null for empty official index industry codes', () => {
    expect(
      mapKisIndexIndustryToSector({
        market: 'KOSPI',
        indexIndustryLarge: '0000',
        indexIndustryMiddle: '0000',
        indexIndustrySmall: '0000',
      }),
    ).toBeNull();
  });
});

describe('mapStoredKisClassification — official KIS index industry only', () => {
  it('uses official KIS index industry over KRX sector flags', () => {
    const r = mapStoredKisClassification({
      market: 'KOSPI',
      indexIndustryLarge: '0027',
      indexIndustryMiddle: '0013',
      indexIndustrySmall: '0000',
      krxSectorFlags: JSON.stringify(flags({ krxSemiconductor: 'Y' })),
    });
    expect(r?.sector).toBe('전기전자');
  });

  it('does not fall back to KRX sector flags when official codes are unavailable', () => {
    const r = mapStoredKisClassification({
      market: 'KOSPI',
      indexIndustryLarge: '0000',
      indexIndustryMiddle: '0000',
      indexIndustrySmall: '0000',
      krxSectorFlags: JSON.stringify(flags({ krxSemiconductor: 'Y' })),
    });
    expect(r).toBeNull();
  });
});

describe('mapKrxFlagsToSector — investment-theme guard', () => {
  it('does not invent AI / 2차전지 / 방산 / 로봇', () => {
    // No KRX flag corresponds to those investment themes. Even if we had a
    // semiconductor + battery hint, we must NOT auto-classify as those names.
    // The closest domain (반도체) only fires when KRX반도체 is the lone Y.
    const r = mapKrxFlagsToSector(flags({ krxSemiconductor: 'Y' }));
    expect(r.sector).toBe('반도체');
    expect((r.sector as string)).not.toBe('AI');
    expect((r.sector as string)).not.toBe('2차전지');
    expect((r.sector as string)).not.toBe('방산');
    expect((r.sector as string)).not.toBe('로봇');
  });
});
