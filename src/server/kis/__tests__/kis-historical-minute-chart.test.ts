import { describe, expect, it, vi } from 'vitest';

import {
  fetchKisHistoricalMinuteCandles,
  mapKisHistoricalMinuteDailyChartRows,
} from '../kis-historical-minute-chart';

describe('KIS historical minute daily chart mapper', () => {
  it('maps KIS daily-minute rows into stored 1m candles', () => {
    const candles = mapKisHistoricalMinuteDailyChartRows(
      '005930',
      [
        {
          stck_bsop_date: '20260504',
          stck_cntg_hour: '153100',
          stck_prpr: '70500',
          stck_oprc: '70000',
          stck_hgpr: '70600',
          stck_lwpr: '69900',
          cntg_vol: '1234',
        },
      ],
      '2026-05-06T12:10:00.000Z',
    );

    expect(candles).toEqual([
      expect.objectContaining({
        ticker: '005930',
        interval: '1m',
        bucketAt: '2026-05-04T06:31:00.000Z',
        session: 'after',
        open: 70_000,
        high: 70_600,
        low: 69_900,
        close: 70_500,
        volume: 1_234,
        source: 'kis-time-daily',
        isPartial: false,
      }),
    ]);
  });

  it('drops no-trade flat rows and never treats cumulative volume as minute volume', () => {
    const candles = mapKisHistoricalMinuteDailyChartRows(
      '005930',
      [
        {
          stck_bsop_date: '20260504',
          stck_cntg_hour: '190000',
          stck_prpr: '266000',
          stck_oprc: '266000',
          stck_hgpr: '266000',
          stck_lwpr: '266000',
          acml_vol: '3262125',
        },
        {
          stck_bsop_date: '20260504',
          stck_cntg_hour: '190100',
          stck_prpr: '266500',
          stck_oprc: '266000',
          stck_hgpr: '266500',
          stck_lwpr: '266000',
          acml_vol: '3263125',
        },
      ],
      '2026-05-06T12:10:00.000Z',
    );

    expect(candles).toHaveLength(1);
    expect(candles[0]).toMatchObject({
      bucketAt: '2026-05-04T10:01:00.000Z',
      volume: 0,
      source: 'kis-time-daily',
    });
  });

  it('uses the official KIS daily-minute endpoint and integrated market query contract', async () => {
    const request = vi.fn(async () => ({
      output2: [
        {
          stck_bsop_date: '20260504',
          stck_cntg_hour: '153100',
          stck_prpr: '70500',
          stck_oprc: '70000',
          stck_hgpr: '70600',
          stck_lwpr: '69900',
          cntg_vol: '1234',
        },
      ],
    }));

    const candles = await fetchKisHistoricalMinuteCandles({
      ticker: '005930',
      dateYmd: '20260504',
      toHms: '200000',
      restClient: { request },
      now: () => new Date('2026-05-06T12:10:00.000Z'),
    });

    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/uapi/domestic-stock/v1/quotations/inquire-time-dailychartprice',
      trId: 'FHKST03010230',
      query: {
        FID_COND_MRKT_DIV_CODE: 'UN',
        FID_INPUT_ISCD: '005930',
        FID_INPUT_HOUR_1: '200000',
        FID_INPUT_DATE_1: '20260504',
        FID_PW_DATA_INCU_YN: 'Y',
        FID_FAKE_TICK_INCU_YN: '',
      },
    });
    expect(candles).toHaveLength(1);
  });
});
