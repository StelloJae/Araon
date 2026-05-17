import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';

import { migrateUp } from '../../db/migrator.js';
import { createTossSseRefreshResultStore } from '../toss-sse-refresh-result-store.js';
import type { TossSseRefreshHint } from '../toss-sse-refresh-router.js';

function hint(resource: TossSseRefreshHint['resource']): TossSseRefreshHint {
  return {
    resource,
    ticker: resource === 'portfolio-positions' ? '005930' : null,
    receivedAt: '2026-05-11T06:00:01.000Z',
    sourceType: 'share-holdings',
    reason: 'Toss SSE share-holdings thin notification',
  };
}

describe('Toss SSE refresh result store', () => {
  it('keeps a bounded sanitized snapshot of REST refresh outcomes', () => {
    let index = 0;
    const times = [
      '2026-05-11T06:00:02.000Z',
      '2026-05-11T06:00:03.000Z',
      '2026-05-11T06:00:04.000Z',
    ];
    const store = createTossSseRefreshResultStore({
      capacity: 2,
      now: () => times[index++] ?? '2026-05-11T06:00:05.000Z',
    });

    store.record(hint('account-summary'), 'refreshed');
    store.record(hint('portfolio-positions'), 'throttled');
    store.record(hint('pending-orders'), 'failed', 'Toss orders HTTP 503');

    expect(store.snapshot()).toEqual({
      items: [
        {
          id: 'refresh-result-3',
          resource: 'pending-orders',
          ticker: null,
          sourceType: 'share-holdings',
          receivedAt: '2026-05-11T06:00:01.000Z',
          result: 'failed',
          reason: 'Toss SSE share-holdings thin notification',
          recordedAt: '2026-05-11T06:00:04.000Z',
          error: 'TOSS_SSE_REFRESH_FAILED',
        },
        {
          id: 'refresh-result-2',
          resource: 'portfolio-positions',
          ticker: '005930',
          sourceType: 'share-holdings',
          receivedAt: '2026-05-11T06:00:01.000Z',
          result: 'throttled',
          reason: 'Toss SSE share-holdings thin notification',
          recordedAt: '2026-05-11T06:00:03.000Z',
          error: null,
        },
      ],
      returnedCount: 2,
    });
    expect(JSON.stringify(store.snapshot())).not.toContain('SESSION');
    expect(JSON.stringify(store.snapshot())).not.toContain('raw-key-hidden');
    expect(JSON.stringify(store.snapshot())).not.toContain('accountNo');
  });

  it('persists sanitized refresh outcomes across SQLite-backed store instances', () => {
    const db = new Database(':memory:');
    migrateUp(db);
    try {
      let index = 0;
      const times = [
        '2026-05-11T06:00:02.000Z',
        '2026-05-11T06:00:03.000Z',
      ];
      const store = createTossSseRefreshResultStore({
        capacity: 2,
        db,
        now: () => times[index++] ?? '2026-05-11T06:00:04.000Z',
      });

      store.record(hint('account-summary'), 'refreshed');
      store.record(
        hint('portfolio-positions'),
        'failed',
        'SESSION=[test-session-token] accountNo=[test-account]',
      );

      const reopened = createTossSseRefreshResultStore({ capacity: 2, db });
      const snapshot = reopened.snapshot(5);

      expect(snapshot).toEqual({
        items: [
          {
            id: 'refresh-result-2',
            resource: 'portfolio-positions',
            ticker: '005930',
            sourceType: 'share-holdings',
            receivedAt: '2026-05-11T06:00:01.000Z',
            result: 'failed',
            reason: 'Toss SSE share-holdings thin notification',
            recordedAt: '2026-05-11T06:00:03.000Z',
            error: 'TOSS_SSE_REFRESH_FAILED',
          },
          {
            id: 'refresh-result-1',
            resource: 'account-summary',
            ticker: null,
            sourceType: 'share-holdings',
            receivedAt: '2026-05-11T06:00:01.000Z',
            result: 'refreshed',
            reason: 'Toss SSE share-holdings thin notification',
            recordedAt: '2026-05-11T06:00:02.000Z',
            error: null,
          },
        ],
        returnedCount: 2,
      });
      expect(JSON.stringify(snapshot)).not.toContain('[test-session-token]');
      expect(JSON.stringify(snapshot)).not.toContain('12345678');
    } finally {
      db.close();
    }
  });

  it('reduces arbitrary provider failure text to a safe refresh error code', () => {
    const store = createTossSseRefreshResultStore({
      now: () => '2026-05-11T06:00:02.000Z',
    });

    store.record(
      hint('pending-orders'),
      'failed',
      'raw Toss response https://wts-api.tossinvest.com/account orderNo=[test-order-no] referenceId=[test-reference]',
    );

    const snapshot = store.snapshot();
    expect(snapshot.items[0]?.error).toBe('TOSS_SSE_REFRESH_FAILED');
    expect(JSON.stringify(snapshot)).not.toContain('wts-api.tossinvest.com');
    expect(JSON.stringify(snapshot)).not.toContain('[test-order-no]');
    expect(JSON.stringify(snapshot)).not.toContain('[test-reference]');
  });
});
