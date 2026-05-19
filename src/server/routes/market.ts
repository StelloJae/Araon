import type { FastifyPluginOptions, FastifyInstance } from 'fastify';
import type {
  MarketTopMoversMarket,
  TossRealtimeRankingMarket,
  TossRealtimeRankingResponse,
} from '@shared/types.js';
import {
  krTickerFromTossProductCode,
  normalizeTossProductCode,
} from '@shared/product-identity.js';
import type { MarketQuoteBatchResult } from '../market/market-data-provider.js';
import type { MarketSummaryService } from '../market/market-summary-service.js';
import type { MarketTopMoversService } from '../market/market-top-movers-service.js';
import type { TossStockSearchItem } from '../toss/toss-public-client.js';

export interface TossRealtimeRankingService {
  getRealtimeRanking(input?: {
    limit?: number;
    market?: TossRealtimeRankingMarket;
  }): Promise<TossRealtimeRankingResponse>;
}

export interface TossQuoteService {
  getQuoteBatch(input: { tickers: readonly string[] }): Promise<MarketQuoteBatchResult>;
}

export interface TossSearchService {
  searchStocks(input: { query: string; limit?: number }): Promise<{
    providerId: 'toss-public';
    fetchedAt: string;
    query: string;
    requestedLimit: number;
    returnedCount: number;
    items: TossStockSearchItem[];
  }>;
}

export interface TossFastQuoteSelectionService {
  setCurrentTickers(tickers: readonly string[]): void;
}

export interface MarketRoutesOptions extends FastifyPluginOptions {
  service: MarketSummaryService;
  topMoversService?: MarketTopMoversService;
  tossRealtimeRankingService?: TossRealtimeRankingService;
  tossQuoteService?: TossQuoteService;
  tossSearchService?: TossSearchService;
  tossFastQuoteSelectionService?: TossFastQuoteSelectionService;
}

export async function marketRoutes(
  app: FastifyInstance,
  opts: MarketRoutesOptions,
): Promise<void> {
  app.get('/market/summary', async (_request, reply) => {
    const data = await opts.service.getSummary();
    return reply.send({ success: true, data });
  });

  app.get('/market/top-movers', async (request, reply) => {
    if (opts.topMoversService === undefined) {
      return reply.status(503).send({
        success: false,
        error: {
          code: 'MARKET_TOP_MOVERS_UNAVAILABLE',
          message: 'TOP100 ranking service is not configured.',
        },
      });
    }
    const query = request.query as { limit?: string; market?: string };
    const input = {
      ...(query.limit === undefined ? {} : { limit: Number(query.limit) }),
      market: parseTopMoversMarket(query.market),
    };
    const data = await opts.topMoversService.getTopMovers(input);
    return reply.send({ success: true, data });
  });

  app.get('/market/toss/realtime-ranking', async (request, reply) => {
    if (opts.tossRealtimeRankingService === undefined) {
      return reply.status(503).send({
        success: false,
        error: {
          code: 'TOSS_REALTIME_RANKING_UNAVAILABLE',
          message: 'Toss realtime ranking service is not configured.',
        },
      });
    }
    const query = request.query as { limit?: string; market?: string };
    const market = parseTossMarket(query.market);
    const data = await opts.tossRealtimeRankingService.getRealtimeRanking({
      ...(query.limit === undefined ? {} : { limit: Number(query.limit) }),
      market,
    });
    return reply.send({ success: true, data });
  });

  app.get('/market/toss/quotes', async (request, reply) => {
    if (opts.tossQuoteService === undefined) {
      return reply.status(503).send({
        success: false,
        error: {
          code: 'TOSS_QUOTES_UNAVAILABLE',
          message: 'Toss quote service is not configured.',
        },
      });
    }
    const query = request.query as { tickers?: string };
    const tickers = parseTickers(query.tickers);
    if (tickers.length === 0) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_TICKERS',
          message: 'At least one 6-digit ticker is required.',
        },
      });
    }
    const data = await opts.tossQuoteService.getQuoteBatch({ tickers });
    return reply.send({ success: true, data });
  });

  app.post('/market/toss/fast-quote/current', async (request, reply) => {
    if (opts.tossFastQuoteSelectionService === undefined) {
      return reply.status(503).send({
        success: false,
        error: {
          code: 'TOSS_FAST_QUOTE_SELECTION_UNAVAILABLE',
          message: 'Toss fast quote selection service is not configured.',
        },
      });
    }
    const tickers = parseCurrentTickers(request.body);
    opts.tossFastQuoteSelectionService.setCurrentTickers(tickers);
    return reply.send({ success: true, data: { tickers } });
  });

  app.get('/market/toss/search', async (request, reply) => {
    if (opts.tossSearchService === undefined) {
      return reply.status(503).send({
        success: false,
        error: {
          code: 'TOSS_SEARCH_UNAVAILABLE',
          message: 'Toss stock search service is not configured.',
        },
      });
    }
    const query = request.query as { q?: string; limit?: string };
    const q = query.q?.trim() ?? '';
    if (q.length === 0) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_SEARCH_QUERY',
          message: 'Search query is required.',
        },
      });
    }
    const data = await opts.tossSearchService.searchStocks({
      query: q,
      ...(query.limit === undefined ? {} : { limit: Number(query.limit) }),
    });
    return reply.send({ success: true, data });
  });
}

function parseTossMarket(value: string | undefined): TossRealtimeRankingMarket {
  if (value === 'all' || value === 'kr' || value === 'us') return value;
  return 'kr';
}

function parseTopMoversMarket(value: string | undefined): MarketTopMoversMarket {
  return value === 'us' ? 'us' : 'kr';
}

function parseTickers(value: string | undefined): string[] {
  if (value === undefined) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value.split(',')) {
    const ticker = raw.trim();
    if (!/^\d{6}$/.test(ticker) || seen.has(ticker)) continue;
    seen.add(ticker);
    out.push(ticker);
  }
  return out.slice(0, 200);
}

function parseCurrentTickers(body: unknown): string[] {
  if (
    typeof body !== 'object' ||
    body === null ||
    !Array.isArray((body as { tickers?: unknown }).tickers)
  ) {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of (body as { tickers: unknown[] }).tickers) {
    if (typeof raw !== 'string') continue;
    const productCode = normalizeTossProductCode(raw);
    if (productCode === null) continue;
    const ticker = krTickerFromTossProductCode(productCode);
    if (ticker === null || seen.has(ticker)) continue;
    seen.add(ticker);
    out.push(ticker);
  }
  return out.slice(0, 60);
}
