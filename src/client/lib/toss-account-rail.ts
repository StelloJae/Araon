import type {
  TossAccountSummaryPayload,
  TossCompletedOrdersPayload,
  TossPendingOrdersPayload,
  TossPortfolioPositionsPayload,
  TossSessionStatusPayload,
  TossTransactionsOverviewPayload,
  TossTransactionsPayload,
  TossWatchlistPayload,
} from './api-client';

export interface TossAccountRailSnapshot {
  sessionReady: boolean;
  summary: TossAccountSummaryPayload | null;
  positions: TossPortfolioPositionsPayload | null;
  pendingOrders: TossPendingOrdersPayload | null;
  completedOrders: TossCompletedOrdersPayload | null;
  transactionsOverview: TossTransactionsOverviewPayload | null;
  transactions: TossTransactionsPayload | null;
  watchlist: TossWatchlistPayload | null;
}

export interface TossAccountRailLoaderDeps {
  getAuthStatus(): Promise<TossSessionStatusPayload>;
  getSummary(): Promise<TossAccountSummaryPayload>;
  getPositions(): Promise<TossPortfolioPositionsPayload>;
  getPendingOrders(): Promise<TossPendingOrdersPayload>;
  getCompletedOrders(): Promise<TossCompletedOrdersPayload>;
  getTransactionsOverview(): Promise<TossTransactionsOverviewPayload>;
  getTransactions(): Promise<TossTransactionsPayload>;
  getWatchlist(): Promise<TossWatchlistPayload>;
}

export async function loadTossAccountRailSnapshot(
  deps: TossAccountRailLoaderDeps,
): Promise<TossAccountRailSnapshot> {
  const auth = await deps.getAuthStatus();
  const sessionReady = isTossAccountSessionReady(auth);
  if (!sessionReady) {
    return {
      sessionReady: false,
      summary: null,
      positions: null,
      pendingOrders: null,
      completedOrders: null,
      transactionsOverview: null,
      transactions: null,
      watchlist: null,
    };
  }

  const summary = await deps.getSummary();
  const [
    positions,
    pendingOrders,
    completedOrders,
    transactionsOverview,
    transactions,
    watchlist,
  ] = await Promise.all([
    optionalSurface(deps.getPositions),
    optionalSurface(deps.getPendingOrders),
    optionalSurface(deps.getCompletedOrders),
    optionalSurface(deps.getTransactionsOverview),
    optionalSurface(deps.getTransactions),
    optionalSurface(deps.getWatchlist),
  ]);
  return {
    sessionReady: true,
    summary,
    positions,
    pendingOrders,
    completedOrders,
    transactionsOverview,
    transactions,
    watchlist,
  };
}

export function isTossAccountSessionReady(
  auth: TossSessionStatusPayload,
): boolean {
  return auth.configured &&
    auth.provider === 'toss' &&
    (
      auth.state === 'persistent' ||
      auth.state === 'expiring' ||
      auth.state === 'session_scoped'
  );
}

async function optionalSurface<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}
