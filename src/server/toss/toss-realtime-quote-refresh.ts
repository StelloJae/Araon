import type { Price, Stock } from '@shared/types.js';

import type { MarketQuoteBatchResult } from '../market/market-data-provider.js';

export type TossRealtimeQuoteRefreshResult =
  | 'refreshed'
  | 'ignored'
  | 'untracked'
  | 'missing'
  | 'throttled'
  | 'in_flight';

export interface TossRealtimeQuoteRefreshEvent {
  readonly stockCode: string | null;
}

export interface TossRealtimeQuoteRefreshHandler {
  handle(event: TossRealtimeQuoteRefreshEvent): Promise<TossRealtimeQuoteRefreshResult>;
}

export interface TossRealtimeQuoteRefreshProvider {
  getQuoteBatch(input: { tickers: readonly string[] }): Promise<MarketQuoteBatchResult>;
}

export interface TossRealtimeQuoteRefreshStockRepo {
  findByTicker(ticker: string): Stock | null;
}

export interface TossRealtimeQuoteRefreshPriceStore {
  setPrice(price: Price): void;
}

export interface TossRealtimeQuoteRefreshHandlerOptions {
  provider: TossRealtimeQuoteRefreshProvider;
  stockRepo: TossRealtimeQuoteRefreshStockRepo;
  priceStore: TossRealtimeQuoteRefreshPriceStore;
  minRefreshGapMs?: number;
  now?: () => number;
}

const DEFAULT_MIN_REFRESH_GAP_MS = 1_000;

export function createTossRealtimeQuoteRefreshHandler(
  options: TossRealtimeQuoteRefreshHandlerOptions,
): TossRealtimeQuoteRefreshHandler {
  const minRefreshGapMs = options.minRefreshGapMs ?? DEFAULT_MIN_REFRESH_GAP_MS;
  const now = options.now ?? (() => Date.now());
  const lastRefreshStartedAt = new Map<string, number>();
  const inFlight = new Set<string>();

  async function handle(event: TossRealtimeQuoteRefreshEvent): Promise<TossRealtimeQuoteRefreshResult> {
    const ticker = normalizeTossRealtimeStockCode(event.stockCode);
    if (ticker === null) return 'ignored';
    if (options.stockRepo.findByTicker(ticker) === null) return 'untracked';
    if (inFlight.has(ticker)) return 'in_flight';

    const currentMs = now();
    const previousMs = lastRefreshStartedAt.get(ticker);
    if (previousMs !== undefined && currentMs - previousMs < minRefreshGapMs) {
      return 'throttled';
    }

    lastRefreshStartedAt.set(ticker, currentMs);
    inFlight.add(ticker);
    try {
      const result = await options.provider.getQuoteBatch({ tickers: [ticker] });
      const price = result.prices.find((item) => item.ticker === ticker);
      if (price === undefined || !isUsablePrice(price)) return 'missing';
      options.priceStore.setPrice(price);
      return 'refreshed';
    } finally {
      inFlight.delete(ticker);
    }
  }

  return { handle };
}

export function normalizeTossRealtimeStockCode(stockCode: string | null): string | null {
  if (stockCode === null) return null;
  const trimmed = stockCode.trim().toUpperCase();
  const ticker = trimmed.startsWith('A') ? trimmed.slice(1) : trimmed;
  return /^\d{6}$/.test(ticker) ? ticker : null;
}

function isUsablePrice(price: Price): boolean {
  return Number.isFinite(price.price) && price.price > 0;
}
