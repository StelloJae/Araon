import { describe, expect, it, vi } from 'vitest';

import { createTossRealtimeRefreshHandlers } from '../toss-realtime-refresh-handlers.js';
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

describe('Toss realtime refresh handlers', () => {
  it('records and broadcasts refreshed quote audit rows for price-refresh events', async () => {
    const store = createTossSseRefreshResultStore({
      now: () => '2026-05-11T06:00:02.000Z',
    });
    const broadcastRefreshResult = vi.fn();
    const handlers = createTossRealtimeRefreshHandlers({
      quoteRefresh: { handle: vi.fn(async () => 'refreshed') },
      refreshExecutor: { handle: vi.fn(async () => 'ignored') },
      resultStore: store,
      broadcastRefreshResult,
    });

    await handlers.onPriceRefresh({
      stockCode: 'A005930',
      receivedAt: '2026-05-11T06:00:01.000Z',
    });

    expect(store.snapshot()).toMatchObject({
      returnedCount: 1,
      items: [
        {
          resource: 'quote',
          ticker: '005930',
          sourceType: 'price-refresh',
          result: 'refreshed',
          error: null,
        },
      ],
    });
    expect(broadcastRefreshResult).toHaveBeenCalledWith(store.snapshot().items[0]);
  });

  it('keeps unsupported price-refresh outcomes as non-completion audit rows', async () => {
    const store = createTossSseRefreshResultStore({
      now: () => '2026-05-11T06:00:02.000Z',
    });
    const onSkipped = vi.fn();
    const handlers = createTossRealtimeRefreshHandlers({
      quoteRefresh: { handle: vi.fn(async () => 'untracked') },
      refreshExecutor: { handle: vi.fn(async () => 'ignored') },
      resultStore: store,
      onSkipped,
    });

    await handlers.onPriceRefresh({
      stockCode: 'A000660',
      receivedAt: '2026-05-11T06:00:01.000Z',
    });

    expect(store.snapshot().items[0]).toMatchObject({
      resource: 'quote',
      result: 'ignored',
      error: null,
    });
    expect(onSkipped).toHaveBeenCalledWith({
      kind: 'price-refresh',
      result: 'untracked',
    });
  });

  it('records supported account refresh hints and sanitizes provider failures', async () => {
    const store = createTossSseRefreshResultStore({
      now: () => '2026-05-11T06:00:02.000Z',
    });
    const handlers = createTossRealtimeRefreshHandlers({
      quoteRefresh: { handle: vi.fn(async () => 'ignored') },
      refreshExecutor: {
        handle: vi.fn()
          .mockResolvedValueOnce('refreshed')
          .mockRejectedValueOnce(new Error('SESSION=[test-session] accountNo=[test-account]')),
      },
      resultStore: store,
    });

    await handlers.onRefreshHint(hint('portfolio-positions'));
    await expect(handlers.onRefreshHint(hint('account-summary'))).rejects.toThrow();

    expect(store.snapshot()).toMatchObject({
      returnedCount: 2,
      items: [
        {
          resource: 'account-summary',
          result: 'failed',
          error: 'TOSS_SSE_REFRESH_FAILED',
        },
        {
          resource: 'portfolio-positions',
          result: 'refreshed',
          error: null,
        },
      ],
    });
    expect(JSON.stringify(store.snapshot())).not.toContain('[test-session]');
    expect(JSON.stringify(store.snapshot())).not.toContain('[test-account]');
  });
});
