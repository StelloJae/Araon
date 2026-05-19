import { describe, expect, it, vi } from 'vitest';

import {
  runAgentEventAlertDeliverySmoke,
  type AgentEventAlertDeliverySnapshot,
} from '../agent-event-alert-delivery-smoke.js';

describe('agent event alert delivery smoke', () => {
  it('reports first_seen alert delivery latency without echoing event payload details', async () => {
    const wait = vi.fn(async () => undefined);
    const getDeliveries = vi.fn<() => Promise<AgentEventAlertDeliverySnapshot>>()
      .mockResolvedValueOnce({
        returnedCount: 0,
        items: [],
        summary: summary({ totalCount: 0, lastDispatchLatencyMs: null }),
      })
      .mockResolvedValueOnce({
        returnedCount: 1,
        items: [
          {
            status: 'skipped_no_client',
            clientCount: 0,
            dispatchLatencyMs: 10_502,
          },
        ],
        summary: summary({
          totalCount: 1,
          skippedNoClientCount: 1,
          lastDispatchLatencyMs: 10_502,
          maxDispatchLatencyMs: 10_502,
        }),
      });

    const report = await runAgentEventAlertDeliverySmoke({
      addTrackedStock: async () => undefined,
      createLocalSignal: async () => undefined,
      getAgentEvents: async () => ({ returnedCount: 1 }),
      getDeliveries,
      wait,
      waitMs: 10_500,
      now: () => new Date('2026-05-12T03:00:00.000Z'),
    });

    expect(wait).toHaveBeenCalledWith(10_500);
    expect(report).toMatchObject({
      provider: 'araon-agent-event-alert-delivery',
      generatedAt: '2026-05-12T03:00:00.000Z',
      outcome: 'ok',
      errorCode: null,
      externalCallsEnabled: false,
      setup: {
        stockRegistered: true,
        localSignalCreated: true,
        agentEventCount: 1,
      },
      early: {
        returnedCount: 0,
      },
      final: {
        returnedCount: 1,
        status: 'skipped_no_client',
        clientCount: 0,
        dispatchLatencyMs: 10_502,
        withinTarget: true,
        targetFirstSeenToDispatchMs: 30_000,
      },
    });
    expect(JSON.stringify(report)).not.toContain('005930');
    expect(JSON.stringify(report)).not.toContain('signalPrice');
    expect(JSON.stringify(report)).not.toContain('SESSION');
  });

  it('returns sanitized failure state when the local delivery path cannot be proven', async () => {
    const report = await runAgentEventAlertDeliverySmoke({
      addTrackedStock: async () => undefined,
      createLocalSignal: async () => {
        throw new Error('raw SESSION=secret accountNo=1234 signalPrice=900000');
      },
      getAgentEvents: async () => ({ returnedCount: 0 }),
      getDeliveries: async () => ({
        returnedCount: 0,
        items: [],
        summary: summary({ totalCount: 0, lastDispatchLatencyMs: null }),
      }),
      wait: async () => undefined,
      now: () => new Date('2026-05-12T03:00:00.000Z'),
    });

    expect(report).toMatchObject({
      provider: 'araon-agent-event-alert-delivery',
      outcome: 'failed',
      errorCode: 'AGENT_EVENT_ALERT_DELIVERY_SMOKE_FAILED',
    });
    expect(JSON.stringify(report)).not.toContain('secret');
    expect(JSON.stringify(report)).not.toContain('accountNo');
    expect(JSON.stringify(report)).not.toContain('signalPrice');
  });
});

function summary(
  overrides: Partial<AgentEventAlertDeliverySnapshot['summary']>,
): AgentEventAlertDeliverySnapshot['summary'] {
  return {
    targetFirstSeenToDispatchMs: 30_000,
    totalCount: 0,
    dispatchedCount: 0,
    skippedNoClientCount: 0,
    dispatchedWithinTargetCount: 0,
    dispatchedLateCount: 0,
    lastDispatchLatencyMs: null,
    maxDispatchLatencyMs: null,
    ...overrides,
  };
}
