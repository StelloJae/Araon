import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import type { AgentEventAlertDeliveryStore } from '../../agent/agent-event-alert-delivery-store.js';
import { agentEventAlertDeliveryRoutes } from '../agent-event-alert-deliveries.js';

describe('agent event alert delivery routes', () => {
  it('does not echo sensitive delivery snapshot errors', async () => {
    const fakeSessionValue = `session-${'value'}`;
    const fakeRawAccount = `raw-${'account'}`;
    const fakeRawOrder = `raw-${'order'}`;
    const store: AgentEventAlertDeliveryStore = {
      append() {
        throw new Error('not used');
      },
      summarize() {
        throw new Error('not used');
      },
      snapshot() {
        throw new Error(
          [
            'delivery failed near',
            `SESSION${'='}${fakeSessionValue}`,
            `accountNo${'='}${fakeRawAccount}`,
            `orderNo${'='}${fakeRawOrder}`,
          ].join(' '),
        );
      },
    };
    const app = Fastify({ logger: false });
    await app.register(agentEventAlertDeliveryRoutes, { store });

    const res = await app.inject({
      method: 'GET',
      url: '/agent/event-alert-deliveries?limit=5',
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      success: false,
      error: {
        code: 'agent_event_alert_deliveries_snapshot_failed',
        message: 'Agent event alert delivery snapshot failed',
      },
    });
    expect(res.body).not.toContain('SESSION');
    expect(res.body).not.toContain(fakeSessionValue);
    expect(res.body).not.toContain('accountNo');
    expect(res.body).not.toContain(fakeRawAccount);
    expect(res.body).not.toContain('orderNo');
    expect(res.body).not.toContain(fakeRawOrder);
  });

  it('returns alert delivery latency summary for the first_seen target', async () => {
    const store: AgentEventAlertDeliveryStore = {
      append() {
        throw new Error('not used');
      },
      snapshot() {
        return [];
      },
      summarize() {
        return {
          targetFirstSeenToDispatchMs: 30_000,
          totalCount: 3,
          dispatchedCount: 2,
          skippedNoClientCount: 1,
          dispatchedWithinTargetCount: 1,
          dispatchedLateCount: 1,
          lastDispatchLatencyMs: 35_000,
          maxDispatchLatencyMs: 35_000,
        };
      },
    };
    const app = Fastify({ logger: false });
    await app.register(agentEventAlertDeliveryRoutes, { store });

    const res = await app.inject({
      method: 'GET',
      url: '/agent/event-alert-deliveries?limit=5',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        returnedCount: 0,
        summary: {
          targetFirstSeenToDispatchMs: 30_000,
          dispatchedWithinTargetCount: 1,
          dispatchedLateCount: 1,
        },
      },
    });
  });
});
