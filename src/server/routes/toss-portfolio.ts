import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

import type { TossPortfolioClient } from '../toss/toss-portfolio-client.js';
import { sendTossReadRouteError } from './toss-read-route-error.js';

export interface TossPortfolioRoutesOptions extends FastifyPluginOptions {
  readonly portfolioClient: TossPortfolioClient;
}

export async function tossPortfolioRoutes(
  app: FastifyInstance,
  opts: TossPortfolioRoutesOptions,
): Promise<void> {
  app.get('/toss/portfolio/positions', async (_request, reply) => {
    try {
      return reply.send({
        success: true,
        data: await opts.portfolioClient.listPositions(),
      });
    } catch (err: unknown) {
      return sendTossReadRouteError(err, reply);
    }
  });
}
