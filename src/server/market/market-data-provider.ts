import type {
  MarketTopMoverDirection,
  MarketTopMoverItem,
  MarketTopMoversRankingDiagnostic,
  MarketTopMoversSourcePhase,
  Price,
  PriceCandle,
  TossRealtimeRankingMarket,
  TossRealtimeRankingResponse,
} from '@shared/types.js';

export type MarketDataProviderId =
  | 'kis-legacy'
  | 'toss-public'
  | 'toss-authenticated';

export type MarketDataProviderCapability =
  | 'top-movers'
  | 'quote-batch'
  | 'realtime-ranking'
  | 'trade-subscribe'
  | 'daily-candles'
  | 'stock-metadata'
  | 'search';

export interface MarketDataProviderHealth {
  providerId: MarketDataProviderId;
  label: string;
  status: 'ready' | 'degraded' | 'unavailable';
  requiresAuth: boolean;
  authenticated: boolean;
  capabilities: readonly MarketDataProviderCapability[];
  lastErrorCode: string | null;
  lastErrorAt: string | null;
  message: string | null;
}

export interface MarketTopMoversProviderInput {
  direction: MarketTopMoverDirection;
  count: number;
  sourcePhase?: MarketTopMoversSourcePhase;
  onDiagnostic?: (diagnostic: MarketTopMoversRankingDiagnostic) => void;
}

export interface MarketQuoteBatchInput {
  tickers: readonly string[];
}

export interface MarketQuoteBatchResult {
  providerId: MarketDataProviderId;
  fetchedAt: string;
  requestedCount: number;
  returnedCount: number;
  prices: Price[];
  missingTickers: string[];
}

export interface MarketRealtimeRankingInput {
  limit?: number;
  market?: TossRealtimeRankingMarket;
}

export interface MarketDailyCandlesInput {
  ticker: string;
  fromYmd: string;
  toYmd: string;
  now: Date;
}

export interface MarketDataProvider {
  id: MarketDataProviderId;
  label: string;
  requiresAuth: boolean;
  capabilities: readonly MarketDataProviderCapability[];
  getTopMoversRanking?(input: MarketTopMoversProviderInput): Promise<MarketTopMoverItem[]>;
  getQuoteBatch?(input: MarketQuoteBatchInput): Promise<MarketQuoteBatchResult>;
  getRealtimeRanking?(input?: MarketRealtimeRankingInput): Promise<TossRealtimeRankingResponse>;
  getDailyCandles?(input: MarketDailyCandlesInput): Promise<PriceCandle[]>;
  getHealth(): MarketDataProviderHealth;
}
