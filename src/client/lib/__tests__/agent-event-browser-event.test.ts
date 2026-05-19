import { describe, expect, it, vi } from 'vitest';

import type { AgentEventNotificationPayload } from '@shared/types';
import {
  ARAON_AGENT_EVENT_EVENT,
  agentNotificationToRailEvent,
  dispatchAgentEventBrowserEvent,
  mergeAgentEventRailSnapshot,
} from '../agent-event-browser-event';

function notification(
  overrides: Partial<AgentEventNotificationPayload> = {},
): AgentEventNotificationPayload {
  return {
    id: 'agent-event-1',
    type: 'news_detected',
    ticker: '005930',
    source: 'naver-finance',
    publishedAt: '2026-05-11T06:00:00.000Z',
    firstSeenAt: '2026-05-11T06:00:18.000Z',
    freshnessMs: 18_000,
    freshness: 'near_realtime',
    relevance: 0.7,
    confidence: 0.72,
    reason: 'New stock news detected',
    payloadRef: 'stock-news:42',
    createdAt: '2026-05-11T06:00:18.000Z',
    ...overrides,
  };
}

describe('agent-event browser event helpers', () => {
  it('maps a sanitized SSE notification into a rail event without provider dedupe keys', () => {
    const event = agentNotificationToRailEvent(notification());

    expect(event.id).toBe('agent-event-1');
    expect(event.ticker).toBe('005930');
    expect(event.freshness).toBe('near_realtime');
    expect(JSON.stringify(event)).not.toContain('dedupeKey');
    expect(JSON.stringify(event)).not.toContain('naver-finance:raw');
  });

  it('prepends new SSE events, de-dupes by local event id, and caps the rail snapshot', () => {
    const existing = [
      agentNotificationToRailEvent(notification({ id: 'agent-event-1' })),
      agentNotificationToRailEvent(notification({ id: 'agent-event-2', ticker: '000660' })),
    ];

    const merged = mergeAgentEventRailSnapshot(
      existing,
      notification({ id: 'agent-event-3', ticker: '035420' }),
      2,
    );

    expect(merged.map((event) => event.id)).toEqual(['agent-event-3', 'agent-event-1']);

    const deduped = mergeAgentEventRailSnapshot(
      merged,
      notification({ id: 'agent-event-1', ticker: '005930', reason: 'updated local copy' }),
      3,
    );

    expect(deduped.map((event) => event.id)).toEqual(['agent-event-1', 'agent-event-3']);
    expect(deduped[0]?.reason).toBe('updated local copy');
  });

  it('dispatches the sanitized agent notification on a browser event target', () => {
    const target = new EventTarget();
    const listener = vi.fn();
    target.addEventListener(ARAON_AGENT_EVENT_EVENT, listener);

    const payload = notification({ id: 'agent-event-4' });

    dispatchAgentEventBrowserEvent(payload, target);

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0]?.[0] as CustomEvent<AgentEventNotificationPayload>).detail).toEqual(payload);
  });
});
