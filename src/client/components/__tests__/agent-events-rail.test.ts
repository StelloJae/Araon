import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentEventsRail } from '../AgentEventsRail';
import { useProductDisplayNameStore } from '../../stores/product-display-name-store';

describe('AgentEventsRail', () => {
  beforeEach(() => {
    useProductDisplayNameStore.getState().reset();
  });

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
        displayNamesOverride: { '084670': '동양고속' },
      }),
    );

    expect(html).toContain('감지된 거래 후보');
    expect(html).toContain('현재 단계: 판단 보조');
    expect(html).toContain('감지 → 후보 → 근거 → 모의 → 리스크 → 승인 → 잠금');
    expect(html).toContain('뉴스 감지');
    expect(html).toContain('시장 급변');
    expect(html).toContain('005930');
    expect(html).toContain('000660');
    expect(html).toContain('급상승 신호');
    expect(html).toContain('가격 업데이트 · 등락률 0.89%');
    expect(html).toContain('신뢰 중간');
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
        displayNamesOverride: { '084670': '동양고속' },
      }),
    );

    expect(html).toContain('급락 신호');
    expect(html).toContain('매도 검토');
    expect(html).not.toContain('급상승 신호');
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

    expect(html).toContain('모의 매수');
    expect(html).toContain('005930');
    expect(html).not.toContain('event-1');
    expect(html).not.toContain('internal-key');
    expect(html).not.toContain('stock-news:42');
  });

  it('shows one row for duplicate market movement display events', () => {
    const baseEvent = {
      type: 'market_movement_detected' as const,
      ticker: '412350',
      source: 'realtime-momentum',
      publishedAt: null,
      firstSeenAt: '2026-05-18T00:17:30.000Z',
      freshness: 'near_realtime' as const,
      relevance: 0.8,
      confidence: 0.9,
      reason: '실시간 모멘텀 · 추세 급등 · 1분 · +3.09%',
      payloadRef: null,
      createdAt: '2026-05-18T00:17:30.000Z',
    };
    const html = renderToStaticMarkup(
      createElement(AgentEventsRail, {
        events: [
          { ...baseEvent, id: 'event-a', freshnessMs: 2 },
          { ...baseEvent, id: 'event-b', freshnessMs: 6 },
        ],
        loading: false,
        onOpenTicker: vi.fn(),
        displayNamesOverride: { '412350': '레이저쎌' },
      }),
    );

    expect(html).toContain('레이저쎌');
    expect(html).toContain('방금');
    expect(html).not.toContain('6ms');
    expect(html).toContain('2건');
    expect(html).not.toContain('event-a');
    expect(html).not.toContain('event-b');
  });

  it('shows more than two candidates in compact home mode', () => {
    const events = Array.from({ length: 5 }, (_, index) => ({
      id: `event-${index + 1}`,
      type: 'market_movement_detected' as const,
      ticker: `08467${index}`,
      source: 'realtime-momentum',
      publishedAt: null,
      firstSeenAt: '2026-05-18T00:17:30.000Z',
      freshnessMs: 2 + index,
      freshness: 'near_realtime' as const,
      relevance: 0.8,
      confidence: 0.9,
      reason: `실시간 모멘텀 · 강한 단기 급등 · 30초 · +3.2${index}%`,
      payloadRef: null,
      createdAt: '2026-05-18T00:17:30.000Z',
    }));

    const html = renderToStaticMarkup(
      createElement(AgentEventsRail, {
        events,
        loading: false,
        onOpenTicker: vi.fn(),
        compact: true,
        displayNamesOverride: {
          '084670': '동양고속',
          '084671': '후보둘',
          '084672': '후보셋',
          '084673': '후보넷',
          '084674': '후보다섯',
        },
      }),
    );

    expect(html).toContain('동양고속');
    expect(html).toContain('후보둘');
    expect(html).toContain('후보셋');
    expect(html).toContain('후보넷');
    expect(html).toContain('외 1건');
    expect(html).not.toContain('후보다섯');
  });

  it('renders cached product display names instead of ticker-only fallback', () => {
    useProductDisplayNameStore
      .getState()
      .upsert([{ ticker: '084670', name: '동양고속' }]);

    const html = renderToStaticMarkup(
      createElement(AgentEventsRail, {
        events: [
          {
            id: 'event-surge',
            type: 'market_movement_detected',
            ticker: '084670',
            source: 'realtime-momentum',
            publishedAt: null,
            firstSeenAt: '2026-05-18T00:17:30.000Z',
            freshnessMs: 4,
            freshness: 'near_realtime',
            relevance: 0.8,
            confidence: 0.9,
            reason: '실시간 모멘텀 · 강한 단기 급등 · 30초 · +3.26%',
            payloadRef: null,
            createdAt: '2026-05-18T00:17:30.000Z',
          },
        ],
        loading: false,
        onOpenTicker: vi.fn(),
        displayNamesOverride: { '084670': '동양고속' },
      }),
    );

    expect(html).toContain('동양고속');
    expect(html).toContain('084670');
    expect(html).not.toContain('title="시장 급변 · 084670"');
  });
});
