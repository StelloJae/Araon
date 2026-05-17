import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';

import type { AraonWatchlistService } from '../watchlist/araon-watchlist-service.js';

export interface WatchlistRoutesOptions extends FastifyPluginOptions {
  service: AraonWatchlistService;
}

const watchlistMutationBodySchema = z.object({
  productCode: z.string().min(1),
  krTicker: z.string().regex(/^\d{6}$/).nullable().optional(),
  symbol: z.string().min(1).nullable().optional(),
  name: z.string().min(1).nullable().optional(),
  market: z.enum(['KOSPI', 'KOSDAQ', 'US', 'TOSS_ONLY', 'UNKNOWN']).nullable().optional(),
  currency: z.enum(['KRW', 'USD', 'UNKNOWN']).nullable().optional(),
});

export async function watchlistRoutes(
  app: FastifyInstance,
  opts: WatchlistRoutesOptions,
): Promise<void> {
  app.get('/watchlist', async (_request, reply) => {
    try {
      return reply.send({
        success: true,
        data: await opts.service.getWatchlist(),
      });
    } catch {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'WATCHLIST_READ_FAILED',
          message: 'Watchlist read failed',
        },
      });
    }
  });

  app.post('/watchlist/items', async (request, reply) => {
    const parsed = watchlistMutationBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'WATCHLIST_PRODUCT_INVALID',
          message: 'Watchlist product is invalid',
        },
      });
    }

    try {
      const result = await opts.service.addItem(parsed.data);
      const status = result.action === 'unsupported' ? 202 : 200;
      return reply.status(status).send({ success: true, data: result });
    } catch {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'WATCHLIST_ADD_FAILED',
          message: 'Watchlist add failed',
        },
      });
    }
  });

  app.delete('/watchlist/items/:productCode', async (request, reply) => {
    const params = request.params as { productCode?: string };
    const productCode = params.productCode;
    if (typeof productCode !== 'string' || productCode.trim().length === 0) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'WATCHLIST_PRODUCT_INVALID',
          message: 'Watchlist product is invalid',
        },
      });
    }

    try {
      const result = await opts.service.removeItem({ productCode });
      const status = result.action === 'unsupported' ? 202 : 200;
      return reply.status(status).send({ success: true, data: result });
    } catch {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'WATCHLIST_REMOVE_FAILED',
          message: 'Watchlist remove failed',
        },
      });
    }
  });
}
