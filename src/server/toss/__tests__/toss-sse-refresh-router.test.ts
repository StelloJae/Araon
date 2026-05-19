import { describe, expect, it } from 'vitest';

import { routeTossSseRefreshHints } from '../toss-sse-refresh-router.js';
import type { TossSseEvent } from '../toss-sse-client.js';

function event(type: string, stockCode: string | null = null): TossSseEvent {
  return {
    id: null,
    name: null,
    type,
    key: 'raw-key-hidden',
    stockCode,
    receivedAt: '2026-05-11T06:00:01.000Z',
  };
}

describe('Toss SSE refresh router', () => {
  it('maps thin notification types to sanitized REST refresh hints', () => {
    expect(routeTossSseRefreshHints(event('pending-order-refresh'))).toEqual([
      {
        resource: 'pending-orders',
        ticker: null,
        receivedAt: '2026-05-11T06:00:01.000Z',
        sourceType: 'pending-order-refresh',
        reason: 'Toss SSE pending-order-refresh thin notification',
      },
    ]);

    expect(routeTossSseRefreshHints(event('purchase-price-refresh', 'A005930'))).toEqual([
      {
        resource: 'account-summary',
        ticker: '005930',
        receivedAt: '2026-05-11T06:00:01.000Z',
        sourceType: 'purchase-price-refresh',
        reason: 'Toss SSE purchase-price-refresh thin notification',
      },
      {
        resource: 'portfolio-positions',
        ticker: '005930',
        receivedAt: '2026-05-11T06:00:01.000Z',
        sourceType: 'purchase-price-refresh',
        reason: 'Toss SSE purchase-price-refresh thin notification',
      },
    ]);

    expect(routeTossSseRefreshHints(event('share-holdings', 'US20181228002'))).toEqual([
      {
        resource: 'portfolio-positions',
        ticker: 'US20181228002',
        receivedAt: '2026-05-11T06:00:01.000Z',
        sourceType: 'share-holdings',
        reason: 'Toss SSE share-holdings thin notification',
      },
      {
        resource: 'account-summary',
        ticker: 'US20181228002',
        receivedAt: '2026-05-11T06:00:01.000Z',
        sourceType: 'share-holdings',
        reason: 'Toss SSE share-holdings thin notification',
      },
    ]);
  });

  it('classifies notification-only events without exposing raw SSE keys', () => {
    expect(routeTossSseRefreshHints(event('web-push', 'A000660'))).toEqual([
      {
        resource: 'user-notifications',
        ticker: '000660',
        receivedAt: '2026-05-11T06:00:01.000Z',
        sourceType: 'web-push',
        reason: 'Toss SSE web-push thin notification',
      },
    ]);

    expect(routeTossSseRefreshHints(event('unknown-in-fixture', 'A000660'))).toEqual([]);
    expect(JSON.stringify(routeTossSseRefreshHints(event('web-push')))).not.toContain('raw-key-hidden');
  });
});
