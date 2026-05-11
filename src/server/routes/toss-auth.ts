import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';

import type { TossLoginService } from '../toss/toss-cdp-login-service.js';
import type { TossSessionStore } from '../toss/toss-session-store.js';

export interface TossAuthRoutesOptions extends FastifyPluginOptions {
  sessionStore: TossSessionStore;
  loginService?: TossLoginService;
}

const loginStartBodySchema = z.object({
  timeoutMs: z.number().int().min(30_000).max(10 * 60_000).optional(),
  headless: z.boolean().optional(),
}).optional();

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

  app.get('/toss/auth/login/status', async (_request, reply) => {
    return reply.send({
      success: true,
      data: opts.loginService?.status() ?? null,
    });
  });

  app.post('/toss/auth/login/start', async (request, reply) => {
    if (opts.loginService === undefined) {
      return reply.code(503).send({
        success: false,
        error: 'toss_login_unavailable',
      });
    }
    const parsed = loginStartBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: 'invalid_toss_login_start_body',
      });
    }
    const startOptions = parsed.data === undefined ? {} : {
      ...(parsed.data.timeoutMs === undefined ? {} : { timeoutMs: parsed.data.timeoutMs }),
      ...(parsed.data.headless === undefined ? {} : { headless: parsed.data.headless }),
    };
    const status = await opts.loginService.start(startOptions);
    return reply.send({ success: true, data: status });
  });

  app.post('/toss/auth/login/cancel', async (_request, reply) => {
    if (opts.loginService === undefined) {
      return reply.code(503).send({
        success: false,
        error: 'toss_login_unavailable',
      });
    }
    return reply.send({
      success: true,
      data: await opts.loginService.cancel(),
    });
  });
}
