import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  KisBudgetPill,
  MarketTape,
  StatusBar,
  TossFastQuoteLanePill,
  TossQuotePollingPill,
  shouldShowKisBudgetPill,
  type KisBudgetSummary,
  type MarketTapeSummary,
  type TossFastQuoteLaneSummary,
  type TossQuotePollingSummary,
} from '../StatusBar';

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

describe('StatusBar', () => {
  it('keeps diagnostics out of the normal product tape', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBar, {
        totalCount: 50,
        favCount: 10,
        pollingCount: 40,
        lastUpdate: '20:09:00',
        kstTime: '20:09:00 KST',
        marketSummary: null,
        onOpenSettings: () => undefined,
      }),
    );

    expect(html).toContain('즐겨찾기');
    expect(html).not.toContain('투자 유의사항');
    expect(html).not.toContain('비실시간');
    expect(html).not.toContain('폴링');
    expect(html).not.toContain('총 종목');
    expect(html).not.toContain('일반 갱신');
    expect(html).not.toContain('일반 가격');
  });
});

describe('KisBudgetPill', () => {
  it('renders a product-facing realtime tracking risk label without raw provider classes', () => {
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

    expect(html).toContain('실시간 추적 여유');
    expect(html).toContain('1.0/s');
    expect(html).toContain('활성 경로 1개');
    expect(html).not.toContain('KIS');
    expect(html).not.toContain('REST');
    expect(html).not.toContain('polling');
    expect(html).not.toContain('ranking');
    expect(html).not.toContain('foreground');
  });

  it('translates raw KIS throttle reasons into user-facing tracking copy', () => {
    const budget = kisBudgetFixture({
      riskState: 'recovering',
      riskLabel: 'KIS 회복중',
      riskReason: 'EGW00201',
    });

    const html = renderToStaticMarkup(createElement(KisBudgetPill, { budget }));

    expect(html).toContain('실시간 추적 회복중');
    expect(html).toContain('요청 제한');
    expect(html).not.toContain('KIS');
    expect(html).not.toContain('EGW00201');
  });
});

describe('TossQuotePollingPill', () => {
  it('renders general quote diagnostics without product-bar copy', () => {
    const polling: TossQuotePollingSummary = {
      configured: true,
      running: true,
      enabled: true,
      source: 'toss-public',
      cycleCount: 4,
      lastCycleMs: 52,
      tickersInCycle: 12,
      requestedCount: 12,
      returnedCount: 11,
      missingCount: 1,
      errorCount: 0,
      consecutiveFailureCount: 0,
      lastSuccessAt: '2026-05-11T03:00:00.000Z',
      lastFailureAt: null,
      lastErrorCode: null,
      lastMessage: 'partial_quote_batch',
      intervalMs: 3000,
      batchSize: 100,
      suppressingKisPolling: true,
    };

    const html = renderToStaticMarkup(createElement(TossQuotePollingPill, { polling }));

    expect(html).toContain('가격 일부 지연');
    expect(html).toContain('실시간 추적과 별개');
    expect(html).toContain('실시간 추적 억제');
    expect(html).not.toContain('일반 가격');
  });

  it('does not imply KIS REST helper is open when repeated Toss failures are still suppressed', () => {
    const polling: TossQuotePollingSummary = {
      configured: true,
      running: true,
      enabled: true,
      source: 'toss-public',
      cycleCount: 8,
      lastCycleMs: 1200,
      tickersInCycle: 4,
      requestedCount: 4,
      returnedCount: 0,
      missingCount: 4,
      errorCount: 3,
      consecutiveFailureCount: 3,
      lastSuccessAt: null,
      lastFailureAt: '2026-05-12T00:00:00.000Z',
      lastErrorCode: 'TOSS_QUOTE_POLLING_FAILED',
      lastMessage: null,
      intervalMs: 3000,
      batchSize: 100,
      suppressingKisPolling: true,
    };

    const html = renderToStaticMarkup(createElement(TossQuotePollingPill, { polling }));

    expect(html).toContain('Toss 실패 · 추적 잠금');
    expect(html).toContain('실시간 추적 비활성');
    expect(html).not.toContain('실시간 추적 허용');
    expect(html).not.toContain('fallback');
    expect(html).not.toContain('polling');
  });
});

