/**
 * 한글 초성 추출.
 *
 * 한글 음절(U+AC00..U+D7A3)은 `0xAC00 + (cho*588) + (jung*28) + jong`로
 * 인코딩되므로 초성 인덱스는 `(code - 0xAC00) / 588`. 출력은 한글 호환
 * 자모(U+3131..) 19자.
 *
 * 비-한글(ASCII/숫자/구두점/이미 입력된 자모)은 `toLowerCase()`로 흘려보내,
 * 사용자가 친 쿼리의 chosung-form과 stock 이름의 chosung-form을 그대로
 * 비교할 수 있게 한다. (예: "SK하이닉스" → "skㅎㅇㄴㅅ", "naver" → "naver")
 */

const CHOSUNG_TABLE = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ',
  'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ',
  'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
] as const;

const HANGUL_SYLLABLES_START = 0xac00;
const HANGUL_SYLLABLES_END = 0xd7a3;
const HANGUL_SYLLABLE_BLOCK = 588;

export function getChosung(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    if (code >= HANGUL_SYLLABLES_START && code <= HANGUL_SYLLABLES_END) {
      const idx = Math.floor((code - HANGUL_SYLLABLES_START) / HANGUL_SYLLABLE_BLOCK);
      out += CHOSUNG_TABLE[idx];
    } else {
      out += ch.toLowerCase();
    }
  }
  return out;
}
