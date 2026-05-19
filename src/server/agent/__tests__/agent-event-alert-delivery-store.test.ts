import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';

import { migrateUp } from '../../db/migrator.js';
import { createSqliteAgentEventAlertDeliveryStore } from '../agent-event-alert-delivery-store.js';
import type { AgentEvent } from '../agent-event-queue.js';

describe('agent event alert delivery store', () => {
  it('records first_seen to dispatch latency for alert audit', () => {
    const db = new Database(':memory:');
    try {
      migrateUp(db);
      const store = createSqliteAgentEventAlertDeliveryStore(db, {
        idFactory: () => 'delivery-1',
        now: () => '2026-05-11T06:00:22.000Z',
      });

      const event: AgentEvent = {
        id: 'event-1',
        type: 'news_detected',
        ticker: '005930',
        source: 'naver-search',
        publishedAt: '2026-05-11T06:00:00.000Z',
        firstSeenAt: '2026-05-11T06:00:20.000Z',
        freshnessMs: 20_000,
        relevance: 0.7,
        confidence: 0.72,
        reason: 'New stock news detected: 삼성전자 신규 뉴스',
        dedupeKey: 'news:naver-search:news-1',
        payloadRef: 'stock-news:news-1',
        createdAt: '2026-05-11T06:00:20.000Z',
      };

      const inserted = store.append({
        event,
        channel: 'browser-sse',
        target: 'local-ui',
        status: 'dispatched',
        clientCount: 1,
        reason: 'agent-event SSE notification',
      });

      expect(inserted).toMatchObject({
        id: 'delivery-1',
        eventId: 'event-1',
        ticker: '005930',
        dispatchLatencyMs: 2_000,
        createdAt: '2026-05-11T06:00:22.000Z',
      });
      expect(store.snapshot(1)[0]).toMatchObject({
        id: 'delivery-1',
        dispatchLatencyMs: 2_000,
      });
    } finally {
      db.close();
    }
  });

  it('records order-intent lifecycle alert events without violating event type constraints', () => {
    const db = new Database(':memory:');
    try {
      migrateUp(db);
      const store = createSqliteAgentEventAlertDeliveryStore(db, {
        idFactory: () => 'delivery-preview',
        now: () => '2026-05-11T06:00:01.000Z',
      });

      const event: AgentEvent = {
        id: 'event-preview',
        type: 'preview_created',
        ticker: '005930',
        productCode: 'A005930',
        krTicker: '005930',
        market: 'KOSPI',
        displayName: '삼성전자',
        source: 'order-intent',
        publishedAt: '2026-05-11T06:00:00.000Z',
        firstSeenAt: '2026-05-11T06:00:00.000Z',
        freshnessMs: 0,
        relevance: 0.5,
        confidence: 1,
        reason: 'Local simulated order preview created; live execution remains locked.',
        dedupeKey: 'order-intent:preview:intent-preview',
        payloadRef: null,
        rawPayloadRedacted: true,
        relatedIds: {
          watchlistId: null,
          holdingId: null,
          orderIntentId: 'intent-preview',
          approvalId: null,
        },
        skipReason: 'live execution locked',
        createdAt: '2026-05-11T06:00:00.000Z',
      };

      const inserted = store.append({
        event,
        channel: 'browser-sse',
        target: 'local-ui',
        status: 'skipped_no_client',
        clientCount: 0,
        reason: 'agent-event SSE notification',
      });

      expect(inserted).toMatchObject({
        id: 'delivery-preview',
        eventType: 'preview_created',
        eventId: 'event-preview',
        dispatchLatencyMs: 1_000,
      });
    } finally {
      db.close();
    }
  });

  it('summarizes first_seen to dispatch latency against the 30s target', () => {
    const db = new Database(':memory:');
    try {
      migrateUp(db);
      let index = 0;
      const times = [
        '2026-05-11T06:00:02.000Z',
        '2026-05-11T06:00:35.000Z',
        '2026-05-11T06:00:40.000Z',
      ];
      const store = createSqliteAgentEventAlertDeliveryStore(db, {
        idFactory: () => `delivery-${index + 1}`,
        now: () => times[index++] ?? '2026-05-11T06:00:40.000Z',
      });
      const event: AgentEvent = {
        id: 'event-1',
        type: 'news_detected',
        ticker: '005930',
        source: 'naver-search',
        publishedAt: '2026-05-11T05:59:59.000Z',
        firstSeenAt: '2026-05-11T06:00:00.000Z',
        freshnessMs: 1_000,
        relevance: 0.7,
        confidence: 0.72,
        reason: 'New stock news detected',
        dedupeKey: 'news:naver-search:news-1',
        payloadRef: 'stock-news:news-1',
        createdAt: '2026-05-11T06:00:00.000Z',
      };

      store.append({
        event,
        channel: 'browser-sse',
        target: 'local-ui',
        status: 'dispatched',
        clientCount: 1,
        reason: 'agent-event SSE notification',
      });
      store.append({
        event: { ...event, id: 'event-2', dedupeKey: 'news:naver-search:news-2' },
        channel: 'browser-sse',
        target: 'local-ui',
        status: 'dispatched',
        clientCount: 1,
        reason: 'agent-event SSE notification',
      });
      store.append({
        event: { ...event, id: 'event-3', dedupeKey: 'news:naver-search:news-3' },
        channel: 'browser-sse',
        target: 'local-ui',
        status: 'skipped_no_client',
        clientCount: 0,
        reason: 'agent-event SSE notification',
      });

      expect(store.summarize()).toEqual({
        targetFirstSeenToDispatchMs: 30_000,
        totalCount: 3,
        dispatchedCount: 2,
        skippedNoClientCount: 1,
        dispatchedWithinTargetCount: 1,
        dispatchedLateCount: 1,
        lastDispatchLatencyMs: 40_000,
        maxDispatchLatencyMs: 40_000,
      });
    } finally {
      db.close();
    }
  });
});
