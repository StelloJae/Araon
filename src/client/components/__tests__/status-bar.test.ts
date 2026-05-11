import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { KisBudgetPill, MarketTape, type KisBudgetSummary, type MarketTapeSummary } from '../StatusBar';

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

describe('KisBudgetPill', () => {
  it('renders the compact REST budget risk label', () => {
    const budget: KisBudgetSummary = {
      generatedAt: '2026-05-11T03:00:00.000Z',
      riskState: 'safe',
      riskLabel: 'KIS 여유',
      riskReason: '1.0/s',
      windows: {
        tenSec: emptyWindow(10_000),
        sixtySec: {
          ...emptyWindow(60_000),
          startedCount: 60,
          callPerSec: 1,
          byClass: [
            {
              profileId: 'primary',
              endpointClass: 'polling',
              priorityClass: 'polling',
              startedCount: 50,
              successCount: 50,
              failureCount: 0,
              throttleCount: 0,
              callPerSec: 0.83,
              successPerSec: 0.83,
              failurePerMin: 0,
              throttlePerMin: 0,
              queueDepth: 0,
              currentAllowedRps: 15,
            },
          ],
        },
      },
    };

    const html = renderToStaticMarkup(createElement(KisBudgetPill, { budget }));

    expect(html).toContain('KIS 여유');
    expect(html).toContain('1.0/s');
    expect(html).toContain('polling 0.83/s');
  });
});

function emptyWindow(windowMs: number): KisBudgetSummary['windows']['sixtySec'] {
  return {
    windowMs,
    startedCount: 0,
    successCount: 0,
    failureCount: 0,
    throttleCount: 0,
    callPerSec: 0,
    successPerSec: 0,
    failurePerMin: 0,
    throttlePerMin: 0,
    byClass: [],
  };
}
