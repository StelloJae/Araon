import type { TossAccountSummaryClient } from './toss-account-summary-client.js';
import type { TossOrdersClient } from './toss-orders-client.js';
import type { TossPortfolioClient } from './toss-portfolio-client.js';
import type { TossSseRefreshHint } from './toss-sse-refresh-router.js';

export type TossSseRefreshExecutionResult =
  | 'refreshed'
  | 'ignored'
  | 'throttled'
  | 'in_flight';

export interface TossSseRefreshExecutor {
  handle(hint: TossSseRefreshHint): Promise<TossSseRefreshExecutionResult>;
}

export interface TossSseRefreshExecutorOptions {
  readonly ordersClient: Pick<TossOrdersClient, 'listPendingOrders' | 'listCompletedOrders'>;
  readonly accountSummaryClient: Pick<TossAccountSummaryClient, 'getSummary'>;
  readonly portfolioClient: Pick<TossPortfolioClient, 'listPositions'>;
  readonly minRefreshGapMs?: number;
  readonly now?: () => number;
}

const DEFAULT_MIN_REFRESH_GAP_MS = 1_000;

export function createTossSseRefreshExecutor(
  options: TossSseRefreshExecutorOptions,
): TossSseRefreshExecutor {
  const minRefreshGapMs = options.minRefreshGapMs ?? DEFAULT_MIN_REFRESH_GAP_MS;
  const now = options.now ?? (() => Date.now());
  const inFlight = new Set<string>();
  const lastRefreshStartedAt = new Map<string, number>();

  async function handle(hint: TossSseRefreshHint): Promise<TossSseRefreshExecutionResult> {
    const task = taskForHint(hint, options);
    if (task === null) return 'ignored';
    const key = refreshKey(hint);
    if (inFlight.has(key)) return 'in_flight';
    const currentMs = now();
    const previousMs = lastRefreshStartedAt.get(key);
    if (previousMs !== undefined && currentMs - previousMs < minRefreshGapMs) {
      return 'throttled';
    }
    lastRefreshStartedAt.set(key, currentMs);
    inFlight.add(key);
    try {
      await task();
      return 'refreshed';
    } finally {
      inFlight.delete(key);
    }
  }

  return { handle };
}

function taskForHint(
  hint: TossSseRefreshHint,
  options: TossSseRefreshExecutorOptions,
): (() => Promise<unknown>) | null {
  switch (hint.resource) {
    case 'pending-orders':
      return () => options.ordersClient.listPendingOrders();
    case 'completed-orders':
      return () => options.ordersClient.listCompletedOrders();
    case 'account-summary':
      return () => options.accountSummaryClient.getSummary();
    case 'portfolio-positions':
      return () => options.portfolioClient.listPositions();
    case 'quote':
    case 'user-notifications':
    case 'preferences':
    case 'icons':
      return null;
  }
}

function refreshKey(hint: TossSseRefreshHint): string {
  switch (hint.resource) {
    case 'pending-orders':
    case 'completed-orders':
    case 'account-summary':
    case 'portfolio-positions':
      return hint.resource;
    case 'quote':
    case 'user-notifications':
    case 'preferences':
    case 'icons':
      return `${hint.resource}:${hint.ticker ?? '*'}`;
  }
}
