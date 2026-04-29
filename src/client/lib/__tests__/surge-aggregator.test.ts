import { describe, expect, it } from 'vitest';
import type { MarketStatus } from '@shared/types';
import { aggregateSurgeView } from '../surge-aggregator';
import type { StockViewModel } from '../view-models';
import type { SurgeEntry } from '../../stores/surge-store';
import { SURGE_TOTAL_MS } from '../../stores/surge-store';

const NOW = 1_700_000_000_000;

function vm(code: string, name: string, changePct: number, opts: Partial<StockViewModel> = {}): StockViewModel {
  return {
    code,
    name,
    market: 'KOSPI',
    price: 10_000,
    changePct,
    changeAbs: 0,
    volume: 100_000,
    updatedAt: '2025-01-01T00:00:00Z',
    isSnapshot: false,
    ...opts,
  };
}

function entry(code: string, name: string, surgePct: number, ageMs: number): SurgeEntry {
  return { code, name, price: 10_000, surgePct, ts: NOW - ageMs };
}

const STATUS_OPEN: MarketStatus = 'open';
const STATUS_CLOSED: MarketStatus = 'closed';
const STATUS_SNAPSHOT: MarketStatus = 'snapshot';

describe('aggregateSurgeView — live filter', () => {
  it('returns empty when market is closed', () => {
    const feed: SurgeEntry[] = [entry('005930', '삼성전자', 5.5, 1_000)];
    const stocks = [vm('005930', '삼성전자', 5.5)];
    const got = aggregateSurgeView(feed, stocks, 'live', STATUS_CLOSED, 3, NOW, 15);
    expect(got).toEqual([]);
  });

  it('returns empty under snapshot status too', () => {
    const feed: SurgeEntry[] = [entry('005930', '삼성전자', 5.5, 1_000)];
    const got = aggregateSurgeView(feed, [], 'live', STATUS_SNAPSHOT, 3, NOW, 15);
    expect(got).toEqual([]);
  });

  it('drops feed entries past SURGE_TOTAL_MS even when market open', () => {
    const fresh = entry('005930', '삼성전자', 5.5, 1_000);
    const stale = entry('000660', 'SK하이닉스', 4.2, SURGE_TOTAL_MS + 1_000);
    const got = aggregateSurgeView(
      [fresh, stale],
      [],
      'live',
      STATUS_OPEN,
      3,
      NOW,
      15,
    );
    expect(got.map((it) => it.code)).toEqual(['005930']);
    expect(got[0]?.isLive).toBe(true);
  });

  it('enriches live entry volume from current quote when available', () => {
    const feed: SurgeEntry[] = [entry('005930', '삼성전자', 5.5, 1_000)];
    const stocks = [vm('005930', '삼성전자', 5.5, { volume: 1_234_567 })];
    const got = aggregateSurgeView(feed, stocks, 'live', STATUS_OPEN, 3, NOW, 15);
    expect(got[0]?.volume).toBe(1_234_567);
  });

  it('volume is null when no matching quote exists', () => {
    const feed: SurgeEntry[] = [entry('005930', '삼성전자', 5.5, 1_000)];
    const got = aggregateSurgeView(feed, [], 'live', STATUS_OPEN, 3, NOW, 15);
    expect(got[0]?.volume).toBeNull();
  });
});

describe('aggregateSurgeView — today filter', () => {
  it('lists every stock above threshold regardless of market status', () => {
    const stocks = [
      vm('A', 'AlphaCo', 1.0),
      vm('B', 'BetaCo', 4.5),
      vm('C', 'GammaCo', 11.2),
      vm('D', 'DeltaCo', -2.5),
    ];
    const got = aggregateSurgeView([], stocks, 'today', STATUS_CLOSED, 3, NOW, 15);
    expect(got.map((it) => it.code)).toEqual(['C', 'B']);
    expect(got.every((it) => it.isLive === false)).toBe(true);
  });

  it('sorts today items by changePct desc', () => {
    const stocks = [
      vm('A', 'AlphaCo', 5.5),
      vm('B', 'BetaCo', 7.2),
      vm('C', 'GammaCo', 3.1),
    ];
    const got = aggregateSurgeView([], stocks, 'today', STATUS_OPEN, 3, NOW, 15);
    expect(got.map((it) => it.code)).toEqual(['B', 'A', 'C']);
  });

  it('respects threshold (≥ inclusive)', () => {
    const stocks = [
      vm('A', 'AlphaCo', 3.0),
      vm('B', 'BetaCo', 2.99),
    ];
    const got = aggregateSurgeView([], stocks, 'today', STATUS_OPEN, 3, NOW, 15);
    expect(got.map((it) => it.code)).toEqual(['A']);
  });

  it('does not include live feed entries under today filter', () => {
    const feed: SurgeEntry[] = [entry('A', 'AlphaCo', 5.5, 1_000)];
    const got = aggregateSurgeView(feed, [], 'today', STATUS_OPEN, 3, NOW, 15);
    expect(got).toEqual([]);
  });
});

describe('aggregateSurgeView — all filter', () => {
  it('puts live first then today, deduped by code', () => {
    const feed: SurgeEntry[] = [entry('A', 'AlphaCo', 5.5, 1_000)];
    const stocks = [
      vm('A', 'AlphaCo', 5.5),
      vm('B', 'BetaCo', 4.0),
      vm('C', 'GammaCo', 8.5),
    ];
    const got = aggregateSurgeView(feed, stocks, 'all', STATUS_OPEN, 3, NOW, 15);
    expect(got.map((it) => it.code)).toEqual(['A', 'C', 'B']);
    expect(got[0]?.isLive).toBe(true);
    expect(got[1]?.isLive).toBe(false);
  });

  it('falls back to today-only when market closed', () => {
    const feed: SurgeEntry[] = [entry('A', 'AlphaCo', 5.5, 1_000)];
    const stocks = [vm('A', 'AlphaCo', 5.5), vm('B', 'BetaCo', 4.0)];
    const got = aggregateSurgeView(feed, stocks, 'all', STATUS_CLOSED, 3, NOW, 15);
    expect(got.map((it) => it.code)).toEqual(['A', 'B']);
    expect(got.every((it) => it.isLive === false)).toBe(true);
  });

  it('respects maxRows cap', () => {
    const stocks = Array.from({ length: 25 }, (_, i) =>
      vm(String(i).padStart(6, '0'), `Co${i}`, 4 + i * 0.1),
    );
    const got = aggregateSurgeView([], stocks, 'all', STATUS_OPEN, 3, NOW, 5);
    expect(got).toHaveLength(5);
  });
});
