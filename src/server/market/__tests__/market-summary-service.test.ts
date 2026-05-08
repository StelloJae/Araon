import { describe, expect, it } from 'vitest';

import {
  createMarketSummaryService,
  parseNaverIndexPage,
  parseNaverMarketIndexPage,
} from '../market-summary-service.js';

describe('market summary service', () => {
  it('parses KOSPI/KOSDAQ index pages from Naver Finance markup', () => {
    const parsed = parseNaverIndexPage(`
      <div class="quotient dn" id ="quotient">
        <em id="now_value">2,742.13</em>
        <span class="fluc" id="change_value_and_rate"><span>12.92</span> -0.84%</span>
      </div>
    `);

    expect(parsed).toEqual({
      value: 2742.13,
      change: -12.92,
      changePct: -0.84,
    });
  });

  it('parses USD/KRW and WTI from the Naver market index page', () => {
    const parsed = parseNaverMarketIndexPage(`
      <li class="on">
        <a href="/marketindex/exchangeDetail.naver?marketindexCd=FX_USDKRW" class="head usd">
          <h3 class="h_lst"><span class="blind">미국 USD</span></h3>
          <div class="head_info point_up">
            <span class="value">1,464.70</span>
            <span class="change">6.70</span>
            <span class="blind">상승</span>
          </div>
        </a>
      </li>
      <li class="on">
        <a href="/marketindex/worldOilDetail.naver?marketindexCd=OIL_CL&fdtc=2" class="head wti">
          <h3 class="h_lst"><span class="blind">WTI</span></h3>
          <div class="head_info point_dn">
            <span class="value">94.81</span>
            <span class="change">0.27</span>
            <span class="blind">하락</span>
          </div>
        </a>
      </li>
    `);

    expect(parsed.usdKrw).toMatchObject({ value: 1464.7, change: 6.7 });
    expect(parsed.wti).toMatchObject({ value: 94.81, change: -0.27 });
  });

  it('returns all four market tape indicators from a mock transport', async () => {
    const service = createMarketSummaryService({
      now: () => new Date('2026-05-08T11:00:00.000Z'),
      ttlMs: 1,
      fetchText: async (url) => {
        if (url.includes('code=KOSPI')) {
          return '<em id="now_value">2,700.00</em><span id="change_value_and_rate"><span>10.00</span> +0.37%</span>';
        }
        if (url.includes('code=KOSDAQ')) {
          return '<em id="now_value">900.00</em><span id="change_value_and_rate"><span>5.00</span> -0.55%</span>';
        }
        return `
          <a class="head usd"><span class="blind">미국 USD</span><div class="head_info point_up"><span class="value">1,400.00</span><span class="change">1.50</span><span class="blind">상승</span></div></a>
          <a class="head wti"><span class="blind">WTI</span><div class="head_info point_dn"><span class="value">80.25</span><span class="change">0.75</span><span class="blind">하락</span></div></a>
        `;
      },
    });

    const summary = await service.getSummary();

    expect(summary.indicators.map((item) => item.id)).toEqual([
      'kospi',
      'kosdaq',
      'usdkrw',
      'wti',
    ]);
    expect(summary.indicators[0]).toMatchObject({ label: 'KOSPI', value: 2700 });
    expect(summary.indicators[3]).toMatchObject({ label: 'WTI', change: -0.75 });
  });
});
