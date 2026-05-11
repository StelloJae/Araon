import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { MarketTopMoversResponse } from '@shared/types';
import { TopMoversBoard } from '../TopMoversBoard';
import { ViewToggle } from '../ViewToggle';

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

describe('TOP100 view chrome', () => {
  it('replaces tag/mixed tabs with a focused TOP100 tab', () => {
    const html = renderToStaticMarkup(
      createElement(ViewToggle, {
        value: 'top100',
        onChange: vi.fn(),
      }),
    );

    expect(html).toContain('섹터');
    expect(html).toContain('TOP100');
    expect(html).not.toContain('태그');
    expect(html).not.toContain('혼합');
  });

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
});
