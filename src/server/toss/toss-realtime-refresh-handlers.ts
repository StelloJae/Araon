import type {
  TossRealtimePriceRefreshEvent,
} from './toss-realtime-service.js';
import type {
  TossRealtimeQuoteRefreshHandler,
  TossRealtimeQuoteRefreshResult,
} from './toss-realtime-quote-refresh.js';
import type {
  TossSseRefreshExecutionResult,
  TossSseRefreshExecutor,
} from './toss-sse-refresh-executor.js';
import type {
  TossSseRefreshResultEntry,
  TossSseRefreshResultStore,
} from './toss-sse-refresh-result-store.js';
import type { TossSseRefreshHint } from './toss-sse-refresh-router.js';
import {
  createTossPriceRefreshAuditHint,
  mapTossQuoteRefreshAuditResult,
} from './toss-price-refresh-audit.js';

export interface TossRealtimeRefreshHandlers {
  readonly onPriceRefresh: (event: TossRealtimePriceRefreshEvent) => Promise<void>;
  readonly onRefreshHint: (hint: TossSseRefreshHint) => Promise<void>;
}

export type TossRealtimeRefreshSkippedEvent =
  | {
      readonly kind: 'price-refresh';
      readonly result: TossRealtimeQuoteRefreshResult;
    }
  | {
      readonly kind: 'refresh-hint';
      readonly result: TossSseRefreshExecutionResult;
      readonly hint: TossSseRefreshHint;
    };

export interface TossRealtimeRefreshHandlersOptions {
  readonly quoteRefresh: TossRealtimeQuoteRefreshHandler;
  readonly refreshExecutor: TossSseRefreshExecutor;
  readonly resultStore: TossSseRefreshResultStore;
  readonly broadcastRefreshResult?: (entry: TossSseRefreshResultEntry) => void;
  readonly onSkipped?: (event: TossRealtimeRefreshSkippedEvent) => void;
}

export function createTossRealtimeRefreshHandlers(
  options: TossRealtimeRefreshHandlersOptions,
): TossRealtimeRefreshHandlers {
  async function onPriceRefresh(event: TossRealtimePriceRefreshEvent): Promise<void> {
    const hint = createTossPriceRefreshAuditHint(event);
    try {
      const result = await options.quoteRefresh.handle({ stockCode: event.stockCode });
      const entry = options.resultStore.record(
        hint,
        mapTossQuoteRefreshAuditResult(result),
      );
      options.broadcastRefreshResult?.(entry);
      if (result !== 'refreshed') {
        options.onSkipped?.({ kind: 'price-refresh', result });
      }
    } catch (err: unknown) {
      const entry = options.resultStore.record(
        hint,
        'failed',
        err instanceof Error ? err.message : 'Toss realtime quote refresh failed',
      );
      options.broadcastRefreshResult?.(entry);
      throw err;
    }
  }

  async function onRefreshHint(hint: TossSseRefreshHint): Promise<void> {
    try {
      const result = await options.refreshExecutor.handle(hint);
      const entry = options.resultStore.record(hint, result);
      options.broadcastRefreshResult?.(entry);
      if (result !== 'refreshed') {
        options.onSkipped?.({ kind: 'refresh-hint', result, hint });
      }
    } catch (err: unknown) {
      const entry = options.resultStore.record(
        hint,
        'failed',
        err instanceof Error ? err.message : 'Toss SSE REST refresh failed',
      );
      options.broadcastRefreshResult?.(entry);
      throw err;
    }
  }

  return {
    onPriceRefresh,
    onRefreshHint,
  };
}
