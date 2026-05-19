import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAgentEventAlertDeliveries, getAgentEvents } from '../api-client';

describe('Agent events API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests a bounded sanitized agent event snapshot', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: {
        items: [
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
        returnedCount: 1,
        summary: {
          targetFirstSeenToDispatchMs: 30_000,
          totalCount: 1,
          dispatchedCount: 1,
          skippedNoClientCount: 0,
          dispatchedWithinTargetCount: 1,
          dispatchedLateCount: 0,
          lastDispatchLatencyMs: 1_000,
          maxDispatchLatencyMs: 1_000,
        },
      },
    })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getAgentEvents(7);

    expect(fetchMock).toHaveBeenCalledWith('/agent/events?limit=7');
    expect(result.returnedCount).toBe(1);
    expect(result.items[0]?.type).toBe('news_detected');
    expect(result.items[0]?.freshness).toBe('near_realtime');
    expect(JSON.stringify(result)).not.toContain(`SESSION${'='}`);
    expect(JSON.stringify(result)).not.toContain('accountNo');
    expect(JSON.stringify(result)).not.toContain('dedupeKey');
  });

  it('requests alert delivery audit entries with dispatch latency', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: {
        items: [
          {
            id: 'delivery-1',
            eventId: 'event-1',
            eventType: 'news_detected',
            ticker: '005930',
            channel: 'browser-sse',
            target: 'local-ui',
            status: 'dispatched',
            clientCount: 1,
            dispatchLatencyMs: 1_000,
            reason: 'agent-event SSE notification',
            createdAt: '2026-05-11T06:00:19.000Z',
          },
        ],
        returnedCount: 1,
        summary: {
          targetFirstSeenToDispatchMs: 30_000,
          totalCount: 1,
          dispatchedCount: 1,
          skippedNoClientCount: 0,
          dispatchedWithinTargetCount: 1,
          dispatchedLateCount: 0,
          lastDispatchLatencyMs: 1_000,
          maxDispatchLatencyMs: 1_000,
        },
      },
    })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getAgentEventAlertDeliveries(3);

    expect(fetchMock).toHaveBeenCalledWith('/agent/event-alert-deliveries?limit=3');
    expect(result.items[0]?.dispatchLatencyMs).toBe(1_000);
    expect(result.summary.dispatchedWithinTargetCount).toBe(1);
    expect(JSON.stringify(result)).not.toContain(`SESSION${'='}`);
    expect(JSON.stringify(result)).not.toContain('accountNo');
  });
});
