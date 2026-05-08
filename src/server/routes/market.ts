import type { FastifyPluginOptions, FastifyInstance } from 'fastify';
import type { MarketSummaryService } from '../market/market-summary-service.js';

export interface MarketRoutesOptions extends FastifyPluginOptions {
  service: MarketSummaryService;
}

export async function marketRoutes(
  app: FastifyInstance,
  opts: MarketRoutesOptions,
): Promise<void> {
  app.get('/market/summary', async (_request, reply) => {
    const data = await opts.service.getSummary();
    return reply.send({ success: true, data });
  });
}
