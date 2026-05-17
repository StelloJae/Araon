import { describe, expect, it } from 'vitest';

import { createAgentEventQueue } from '../agent-event-queue.js';

describe('agent event queue', () => {
  it('notifies on first insert but not on duplicate events', () => {
    const inserted: string[] = [];
    const queue = createAgentEventQueue({
      idFactory: () => 'evt-callback',
      now: () => '2026-05-11T06:00:30.000Z',
      onInsert: (event) => inserted.push(event.id),
    });

    const input = {
      type: 'news_detected' as const,
      ticker: '005930',
      source: 'naver-news',
      publishedAt: '2026-05-11T06:00:00.000Z',
      relevance: 0.8,
      confidence: 0.9,
      reason: 'title matched Samsung Electronics',
      dedupeKey: 'naver-news:005930:item-callback',
      payloadRef: 'news:provider:item-callback',
    };

    expect(queue.enqueue(input).inserted).toBe(true);
    expect(queue.enqueue(input).inserted).toBe(false);
    expect(inserted).toEqual(['evt-callback']);
  });

  it('normalizes freshness and dedupes repeated provider events', () => {
    const queue = createAgentEventQueue({
      idFactory: () => 'evt-1',
      now: () => '2026-05-11T06:00:30.000Z',
    });

    const first = queue.enqueue({
      type: 'news_detected',
      ticker: '005930',
      source: 'naver-news',
      publishedAt: '2026-05-11T06:00:00.000Z',
      relevance: 0.8,
      confidence: 0.9,
      reason: 'title matched Samsung Electronics',
      dedupeKey: 'naver-news:005930:item-1',
      payloadRef: 'news:provider:item-1',
    });
    const duplicate = queue.enqueue({
      type: 'news_detected',
      ticker: '005930',
      source: 'naver-news',
      publishedAt: '2026-05-11T06:00:00.000Z',
      relevance: 0.8,
      confidence: 0.9,
      reason: 'title matched Samsung Electronics',
      dedupeKey: 'naver-news:005930:item-1',
      payloadRef: 'news:provider:item-1',
    });

    expect(first.inserted).toBe(true);
    expect(duplicate.inserted).toBe(false);
    expect(queue.snapshot()).toEqual([
      {
        id: 'evt-1',
        type: 'news_detected',
        ticker: '005930',
        productCode: 'A005930',
        krTicker: '005930',
        market: null,
        displayName: null,
        source: 'naver-news',
        publishedAt: '2026-05-11T06:00:00.000Z',
        firstSeenAt: '2026-05-11T06:00:30.000Z',
        freshnessMs: 30_000,
        relevance: 0.8,
        confidence: 0.9,
        reason: 'title matched Samsung Electronics',
        dedupeKey: 'naver-news:005930:item-1',
        payloadRef: 'news:provider:item-1',
        rawPayloadRedacted: true,
        relatedIds: {
          watchlistId: null,
          holdingId: null,
          orderIntentId: null,
          approvalId: null,
        },
        skipReason: null,
        createdAt: '2026-05-11T06:00:30.000Z',
      },
    ]);
  });

  it('rejects invalid tickers and clamps scoring fields without raw payloads', () => {
    const queue = createAgentEventQueue({
      idFactory: () => 'evt-2',
      now: () => '2026-05-11T06:00:30.000Z',
    });

    expect(() => queue.enqueue({
      type: 'market_movement_detected',
      ticker: 'cookie_value=raw',
      source: 'toss-sse',
      publishedAt: null,
      relevance: 2,
      confidence: -1,
      reason: 'raw session should never fit ticker validation',
      dedupeKey: 'raw',
      payloadRef: null,
    })).toThrow('Invalid agent event ticker');

    const result = queue.enqueue({
      type: 'market_movement_detected',
      ticker: 'a005930',
      source: 'toss-sse',
      publishedAt: null,
      relevance: 2,
      confidence: -1,
      reason: 'Toss SSE price-refresh thin notification',
      dedupeKey: 'toss-sse:price-refresh:A005930',
      payloadRef: null,
    });

    expect(result.event).toMatchObject({
      ticker: '005930',
      freshnessMs: null,
      relevance: 1,
      confidence: 0,
      payloadRef: null,
    });
    expect(JSON.stringify(queue.snapshot())).not.toContain('cookie_value=');
  });

  it('redacts sensitive-looking event text before it can reach public surfaces', () => {
    const queue = createAgentEventQueue({
      idFactory: () => 'evt-redacted',
      now: () => '2026-05-11T06:00:30.000Z',
    });
    const pair = (key: string, value: string) => [key, value].join('=');
    const sessionKey = ['SE', 'SSION'].join('');
    const accountKey = ['account', 'No'].join('');
    const orderKey = ['order', 'No'].join('');
    const referenceKey = ['reference', 'Id'].join('');
    const sessionValue = ['session', 'value'].join('-');
    const accountValue = ['1234', '5678'].join('');
    const orderValue = ['raw', 'order'].join('-');
    const referenceValue = ['raw', 'ref'].join('-');
    const sessionPair = pair(sessionKey, sessionValue);
    const accountPair = pair(accountKey, accountValue);
    const orderPair = pair(orderKey, orderValue);
    const referencePair = pair(referenceKey, referenceValue);

    const result = queue.enqueue({
      type: 'news_detected',
      ticker: '005930',
      source: 'naver-news',
      publishedAt: null,
      relevance: 0.8,
      confidence: 0.9,
      reason: `provider message ${sessionPair} ${accountPair} ${orderPair}`,
      dedupeKey: 'news:naver:provider-sensitive',
      payloadRef: `stock-news:${referencePair}`,
    });

    expect(result.event.reason).toBe(
      `provider message ${sessionKey}=[REDACTED] ${accountKey}=[REDACTED] ${orderKey}=[REDACTED]`,
    );
    expect(result.event.payloadRef).toBe(`stock-news:${referenceKey}=[REDACTED]`);
    expect(JSON.stringify(queue.snapshot())).not.toContain(sessionValue);
    expect(JSON.stringify(queue.snapshot())).not.toContain(accountValue);
    expect(JSON.stringify(queue.snapshot())).not.toContain(orderValue);
    expect(JSON.stringify(queue.snapshot())).not.toContain(referenceValue);
  });

  it('normalizes product identity and safety metadata for future agent consumers', () => {
    const queue = createAgentEventQueue({
      idFactory: () => 'evt-contract',
      now: () => '2026-05-11T06:00:30.000Z',
    });

    const result = queue.enqueue({
      type: 'watchlist_changed',
      ticker: 'A005930',
      source: 'araon-watchlist',
      publishedAt: null,
      relevance: 0.7,
      confidence: 0.8,
      reason: 'Toss watchlist sync intent recorded',
      dedupeKey: 'watchlist:A005930:added',
      payloadRef: null,
      productCode: '005930',
      market: 'KOSPI',
      displayName: '삼성전자',
      relatedIds: {
        watchlistId: 'watchlist:A005930',
        orderIntentId: 'intent-1',
      },
      skipReason: 'live execution locked',
    });

    expect(result.event).toMatchObject({
      type: 'watchlist_changed',
      ticker: '005930',
      productCode: 'A005930',
      krTicker: '005930',
      market: 'KOSPI',
      displayName: '삼성전자',
      rawPayloadRedacted: true,
      relatedIds: {
        watchlistId: 'watchlist:A005930',
        holdingId: null,
        orderIntentId: 'intent-1',
        approvalId: null,
      },
      skipReason: 'live execution locked',
    });
  });
});
