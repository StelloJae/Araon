import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

import type { TossAccountSummaryClient } from '../toss/toss-account-summary-client.js';
import { sendTossReadRouteError } from './toss-read-route-error.js';

export interface TossAccountSummaryRoutesOptions extends FastifyPluginOptions {
  readonly summaryClient: TossAccountSummaryClient;
}

export async function tossAccountSummaryRoutes(
  app: FastifyInstance,
  opts: TossAccountSummaryRoutesOptions,
): Promise<void> {
  app.get('/toss/account/summary', async (_request, reply) => {
    try {
      return reply.send({
        success: true,
        data: await opts.summaryClient.getSummary(),
      });
    } catch (err: unknown) {
      return sendTossReadRouteError(err, reply);
    }
  });
}
