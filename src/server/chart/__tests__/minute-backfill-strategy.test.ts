import { describe, expect, it } from 'vitest';

import { planSelectedTickerMinuteBackfill } from '../minute-backfill-strategy';

describe('selected ticker minute backfill strategy', () => {
  it('allows only manual selected-ticker planning after the integrated session closes', () => {
    expect(
      planSelectedTickerMinuteBackfill({
        tickers: ['005930'],
        now: new Date('2026-05-05T11:10:00.000Z'),
      }),
    ).toEqual({
      state: 'ready',
      tickers: ['005930'],
      interval: '1m',
      source: 'kis-time-today',
      rowLimitPerRequest: 30,
      maxPages: 4,
      maxRows: 120,
      backgroundAllowed: false,
      fullWatchlistAllowed: false,
      message: '선택 종목의 당일 분봉 일부만 수동 보강할 수 있습니다.',
    });
  });

  it('blocks minute backfill during the integrated market session', () => {
    expect(
      planSelectedTickerMinuteBackfill({
        tickers: ['005930'],
        now: new Date('2026-05-05T06:00:00.000Z'),
      }),
    ).toMatchObject({
      state: 'blocked',
      reason: 'MARKET_HOURS',
      backgroundAllowed: false,
    });
  });

  it('refuses full-watchlist or multi-ticker minute backfill', () => {
    expect(
      planSelectedTickerMinuteBackfill({
        tickers: ['005930', '000660'],
        now: new Date('2026-05-05T11:10:00.000Z'),
      }),
    ).toMatchObject({
      state: 'blocked',
      reason: 'SELECTED_TICKER_ONLY',
      fullWatchlistAllowed: false,
    });
  });

  it('holds weekend planning because KIS minute data is today-only', () => {
    expect(
      planSelectedTickerMinuteBackfill({
        tickers: ['005930'],
        now: new Date('2026-05-09T03:00:00.000Z'),
      }),
    ).toMatchObject({
      state: 'hold',
      reason: 'TODAY_MINUTE_ONLY',
    });
  });
});
