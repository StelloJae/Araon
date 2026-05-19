import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { CredentialsSetup } from '../CredentialsSetup';

describe('CredentialsSetup first-run copy', () => {
  it('sets honest expectations before a user enters KIS credentials', () => {
    const html = renderToStaticMarkup(
      createElement(CredentialsSetup, {
        onSuccess: vi.fn(),
      }),
    );

    expect(html).toContain('읽기 전용 모니터링 도구');
    expect(html).toContain('Toss 로그인 후 계좌·포트폴리오·관심종목을 읽기 전용으로 가져옵니다');
    expect(html).toContain('KIS 자격증명은 선택 사항');
    expect(html).toContain('계좌·주문·차트·랭킹 기준이 아닙니다');
    expect(html).toContain('처음 시작 순서');
    expect(html).toContain('먼저 Toss 계정 세션을 연결합니다');
    expect(html).toContain('검색·랭킹·관심종목은 Toss-first 데이터로 확인합니다');
    expect(html).toContain('저지연 실시간 추적이 필요할 때만 KIS App Key / App Secret을 등록합니다');
    expect(html).toContain('실시간 추적은 최대 40개 한국 종목까지 보조합니다');
    expect(html).toContain('Toss-only product는 KIS로 보내지 않습니다');
    expect(html).toContain('비상정지');
    expect(html).not.toContain('실시간 시세와 일봉 보강을 자동으로 관리');
    expect(html).not.toContain('전체 종목 목록을 자동으로 준비');
    expect(html).not.toContain('모의투자 계정');
  });
});
