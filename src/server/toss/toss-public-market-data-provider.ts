import type {
  MarketDataProvider,
  MarketDataProviderHealth,
  MarketQuoteBatchInput,
  MarketQuoteBatchResult,
  MarketRealtimeRankingInput,
  MarketTopMoversProviderInput,
} from '../market/market-data-provider.js';
import {
  fetchTossOverviewRanking,
  type TossOverviewRankingMarket,
} from './toss-overview-ranking-client.js';
import {
  fetchTossQuoteBatch,
  fetchTossRealtimeRanking,
  normalizeTossProductCode,
  tickerFromTossProductCode,
} from './toss-public-client.js';

export interface CreateTossPublicMarketDataProviderOptions {
  fetchFn?: typeof fetch;
  certBaseUrl?: string;
  infoBaseUrl?: string;
  market?: TossOverviewRankingMarket;
  now?: () => Date;
}

export interface TossPublicMarketDataProvider extends MarketDataProvider {
  id: 'toss-public';
  requiresAuth: false;
  getTopMoversRanking(input: MarketTopMoversProviderInput): ReturnType<typeof fetchTossOverviewRanking>;
  getQuoteBatch(input: MarketQuoteBatchInput): Promise<MarketQuoteBatchResult>;
  getRealtimeRanking(input?: MarketRealtimeRankingInput): ReturnType<typeof fetchTossRealtimeRanking>;
}

const CAPABILITIES = [
  'top-movers',
  'quote-batch',
  'realtime-ranking',
] as const;

export function createTossPublicMarketDataProvider({
  fetchFn = fetch,
  certBaseUrl,
  infoBaseUrl,
  market = 'kr',
  now = () => new Date(),
}: CreateTossPublicMarketDataProviderOptions = {}): TossPublicMarketDataProvider {
  let lastErrorCode: string | null = null;
  let lastErrorAt: string | null = null;

  function recordSuccess(): void {
    lastErrorCode = null;
    lastErrorAt = null;
  }

  function recordFailure(code: string): void {
    lastErrorCode = code;
    lastErrorAt = now().toISOString();
  }

  async function run<T>(errorCode: string, task: () => Promise<T>): Promise<T> {
    try {
      const value = await task();
      recordSuccess();
      return value;
    } catch (err) {
      recordFailure(errorCode);
      throw err;
    }
  }

  return {
    id: 'toss-public',
    label: 'Toss public web',
    requiresAuth: false,
    capabilities: CAPABILITIES,
    getTopMoversRanking(input) {
      return run('TOSS_TOP_MOVERS_FAILED', () => fetchTossOverviewRanking({
        direction: input.direction,
        count: input.count,
        market,
        ...(input.sourcePhase !== undefined ? { sourcePhase: input.sourcePhase } : {}),
        fetchFn,
        ...(certBaseUrl !== undefined ? { certBaseUrl } : {}),
        ...(input.onDiagnostic !== undefined ? { onDiagnostic: input.onDiagnostic } : {}),
      }));
    },
    async getQuoteBatch(input) {
      const requestedTickers = normalizeRequestedTickers(input.tickers);
      const prices = await run('TOSS_QUOTE_BATCH_FAILED', () => fetchTossQuoteBatch({
        tickers: requestedTickers,
        now,
        fetchFn,
        ...(infoBaseUrl !== undefined ? { infoBaseUrl } : {}),
      }));
      const returned = new Set(prices.map((price) => price.ticker));
      return {
        providerId: 'toss-public',
        fetchedAt: now().toISOString(),
        requestedCount: requestedTickers.length,
        returnedCount: prices.length,
        prices,
        missingTickers: requestedTickers.filter((ticker) => !returned.has(ticker)),
      };
    },
    getRealtimeRanking(input = {}) {
      return run('TOSS_REALTIME_RANKING_FAILED', () => fetchTossRealtimeRanking({
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.market !== undefined ? { market: input.market } : {}),
        now,
        fetchFn,
        ...(infoBaseUrl !== undefined ? { infoBaseUrl } : {}),
      }));
    },
    getHealth(): MarketDataProviderHealth {
      return {
        providerId: 'toss-public',
        label: 'Toss public web',
        status: lastErrorCode === null ? 'ready' : 'degraded',
        requiresAuth: false,
        authenticated: true,
        capabilities: CAPABILITIES,
        lastErrorCode,
        lastErrorAt,
        message: lastErrorCode === null
          ? '토스 공개 웹 데이터 provider가 준비되었습니다.'
          : '최근 토스 공개 웹 데이터 호출이 실패했습니다.',
      };
    },
  };
}

function normalizeRequestedTickers(tickers: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tickers) {
    const productCode = normalizeTossProductCode(raw);
    if (productCode === null) continue;
    const ticker = tickerFromTossProductCode(productCode);
    if (ticker === null || seen.has(ticker)) continue;
    seen.add(ticker);
    out.push(ticker);
  }
  return out;
}
