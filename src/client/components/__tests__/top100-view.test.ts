import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { MarketTopMoversResponse, TossRealtimeRankingResponse } from '@shared/types';
import {
  normalizeMarketTop100RefreshDelayMs,
  shouldScheduleMarketTop100Refresh,
} from '../SectionStack';
import { TopMoversBoard } from '../TopMoversBoard';
import { TossRealtimeRankingBoard } from '../TossRealtimeRankingBoard';

function topMovers(): MarketTopMoversResponse {
  return {
    generatedAt: '2026-05-08T08:00:05.000Z',
    fetchedAt: '2026-05-08T08:00:05.000Z',
    cacheTtlMs: 3_000,
    refreshIntervalMs: 3_000,
    staleAfterMs: 15_000,
    source: 'kis-ranking-auto',
    sourcePhase: 'regular',
    sourceLabel: '본장',
    sourceReason: '정규장 등락률 랭킹입니다.',
    frozen: false,
    lastGoodAgeMs: 0,
    partialReason: 'under_requested_limit',
    stopReason: 'under_requested_limit',
    rankingDiagnostics: {
      gainers: null,
      losers: null,
    },
    rankingRateLimited: false,
    status: 'ready',
    message: '3초마다 갱신',
    cooldownUntil: null,
    coverage: {
      requestedLimit: 100,
      gainersCount: 1,
      losersCount: 1,
      gainersComplete: false,
      losersComplete: false,
      marketUniverse: 'kis-full-market-ranking',
      guaranteedTop100: false,
      includesLocalFallback: false,
    },
    gainers: [
      {
        rank: 1,
        ticker: '005930',
        name: '삼성전자',
        price: 70_000,
        changeAbs: 2_500,
        changePct: 3.7,
        volume: 1_234_567,
      },
    ],
    losers: [
      {
        rank: 1,
        ticker: '000660',
        name: 'SK하이닉스',
        price: 180_000,
        changeAbs: -5_000,
        changePct: -2.7,
        volume: 7_654_321,
      },
    ],
  };
}

function unsupportedTopMovers(): MarketTopMoversResponse {
  return {
    ...topMovers(),
    fetchedAt: null,
    source: 'toss-overview-ranking',
    sourcePhase: 'unsupported',
    sourceLabel: '토스 웹 랭킹',
    status: 'unconfigured',
    message: '현재 시간대에 사용할 TOP100 랭킹 소스가 없습니다.',
    partialReason: 'source_unsupported',
    stopReason: null,
    coverage: {
      requestedLimit: 100,
      gainersCount: 0,
      losersCount: 0,
      gainersComplete: false,
      losersComplete: false,
      marketUniverse: 'toss-web-ranking',
      guaranteedTop100: false,
      includesLocalFallback: false,
    },
    gainers: [],
    losers: [],
  };
}

function tossRealtimeRanking(): TossRealtimeRankingResponse {
  return {
    generatedAt: '2026-05-11T06:05:00.000Z',
    fetchedAt: '2026-05-11T06:05:00.000Z',
    rankingDateTime: '2025-03-10T16:44:43',
    rankingTimestampStatus: 'stale',
    source: 'toss-public-realtime-ranking',
    sourceLabel: '토스 실시간 인기',
    status: 'partial',
    message: '토스 공개 인기 랭킹입니다. 랭킹 시각이 오래되어 가격만 별도 갱신했습니다.',
    refreshIntervalMs: 15_000,
    coverage: {
      requestedLimit: 100,
      returnedCount: 1,
      pricedCount: 1,
      market: 'kr',
    },
    items: [
      {
        rank: 1,
        ticker: '005930',
        productCode: 'A005930',
        name: '삼성전자',
        market: '코스피',
        currency: 'KRW',
        price: 284_000,
        changeAbs: 15_500,
        changePct: 5.77,
        volume: 56_326_493,
      },
    ],
  };
}

