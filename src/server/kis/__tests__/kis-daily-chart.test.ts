import { describe, expect, it, vi } from 'vitest';
import { KisRestError } from '../kis-rest-client.js';
import {
  fetchKisDailyCandles,
  mapKisDailyItemChartRows,
  classifyKisDailyBackfillError,
} from '../kis-daily-chart.js';

describe('mapKisDailyItemChartRows', () => {
  it('normalizes KIS daily OHLCV rows into 1d candles', () => {
    const rows = mapKisDailyItemChartRows('005930', [
      {
        stck_bsop_date: '20260502',
        stck_oprc: '70000',
        stck_hgpr: '71000',
        stck_lwpr: '69000',
        stck_clpr: '70500',
        acml_vol: '1234567',
      },
    ], '2026-05-05T12:00:00.000Z');

    expect(rows).toEqual([
      expect.objectContaining({
        ticker: '005930',
        interval: '1d',
        bucketAt: '2026-05-01T15:00:00.000Z',
        session: 'regular',
        open: 70_000,
        high: 71_000,
        low: 69_000,
        close: 70_500,
        volume: 1_234_567,
        sampleCount: 1,
        source: 'kis-daily',
        isPartial: false,
      }),
    ]);
  });

  it('skips malformed rows without inventing candles', () => {
    const rows = mapKisDailyItemChartRows('005930', [
      { stck_bsop_date: '20260502', stck_oprc: 'bad' },
      { stck_bsop_date: '', stck_oprc: '70000', stck_hgpr: '71000', stck_lwpr: '69000', stck_clpr: '70500', acml_vol: '1' },
    ], '2026-05-05T12:00:00.000Z');

    expect(rows).toEqual([]);
  });
});

describe('fetchKisDailyCandles', () => {
  it('calls the KIS daily chart endpoint through an injected transport', async () => {
    const request = vi.fn().mockResolvedValue({
      output2: [
        {
          stck_bsop_date: '20260502',
          stck_oprc: '70000',
          stck_hgpr: '71000',
          stck_lwpr: '69000',
          stck_clpr: '70500',
          acml_vol: '1234567',
        },
      ],
    });

    const candles = await fetchKisDailyCandles({
      ticker: '005930',
      fromYmd: '20260501',
      toYmd: '20260505',
      restClient: { request },
      now: () => new Date('2026-05-05T12:00:00.000Z'),
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      path: '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
      trId: 'FHKST03010100',
      query: expect.objectContaining({
        FID_COND_MRKT_DIV_CODE: 'UN',
        FID_INPUT_ISCD: '005930',
        FID_INPUT_DATE_1: '20260501',
        FID_INPUT_DATE_2: '20260505',
        FID_PERIOD_DIV_CODE: 'D',
        FID_ORG_ADJ_PRC: '0',
      }),
    }));
    expect(candles).toHaveLength(1);
    expect(candles[0]?.source).toBe('kis-daily');
  });

  it('classifies KIS throttle errors as cooldown-worthy', () => {
    const err = new KisRestError('too many requests', 429, null, 'EGW00201', {});
    expect(classifyKisDailyBackfillError(err)).toEqual({
      code: 'KIS_RATE_LIMITED',
      cooldownMs: 10 * 60 * 1000,
    });
  });
});
