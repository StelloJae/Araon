import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { StockViewModel } from '../../lib/view-models';
import { StockRow } from '../StockRow';
import { formatSurgeSubLabel } from '../SurgeBlock';

function stock(overrides: Partial<StockViewModel> = {}): StockViewModel {
  return {
    code: '005930',
    name: '삼성전자',
    market: 'KOSPI',
    price: 70_000,
    changePct: 3.4,
    changeAbs: 2300,
    volume: 1_234_567,
    updatedAt: '2026-04-29T01:00:00.000Z',
    isSnapshot: false,
    sectorId: null,
    effectiveSector: { name: '반도체', source: 'auto' },
    ...overrides,
  };
}

describe('volume visibility', () => {
  it('shows current cumulative volume on compact stock rows', () => {
    const html = renderToStaticMarkup(
      createElement(StockRow, {
        stock: stock(),
        rank: 1,
        isFav: true,
        onToggleFav: () => undefined,
        onOpenDetail: () => undefined,
        flashSeed: 0,
        isFirst: true,
      }),
    );

    expect(html).toContain('거래량');
    expect(html).toContain('123.5만');
  });

  it('shows current cumulative volume on surge row sublabels', () => {
    const label = formatSurgeSubLabel({
      code: '005930',
      name: '삼성전자',
      price: 70_000,
      changePct: 4.2,
      volume: 1_234_567,
      ts: 1_700_000_000_000,
      isLive: true,
    }, 1_000);

    expect(label).toContain('거래량');
    expect(label).toContain('123.5만');
  });

  it('does not invent a surge volume label when quote volume is missing', () => {
    const label = formatSurgeSubLabel({
      code: '005930',
      name: '삼성전자',
      price: 70_000,
      changePct: 4.2,
      volume: null,
      ts: 1_700_000_000_000,
      isLive: true,
    }, 1_000);

    expect(label).not.toContain('거래량');
  });

  it('shows collecting state instead of fake multiplier when baseline is missing', () => {
    const label = formatSurgeSubLabel({
      code: '005930',
      name: '삼성전자',
      price: 70_000,
      changePct: 4.2,
      volume: 1_234_567,
      volumeSurgeRatio: null,
      volumeBaselineStatus: 'collecting',
      ts: 1_700_000_000_000,
      isLive: true,
    }, 1_000);

    expect(label).toContain('기준선 수집 중');
    expect(label).not.toContain('x');
  });

  it('shows volume surge ratio when a same-time baseline is available', () => {
    const label = formatSurgeSubLabel({
      code: '005930',
      name: '삼성전자',
      price: 70_000,
      changePct: 4.2,
      volume: 1_234_567,
      volumeSurgeRatio: 5.24,
      volumeBaselineStatus: 'ready',
      ts: 1_700_000_000_000,
      isLive: true,
    }, 1_000);

    expect(label).toContain('거래량 5.2x');
  });
});
