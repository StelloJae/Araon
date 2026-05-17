import { describe, expect, it, vi } from 'vitest';

import { createTossSseRefreshExecutor } from '../toss-sse-refresh-executor.js';
import type { TossSseRefreshHint } from '../toss-sse-refresh-router.js';

function hint(
  resource: TossSseRefreshHint['resource'],
  ticker: string | null = resource === 'portfolio-positions' ? '005930' : null,
): TossSseRefreshHint {
  return {
    resource,
    ticker,
    receivedAt: '2026-05-11T06:00:01.000Z',
    sourceType: 'share-holdings',
    reason: 'Toss SSE share-holdings thin notification',
  };
}

describe('Toss SSE refresh executor', () => {
  it('executes read-only Toss REST refreshes for supported resources', async () => {
    const listPendingOrders = vi.fn(async () => ({ provider: 'toss', fetchedAt: 'now', orders: [] }));
    const listCompletedOrders = vi.fn(async () => ({ provider: 'toss', fetchedAt: 'now', range: {}, orders: [] }));
    const getSummary = vi.fn(async () => ({ provider: 'toss', fetchedAt: 'now' }));
    const listPositions = vi.fn(async () => ({ provider: 'toss', fetchedAt: 'now', positions: [] }));
    const executor = createTossSseRefreshExecutor({
      ordersClient: { listPendingOrders, listCompletedOrders },
      accountSummaryClient: { getSummary },
      portfolioClient: { listPositions },
      now: () => 1_000,
    });

    await expect(executor.handle(hint('pending-orders'))).resolves.toBe('refreshed');
    await expect(executor.handle(hint('completed-orders'))).resolves.toBe('refreshed');
    await expect(executor.handle(hint('account-summary'))).resolves.toBe('refreshed');
    await expect(executor.handle(hint('portfolio-positions'))).resolves.toBe('refreshed');

    expect(listPendingOrders).toHaveBeenCalledTimes(1);
    expect(listCompletedOrders).toHaveBeenCalledTimes(1);
    expect(getSummary).toHaveBeenCalledTimes(1);
    expect(listPositions).toHaveBeenCalledTimes(1);
  });

  it('ignores non-REST or separately handled refresh resources', async () => {
    const listPendingOrders = vi.fn();
    const executor = createTossSseRefreshExecutor({
      ordersClient: { listPendingOrders, listCompletedOrders: vi.fn() },
      accountSummaryClient: { getSummary: vi.fn() },
      portfolioClient: { listPositions: vi.fn() },
      now: () => 1_000,
    });

    await expect(executor.handle(hint('quote'))).resolves.toBe('ignored');
    await expect(executor.handle(hint('user-notifications'))).resolves.toBe('ignored');
    await expect(executor.handle(hint('preferences'))).resolves.toBe('ignored');
    await expect(executor.handle(hint('icons'))).resolves.toBe('ignored');

    expect(listPendingOrders).not.toHaveBeenCalled();
  });

  it('throttles immediate duplicate refreshes by resource and sanitized ticker', async () => {
    let now = 1_000;
    const listPositions = vi.fn(async () => ({ provider: 'toss', fetchedAt: 'now', positions: [] }));
    const executor = createTossSseRefreshExecutor({
      ordersClient: { listPendingOrders: vi.fn(), listCompletedOrders: vi.fn() },
      accountSummaryClient: { getSummary: vi.fn() },
      portfolioClient: { listPositions },
      minRefreshGapMs: 1_000,
      now: () => now,
    });

    await expect(executor.handle(hint('portfolio-positions'))).resolves.toBe('refreshed');
    await expect(executor.handle(hint('portfolio-positions'))).resolves.toBe('throttled');
    now += 1_001;
    await expect(executor.handle(hint('portfolio-positions'))).resolves.toBe('refreshed');

    expect(listPositions).toHaveBeenCalledTimes(2);
  });

  it('throttles account-wide refreshes by resource even when SSE tickers differ', async () => {
    let now = 1_000;
    const listPositions = vi.fn(async () => ({ provider: 'toss', fetchedAt: 'now', positions: [] }));
    const executor = createTossSseRefreshExecutor({
      ordersClient: { listPendingOrders: vi.fn(), listCompletedOrders: vi.fn() },
      accountSummaryClient: { getSummary: vi.fn() },
      portfolioClient: { listPositions },
      minRefreshGapMs: 1_000,
      now: () => now,
    });

    await expect(executor.handle(hint('portfolio-positions', '005930'))).resolves.toBe('refreshed');
    await expect(executor.handle(hint('portfolio-positions', '000660'))).resolves.toBe('throttled');
    now += 1_001;
    await expect(executor.handle(hint('portfolio-positions', '000660'))).resolves.toBe('refreshed');

    expect(listPositions).toHaveBeenCalledTimes(2);
  });
});
