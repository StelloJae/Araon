import type { FastifyInstance, FastifyPluginOptions, FastifyReply } from 'fastify';
import { z } from 'zod';

import type { TossLoginService } from '../toss/toss-cdp-login-service.js';
import type { TossSessionExtensionService } from '../toss/toss-session-extension-service.js';
import type { TossSessionStore } from '../toss/toss-session-store.js';

export interface TossAuthRoutesOptions extends FastifyPluginOptions {
  sessionStore: TossSessionStore;
  loginService?: TossLoginService;
  extensionService?: TossSessionExtensionService;
  onLoginSucceeded?: () => Promise<void> | void;
  onSessionCleared?: () => Promise<void> | void;
}

const loginStartBodySchema = z.object({
  timeoutMs: z.number().int().min(30_000).max(10 * 60_000).optional(),
  headless: z.boolean().optional(),
}).optional();

const sessionExtendBodySchema = z.object({
  timeoutMs: z.number().int().min(30_000).max(5 * 60_000).optional(),
}).optional();

export async function tossAuthRoutes(
  app: FastifyInstance,
  opts: TossAuthRoutesOptions,
): Promise<void> {
  let lastLoginSuccessKey: string | null = null;

  async function maybeNotifyLoginSucceeded(status: ReturnType<TossLoginService['status']>): Promise<void> {
    if (status.state !== 'succeeded') return;
    const key = status.finishedAt ?? status.updatedAt ?? 'succeeded';
    if (key === lastLoginSuccessKey) return;
    lastLoginSuccessKey = key;
    await opts.onLoginSucceeded?.();
  }

  app.get('/toss/auth/status', async (_request, reply) => {
    try {
      const status = await opts.sessionStore.status();
      return reply.send({ success: true, data: status });
    } catch {
      return sendTossAuthRouteError(reply);
    }
  });

  app.delete('/toss/auth/session', async (_request, reply) => {
    try {
      await opts.sessionStore.clear();
      await opts.onSessionCleared?.();
      return reply.send({
        success: true,
        data: await opts.sessionStore.status(),
      });
    } catch {
      return sendTossAuthRouteError(reply);
    }
  });

  app.post('/toss/auth/session/extend', async (request, reply) => {
    if (opts.extensionService === undefined) {
      return reply.code(503).send({
        success: false,
        error: 'toss_session_extension_unavailable',
      });
    }
    const parsed = sessionExtendBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: 'invalid_toss_session_extend_body',
      });
    }
    const extendOptions = parsed.data?.timeoutMs === undefined
      ? {}
      : { timeoutMs: parsed.data.timeoutMs };
    try {
      return reply.send({
        success: true,
        data: await opts.extensionService.extend(extendOptions),
      });
    } catch {
      return sendTossAuthRouteError(reply);
    }
  });

  app.get('/toss/auth/login/status', async (_request, reply) => {
    try {
      const status = opts.loginService?.status() ?? null;
      if (status !== null) await maybeNotifyLoginSucceeded(status);
      return reply.send({
        success: true,
        data: status === null ? null : sanitizeLoginStatus(status),
      });
    } catch {
      return sendTossAuthRouteError(reply);
    }
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
    try {
      const status = await opts.loginService.start(startOptions);
      await maybeNotifyLoginSucceeded(status);
      return reply.send({ success: true, data: sanitizeLoginStatus(status) });
    } catch {
      return sendTossAuthRouteError(reply);
    }
  });

  app.post('/toss/auth/login/cancel', async (_request, reply) => {
    if (opts.loginService === undefined) {
      return reply.code(503).send({
        success: false,
        error: 'toss_login_unavailable',
      });
    }
    try {
      const status = await opts.loginService.cancel();
      return reply.send({
        success: true,
        data: sanitizeLoginStatus(status),
      });
    } catch {
      return sendTossAuthRouteError(reply);
    }
  });
}

function sanitizeLoginStatus(
  status: ReturnType<TossLoginService['status']>,
): ReturnType<TossLoginService['status']> {
  return {
    ...status,
    message: sanitizeLoginStatusMessage(status.message),
  };
}

function sanitizeLoginStatusMessage(message: string | null): string | null {
  if (message === null || SAFE_LOGIN_STATUS_MESSAGES.has(message)) return message;
  return 'TOSS_LOGIN_CAPTURE_FAILED';
}

function sendTossAuthRouteError(reply: FastifyReply): FastifyReply {
  return reply.code(502).send({
    success: false,
    error: {
      code: 'TOSS_AUTH_REQUEST_FAILED',
      message: 'Toss auth request failed',
    },
  });
}

const SAFE_LOGIN_STATUS_MESSAGES = new Set([
  'Toss login browser is starting',
  'Toss login capture cancelled',
  'QR login completed; waiting for persistent device confirmation',
  'QR login completed; verifying Toss session',
  'Waiting for Toss QR login',
  'Toss session captured',
  'Toss persistent session captured',
  'Timed out before a persistent Toss session was captured',
  'Timed out before a Toss session was captured',
  'TOSS_LOGIN_CAPTURE_FAILED',
]);
