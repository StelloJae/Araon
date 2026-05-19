import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

import type { TossWatchlistClient } from '../toss/toss-watchlist-client.js';
import { sendTossReadRouteError } from './toss-read-route-error.js';

export interface TossWatchlistRoutesOptions extends FastifyPluginOptions {
  readonly watchlistClient: TossWatchlistClient;
}

export async function tossWatchlistRoutes(
  app: FastifyInstance,
  opts: TossWatchlistRoutesOptions,
): Promise<void> {
  app.get('/toss/watchlist', async (_request, reply) => {
    try {
      return reply.send({
        success: true,
        data: await opts.watchlistClient.listWatchlist(),
      });
    } catch (err: unknown) {
      return sendTossReadRouteError(err, reply);
    }
  });
}
