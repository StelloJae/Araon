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
    expect(html).toContain('주문/매매 기능은 없고');
    expect(html).toContain('실시간 시세는 기본 OFF');
    expect(html).toContain('REST 폴링이 기본 경로');
    expect(html).toContain('실시간 시세는 별도 설정');
    expect(html).not.toContain('모의투자 계정');
  });
});
