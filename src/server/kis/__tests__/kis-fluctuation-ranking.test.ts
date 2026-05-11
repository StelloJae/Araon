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
    const restClient = createMockRestClient([
      {
        payload: {
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
        },
        trCont: null,
      },
    ]);

    const items = await fetchKisFluctuationRanking({
      direction: 'gainers',
      count: 100,
      now: new Date('2026-05-08T01:00:00.000Z'),
      restClient,
    });

    expect(restClient.requestWithMeta).toHaveBeenCalledWith({
      method: 'GET',
      path: '/uapi/domestic-stock/v1/ranking/fluctuation',
      trId: 'FHPST01700000',
      endpointClass: 'ranking',
      query: expect.objectContaining({
        fid_cond_mrkt_div_code: 'J',
        fid_cond_scr_div_code: '20170',
        fid_input_iscd: '0000',
        fid_rank_sort_cls_code: '0',
        fid_input_cnt_1: '0',
      }),
    });
    expect(items[0]?.ticker).toBe('005930');
  });

  it('uses the KIS previous-day decline direction code for losers', async () => {
    const restClient = createMockRestClient([{ payload: { output: [] }, trCont: null }]);

    await fetchKisFluctuationRanking({
      direction: 'losers',
      count: 100,
      now: new Date('2026-05-08T01:00:00.000Z'),
      restClient,
    });

    expect(restClient.requestWithMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          fid_rank_sort_cls_code: '1',
          fid_input_cnt_1: '0',
        }),
      }),
    );
  });

  it('uses the expected transaction ranking endpoint for premarket TOP100', async () => {
    const restClient = createMockRestClient([
      {
        payload: {
          output: [
            {
              stck_shrn_iscd: '005930',
              hts_kor_isnm: '삼성전자',
              stck_prpr: '70000',
              prdy_vrss: '2500',
              prdy_ctrt: '3.70',
              cntg_vol: '1234',
            },
          ],
        },
        trCont: null,
      },
    ]);

    const items = await fetchKisFluctuationRanking({
      direction: 'gainers',
      count: 100,
      sourcePhase: 'premarket',
      restClient,
    });

    expect(restClient.requestWithMeta).toHaveBeenCalledWith({
      method: 'GET',
      path: '/uapi/domestic-stock/v1/ranking/exp-trans-updown',
      trId: 'FHPST01820000',
      endpointClass: 'ranking',
      query: expect.objectContaining({
        fid_rank_sort_cls_code: '0',
        fid_cond_mrkt_div_code: 'J',
        fid_cond_scr_div_code: '20182',
        fid_input_iscd: '0000',
        fid_mkop_cls_code: '0',
      }),
    });
    expect(items[0]).toMatchObject({ ticker: '005930', rank: 1, changePct: 3.7 });
  });

  it('uses the overtime fluctuation endpoint for after-hours TOP100', async () => {
    const restClient = createMockRestClient([
      {
        payload: {
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
        },
        trCont: null,
      },
    ]);

    const items = await fetchKisFluctuationRanking({
      direction: 'gainers',
      count: 100,
      sourcePhase: 'after_hours',
      restClient,
    });

    expect(restClient.requestWithMeta).toHaveBeenCalledWith({
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
    expect(items[0]).toMatchObject({ ticker: '277810', rank: 1, changePct: 9.33 });
  });

  it('keeps TOP100 on the full-day fluctuation endpoint during NXT after-hours', async () => {
    const restClient = createMockRestClient([
      {
        payload: {
          output: [
            {
              data_rank: '1',
              stck_shrn_iscd: '277810',
              hts_kor_isnm: '레인보우로보틱스',
              stck_prpr: '782000',
              prdy_vrss: '86000',
              prdy_ctrt: '12.20',
              acml_vol: '12345',
            },
          ],
        },
        trCont: null,
      },
    ]);

    const items = await fetchKisFluctuationRanking({
      direction: 'gainers',
      count: 100,
      now: new Date('2026-05-08T10:30:00.000Z'),
      restClient,
    });

    expect(restClient.requestWithMeta).toHaveBeenCalledWith({
      method: 'GET',
      path: '/uapi/domestic-stock/v1/ranking/fluctuation',
      trId: 'FHPST01700000',
      endpointClass: 'ranking',
      query: expect.objectContaining({
        fid_cond_mrkt_div_code: 'J',
        fid_cond_scr_div_code: '20170',
        fid_input_iscd: '0000',
        fid_rank_sort_cls_code: '0',
        fid_input_cnt_1: '0',
      }),
    });
    expect(items[0]?.ticker).toBe('277810');
    expect(items[0]?.changePct).toBe(12.2);
  });

  it('keeps loser TOP100 on the full-day fluctuation endpoint during NXT after-hours', async () => {
    const restClient = createMockRestClient([{ payload: { output: [] }, trCont: null }]);

    await fetchKisFluctuationRanking({
      direction: 'losers',
      count: 100,
      now: new Date('2026-05-08T10:30:00.000Z'),
      restClient,
    });

    expect(restClient.requestWithMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          fid_rank_sort_cls_code: '1',
          fid_input_cnt_1: '0',
        }),
      }),
    );
  });

  it('filters and re-ranks mixed KIS rows by requested direction', async () => {
    const restClient = createMockRestClient([
      {
        payload: {
          output: [
            {
              data_rank: '1',
              stck_shrn_iscd: '000001',
              hts_kor_isnm: '깨진상승목록음수',
              stck_prpr: '1000',
              prdy_vrss: '-10',
              prdy_ctrt: '-1.00',
              acml_vol: '100',
            },
            {
              data_rank: '2',
              stck_shrn_iscd: '000002',
              hts_kor_isnm: '상승이',
              stck_prpr: '2000',
              prdy_vrss: '100',
              prdy_ctrt: '5.00',
              acml_vol: '200',
            },
            {
              data_rank: '3',
              stck_shrn_iscd: '000003',
              hts_kor_isnm: '상승일',
              stck_prpr: '3000',
              prdy_vrss: '300',
              prdy_ctrt: '10.00',
              acml_vol: '300',
            },
          ],
        },
        trCont: null,
      },
    ]);

    const items = await fetchKisFluctuationRanking({
      direction: 'gainers',
      count: 10,
      restClient,
    });

    expect(items.map((item) => [item.rank, item.ticker, item.changePct])).toEqual([
      [1, '000003', 10],
      [2, '000002', 5],
    ]);
  });

  it('follows KIS tr_cont pages until the requested ranking count is filled', async () => {
    const restClient = createMockRestClient([
      {
        payload: {
          output: [
            {
              data_rank: '1',
              stck_shrn_iscd: '000001',
              hts_kor_isnm: '상승일',
              stck_prpr: '1000',
              prdy_vrss: '100',
              prdy_ctrt: '10.00',
              acml_vol: '100',
            },
          ],
        },
        trCont: 'M',
      },
      {
        payload: {
          output: [
            {
              data_rank: '2',
              stck_shrn_iscd: '000002',
              hts_kor_isnm: '상승이',
              stck_prpr: '2000',
              prdy_vrss: '180',
              prdy_ctrt: '9.90',
              acml_vol: '200',
            },
          ],
        },
        trCont: null,
      },
    ]);

    const items = await fetchKisFluctuationRanking({
      direction: 'gainers',
      count: 2,
      restClient,
      pageDelayMs: 0,
    });

    expect(restClient.requestWithMeta).toHaveBeenCalledTimes(2);
    expect(restClient.requestWithMeta).toHaveBeenNthCalledWith(
      1,
      expect.not.objectContaining({ headers: expect.anything() }),
    );
    expect(restClient.requestWithMeta).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ headers: { tr_cont: 'N' } }),
    );
    expect(items.map((item) => item.ticker)).toEqual(['000001', '000002']);
  });

  it('fills TOP100 across continuation pages and records sanitized diagnostics', async () => {
    const diagnostics: unknown[] = [];
    const restClient = createMockRestClient([
      { payload: { output: makeKisRows('gainers', 1, 30) }, trCont: 'M' },
      { payload: { output: makeKisRows('gainers', 31, 30) }, trCont: 'M' },
      { payload: { output: makeKisRows('gainers', 61, 30) }, trCont: 'M' },
      { payload: { output: makeKisRows('gainers', 91, 10) }, trCont: null },
    ]);

    const items = await fetchKisFluctuationRanking({
      direction: 'gainers',
      count: 100,
      restClient,
      pageDelayMs: 0,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(items).toHaveLength(100);
    expect(restClient.requestWithMeta).toHaveBeenCalledTimes(4);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        direction: 'gainers',
        pagesAttempted: 4,
        rowsReceived: 100,
        rowsAccepted: 100,
        rowsPerPage: [30, 30, 30, 10],
        continuationValues: ['M', 'M', 'M', null],
        stopReason: 'complete',
      }),
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain('appSecret');
  });

  it('classifies a 30-row response without continuation as an upstream partial limit suspect', async () => {
    const diagnostics: unknown[] = [];
    const restClient = createMockRestClient([
      { payload: { output: makeKisRows('gainers', 1, 30) }, trCont: null },
    ]);

    const items = await fetchKisFluctuationRanking({
      direction: 'gainers',
      count: 100,
      restClient,
      pageDelayMs: 0,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(items).toHaveLength(30);
    expect(restClient.requestWithMeta).toHaveBeenCalledTimes(1);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        pagesAttempted: 1,
        rowsReceived: 30,
        rowsAccepted: 30,
        rowsPerPage: [30],
        continuationValues: [null],
        stopReason: 'upstream_partial_limit_suspected',
      }),
    ]);
  });
});

function createMockRestClient(
  pages: Array<{ payload: Record<string, unknown>; trCont: string | null }>,
) {
  const queue = [...pages];
  const requestWithMeta = vi.fn(async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error('unexpected KIS page request');
    return {
      payload: next.payload,
      headers: { trCont: next.trCont },
    };
  });
  return {
    request: vi.fn(async () => (await requestWithMeta()).payload),
    requestWithMeta,
  };
}

function makeKisRows(direction: 'gainers' | 'losers', start: number, count: number) {
  return Array.from({ length: count }, (_, idx) => {
    const rank = start + idx;
    const changePct = direction === 'gainers' ? 100 - rank / 100 : -(100 - rank / 100);
    return {
      data_rank: String(rank),
      stck_shrn_iscd: String(rank).padStart(6, '0'),
      hts_kor_isnm: `${direction}-${rank}`,
      stck_prpr: String(1_000 + rank),
      prdy_vrss: String(direction === 'gainers' ? rank : -rank),
      prdy_ctrt: changePct.toFixed(2),
      acml_vol: String(rank * 100),
    };
  });
}
