import type { TossSseRefreshResource, TossSseRefreshResultPayload } from '@shared/types';

export const ARAON_TOSS_REFRESH_RESULT_EVENT = 'araon:toss-refresh-result';

const ACCOUNT_RAIL_RESOURCES = new Set<TossSseRefreshResource>([
  'account-summary',
  'portfolio-positions',
  'pending-orders',
  'completed-orders',
]);

export function shouldRefreshTossAccountRailFromResult(
  result: TossSseRefreshResultPayload,
): boolean {
  return result.result === 'refreshed' && ACCOUNT_RAIL_RESOURCES.has(result.resource);
}

export function dispatchTossRefreshResultEvent(
  result: TossSseRefreshResultPayload,
  target: EventTarget = window,
): void {
  target.dispatchEvent(
    new CustomEvent<TossSseRefreshResultPayload>(ARAON_TOSS_REFRESH_RESULT_EVENT, {
      detail: result,
    }),
  );
}
