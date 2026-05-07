import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ObservationPlanEditorView } from '../StockObservationPlanPanel';

describe('StockObservationPlanPanel', () => {
  it('renders a local watch thesis editor without trading copy', () => {
    const html = renderToStaticMarkup(
      createElement(ObservationPlanEditorView, {
        draft: {
          thesis: '일봉 추세와 거래대금 회복 관찰',
          trigger: '전고점 돌파',
          invalidation: '전일 저점 이탈',
          status: 'watching',
        },
        loading: false,
        saving: false,
        message: null,
        canSave: true,
        onChange: vi.fn(),
        onSave: vi.fn(),
      }),
    );

    expect(html).toContain('관찰 계획');
    expect(html).toContain('관찰 thesis');
    expect(html).toContain('확인 trigger');
    expect(html).toContain('무효화 조건');
    expect(html).toContain('저장 준비 완료');
    expect(html).toContain('계획 저장');
    expect(html).not.toContain('매수');
    expect(html).not.toContain('주문');
  });

  it('shows which observation fields are still missing before saving', () => {
    const html = renderToStaticMarkup(
      createElement(ObservationPlanEditorView, {
        draft: {
          thesis: '',
          trigger: '전고점 돌파',
          invalidation: '',
          status: 'watching',
        },
        loading: false,
        saving: false,
        message: null,
        canSave: false,
        onChange: vi.fn(),
        onSave: vi.fn(),
      }),
    );

    expect(html).toContain('저장하려면 thesis, 무효화 조건을 채워주세요');
  });
});
