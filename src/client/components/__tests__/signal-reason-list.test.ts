import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SignalReasonList } from '../SignalReasonList';
import type { SignalExplanation } from '../../lib/signal-explainer';

const explanation: SignalExplanation = {
  level: 'strong',
  score: 65,
  confidence: 'live',
  primaryReason: '실시간 10초 +1.8% 급가속',
  reasons: [
    {
      kind: 'realtime-momentum',
      text: '실시간 10초 +1.8% 급가속',
      weight: 35,
      tone: 'positive',
    },
    {
      kind: 'today-strength',
      text: '오늘 +5.4% 강세',
      weight: 30,
      tone: 'positive',
    },
  ],
  caveats: ['거래량 기준선 수집 중'],
};

describe('SignalReasonList', () => {
  it('renders compact explanation text for surge rows', () => {
    const html = renderToStaticMarkup(
      createElement(SignalReasonList, {
        explanation,
        mode: 'compact',
      }),
    );

    expect(html).toContain('실시간 10초 +1.8% 급가속');
    expect(html).toContain('오늘 +5.4% 강세');
    expect(html).toContain('기준선 수집 중');
  });

  it('renders an honest empty state without fake multipliers', () => {
    const html = renderToStaticMarkup(
      createElement(SignalReasonList, {
        explanation: {
          level: 'none',
          score: 0,
          confidence: 'collecting',
          primaryReason: '관찰 근거 부족',
          reasons: [],
          caveats: ['거래량 기준선 수집 중'],
        },
        mode: 'list',
      }),
    );

    expect(html).toContain('관찰 근거 부족');
    expect(html).toContain('거래량 기준선 수집 중');
    expect(html).not.toContain('거래량 기준선 대비');
    expect(html).not.toContain('2.0x');
  });
});
