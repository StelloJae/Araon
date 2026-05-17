import type { TossSessionSummary } from './toss-session-store.js';
import type { TossAccountClient } from './toss-account-client.js';
import type { TossAccountSummaryClient } from './toss-account-summary-client.js';
import type { TossPortfolioClient } from './toss-portfolio-client.js';
import type { TossOrdersClient } from './toss-orders-client.js';
import type { TossTransactionsClient } from './toss-transactions-client.js';
import type { TossWatchlistClient } from './toss-watchlist-client.js';
import type { TossNewsClient } from './toss-news-client.js';

export type TossAuthenticatedReadSmokeSurfaceId =
  | 'account-list'
  | 'account-summary'
  | 'portfolio-positions'
  | 'pending-orders'
  | 'completed-orders'
  | 'transactions-kr'
  | 'transactions-overview-kr'
  | 'transactions-overview-us'
  | 'watchlist'
  | 'toss-asset-news';

export interface TossAuthenticatedReadSmokeClients {
  readonly account: Pick<TossAccountClient, 'listAccounts'>;
  readonly accountSummary: Pick<TossAccountSummaryClient, 'getSummary'>;
  readonly portfolio: Pick<TossPortfolioClient, 'listPositions'>;
  readonly orders: Pick<TossOrdersClient, 'listPendingOrders' | 'listCompletedOrders'>;
  readonly transactions: Pick<TossTransactionsClient, 'listTransactions' | 'getOverview'>;
  readonly watchlist: Pick<TossWatchlistClient, 'listWatchlist'>;
  readonly news?: Pick<TossNewsClient, 'refresh'>;
}

export interface TossAuthenticatedReadSmokeOptions {
  readonly sessionStatus: () => Promise<TossSessionSummary>;
  readonly clients: TossAuthenticatedReadSmokeClients;
  readonly newsProbe?: {
    readonly ticker: string;
    readonly name: string;
  };
  readonly now?: () => Date;
}

export interface TossAuthenticatedReadSmokeSessionSummary {
  readonly configured: boolean;
  readonly state: TossSessionSummary['state'];
  readonly persistent: boolean;
  readonly effectiveExpiresAt: string | null;
  readonly expiresInMs: number | null;
}

export interface TossAuthenticatedReadSmokeSurface {
  readonly id: TossAuthenticatedReadSmokeSurfaceId;
  readonly label: string;
  readonly status: 'ok' | 'failed' | 'skipped';
  readonly counts?: Readonly<Record<string, number>>;
  readonly errorCode?: 'TOSS_SESSION_REQUIRED' | 'TOSS_SMOKE_SURFACE_FAILED';
}

export interface TossAuthenticatedReadSmokeReport {
  readonly provider: 'toss';
  readonly generatedAt: string;
  readonly outcome: 'ok' | 'partial' | 'session_required';
  readonly session: TossAuthenticatedReadSmokeSessionSummary;
  readonly surfaces: readonly TossAuthenticatedReadSmokeSurface[];
}

interface SurfaceSpec {
  readonly id: TossAuthenticatedReadSmokeSurfaceId;
  readonly label: string;
  readonly run: () => Promise<Readonly<Record<string, number>>>;
}

export async function runTossAuthenticatedReadSmoke(
  options: TossAuthenticatedReadSmokeOptions,
): Promise<TossAuthenticatedReadSmokeReport> {
  const now = options.now ?? (() => new Date());
  const session = await options.sessionStatus();
  const generatedAt = now().toISOString();
  const sessionSummary = summarizeSession(session);
  const specs = smokeSurfaceSpecs(options, now);

  if (!session.configured) {
    return {
      provider: 'toss',
      generatedAt,
      outcome: 'session_required',
      session: sessionSummary,
      surfaces: specs.map((spec) => ({
        id: spec.id,
        label: spec.label,
        status: 'skipped',
        errorCode: 'TOSS_SESSION_REQUIRED',
      })),
    };
  }

  const surfaces: TossAuthenticatedReadSmokeSurface[] = [];
  for (const spec of specs) {
    try {
      surfaces.push({
        id: spec.id,
        label: spec.label,
        status: 'ok',
        counts: await spec.run(),
      });
    } catch {
      surfaces.push({
        id: spec.id,
        label: spec.label,
        status: 'failed',
        errorCode: 'TOSS_SMOKE_SURFACE_FAILED',
      });
    }
  }

  return {
    provider: 'toss',
    generatedAt,
    outcome: surfaces.some((surface) => surface.status === 'failed') ? 'partial' : 'ok',
    session: sessionSummary,
    surfaces,
  };
}

function smokeSurfaceSpecs(
  options: TossAuthenticatedReadSmokeOptions,
  now: () => Date,
): SurfaceSpec[] {
  const { clients } = options;
  return [
    {
      id: 'account-list',
      label: 'Toss account list',
      run: async () => {
        const payload = await clients.account.listAccounts();
        return { accounts: payload.accounts.length };
      },
    },
    {
      id: 'account-summary',
      label: 'Toss account summary',
      run: async () => {
        const payload = await clients.accountSummary.getSummary();
        return {
          markets: Object.keys(payload.markets).length,
          withdrawableKr: payload.withdrawable.kr.length,
          withdrawableUs: payload.withdrawable.us.length,
        };
      },
    },
    {
      id: 'portfolio-positions',
      label: 'Toss portfolio positions',
      run: async () => {
        const payload = await clients.portfolio.listPositions();
        return { positions: payload.positions.length };
      },
    },
    {
      id: 'pending-orders',
      label: 'Toss pending orders',
      run: async () => {
        const payload = await clients.orders.listPendingOrders();
        return { orders: payload.orders.length };
      },
    },
    {
      id: 'completed-orders',
      label: 'Toss completed orders',
      run: async () => {
        const payload = await clients.orders.listCompletedOrders({ market: 'all' });
        return { orders: payload.orders.length };
      },
    },
    {
      id: 'transactions-kr',
      label: 'Toss KR transactions',
      run: async () => {
        const payload = await clients.transactions.listTransactions({ market: 'kr' });
        return { items: payload.items.length };
      },
    },
    {
      id: 'transactions-overview-kr',
      label: 'Toss KR transaction overview',
      run: async () => {
        const payload = await clients.transactions.getOverview('kr');
        return {
          withdrawable: payload.withdrawable.length,
          deposit: payload.deposit.length,
        };
      },
    },
    {
      id: 'transactions-overview-us',
      label: 'Toss US transaction overview',
      run: async () => {
        const payload = await clients.transactions.getOverview('us');
        return {
          withdrawable: payload.withdrawable.length,
          deposit: payload.deposit.length,
        };
      },
    },
    {
      id: 'watchlist',
      label: 'Toss watchlist',
      run: async () => {
        const payload = await clients.watchlist.listWatchlist();
        return {
          groups: payload.groups.length,
          items: payload.items.length,
        };
      },
    },
    {
      id: 'toss-asset-news',
      label: 'Toss asset news',
      run: async () => {
        if (clients.news === undefined) return { items: 0 };
        const probe = options.newsProbe ?? { ticker: '005930', name: '삼성전자' };
        const items = await clients.news.refresh({
          ticker: probe.ticker,
          name: probe.name,
          now: now(),
        });
        return { items: items.length };
      },
    },
  ];
}

function summarizeSession(
  session: TossSessionSummary,
): TossAuthenticatedReadSmokeSessionSummary {
  return {
    configured: session.configured,
    state: session.state,
    persistent: session.persistent,
    effectiveExpiresAt: session.effectiveExpiresAt,
    expiresInMs: session.expiresInMs,
  };
}
