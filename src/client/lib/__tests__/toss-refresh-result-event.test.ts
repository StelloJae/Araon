import { describe, expect, it, vi } from 'vitest';

import type { TossSseRefreshResultPayload } from '@shared/types';
import {
  ARAON_TOSS_REFRESH_RESULT_EVENT,
  dispatchTossRefreshResultEvent,
  shouldRefreshTossAccountRailFromResult,
} from '../toss-refresh-result-event';

function result(
  overrides: Partial<TossSseRefreshResultPayload> = {},
): TossSseRefreshResultPayload {
  return {
    id: 'refresh-result-1',
    resource: 'account-summary',
    ticker: null,
    sourceType: 'account',
    receivedAt: '2026-05-11T07:00:00.000Z',
    result: 'refreshed',
    reason: 'account summary refreshed',
    recordedAt: '2026-05-11T07:00:01.000Z',
    error: null,
    ...overrides,
  };
}

describe('toss-refresh-result browser event helpers', () => {
  it('refreshes the account rail for successful account/order/portfolio refresh results', () => {
    expect(shouldRefreshTossAccountRailFromResult(result({ resource: 'account-summary' }))).toBe(true);
    expect(shouldRefreshTossAccountRailFromResult(result({ resource: 'portfolio-positions' }))).toBe(true);
    expect(shouldRefreshTossAccountRailFromResult(result({ resource: 'pending-orders' }))).toBe(true);
    expect(shouldRefreshTossAccountRailFromResult(result({ resource: 'completed-orders' }))).toBe(true);
  });

  it('ignores quote-only and non-refreshed results for the account rail', () => {
    expect(shouldRefreshTossAccountRailFromResult(result({ resource: 'quote' }))).toBe(false);
    expect(shouldRefreshTossAccountRailFromResult(result({ resource: 'preferences' }))).toBe(false);
    expect(shouldRefreshTossAccountRailFromResult(result({ resource: 'user-notifications' }))).toBe(false);
    expect(shouldRefreshTossAccountRailFromResult(result({ resource: 'account-summary', result: 'failed' }))).toBe(false);
    expect(shouldRefreshTossAccountRailFromResult(result({ resource: 'pending-orders', result: 'throttled' }))).toBe(false);
    expect(shouldRefreshTossAccountRailFromResult(result({ resource: 'completed-orders', result: 'in_flight' }))).toBe(false);
    expect(shouldRefreshTossAccountRailFromResult(result({ resource: 'portfolio-positions', result: 'ignored' }))).toBe(false);
  });

  it('dispatches the sanitized refresh result detail on a browser event target', () => {
    const target = new EventTarget();
    const listener = vi.fn();
    target.addEventListener(ARAON_TOSS_REFRESH_RESULT_EVENT, listener);

    const payload = result({ resource: 'pending-orders' });

    dispatchTossRefreshResultEvent(payload, target);

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0]?.[0] as CustomEvent<TossSseRefreshResultPayload>).detail).toEqual(payload);
  });
});
