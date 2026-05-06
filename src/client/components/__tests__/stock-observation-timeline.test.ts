import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { StockObservationTimeline } from '../StockObservationTimeline';

describe('StockObservationTimeline', () => {
  it('renders the signal outcome timeline surface without placeholder copy', () => {
    const html = renderToStaticMarkup(
      createElement(StockObservationTimeline, {
        ticker: '005930',
      }),
    );

    expect(html).toContain('관찰 타임라인');
    expect(html).toContain('실시간 신호와 직접 남긴 메모');
    expect(html).not.toContain('연동 예정');
  });
});
