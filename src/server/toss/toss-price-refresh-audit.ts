import type { TossRealtimeQuoteRefreshResult } from './toss-realtime-quote-refresh.js';
import type { TossSseRefreshExecutionResult } from './toss-sse-refresh-executor.js';
import {
  normalizeTossSseRefreshTicker,
  type TossSseRefreshHint,
} from './toss-sse-refresh-router.js';

export interface TossPriceRefreshAuditEvent {
  readonly stockCode: string;
  readonly receivedAt: string;
}

export function createTossPriceRefreshAuditHint(
  event: TossPriceRefreshAuditEvent,
): TossSseRefreshHint {
  return {
    resource: 'quote',
    ticker: normalizeTossSseRefreshTicker(event.stockCode),
    receivedAt: event.receivedAt,
    sourceType: 'price-refresh',
    reason: 'Toss SSE price-refresh thin notification',
  };
}

export function mapTossQuoteRefreshAuditResult(
  result: TossRealtimeQuoteRefreshResult,
): TossSseRefreshExecutionResult {
  switch (result) {
    case 'refreshed':
    case 'throttled':
    case 'in_flight':
    case 'ignored':
      return result;
    case 'untracked':
    case 'missing':
      return 'ignored';
  }
}
