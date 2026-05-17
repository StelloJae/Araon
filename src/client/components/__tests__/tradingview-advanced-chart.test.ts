import { describe, expect, it } from 'vitest';

import {
  tradingViewEmbedModeForStock,
  tradingViewSymbolForStock,
} from '../TradingViewAdvancedChart';

describe('tradingViewSymbolForStock', () => {
  it('uses KRX-prefixed symbols for Korean dashboard tickers', () => {
    expect(tradingViewSymbolForStock({ code: '005930', market: 'KOSPI' })).toBe('KRX:005930');
    expect(tradingViewSymbolForStock({ code: '035720', market: 'KOSDAQ' })).toBe('KRX:035720');
  });

  it('keeps KRX tickers on the local datafeed path until Charting Library is available', () => {
    expect(tradingViewEmbedModeForStock({ code: '005930', market: 'KOSPI' })).toBe(
      'local-datafeed-required',
    );
    expect(tradingViewEmbedModeForStock({ code: '035720', market: 'KOSDAQ' })).toBe(
      'local-datafeed-required',
    );
  });
});
