import { describe, expect, it } from 'vitest';
import {
  fmtAbs,
  fmtAge,
  fmtAgeTag,
  fmtClock,
  fmtPct,
  fmtPrice,
  fmtRelativeTime,
  fmtVolMan,
  krColor,
  moversBarAlpha,
  rowBarAlpha,
  surgeBarAlpha,
} from '../format';

describe('fmtPrice / fmtPct / fmtAbs', () => {
  it('formats Korean-locale price with thousands separator', () => {
    expect(fmtPrice(1_248_400)).toBe('1,248,400');
  });
  it('formats signed percent with two decimals + % suffix', () => {
    expect(fmtPct(2.345)).toBe('+2.35%');
    expect(fmtPct(-1.2)).toBe('-1.20%');
    expect(fmtPct(0)).toBe('+0.00%');
  });
  it('formats signed absolute change', () => {
    expect(fmtAbs(1_800)).toBe('+1,800');
    expect(fmtAbs(-1_800)).toBe('-1,800');
  });
});

describe('fmtVolMan', () => {
  it('divides by 10000 and shows one decimal', () => {
    expect(fmtVolMan(12_484_000)).toBe('1248.4만');
  });
});

describe('fmtClock', () => {
  it('zero-pads HH:MM:SS', () => {
    const d = new Date(2025, 0, 1, 9, 5, 7);
    expect(fmtClock(d)).toBe('09:05:07');
  });
});

describe('krColor', () => {
  it('returns kr-up for >0.01', () => {
    expect(krColor(0.5)).toBe('var(--kr-up)');
  });
  it('returns kr-down for <-0.01', () => {
    expect(krColor(-0.5)).toBe('var(--kr-down)');
  });
  it('returns muted near zero', () => {
    expect(krColor(0)).toBe('var(--text-muted)');
    expect(krColor(0.005)).toBe('var(--text-muted)');
  });
});

describe('bar alpha tiers', () => {
  it('moversBarAlpha steps at 5% and 10%', () => {
    expect(moversBarAlpha(2)).toBe(0.15);
    expect(moversBarAlpha(-6)).toBe(0.28);
    expect(moversBarAlpha(11)).toBe(0.5);
  });
  it('rowBarAlpha steps at 5% and 10%', () => {
    expect(rowBarAlpha(1)).toBe(0.1);
    expect(rowBarAlpha(7)).toBe(0.18);
    expect(rowBarAlpha(15)).toBe(0.32);
  });
  it('surgeBarAlpha steps at 5% and 8%', () => {
    expect(surgeBarAlpha(3)).toBe(0.18);
    expect(surgeBarAlpha(6)).toBe(0.32);
    expect(surgeBarAlpha(9)).toBe(0.5);
  });
});

describe('fmtAge / fmtAgeTag', () => {
  it('fmtAge labels seconds and minutes', () => {
    expect(fmtAge(500)).toBe('방금');
    expect(fmtAge(12_000)).toBe('12초 전');
    expect(fmtAge(65_000)).toBe('1분 5초 전');
  });
  it('fmtAgeTag is compact', () => {
    expect(fmtAgeTag(45_000)).toBe('45s');
    expect(fmtAgeTag(125_000)).toBe('2m');
  });
});

describe('fmtRelativeTime', () => {
  const base = new Date('2025-01-01T12:00:00Z').getTime();

  it('returns em dash when no date', () => {
    expect(fmtRelativeTime(null, base)).toBe('—');
  });
  it('returns 방금 inside the first second', () => {
    expect(fmtRelativeTime(new Date(base - 500), base)).toBe('방금');
  });
  it('reports seconds under one minute', () => {
    expect(fmtRelativeTime(new Date(base - 12_000), base)).toBe('12초 전');
  });
  it('reports minutes under one hour', () => {
    expect(fmtRelativeTime(new Date(base - 5 * 60_000), base)).toBe('5분 전');
    expect(fmtRelativeTime(new Date(base - 59 * 60_000), base)).toBe('59분 전');
  });
  it('reports hours past one hour', () => {
    expect(fmtRelativeTime(new Date(base - 90 * 60_000), base)).toBe('1시간 전');
  });
  it('clamps negative ages (clock skew) to 방금', () => {
    expect(fmtRelativeTime(new Date(base + 500), base)).toBe('방금');
  });
});
