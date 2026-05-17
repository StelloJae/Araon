import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

import type { TossAccountClient } from '../toss/toss-account-client.js';
import { sendTossReadRouteError } from './toss-read-route-error.js';

export interface TossAccountRoutesOptions extends FastifyPluginOptions {
  readonly accountClient: TossAccountClient;
}

export async function tossAccountRoutes(
  app: FastifyInstance,
  opts: TossAccountRoutesOptions,
): Promise<void> {
  app.get('/toss/account/list', async (_request, reply) => {
    try {
      return reply.send({
        success: true,
        data: await opts.accountClient.listAccounts(),
      });
    } catch (err: unknown) {
      return sendTossReadRouteError(err, reply);
    }
  });
}
