import { describe, expect, it } from 'vitest';
import type { AgentEventNotificationEvent } from '@shared/types';

import { agentEventToToastSpec, maybeAgentEventToToastSpec } from '../agent-event-toast';

describe('agentEventToToastSpec', () => {
  it('creates a toast without leaking provider dedupe keys', () => {
    const event: AgentEventNotificationEvent = {
      type: 'agent-event',
      id: 7,
      event: {
        id: 'agent-event-1',
        type: 'news_detected',
        ticker: '005930',
        source: 'naver-news',
        publishedAt: '2026-05-11T06:00:00.000Z',
        firstSeenAt: '2026-05-11T06:00:20.000Z',
        freshnessMs: 20_000,
        freshness: 'near_realtime',
        relevance: 0.8,
        confidence: 0.9,
        reason: 'title matched Samsung Electronics',
        payloadRef: 'stock-news:42',
        createdAt: '2026-05-11T06:00:20.000Z',
      },
    };

    const spec = agentEventToToastSpec(event, '삼성전자', 1_111);

    expect(spec).toEqual({
      id: 'agent-event-agent-event-1',
      cooldownKey: 'agent-event:agent-event-1',
      ticker: '005930',
      name: '삼성전자',
      kind: 'rule',
      direction: 'up',
      changePct: 0,
      title: '뉴스 감지: 삼성전자',
      detail: 'naver-news · title matched Samsung Electronics',
      ts: 1_111,
    });
    expect(JSON.stringify(spec)).not.toContain('dedupe');
  });

  it('clips long reasons so toast text stays compact', () => {
    const event: AgentEventNotificationEvent = {
      type: 'agent-event',
      id: 8,
      event: {
        id: 'agent-event-2',
        type: 'disclosure_detected',
        ticker: '005930',
        source: 'dart',
        publishedAt: null,
        firstSeenAt: '2026-05-11T06:00:20.000Z',
        freshnessMs: null,
        freshness: 'unknown',
        relevance: null,
        confidence: 0.9,
        reason: 'x'.repeat(200),
        payloadRef: 'stock-disclosure:42',
        createdAt: '2026-05-11T06:00:20.000Z',
      },
    };

    expect(agentEventToToastSpec(event).detail.length).toBeLessThanOrEqual(123);
  });

  it('does not create a toast when global notifications are disabled', () => {
    const event: AgentEventNotificationEvent = {
      type: 'agent-event',
      id: 9,
      event: {
        id: 'agent-event-3',
        type: 'toss_signal_detected',
        ticker: '005930',
        source: 'toss-signal',
        publishedAt: null,
        firstSeenAt: '2026-05-11T06:00:20.000Z',
        freshnessMs: null,
        freshness: 'unknown',
        relevance: null,
        confidence: 0.7,
        reason: 'signal surfaced',
        payloadRef: null,
        createdAt: '2026-05-11T06:00:20.000Z',
      },
    };

    expect(maybeAgentEventToToastSpec(event, '삼성전자', false, 1_111)).toBeNull();
  });

  it('does not toast low-confidence market movement below the user surge threshold', () => {
    const event: AgentEventNotificationEvent = {
      type: 'agent-event',
      id: 10,
      event: {
        id: 'agent-event-4',
        type: 'market_movement_detected',
        ticker: '171090',
        source: 'kis-ws-tick',
        publishedAt: '2026-05-11T06:00:20.000Z',
        firstSeenAt: '2026-05-11T06:00:20.000Z',
        freshnessMs: 0,
        freshness: 'near_realtime',
        relevance: 0.09,
        confidence: 0.78,
        reason: 'KIS WS tick 가격 업데이트 감지 · 등락률 0.89%',
        payloadRef: null,
        createdAt: '2026-05-11T06:00:20.000Z',
      },
    };

    expect(
      maybeAgentEventToToastSpec(
        event,
        '선익시스템',
        { notificationsEnabled: true, marketMovementThresholdPct: 3 },
        1_111,
      ),
    ).toBeNull();
  });

  it('does not toast TOP100 rotation market movement without a percent crossing', () => {
    const event: AgentEventNotificationEvent = {
      type: 'agent-event',
      id: 11,
      event: {
        id: 'agent-event-5',
        type: 'market_movement_detected',
        ticker: '168360',
        source: 'toss-top100-rotation',
        publishedAt: '2026-05-11T06:00:20.000Z',
        firstSeenAt: '2026-05-11T06:00:20.000Z',
        freshnessMs: 0,
        freshness: 'near_realtime',
        relevance: 0.5,
        confidence: 0.66,
        reason: 'Toss TOP100 rotation · TOP100 하락 #5',
        payloadRef: null,
        createdAt: '2026-05-11T06:00:20.000Z',
      },
    };

    expect(
      maybeAgentEventToToastSpec(
        event,
        undefined,
        { notificationsEnabled: true, marketMovementThresholdPct: 3 },
        1_111,
      ),
    ).toBeNull();
  });

  it('does not toast raw KIS tick market movement even when it crosses the threshold', () => {
    const event: AgentEventNotificationEvent = {
      type: 'agent-event',
      id: 12,
      event: {
        id: 'agent-event-6',
        type: 'market_movement_detected',
        ticker: '277810',
        source: 'kis-ws-tick',
        publishedAt: '2026-05-11T06:00:20.000Z',
        firstSeenAt: '2026-05-11T06:00:20.000Z',
        freshnessMs: 0,
        freshness: 'near_realtime',
        relevance: 0.5,
        confidence: 0.78,
        reason: 'KIS WS tick 가격 업데이트 감지 · 등락률 5.01%',
        payloadRef: null,
        createdAt: '2026-05-11T06:00:20.000Z',
      },
    };

    expect(
      maybeAgentEventToToastSpec(
        event,
        '레인보우로보틱스',
        { notificationsEnabled: true, marketMovementThresholdPct: 3 },
        1_111,
      ),
    ).toBeNull();
  });

  it('toasts realtime momentum market movement once it crosses the user surge threshold', () => {
    const event: AgentEventNotificationEvent = {
      type: 'agent-event',
      id: 13,
      event: {
        id: 'agent-event-7',
        type: 'market_movement_detected',
        ticker: '277810',
        source: 'realtime-momentum',
        publishedAt: '2026-05-11T06:00:20.000Z',
        firstSeenAt: '2026-05-11T06:00:20.000Z',
        freshnessMs: 0,
        freshness: 'near_realtime',
        relevance: 0.5,
        confidence: 0.9,
        reason: 'Realtime momentum overheat 30s +5.01%',
        payloadRef: null,
        createdAt: '2026-05-11T06:00:20.000Z',
      },
    };

    expect(
      maybeAgentEventToToastSpec(
        event,
        '레인보우로보틱스',
        { notificationsEnabled: true, marketMovementThresholdPct: 3 },
        1_111,
      ),
    ).toMatchObject({
      title: '시장 움직임: 레인보우로보틱스',
      changePct: 5.01,
      direction: 'up',
    });
  });

  it('labels negative realtime momentum as 급락 and down direction', () => {
    const event: AgentEventNotificationEvent = {
      type: 'agent-event',
      id: 15,
      event: {
        id: 'agent-event-negative',
        type: 'market_movement_detected',
        ticker: '064800',
        source: 'realtime-momentum',
        publishedAt: '2026-05-11T06:00:20.000Z',
        firstSeenAt: '2026-05-11T06:00:20.000Z',
        freshnessMs: 0,
        freshness: 'near_realtime',
        relevance: 0.5,
        confidence: 0.9,
        reason: 'Realtime momentum overheat 30s -3.26%',
        payloadRef: null,
        createdAt: '2026-05-11T06:00:20.000Z',
      },
    };

    const spec = maybeAgentEventToToastSpec(
      event,
      '포니링크',
      { notificationsEnabled: true, marketMovementThresholdPct: 3 },
      1_111,
    );

    expect(spec).toMatchObject({
      direction: 'down',
      changePct: -3.26,
    });
    expect(spec?.detail).toContain('급락 신호');
    expect(spec?.detail).not.toContain('급상승 신호');
  });

  it('labels TOP100 하락 movement as 급락 when no percent is present', () => {
    const event: AgentEventNotificationEvent = {
      type: 'agent-event',
      id: 16,
      event: {
        id: 'agent-event-top100-down',
        type: 'market_movement_detected',
        ticker: '084670',
        source: 'realtime-momentum',
        publishedAt: '2026-05-11T06:00:20.000Z',
        firstSeenAt: '2026-05-11T06:00:20.000Z',
        freshnessMs: 0,
        freshness: 'near_realtime',
        relevance: 0.5,
        confidence: 0.9,
        reason: 'TOP100 하락 #5',
        payloadRef: null,
        createdAt: '2026-05-11T06:00:20.000Z',
      },
    };

    const spec = agentEventToToastSpec(event, '포니링크', 1_111);

    expect(spec.direction).toBe('down');
    expect(spec.detail).toContain('급락 신호');
    expect(spec.detail).not.toContain('급상승 신호');
  });

  it('uses a semantic cooldown key for equivalent market movement events', () => {
    const baseEvent: AgentEventNotificationEvent = {
      type: 'agent-event',
      id: 13,
      event: {
        id: 'agent-event-7',
        type: 'market_movement_detected',
        ticker: '277810',
        source: 'realtime-momentum',
        publishedAt: '2026-05-11T06:00:20.000Z',
        firstSeenAt: '2026-05-11T06:00:20.000Z',
        freshnessMs: 0,
        freshness: 'near_realtime',
        relevance: 0.5,
        confidence: 0.9,
        reason: '급상승 신호 · 실시간 모멘텀 · 과열 · 10초 · +3.09%',
        payloadRef: null,
        createdAt: '2026-05-11T06:00:20.000Z',
      },
    };
    const nextEvent: AgentEventNotificationEvent = {
      ...baseEvent,
      id: 14,
      event: {
        ...baseEvent.event,
        id: 'agent-event-8',
      },
    };

    const first = maybeAgentEventToToastSpec(
      baseEvent,
      '켄코아에어로스페이스',
      { notificationsEnabled: true, marketMovementThresholdPct: 3 },
      1_111,
    );
    const second = maybeAgentEventToToastSpec(
      nextEvent,
      '켄코아에어로스페이스',
      { notificationsEnabled: true, marketMovementThresholdPct: 3 },
      1_222,
    );

    expect(first?.id).not.toBe(second?.id);
    expect(first?.cooldownKey).toBe(second?.cooldownKey);
    expect(first?.cooldownKey).toBe('agent-event:market:277810:realtime-momentum:10s:up');
  });

  it('uses the 0-30s semantic window for recent surge movement toasts', () => {
    const event: AgentEventNotificationEvent = {
      type: 'agent-event',
      id: 17,
      event: {
        id: 'agent-event-recent-surge',
        type: 'market_movement_detected',
        ticker: '277810',
        source: 'realtime-momentum',
        publishedAt: '2026-05-11T06:00:20.000Z',
        firstSeenAt: '2026-05-11T06:00:20.000Z',
        freshnessMs: 0,
        freshness: 'near_realtime',
        relevance: 0.5,
        confidence: 0.9,
        reason: '최근 급상승 · 0~30초 · +3.09%',
        payloadRef: null,
        createdAt: '2026-05-11T06:00:20.000Z',
      },
    };

    const spec = maybeAgentEventToToastSpec(
      event,
      '켄코아에어로스페이스',
      { notificationsEnabled: true, marketMovementThresholdPct: 3 },
      1_111,
    );

    expect(spec?.cooldownKey).toBe('agent-event:market:277810:realtime-momentum:0-30s:up');
  });

  it('uses public product displayName when caller has no local catalog match', () => {
    const event: AgentEventNotificationEvent = {
      type: 'agent-event',
      id: 14,
      event: {
        id: 'agent-event-8',
        type: 'market_movement_detected',
        ticker: '084670',
        product: {
          productCode: 'A084670',
          krTicker: '084670',
          market: 'KOSPI',
          displayName: '동양고속',
        },
        source: 'realtime-momentum',
        publishedAt: '2026-05-18T00:17:30.000Z',
        firstSeenAt: '2026-05-18T00:17:30.000Z',
        freshnessMs: 0,
        freshness: 'near_realtime',
        relevance: 0.8,
        confidence: 0.9,
        reason: 'Realtime momentum overheat 30s +3.26%',
        payloadRef: null,
        rawPayloadRedacted: true,
        relatedIds: {
          watchlistId: null,
          holdingId: null,
          orderIntentId: null,
          approvalId: null,
        },
        skipReason: null,
        createdAt: '2026-05-18T00:17:30.000Z',
      },
    };

    expect(
      maybeAgentEventToToastSpec(
        event,
        undefined,
        { notificationsEnabled: true, marketMovementThresholdPct: 3 },
        1_111,
      ),
    ).toMatchObject({
      title: '시장 움직임: 동양고속',
      name: '동양고속',
    });
  });
});
