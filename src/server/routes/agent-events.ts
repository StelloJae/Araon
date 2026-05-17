import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

import type { AgentEventQueue } from '../agent/agent-event-queue.js';
import { agentEventToPublicPayload } from '../agent/agent-event-public-payload.js';

export interface AgentEventsRoutesOptions extends FastifyPluginOptions {
  readonly queue: AgentEventQueue;
}

export async function agentEventsRoutes(
  app: FastifyInstance,
  opts: AgentEventsRoutesOptions,
): Promise<void> {
  app.get('/agent/events', async (request, reply) => {
    const limit = parseLimit((request.query as { limit?: unknown }).limit);
    try {
      const items = opts.queue.snapshot(limit).map((event) => agentEventToPublicPayload(event));
      return reply.send({
        success: true,
        data: {
          items,
          returnedCount: items.length,
        },
      });
    } catch {
      return reply.code(500).send({
        success: false,
        error: {
          code: 'agent_events_snapshot_failed',
          message: 'Agent event snapshot failed',
        },
      });
    }
  });
}

function parseLimit(value: unknown): number {
  if (typeof value !== 'string') return 50;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 50;
  if (parsed < 1) return 1;
  if (parsed > 200) return 200;
  return parsed;
}
