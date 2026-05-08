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
});
