import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

import type { TossSessionStore } from '../toss/toss-session-store.js';

export interface TossAuthRoutesOptions extends FastifyPluginOptions {
  sessionStore: TossSessionStore;
}

export async function tossAuthRoutes(
  app: FastifyInstance,
  opts: TossAuthRoutesOptions,
): Promise<void> {
  app.get('/toss/auth/status', async (_request, reply) => {
    const status = await opts.sessionStore.status();
    return reply.send({ success: true, data: status });
  });

  app.delete('/toss/auth/session', async (_request, reply) => {
    await opts.sessionStore.clear();
    return reply.send({
      success: true,
      data: await opts.sessionStore.status(),
    });
  });
}
