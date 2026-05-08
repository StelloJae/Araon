import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { MarketTopMoversResponse } from '@shared/types';
import type { StockViewModel } from '../../lib/view-models';
import { buildLocalTopMoversFallback } from '../SectionStack';
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
    status: 'ready',
    message: '3초마다 갱신',
    cooldownUntil: null,
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
    expect(html).toContain('3초');
    expect(html).toContain('삼성전자');
    expect(html).toContain('SK하이닉스');
  });

  it('uses current local stocks when KIS ranking is cooling down without cached rows', () => {
    const fallback = buildLocalTopMoversFallback(
      {
        ...topMovers(),
        fetchedAt: null,
        status: 'cooldown',
        message: 'KIS 호출 제한으로 TOP100 갱신을 대기합니다.',
        gainers: [],
        losers: [],
      },
      [
        vm('005930', '삼성전자', 70_000, 3.7, 2_500),
        vm('000660', 'SK하이닉스', 180_000, -2.7, -5_000),
        vm('000001', '보합종목', 1_000, 0, 0),
      ],
    );

    expect(fallback.status).toBe('stale');
    expect(fallback.message).toContain('현재 화면 종목 기준');
    expect(fallback.gainers.map((item) => item.ticker)).toEqual(['005930']);
    expect(fallback.losers.map((item) => item.ticker)).toEqual(['000660']);
  });
});

function vm(
  code: string,
  name: string,
  price: number,
  changePct: number,
  changeAbs: number,
): StockViewModel {
  return {
    code,
    name,
    price,
    changePct,
    changeAbs,
    volume: 1_000,
    market: 'KOSPI',
    updatedAt: '2026-05-08T08:00:00.000Z',
    isSnapshot: false,
    sectorId: null,
    effectiveSector: { name: '미분류', source: 'unclassified' },
  };
}
