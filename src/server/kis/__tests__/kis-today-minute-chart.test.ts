import { describe, expect, it, vi } from 'vitest';

import {
  fetchKisTodayMinuteCandles,
  mapKisTodayMinuteItemChartRows,
} from '../kis-today-minute-chart';

describe('KIS today minute chart mapper', () => {
  it('maps KIS today minute rows into local 1m candles', () => {
    const candles = mapKisTodayMinuteItemChartRows(
      '005930',
      [
        {
          stck_bsop_date: '20260506',
          stck_cntg_hour: '153000',
          stck_prpr: '70500',
          stck_oprc: '70000',
          stck_hgpr: '70600',
          stck_lwpr: '69900',
          cntg_vol: '1234',
        },
      ],
      '2026-05-06T11:10:00.000Z',
    );

    expect(candles).toEqual([
      expect.objectContaining({
        ticker: '005930',
        interval: '1m',
        bucketAt: '2026-05-06T06:30:00.000Z',
        open: 70_000,
        high: 70_600,
        low: 69_900,
        close: 70_500,
        volume: 1_234,
        source: 'kis-time-today',
        isPartial: false,
      }),
    ]);
  });

  it('drops no-trade flat rows instead of drawing synthetic after-hours candles', () => {
    const candles = mapKisTodayMinuteItemChartRows(
      '005930',
      [
        {
          stck_bsop_date: '20260506',
          stck_cntg_hour: '190000',
          stck_prpr: '266000',
          stck_oprc: '266000',
          stck_hgpr: '266000',
          stck_lwpr: '266000',
          cntg_vol: '0',
        },
        {
          stck_bsop_date: '20260506',
          stck_cntg_hour: '193000',
          stck_prpr: '266000',
          stck_oprc: '266000',
          stck_hgpr: '266000',
          stck_lwpr: '266000',
          acml_vol: '3262125',
        },
      ],
      '2026-05-06T11:10:00.000Z',
    );

    expect(candles).toEqual([]);
  });

  it('does not use cumulative acml_vol as minute volume', () => {
    const candles = mapKisTodayMinuteItemChartRows(
      '005930',
      [
        {
          stck_bsop_date: '20260506',
          stck_cntg_hour: '190000',
          stck_prpr: '266000',
          stck_oprc: '265500',
          stck_hgpr: '266500',
          stck_lwpr: '265000',
          acml_vol: '3262125',
        },
      ],
      '2026-05-06T11:10:00.000Z',
    );

    expect(candles).toHaveLength(1);
    expect(candles[0]?.volume).toBe(0);
  });

  it('uses the KIS today minute endpoint and safe query contract', async () => {
    const request = vi.fn(async () => ({
      output2: [
        {
          stck_bsop_date: '20260506',
          stck_cntg_hour: '153000',
          stck_prpr: '70500',
          stck_oprc: '70000',
          stck_hgpr: '70600',
          stck_lwpr: '69900',
          cntg_vol: '1234',
        },
      ],
    }));

    const candles = await fetchKisTodayMinuteCandles({
      ticker: '005930',
      toHms: '200500',
      restClient: { request },
      now: () => new Date('2026-05-06T11:10:00.000Z'),
    });

    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice',
      trId: 'FHKST03010200',
      endpointClass: 'selected-minute',
      query: {
        FID_ETC_CLS_CODE: '',
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: '005930',
        FID_INPUT_HOUR_1: '200500',
        FID_PW_DATA_INCU_YN: 'Y',
      },
    });
    expect(candles).toHaveLength(1);
  });
});
