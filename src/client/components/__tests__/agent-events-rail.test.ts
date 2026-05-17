import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AgentEventsRail } from '../AgentEventsRail';

describe('AgentEventsRail', () => {
  it('renders a compact read-only event feed without provider dedupe keys', () => {
    const html = renderToStaticMarkup(
      createElement(AgentEventsRail, {
        events: [
          {
            id: 'event-1',
            type: 'news_detected',
            ticker: '005930',
            source: 'naver-finance',
            publishedAt: '2026-05-11T06:00:00.000Z',
            firstSeenAt: '2026-05-11T06:00:18.000Z',
            freshnessMs: 18_000,
            freshness: 'near_realtime',
            relevance: 0.7,
            confidence: 0.72,
            reason: 'New stock news detected: 삼성전자 신규 뉴스',
            payloadRef: 'stock-news:42',
            createdAt: '2026-05-11T06:00:18.000Z',
          },
          {
            id: 'event-2',
            type: 'market_movement_detected',
            ticker: '000660',
            source: 'kis-ws-tick',
            publishedAt: null,
            firstSeenAt: '2026-05-11T06:00:30.000Z',
            freshnessMs: null,
            freshness: 'unknown',
            relevance: 0.6,
            confidence: 0.65,
            reason: 'KIS WS tick 가격 업데이트 감지 · 등락률 0.89%',
            payloadRef: null,
            createdAt: '2026-05-11T06:00:30.000Z',
          },
          {
            id: 'event-3',
            type: 'toss_signal_detected',
            ticker: '035720',
            source: 'toss-signal',
            publishedAt: '2026-03-21T06:00:00.000Z',
            firstSeenAt: '2026-05-11T06:00:26.400Z',
            freshnessMs: 4_406_526_400,
            freshness: 'stale',
            relevance: 0.5,
            confidence: 0.6,
            reason: 'Provider signal surfaced after a long delay',
            payloadRef: null,
            createdAt: '2026-05-11T06:00:26.400Z',
          },
        ],
        loading: false,
        onOpenTicker: vi.fn(),
      }),
    );

    expect(html).toContain('에이전트 관찰');
    expect(html).toContain('뉴스·공시·급등 신호를 보고 거래 후보만 만듭니다');
    expect(html).toContain('뉴스 감지');
    expect(html).toContain('시장 급변');
    expect(html).toContain('005930');
    expect(html).toContain('000660');
    expect(html).toContain('실시간 추적');
    expect(html).toContain('가격 업데이트 · 등락률 0.89%');
    expect(html).not.toContain('kis-ws-tick');
    expect(html).not.toContain('KIS WS tick');
    expect(html).toContain('18.0초');
    expect(html).toContain('3건');
    expect(html).not.toContain('035720');
    expect(html).not.toContain('51일');
    expect(html).not.toContain('4406526.4초');
    expect(html).not.toContain('internal-key');
    expect(html).not.toContain('dedupeKey');
    expect(html).not.toContain('SESSION');
  });

  it('keeps an honest empty state instead of inventing events', () => {
    const html = renderToStaticMarkup(
      createElement(AgentEventsRail, {
        events: [],
        loading: false,
        onOpenTicker: vi.fn(),
      }),
    );

    expect(html).toContain('거래 판단 후보 없음');
    expect(html).not.toContain('005930');
  });

  it('does not duplicate the 실시간 추적 source label when reason already contains it', () => {
    const html = renderToStaticMarkup(
      createElement(AgentEventsRail, {
        events: [
          {
            id: 'event-live',
            type: 'market_movement_detected',
            ticker: '277810',
            source: 'kis-ws-tick',
            publishedAt: null,
            firstSeenAt: '2026-05-11T06:00:30.000Z',
            freshnessMs: 120,
            freshness: 'near_realtime',
            relevance: 0.6,
            confidence: 0.78,
            reason: '실시간 추적 가격 업데이트 감지 · 등락률 -4.33%',
            payloadRef: null,
            createdAt: '2026-05-11T06:00:30.000Z',
          },
        ],
        loading: false,
        onOpenTicker: vi.fn(),
      }),
    );

    expect(html).toContain('실시간 추적');
    expect(html).toContain('가격 업데이트 · 등락률 -4.33%');
    expect(html).not.toContain('실시간 추적 가격 업데이트');
  });

  it('shows an optional simulated preview action without exposing event internals', () => {
    const html = renderToStaticMarkup(
      createElement(AgentEventsRail, {
        events: [
          {
            id: 'event-1',
            type: 'news_detected',
            ticker: '005930',
            source: 'naver-finance',
            publishedAt: '2026-05-11T06:00:00.000Z',
            firstSeenAt: '2026-05-11T06:00:18.000Z',
            freshnessMs: 18_000,
            freshness: 'near_realtime',
            relevance: 0.7,
            confidence: 0.72,
            reason: 'New stock news detected: 삼성전자 신규 뉴스',
            payloadRef: 'stock-news:42',
            createdAt: '2026-05-11T06:00:18.000Z',
          },
        ],
        loading: false,
        onOpenTicker: vi.fn(),
        onCreateBuyPreview: vi.fn(),
      }),
    );

    expect(html).toContain('모의 미리보기');
    expect(html).toContain('005930');
    expect(html).not.toContain('event-1');
    expect(html).not.toContain('internal-key');
    expect(html).not.toContain('stock-news:42');
  });
});
