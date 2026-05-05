import { describe, expect, it } from 'vitest';
import type { MarketStatus } from '@shared/types';
import {
  buildSignalExplanation,
  type SignalExplanation,
} from '../signal-explainer';
import type { SurgeViewItem } from '../surge-aggregator';
import type { StockViewModel } from '../view-models';

function stock(overrides: Partial<StockViewModel> = {}): StockViewModel {
  return {
    code: '005930',
    name: '삼성전자',
    market: 'KOSPI',
    price: 70_000,
    changePct: 1.2,
    changeAbs: 800,
    volume: 1_000_000,
    updatedAt: '2026-04-29T01:00:00.000Z',
    isSnapshot: false,
    sectorId: null,
    effectiveSector: { name: '전기전자', source: 'kis-industry' },
    ...overrides,
  };
}

function surge(overrides: Partial<SurgeViewItem> = {}): SurgeViewItem {
  return {
    code: '005930',
    name: '삼성전자',
    price: 70_000,
    changePct: 1.8,
    volume: 1_000_000,
    ts: 1_700_000_000_000,
    isLive: true,
    signalType: 'scalp',
    momentumPct: 1.8,
    momentumWindow: '10s',
    dailyChangePct: 4.2,
    ...overrides,
  };
}

function explain(
  overrides: {
    stock?: Partial<StockViewModel>;
    allStocks?: ReadonlyArray<StockViewModel>;
    isFavorite?: boolean;
    surgeItem?: SurgeViewItem | null;
    marketStatus?: MarketStatus;
  } = {},
): SignalExplanation {
  const s = stock(overrides.stock);
  return buildSignalExplanation({
    stock: s,
    allStocks: overrides.allStocks ?? [s],
    isFavorite: overrides.isFavorite ?? false,
    surgeItem: overrides.surgeItem ?? null,
    marketStatus: overrides.marketStatus ?? 'open',
  });
}

describe('buildSignalExplanation', () => {
  it('uses live momentum as the primary reason when a realtime surge item exists', () => {
    const got = explain({ surgeItem: surge() });

    expect(got.level).toBe('strong');
    expect(got.confidence).toBe('live');
    expect(got.primaryReason).toContain('실시간');
    expect(got.primaryReason).toContain('10초 +1.8%');
    expect(got.reasons[0]?.kind).toBe('realtime-momentum');
  });

  it('scores today strength without requiring a live momentum item', () => {
    const got = explain({ stock: { changePct: 5.4 } });

    expect(got.level).toBe('watch');
    expect(got.score).toBe(30);
    expect(got.primaryReason).toContain('오늘 +5.4%');
    expect(got.confidence).toBe('live');
  });

  it('boosts favorite stocks without making favorite alone urgent', () => {
    const got = explain({
      stock: { changePct: 3.2 },
      isFavorite: true,
    });

    expect(got.level).toBe('watch');
    expect(got.score).toBe(30);
    expect(got.reasons.map((r) => r.kind)).toContain('favorite');
  });

  it('adds a sector co-movement reason only when enough same-sector stocks are positive', () => {
    const got = explain({
      stock: { changePct: 1.0 },
      allStocks: [
        stock({ code: '005930', changePct: 1.0 }),
        stock({ code: '000660', name: 'SK하이닉스', changePct: 2.3 }),
        stock({ code: '042700', name: '한미반도체', changePct: 3.1 }),
        stock({ code: '011070', name: 'LG이노텍', changePct: 0.4 }),
        stock({
          code: '035720',
          name: '카카오',
          changePct: 7.1,
          effectiveSector: { name: '서비스업', source: 'kis-industry' },
        }),
      ],
    });

    expect(got.reasons).toContainEqual(
      expect.objectContaining({
        kind: 'sector-co-movement',
        text: expect.stringContaining('전기전자'),
      }),
    );
  });

  it('does not invent a volume multiplier while the baseline is still collecting', () => {
    const got = explain({
      stock: {
        changePct: 5.4,
        volumeSurgeRatio: null,
        volumeBaselineStatus: 'collecting',
      },
    });

    expect(got.caveats).toContain('거래량 기준선 수집 중');
    expect(got.reasons.map((r) => r.text).join(' ')).not.toContain('x');
    expect(got.reasons.map((r) => r.text).join(' ')).not.toContain('배');
  });

  it('caps snapshot explanations at watch and does not report live confidence', () => {
    const got = explain({
      stock: {
        changePct: 10.8,
        isSnapshot: true,
        volumeSurgeRatio: 3.2,
        volumeBaselineStatus: 'ready',
      },
      surgeItem: surge({ signalType: 'overheat', momentumPct: 3.4 }),
      isFavorite: true,
      marketStatus: 'snapshot',
    });

    expect(got.level).toBe('watch');
    expect(got.confidence).toBe('snapshot');
    expect(got.caveats).toContain('스냅샷 기준');
  });
});
