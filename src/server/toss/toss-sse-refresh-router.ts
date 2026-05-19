import type { TossSseEvent } from './toss-sse-client.js';

export type TossSseRefreshResource =
  | 'quote'
  | 'pending-orders'
  | 'completed-orders'
  | 'account-summary'
  | 'portfolio-positions'
  | 'user-notifications'
  | 'preferences'
  | 'icons';

export interface TossSseRefreshHint {
  readonly resource: TossSseRefreshResource;
  readonly ticker: string | null;
  readonly receivedAt: string;
  readonly sourceType: string;
  readonly reason: string;
}

const REFRESH_RESOURCES_BY_TYPE = new Map<string, readonly TossSseRefreshResource[]>([
  ['price-refresh', ['quote']],
  ['pending-order-refresh', ['pending-orders']],
  ['order-refresh', ['pending-orders', 'completed-orders']],
  ['purchase-price-refresh', ['account-summary', 'portfolio-positions']],
  ['share-holdings', ['portfolio-positions', 'account-summary']],
  ['web-push', ['user-notifications']],
  ['setting-refresh', ['preferences']],
  ['icon-refresh', ['icons']],
]);

export function routeTossSseRefreshHints(
  event: TossSseEvent,
): readonly TossSseRefreshHint[] {
  const sourceType = normalizeSourceType(event.type);
  const resources = REFRESH_RESOURCES_BY_TYPE.get(sourceType);
  if (resources === undefined) return [];
  const ticker = normalizeTossSseRefreshTicker(event.stockCode);
  return resources.map((resource) => ({
    resource,
    ticker,
    receivedAt: event.receivedAt,
    sourceType,
    reason: `Toss SSE ${sourceType} thin notification`,
  }));
}

function normalizeSourceType(type: string): string {
  const trimmed = type.trim();
  if (trimmed.length === 0) return 'unknown';
  return trimmed.replace(/[^\w.-]/g, '_').slice(0, 64);
}

export function normalizeTossSseRefreshTicker(stockCode: string | null): string | null {
  if (stockCode === null) return null;
  const trimmed = stockCode.trim().toUpperCase();
  if (trimmed.length === 0) return null;
  if (/^A\d{6}$/.test(trimmed)) return trimmed.slice(1);
  if (/^\d{6}$/.test(trimmed)) return trimmed;
  if (/^(KR|US)[A-Z0-9]{8,24}$/.test(trimmed)) return trimmed;
  return null;
}
