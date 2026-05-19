import { describe, expect, it } from 'vitest';

import {
  createAraonProductIdentity,
  krTossChartProductCodeForIdentity,
  isKisEligibleProductCode,
  krTickerFromTossProductCode,
  normalizeTossProductCode,
  quoteAliasesForIdentity,
  quoteKeyForIdentity,
  sparklineKeyForIdentity,
} from '../product-identity.js';

describe('product identity normalization', () => {
  it('splits a Toss KR productCode into a KIS-eligible krTicker', () => {
    expect(normalizeTossProductCode('005930')).toBe('A005930');
    expect(normalizeTossProductCode('A005930')).toBe('A005930');
    expect(krTickerFromTossProductCode('A005930')).toBe('005930');
    expect(isKisEligibleProductCode('A005930')).toBe(true);

    expect(createAraonProductIdentity({
      productCode: 'A005930',
      symbol: '005930',
      name: '삼성전자',
      market: 'KOSPI',
      currency: 'KRW',
    })).toMatchObject({
      productCode: 'A005930',
      krTicker: '005930',
      symbol: '005930',
      kisEligible: true,
      chartEligible: true,
      quoteEligible: true,
    });
  });

  it('keeps six-digit Toss KR product codes KIS-eligible even before market metadata arrives', () => {
    expect(createAraonProductIdentity({
      productCode: 'A005930',
      name: '삼성전자',
    })).toMatchObject({
      productCode: 'A005930',
      krTicker: '005930',
      market: 'UNKNOWN',
      kisEligible: true,
      chartEligible: true,
    });
  });

  it('keeps Toss-only products out of KIS eligibility', () => {
    expect(normalizeTossProductCode('0011T0')).toBe('0011T0');
    expect(krTickerFromTossProductCode('0011T0')).toBeNull();
    expect(isKisEligibleProductCode('0011T0')).toBe(false);

    expect(createAraonProductIdentity({
      productCode: '0011T0',
      symbol: '0011T0',
      name: '채비',
      market: 'TOSS_ONLY',
    })).toMatchObject({
      productCode: '0011T0',
      krTicker: null,
      symbol: '0011T0',
      market: 'TOSS_ONLY',
      kisEligible: false,
      chartEligible: false,
      quoteEligible: true,
    });
  });

  it('derives separate quote, chart, and sparkline keys for KR products', () => {
    const identity = createAraonProductIdentity({
      productCode: 'A298380',
      symbol: '298380',
      name: '에이비엘바이오',
      market: 'KOSDAQ',
      currency: 'KRW',
    });

    expect(identity).not.toBeNull();
    expect(quoteKeyForIdentity(identity!)).toBe('298380');
    expect(sparklineKeyForIdentity(identity!)).toBe('298380');
    expect(krTossChartProductCodeForIdentity(identity!)).toBe('A298380');
    expect(quoteAliasesForIdentity(identity!)).toEqual(['298380', 'A298380']);
  });

  it('keeps Toss-only quote keys away from KR chart and KIS routes', () => {
    const identity = createAraonProductIdentity({
      productCode: 'US20100629001',
      symbol: 'TSLA',
      name: '테슬라',
      market: 'US',
      currency: 'USD',
    });

    expect(identity).not.toBeNull();
    expect(quoteKeyForIdentity(identity!)).toBe('US20100629001');
    expect(sparklineKeyForIdentity(identity!)).toBe('US20100629001');
    expect(krTossChartProductCodeForIdentity(identity!)).toBeNull();
    expect(quoteAliasesForIdentity(identity!)).toEqual(['US20100629001', 'TSLA']);
  });
});
