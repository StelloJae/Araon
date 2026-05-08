import { describe, expect, it, vi } from 'vitest';

import {
  fetchKisFluctuationRanking,
  mapKisFluctuationRows,
  mapKisOvertimeFluctuationRows,
} from '../kis-fluctuation-ranking.js';

describe('KIS fluctuation ranking mapper', () => {
  it('normalizes KIS ranking rows into market top mover items', () => {
    const rows = mapKisFluctuationRows([
      {
        data_rank: '1',
        stck_shrn_iscd: '005930',
        hts_kor_isnm: '삼성전자',
        stck_prpr: '70000',
        prdy_vrss: '2500',
        prdy_ctrt: '3.70',
        acml_vol: '1234567',
      },
      {
        data_rank: '2',
        stck_shrn_iscd: '000660',
        hts_kor_isnm: 'SK하이닉스',
        stck_prpr: '180000',
        prdy_vrss: '-5000',
        prdy_ctrt: '-2.70',
        acml_vol: '7654321',
      },
    ]);

    expect(rows).toEqual([
      {
        rank: 1,
        ticker: '005930',
        name: '삼성전자',
        price: 70_000,
        changeAbs: 2_500,
        changePct: 3.7,
        volume: 1_234_567,
      },
      {
        rank: 2,
        ticker: '000660',
        name: 'SK하이닉스',
        price: 180_000,
        changeAbs: -5_000,
        changePct: -2.7,
        volume: 7_654_321,
      },
    ]);
  });

  it('normalizes KIS overtime ranking rows into market top mover items', () => {
    const rows = mapKisOvertimeFluctuationRows([
      {
        mksc_shrn_iscd: '277810',
        hts_kor_isnm: '레인보우로보틱스',
        ovtm_untp_prpr: '762000',
        ovtm_untp_prdy_vrss: '65000',
        ovtm_untp_prdy_ctrt: '9.33',
        ovtm_untp_vol: '12345',
      },
    ]);

    expect(rows).toEqual([
      {
        rank: 1,
        ticker: '277810',
        name: '레인보우로보틱스',
        price: 762_000,
        changeAbs: 65_000,
        changePct: 9.33,
        volume: 12_345,
      },
    ]);
  });

  it('drops malformed rows instead of inventing top movers', () => {
    expect(
      mapKisFluctuationRows([
        { data_rank: '1', stck_shrn_iscd: 'bad', hts_kor_isnm: '깨진종목' },
        { data_rank: '2', stck_shrn_iscd: '005930', hts_kor_isnm: '', stck_prpr: '70000' },
      ]),
    ).toEqual([]);
  });
});

describe('fetchKisFluctuationRanking', () => {
  it('calls the official KIS fluctuation ranking endpoint for gainers', async () => {
    const request = vi.fn(async () => ({
      output: [
        {
          data_rank: '1',
          stck_shrn_iscd: '005930',
          hts_kor_isnm: '삼성전자',
          stck_prpr: '70000',
          prdy_vrss: '2500',
          prdy_ctrt: '3.70',
          acml_vol: '1234567',
        },
      ],
    }));

    const items = await fetchKisFluctuationRanking({
      direction: 'gainers',
      count: 100,
      now: new Date('2026-05-08T01:00:00.000Z'),
      restClient: { request },
    });

    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/uapi/domestic-stock/v1/ranking/fluctuation',
      trId: 'FHPST01700000',
      endpointClass: 'ranking',
      query: expect.objectContaining({
        fid_cond_mrkt_div_code: 'J',
        fid_cond_scr_div_code: '20170',
        fid_input_iscd: '0000',
        fid_rank_sort_cls_code: '0',
        fid_input_cnt_1: '100',
      }),
    });
    expect(items[0]?.ticker).toBe('005930');
  });

  it('uses the KIS descending direction code for losers', async () => {
    const request = vi.fn(async () => ({ output: [] }));

    await fetchKisFluctuationRanking({
      direction: 'losers',
      count: 100,
      now: new Date('2026-05-08T01:00:00.000Z'),
      restClient: { request },
    });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          fid_rank_sort_cls_code: '3',
          fid_input_cnt_1: '100',
        }),
      }),
    );
  });

  it('uses the official overtime endpoint during NXT after-hours', async () => {
    const request = vi.fn(async () => ({
      output2: [
        {
          mksc_shrn_iscd: '277810',
          hts_kor_isnm: '레인보우로보틱스',
          ovtm_untp_prpr: '762000',
          ovtm_untp_prdy_vrss: '65000',
          ovtm_untp_prdy_ctrt: '9.33',
          ovtm_untp_vol: '12345',
        },
      ],
    }));

    const items = await fetchKisFluctuationRanking({
      direction: 'gainers',
      count: 100,
      now: new Date('2026-05-08T10:30:00.000Z'),
      restClient: { request },
    });

    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/uapi/domestic-stock/v1/ranking/overtime-fluctuation',
      trId: 'FHPST02340000',
      endpointClass: 'ranking',
      query: expect.objectContaining({
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_COND_SCR_DIV_CODE: '20234',
        FID_INPUT_ISCD: '0000',
        FID_DIV_CLS_CODE: '2',
      }),
    });
    expect(items[0]?.ticker).toBe('277810');
  });

  it('uses the KIS overtime descending direction code for losers', async () => {
    const request = vi.fn(async () => ({ output2: [] }));

    await fetchKisFluctuationRanking({
      direction: 'losers',
      count: 100,
      now: new Date('2026-05-08T10:30:00.000Z'),
      restClient: { request },
    });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          FID_DIV_CLS_CODE: '5',
        }),
      }),
    );
  });
});
