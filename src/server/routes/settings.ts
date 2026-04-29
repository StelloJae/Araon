/**
 * Fastify plugin for runtime settings endpoints.
 *
 * Routes:
 *   GET /settings  – current in-memory snapshot
 *   PUT /settings  – validate, persist, notify subscribers
 *
 * Validation enforces a 100 ms floor on `pollingCycleDelayMs` to keep the
 * polling loop from starving the event loop. `rateLimiterMode` is a string
 * literal union so zod rejects anything else.
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';

import { settingsSchema, type SettingsStore, type Settings } from '../settings-store.js';
import { createChildLogger } from '@shared/logger.js';

const log = createChildLogger('routes/settings');

// Reuse the store's schema so route + store stay in lockstep.
const putBodySchema = settingsSchema;

type PutBody = z.infer<typeof putBodySchema>;

export interface SettingsRoutesOptions extends FastifyPluginOptions {
  settingsStore: SettingsStore;
}

export async function settingsRoutes(
  app: FastifyInstance,
  opts: SettingsRoutesOptions,
): Promise<void> {
  const { settingsStore } = opts;

  app.get('/settings', async (_request, reply) => {
    const data: Settings = settingsStore.snapshot();
    return reply.send({ success: true, data });
  });

  app.put<{ Body: PutBody }>('/settings', async (request, reply) => {
    const parsed = putBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: parsed.error.issues });
    }
    await settingsStore.save(parsed.data);
    log.info({ settings: parsed.data }, 'settings updated via PUT /settings');
    return reply.send({ success: true, data: parsed.data });
  });
}
