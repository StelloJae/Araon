import type { FastifyInstance, FastifyPluginOptions, FastifyReply } from 'fastify';
import { z } from 'zod';

import type { TossRealtimeService } from '../toss/toss-realtime-service.js';
import type { TossSseRefreshResultStore } from '../toss/toss-sse-refresh-result-store.js';

export interface TossRealtimeRoutesOptions extends FastifyPluginOptions {
  realtimeService: TossRealtimeService;
  refreshResultStore?: TossSseRefreshResultStore;
}

export async function tossRealtimeRoutes(
  app: FastifyInstance,
  opts: TossRealtimeRoutesOptions,
): Promise<void> {
  app.get('/toss/realtime/status', async (_request, reply) => {
    try {
      return reply.send({
        success: true,
        data: opts.realtimeService.status(),
      });
    } catch {
      return sendTossRealtimeRouteError(reply);
    }
  });

  app.get('/toss/realtime/refresh-results', async (request, reply) => {
    const parsed = refreshResultsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TOSS_REFRESH_RESULTS_QUERY' },
      });
    }
    try {
      const data = opts.refreshResultStore?.snapshot(parsed.data.limit) ?? {
        items: [],
        returnedCount: 0,
      };
      return reply.send({
        success: true,
        data,
      });
    } catch {
      return sendTossRealtimeRouteError(reply);
    }
  });

  app.post('/toss/realtime/start', async (_request, reply) => {
    try {
      return reply.send({
        success: true,
        data: await opts.realtimeService.start(),
      });
    } catch {
      return sendTossRealtimeRouteError(reply);
    }
  });

  app.post('/toss/realtime/stop', async (_request, reply) => {
    try {
      return reply.send({
        success: true,
        data: await opts.realtimeService.stop(),
      });
    } catch {
      return sendTossRealtimeRouteError(reply);
    }
  });
}

function sendTossRealtimeRouteError(reply: FastifyReply): FastifyReply {
  return reply.code(502).send({
    success: false,
    error: {
      code: 'TOSS_REALTIME_REQUEST_FAILED',
      message: 'Toss realtime request failed',
    },
  });
}

const refreshResultsQuerySchema = z.object({
  limit: z.string().transform((value, ctx) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'expected integer between 1 and 100',
      });
      return z.NEVER;
    }
    return parsed;
  }).optional(),
});
