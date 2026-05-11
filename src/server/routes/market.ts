import type { FastifyPluginOptions, FastifyInstance } from 'fastify';
import type { TossRealtimeRankingMarket, TossRealtimeRankingResponse } from '@shared/types.js';
import type { MarketSummaryService } from '../market/market-summary-service.js';
import type { MarketTopMoversService } from '../market/market-top-movers-service.js';

export interface TossRealtimeRankingService {
  getRealtimeRanking(input?: {
    limit?: number;
    market?: TossRealtimeRankingMarket;
  }): Promise<TossRealtimeRankingResponse>;
}

export interface MarketRoutesOptions extends FastifyPluginOptions {
  service: MarketSummaryService;
  topMoversService?: MarketTopMoversService;
  tossRealtimeRankingService?: TossRealtimeRankingService;
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
    const query = request.query as { limit?: string };
    const input = query.limit === undefined ? {} : { limit: Number(query.limit) };
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
}

function parseTossMarket(value: string | undefined): TossRealtimeRankingMarket {
  if (value === 'all' || value === 'kr' || value === 'us') return value;
  return 'kr';
}
