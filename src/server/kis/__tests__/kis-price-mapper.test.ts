import { describe, it, expect } from 'vitest';
import { mapKisInquirePriceToPrice, kisInquirePriceOutputSchema } from '../kis-price-mapper.js';

describe('mapKisInquirePriceToPrice', () => {
  const TICKER = '005930';

  it('parses standard KIS response with output wrapper (strings)', () => {
    const raw = {
      rt_cd: '0',
      msg_cd: 'MCA00000',
      msg1: '정상처리',
      output: {
        stck_prpr: '75000',
        prdy_vrss: '925',
        prdy_ctrt: '1.25',
        acml_vol: '12345678',
        stck_shrn_iscd: '005930',
      },
    };
    const price = mapKisInquirePriceToPrice(TICKER, raw);
    expect(price).toMatchObject({
      ticker: TICKER,
      price: 75000,
      changeRate: 1.25,
      changeAbs: 925,
      volume: 12345678,
      isSnapshot: false,
    });
    expect(price.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('accepts numeric fields (not only strings)', () => {
    const raw = {
      output: { stck_prpr: 75000, prdy_vrss: -375, prdy_ctrt: -0.5, acml_vol: 1000 },
    };
    const price = mapKisInquirePriceToPrice(TICKER, raw);
    expect(price.price).toBe(75000);
    expect(price.changeRate).toBe(-0.5);
    expect(price.changeAbs).toBe(-375);
    expect(price.volume).toBe(1000);
  });

  it('falls back to top-level when `output` is missing', () => {
    const raw = { stck_prpr: '82000', prdy_vrss: '-1750', prdy_ctrt: '-2.10', acml_vol: '555' };
    const price = mapKisInquirePriceToPrice(TICKER, raw);
    expect(price.price).toBe(82000);
    expect(price.changeRate).toBe(-2.1);
    expect(price.changeAbs).toBe(-1750);
    expect(price.volume).toBe(555);
  });

  it('returns zeros and logs when stck_prpr is missing', () => {
    const raw = { output: { prdy_ctrt: '1.0', acml_vol: '10' } };
    const price = mapKisInquirePriceToPrice(TICKER, raw);
    expect(price.price).toBe(0);
    expect(price.changeRate).toBe(1);
    expect(price.volume).toBe(10);
    expect(price.changeAbs).toBeNull();
  });

  it('coerces empty string to fallback', () => {
    const raw = { output: { stck_prpr: '', prdy_vrss: '', prdy_ctrt: '', acml_vol: '' } };
    const price = mapKisInquirePriceToPrice(TICKER, raw);
    expect(price).toMatchObject({ price: 0, changeRate: 0, volume: 0 });
    expect(price.changeAbs).toBeNull();
  });

  it('coerces non-numeric strings to fallback (not NaN)', () => {
    const raw = { output: { stck_prpr: 'not-a-number', prdy_vrss: 'oops', prdy_ctrt: 'x', acml_vol: 'y' } };
    const price = mapKisInquirePriceToPrice(TICKER, raw);
    expect(Number.isNaN(price.price)).toBe(false);
    expect(price).toMatchObject({ price: 0, changeRate: 0, volume: 0 });
    expect(price.changeAbs).toBeNull();
  });

  it('preserves negative sign on prdy_vrss (string)', () => {
    const raw = { output: { stck_prpr: '219500', prdy_vrss: '-5000', prdy_ctrt: '-2.23', acml_vol: '19165257' } };
    const price = mapKisInquirePriceToPrice(TICKER, raw);
    expect(price.changeAbs).toBe(-5000);
  });

  it('changeAbs is null when prdy_vrss is omitted, not 0', () => {
    const raw = { output: { stck_prpr: '100', prdy_ctrt: '0', acml_vol: '0' } };
    const price = mapKisInquirePriceToPrice(TICKER, raw);
    expect(price.changeAbs).toBeNull();
  });

  it('throws on non-object input', () => {
    expect(() => mapKisInquirePriceToPrice(TICKER, null)).toThrow(/expected object/);
    expect(() => mapKisInquirePriceToPrice(TICKER, 'string')).toThrow(/expected object/);
    expect(() => mapKisInquirePriceToPrice(TICKER, 42)).toThrow(/expected object/);
  });

  it('sets isSnapshot=false (REST polling path)', () => {
    const raw = { output: { stck_prpr: '100', prdy_ctrt: '0', acml_vol: '0' } };
    expect(mapKisInquirePriceToPrice(TICKER, raw).isSnapshot).toBe(false);
  });

  it('propagates ticker from argument, not from payload', () => {
    const raw = { output: { stck_prpr: '1', prdy_ctrt: '0', acml_vol: '0', stck_shrn_iscd: '999999' } };
    const price = mapKisInquirePriceToPrice(TICKER, raw);
    expect(price.ticker).toBe(TICKER);
  });

  it('parses optional detail fields without inventing missing fundamentals', () => {
    const raw = {
      output: {
        stck_prpr: '219500',
        prdy_vrss: '-5000',
        prdy_ctrt: '-2.23',
        acml_vol: '19165257',
        acml_tr_pbmn: '4210000000000',
        stck_oprc: '222000',
        stck_hgpr: '222500',
        stck_lwpr: '218000',
        hts_avls: '4710000',
        per: '18.42',
        pbr: '1.33',
        hts_frgn_ehrt: '52.50',
        w52_hgpr: '258000',
        w52_lwpr: '171000',
        dvd_yld: '',
      },
    };

    const price = mapKisInquirePriceToPrice(TICKER, raw);

    expect(price).toMatchObject({
      openPrice: 222000,
      highPrice: 222500,
      lowPrice: 218000,
      accumulatedTradeValue: 4210000000000,
      marketCapKrw: 471_000_000_000_000,
      per: 18.42,
      pbr: 1.33,
      foreignOwnershipRate: 52.5,
      week52High: 258000,
      week52Low: 171000,
    });
    expect(price.dividendYield).toBeNull();
  });
});

describe('kisInquirePriceOutputSchema', () => {
  it('accepts valid payload and passes through unknown fields', () => {
    const result = kisInquirePriceOutputSchema.safeParse({
      stck_prpr: '100',
      prdy_ctrt: '0.5',
      acml_vol: '1000',
      unknown_field: 'ignored',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stck_prpr).toBe('100');
    }
  });

  it('treats missing optional fields as valid', () => {
    const result = kisInquirePriceOutputSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