describe('TossFastQuoteLanePill', () => {
  it('renders user-facing fast quote health without raw cap counts', () => {
    const lane: TossFastQuoteLaneSummary = {
      configured: true,
      running: true,
      enabled: true,
      source: 'toss-fast-quote',
      intervalMs: 100,
      targetCap: 200,
      hardCap: 400,
      candidateCount: 33,
      requestedCount: 33,
      returnedCount: 33,
      acceptedCount: 2,
      droppedUnchangedCount: 31,
      droppedStaleCount: 0,
      droppedInvalidCount: 0,
      skippedInFlightCount: 0,
      failureCount: 0,
      consecutiveFailureCount: 0,
      backoffUntil: null,
      lastSuccessAt: '2026-05-11T03:00:00.000Z',
      lastFailureAt: null,
      lastErrorCode: null,
      lastMessage: 'ready',
    };

    const html = renderToStaticMarkup(createElement(TossFastQuoteLanePill, { lane }));

    expect(html).toContain('빠른 가격 정상');
    expect(html).toContain('관심 종목 33/33 갱신');
    expect(html).not.toContain('실시간 추적과 별개');
    expect(html).not.toContain('간격 0.1s');
    expect(html).not.toContain('상세 진단');
    expect(html).not.toContain('빠른 가격 · 33종목');
  });

  it('renders fast quote health as tape text instead of a tall pill in the footer', () => {
    const lane: TossFastQuoteLaneSummary = {
      configured: true,
      running: true,
      enabled: true,
      source: 'toss-fast-quote',
      intervalMs: 100,
      targetCap: 200,
      hardCap: 400,
      candidateCount: 33,
      requestedCount: 33,
      returnedCount: 33,
      acceptedCount: 2,
      droppedUnchangedCount: 31,
      droppedStaleCount: 0,
      droppedInvalidCount: 0,
      skippedInFlightCount: 0,
      failureCount: 0,
      consecutiveFailureCount: 0,
      backoffUntil: null,
      lastSuccessAt: '2026-05-11T03:00:00.000Z',
      lastFailureAt: null,
      lastErrorCode: null,
      lastMessage: 'ready',
    };

    const html = renderToStaticMarkup(
      createElement(StatusBar, {
        totalCount: 50,
        favCount: 10,
        pollingCount: 40,
        lastUpdate: '20:09:00',
        kstTime: '20:09:00 KST',
        marketSummary: null,
        onOpenSettings: () => undefined,
        fastQuoteLaneOverride: lane,
      }),
    );

    expect(html).toContain('빠른 가격');
    expect(html).toContain('정상');
    expect(html).not.toContain('height:22px');
    expect(html).not.toContain('border-radius:999px');
  });
});

describe('shouldShowKisBudgetPill', () => {
  it('hides calm KIS budget while Toss polling suppresses KIS polling', () => {
    const budget = kisBudgetFixture({ riskState: 'safe', riskLabel: 'KIS 여유' });
    const polling = tossPollingFixture({ suppressingKisPolling: true });

    expect(shouldShowKisBudgetPill(budget, polling)).toBe(false);
  });

  it('keeps KIS budget visible when fallback risk matters', () => {
    const budget = kisBudgetFixture({
      riskState: 'recovering',
      riskLabel: 'KIS 회복중',
      riskReason: 'EGW00201',
    });
    const polling = tossPollingFixture({ suppressingKisPolling: true });

    expect(shouldShowKisBudgetPill(budget, polling)).toBe(true);
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

function kisBudgetFixture(
  overrides: Partial<KisBudgetSummary> = {},
): KisBudgetSummary {
  return {
    generatedAt: '2026-05-11T03:00:00.000Z',
    riskState: 'safe',
    riskLabel: 'KIS 여유',
    riskReason: null,
    windows: {
      tenSec: emptyWindow(10_000),
      sixtySec: emptyWindow(60_000),
    },
    ...overrides,
  };
}

function tossPollingFixture(
  overrides: Partial<TossQuotePollingSummary> = {},
): TossQuotePollingSummary {
  return {
    configured: true,
    running: true,
    enabled: true,
    source: 'toss-public',
    cycleCount: 4,
    lastCycleMs: 52,
    tickersInCycle: 12,
    requestedCount: 12,
    returnedCount: 12,
    missingCount: 0,
    errorCount: 0,
    consecutiveFailureCount: 0,
    lastSuccessAt: '2026-05-11T03:00:00.000Z',
    lastFailureAt: null,
    lastErrorCode: null,
    lastMessage: 'success',
    intervalMs: 3000,
    batchSize: 100,
    suppressingKisPolling: true,
    ...overrides,
  };
}
