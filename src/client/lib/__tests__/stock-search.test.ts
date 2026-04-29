import { describe, expect, it } from 'vitest';
import { rankStockSearch } from '../stock-search';
import type { StockViewModel } from '../view-models';

function vm(code: string, name: string, market: 'KOSPI' | 'KOSDAQ' = 'KOSPI'): StockViewModel {
  return {
    code,
    name,
    price: 10_000,
    changePct: 0,
    changeAbs: 0,
    volume: 0,
    market,
    updatedAt: '2025-01-01T00:00:00Z',
    isSnapshot: false,
  };
}

describe('rankStockSearch', () => {
  const stocks: StockViewModel[] = [
    vm('005930', '삼성전자'),
    vm('000660', 'SK하이닉스'),
    vm('373220', 'LG에너지솔루션'),
    vm('108860', '셀바스AI', 'KOSDAQ'),
    vm('042700', '한미반도체'),
    vm('005380', '현대차'),
  ];

  it('returns empty for blank query', () => {
    expect(rankStockSearch('', stocks)).toEqual([]);
    expect(rankStockSearch('   ', stocks)).toEqual([]);
  });

  it('puts prefix matches before contains matches; preserves input order', () => {
    const r = rankStockSearch('00', stocks);
    // No exact match. Prefix: 005930 / 000660 / 005380 (codes start with "00").
    // Contains: 042700 (code contains "00" but doesn't start with it).
    expect(r.map((s) => s.code)).toEqual([
      '005930',
      '000660',
      '005380',
      '042700',
    ]);
  });

  it('matches by name substring (case-insensitive)', () => {
    const r = rankStockSearch('하이닉스', stocks);
    expect(r.map((s) => s.code)).toEqual(['000660']);
  });

  it('exact code match outranks other prefix matches', () => {
    const r = rankStockSearch('005930', stocks);
    expect(r[0]?.code).toBe('005930');
  });

  it('respects the limit', () => {
    const r = rankStockSearch('0', stocks, 2);
    expect(r).toHaveLength(2);
  });

  it('matches lowercase ascii names too', () => {
    const r = rankStockSearch('AI', stocks);
    expect(r.map((s) => s.code)).toContain('108860');
  });

  // === Chosung (한국어 초성) 검색 =========================================

  it('matches 삼성전자 by chosung ㅅㅅㅈㅈ', () => {
    const r = rankStockSearch('ㅅㅅㅈㅈ', stocks);
    expect(r.map((s) => s.code)).toEqual(['005930']);
  });

  it('matches by chosung prefix (ㅅㅅ → 삼성전자)', () => {
    const r = rankStockSearch('ㅅㅅ', stocks);
    expect(r.map((s) => s.code)).toContain('005930');
  });

  it('matches 현대차 by chosung ㅎㄷㅊ', () => {
    const r = rankStockSearch('ㅎㄷㅊ', stocks);
    expect(r.map((s) => s.code)).toEqual(['005380']);
  });

  it('matches 한미반도체 by chosung prefix ㅎㅁ', () => {
    const r = rankStockSearch('ㅎㅁ', stocks);
    expect(r.map((s) => s.code)).toContain('042700');
  });

  it('matches SK하이닉스 by chosung ㅎㅇㄴㅅ (hangul-only chosung)', () => {
    const r = rankStockSearch('ㅎㅇㄴㅅ', stocks);
    expect(r.map((s) => s.code)).toContain('000660');
  });

  it('matches SK하이닉스 by ASCII "sk" too', () => {
    const r = rankStockSearch('sk', stocks);
    expect(r.map((s) => s.code)).toContain('000660');
  });

  it('matches LG에너지솔루션 by chosung ㅇㄴㅈ', () => {
    const r = rankStockSearch('ㅇㄴㅈ', stocks);
    expect(r.map((s) => s.code)).toContain('373220');
  });

  it('ticker exact still beats chosung match', () => {
    // 005930 is a 6-digit ticker; chosung-only matches must rank lower.
    // Adding a hypothetical name whose chosung happens to equal the ticker
    // — there is none in real data, so we rely on real bucket order.
    const stocksWithChosungBait: StockViewModel[] = [
      vm('111111', 'ㅅㅅㅈㅈ가짜종목'), // chosung-form contains "ㅅㅅㅈㅈ"
      vm('005930', '삼성전자'),
    ];
    // Query "005930" — ticker exact (bucket 1) must outrank chosung match.
    const r = rankStockSearch('005930', stocksWithChosungBait);
    expect(r[0]?.code).toBe('005930');
  });

  it('chosung does not poison ASCII queries with single-char hits', () => {
    // Query "a" should NOT match every stock just because their names have
    // ASCII chars — our chosung path is only activated when qCho !== q.
    const r = rankStockSearch('a', stocks);
    // Only 셀바스AI has 'a' in its name (lowercased "ai"), so it's the lone match.
    expect(r.map((s) => s.code)).toEqual(['108860']);
  });

  it('respects the limit even when chosung adds extra hits', () => {
    const r = rankStockSearch('ㅎ', stocks, 1);
    // Both 한미반도체 and SK하이닉스 (chosung "skㅎㅇㄴㅅ") and 현대차 contain ㅎ.
    expect(r).toHaveLength(1);
  });
});
