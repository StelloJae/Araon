import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MarketTape, type MarketTapeSummary } from '../StatusBar';

describe('MarketTape', () => {
  it('renders KST plus index, FX, and oil indicators compactly', () => {
    const summary: MarketTapeSummary = {
      indicators: [
        { id: 'kospi', label: 'KOSPI', value: 2700.12, change: 5.5, changePct: 0.2, unit: 'pt', status: 'ready' },
        { id: 'kosdaq', label: 'KOSDAQ', value: 900.5, change: -3.2, changePct: -0.35, unit: 'pt', status: 'ready' },
        { id: 'usdkrw', label: 'USD/KRW', value: 1464.7, change: 6.7, changePct: null, unit: '원', status: 'ready' },
        { id: 'wti', label: 'WTI', value: 94.81, change: -0.27, changePct: null, unit: '$', status: 'ready' },
      ],
    };

    const html = renderToStaticMarkup(
      createElement(MarketTape, {
        kstTime: '20:09:00 KST',
        summary,
      }),
    );

    expect(html).toContain('20:09:00 KST');
    expect(html).toContain('KOSPI');
    expect(html).toContain('2,700.12');
    expect(html).toContain('USD/KRW');
    expect(html).toContain('WTI');
  });
});
