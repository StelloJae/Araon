import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

import type { TossRealtimeService } from '../toss/toss-realtime-service.js';

export interface TossRealtimeRoutesOptions extends FastifyPluginOptions {
  realtimeService: TossRealtimeService;
}

export async function tossRealtimeRoutes(
  app: FastifyInstance,
  opts: TossRealtimeRoutesOptions,
): Promise<void> {
  app.get('/toss/realtime/status', async (_request, reply) => {
    return reply.send({
      success: true,
      data: opts.realtimeService.status(),
    });
  });

  app.post('/toss/realtime/start', async (_request, reply) => {
    return reply.send({
      success: true,
      data: await opts.realtimeService.start(),
    });
  });

  app.post('/toss/realtime/stop', async (_request, reply) => {
    return reply.send({
      success: true,
      data: await opts.realtimeService.stop(),
    });
  });
}
