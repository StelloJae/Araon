import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

import type { AgentEventAlertDeliveryStore } from '../agent/agent-event-alert-delivery-store.js';

export interface AgentEventAlertDeliveryRoutesOptions extends FastifyPluginOptions {
  readonly store: AgentEventAlertDeliveryStore;
}

export async function agentEventAlertDeliveryRoutes(
  app: FastifyInstance,
  opts: AgentEventAlertDeliveryRoutesOptions,
): Promise<void> {
  app.get('/agent/event-alert-deliveries', async (request, reply) => {
    const limit = parseLimit((request.query as { limit?: unknown }).limit);
    try {
      const items = opts.store.snapshot(limit);
      return reply.send({
        success: true,
        data: {
          items,
          returnedCount: items.length,
          summary: opts.store.summarize(),
        },
      });
    } catch {
      return reply.code(500).send({
        success: false,
        error: {
          code: 'agent_event_alert_deliveries_snapshot_failed',
          message: 'Agent event alert delivery snapshot failed',
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
