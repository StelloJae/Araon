import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';

import {
  createLauncherHeartbeatController,
  type LauncherHeartbeatController,
  type LauncherHeartbeatStatus,
} from '../launcher/launcher-heartbeat.js';

export interface LauncherRoutesOptions extends FastifyPluginOptions {
  enabled?: boolean;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  initialGraceMs?: number;
  onInactive?: () => void | Promise<void>;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
  now?: () => number;
}

export interface LauncherRoutesState {
  controller: LauncherHeartbeatController;
  dispose(): void;
}

const heartbeatBodySchema = z.object({
  tabId: z.string().min(1).max(128),
  closing: z.boolean().optional(),
});

export async function launcherRoutes(
  app: FastifyInstance,
  opts: LauncherRoutesOptions,
): Promise<void> {
  const controller = createLauncherHeartbeatController({
    enabled: opts.enabled === true,
    ...(opts.heartbeatIntervalMs !== undefined ? { heartbeatIntervalMs: opts.heartbeatIntervalMs } : {}),
    ...(opts.heartbeatTimeoutMs !== undefined ? { heartbeatTimeoutMs: opts.heartbeatTimeoutMs } : {}),
    ...(opts.initialGraceMs !== undefined ? { initialGraceMs: opts.initialGraceMs } : {}),
    onInactive: opts.onInactive ?? (() => undefined),
    ...(opts.now !== undefined ? { now: opts.now } : {}),
  });

  const interval = (opts.setInterval ?? setInterval)(() => {
    controller.checkInactive();
  }, opts.heartbeatIntervalMs ?? 5000);

  app.addHook('onClose', async () => {
    (opts.clearInterval ?? clearInterval)(interval);
  });

  app.get('/runtime/launcher/status', async (_request, reply) => {
    return reply.send({ success: true, data: toPayload(controller.status()) });
  });

  app.post('/runtime/launcher/heartbeat', async (request, reply) => {
    const parsed = heartbeatBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_LAUNCHER_HEARTBEAT_BODY' },
      });
    }

    if (parsed.data.closing === true) {
      controller.closeTab(parsed.data.tabId);
    } else {
      controller.heartbeat(parsed.data.tabId);
    }

    return reply.send({ success: true, data: toPayload(controller.status()) });
  });
}

function toPayload(status: LauncherHeartbeatStatus): LauncherHeartbeatStatus {
  return {
    enabled: status.enabled,
    exitWhenBrowserCloses: status.exitWhenBrowserCloses,
    heartbeatIntervalMs: status.heartbeatIntervalMs,
    heartbeatTimeoutMs: status.heartbeatTimeoutMs,
    activeTabCount: status.activeTabCount,
  };
}
