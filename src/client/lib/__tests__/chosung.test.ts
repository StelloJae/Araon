import { describe, expect, it } from 'vitest';
import { getChosung } from '../chosung';

describe('getChosung', () => {
  it('extracts 초성 from common Korean stock names', () => {
    expect(getChosung('삼성전자')).toBe('ㅅㅅㅈㅈ');
    expect(getChosung('현대차')).toBe('ㅎㄷㅊ');
    expect(getChosung('쏠리드')).toBe('ㅆㄹㄷ');
    expect(getChosung('한미반도체')).toBe('ㅎㅁㅂㄷㅊ');
  });

  it('passes through chosung jamo that the user typed directly', () => {
    expect(getChosung('ㅅㅅㅈㅈ')).toBe('ㅅㅅㅈㅈ');
    expect(getChosung('ㅆㄹㄷ')).toBe('ㅆㄹㄷ');
    expect(getChosung('ㅎㄷㅊ')).toBe('ㅎㄷㅊ');
  });

  it('lowercases ASCII for case-insensitive matching', () => {
    expect(getChosung('NAVER')).toBe('naver');
    expect(getChosung('SK하이닉스')).toBe('skㅎㅇㄴㅅ');
    expect(getChosung('LG에너지솔루션')).toBe('lgㅇㄴㅈㅅㄹㅅ');
  });

  it('returns empty for empty input', () => {
    expect(getChosung('')).toBe('');
  });

  it('preserves digits and punctuation', () => {
    expect(getChosung('SK텔레콤(005')).toBe('skㅌㄹㅋ(005');
  });
});