describe('TOP100 view chrome', () => {
  it('renders gainers and losers in the compact section-card style', () => {
    const html = renderToStaticMarkup(
      createElement(TopMoversBoard, {
        data: topMovers(),
        onOpenTicker: vi.fn(),
      }),
    );

    expect(html).toContain('상승 TOP100');
    expect(html).toContain('하락 TOP100');
    expect(html).toContain('1/100');
    expect(html).toContain('KIS 전체시장 일부');
    expect(html).toContain('3초');
    expect(html).toContain('삼성전자');
    expect(html).toContain('SK하이닉스');
  });

  it('renders sub-second TOP100 refresh cadence without rounding up to one second', () => {
    const html = renderToStaticMarkup(
      createElement(TopMoversBoard, {
        data: {
          ...topMovers(),
          refreshIntervalMs: 500,
          cacheTtlMs: 500,
        },
        onOpenTicker: vi.fn(),
      }),
    );

    expect(html).toContain('0.5초마다');
    expect(html).not.toContain('1초마다');
  });

  it('keeps TOP100 polling sub-second but never schedules after cancellation', () => {
    expect(normalizeMarketTop100RefreshDelayMs(500)).toBe(500);
    expect(normalizeMarketTop100RefreshDelayMs(250)).toBe(300);
    expect(shouldScheduleMarketTop100Refresh(false)).toBe(true);
    expect(shouldScheduleMarketTop100Refresh(true)).toBe(false);
  });

  it('does not turn local watchlist rows into a fake full-market TOP100 fallback', () => {
    const html = renderToStaticMarkup(
      createElement(TopMoversBoard, {
        data: {
          ...topMovers(),
          fetchedAt: null,
          status: 'cooldown',
          message: 'KIS 호출 제한으로 TOP100 갱신을 대기합니다.',
          coverage: {
            requestedLimit: 100,
            gainersCount: 0,
            losersCount: 0,
            gainersComplete: false,
            losersComplete: false,
            marketUniverse: 'kis-full-market-ranking',
            guaranteedTop100: false,
            includesLocalFallback: false,
          },
          gainers: [],
          losers: [],
        },
        onOpenTicker: vi.fn(),
      }),
    );

    expect(html).toContain('KIS 전체시장 대기');
    expect(html).toContain('랭킹 데이터를 기다리는 중');
    expect(html).not.toContain('현재 화면 종목 기준');
  });

  it('labels a complete KIS ranking as full-market guaranteed', () => {
    const full = {
      ...topMovers(),
      coverage: {
        ...topMovers().coverage,
        gainersCount: 100,
        losersCount: 100,
        gainersComplete: true,
        losersComplete: true,
        guaranteedTop100: true,
      },
    } satisfies MarketTopMoversResponse;
    const html = renderToStaticMarkup(
      createElement(TopMoversBoard, {
        data: full,
        onOpenTicker: vi.fn(),
      }),
    );

    expect(html).toContain('KIS 전체시장 보장');
  });

  it('labels a complete Toss overview ranking without KIS partial wording', () => {
    const data = {
      ...topMovers(),
      source: 'toss-overview-ranking',
      sourceLabel: '토스 웹 랭킹',
      sourceReason: '토스증권 웹 overview ranking 기반 상승/하락 랭킹입니다.',
      message: '토스 웹 랭킹 · 30초마다 갱신',
      partialReason: null,
      stopReason: null,
      coverage: {
        ...topMovers().coverage,
        marketUniverse: 'toss-web-ranking',
        gainersCount: 100,
        losersCount: 100,
        gainersComplete: true,
        losersComplete: true,
        guaranteedTop100: true,
      },
    } satisfies MarketTopMoversResponse;
    const html = renderToStaticMarkup(
      createElement(TopMoversBoard, {
        data,
        onOpenTicker: vi.fn(),
      }),
    );

    expect(html).toContain('토스 웹 랭킹');
    expect(html).toContain('토스 웹 랭킹 보장');
    expect(html).not.toContain('KIS 직접 랭킹 일부');
  });

  it('shows the market source phase and retained snapshot state without changing the TOP100 surface', () => {
    const html = renderToStaticMarkup(
      createElement(TopMoversBoard, {
        data: {
          ...topMovers(),
          source: 'kis-ranking-stale-snapshot',
          sourcePhase: 'stale_snapshot',
          sourceLabel: '직전',
          sourceReason: '현재 새로 조회하지 않고 마지막 랭킹을 유지합니다.',
          status: 'stale',
          message: '새 랭킹이 더 적게 수신되어 직전 랭킹을 유지합니다.',
          partialReason: 'smaller_refresh_retained',
          lastGoodAgeMs: 62_000,
        },
        onOpenTicker: vi.fn(),
      }),
    );

    expect(html).toContain('상승 TOP100');
    expect(html).toContain('하락 TOP100');
    expect(html).toContain('직전');
    expect(html).toContain('직전 데이터');
    expect(html).toContain('직전 데이터 유지');
    expect(html).toContain('약 1분 전');
  });

  it('renders Toss realtime popularity ranking as a separate, honest source', () => {
    const html = renderToStaticMarkup(
      createElement(TossRealtimeRankingBoard, {
        data: tossRealtimeRanking(),
        onOpenTicker: vi.fn(),
      }),
    );

    expect(html).toContain('토스 실시간 인기 TOP100');
    expect(html).toContain('랭킹 시각 오래됨');
    expect(html).toContain('가격 1/1');
    expect(html).toContain('삼성전자');
  });

  it('keeps the gainers and losers TOP100 surface when movers are unavailable', () => {
    const html = renderToStaticMarkup(
      createElement(TopMoversBoard, {
        data: unsupportedTopMovers(),
        onOpenTicker: vi.fn(),
      }),
    );

    expect(html).toContain('상승 TOP100');
    expect(html).toContain('하락 TOP100');
    expect(html).toContain('현재 시간대에 사용할 TOP100 랭킹 소스가 없습니다.');
    expect(html).not.toContain('토스 실시간 인기 TOP100');
  });
});
