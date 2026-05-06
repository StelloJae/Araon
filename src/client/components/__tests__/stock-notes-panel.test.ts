import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { StockNotesPanel } from '../StockNotesPanel';

describe('StockNotesPanel', () => {
  it('renders the observation memo surface without market-data placeholders', () => {
    const html = renderToStaticMarkup(
      createElement(StockNotesPanel, {
        ticker: '005930',
      }),
    );

    expect(html).toContain('관찰 메모');
    expect(html).toContain('메모 추가');
    expect(html).toContain('매수/매도 판단이 아니라 관찰 기록으로 저장됩니다');
    expect(html).not.toContain('연동 예정');
  });
});
