/**
 * Agent event alert delivery smoke.
 *
 * Purpose:
 * - Start an isolated local Araon server with a temporary data directory.
 * - Create one local signal-derived agent event without external provider calls.
 * - Verify that alert delivery is not emitted immediately, then appears after
 *   the 10s first_seen delay and is summarized against the 30s target.
 * - Print only count/status/latency fields. It does not print raw event payloads,
 *   tickers, prices, account data, provider payloads, cookies, or secrets.
 *
 * Usage:
 *   npx tsx scripts/internal/probes/probe-agent-event-alert-delivery-smoke.mts
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  type AgentEventAlertDeliverySnapshot,
  runAgentEventAlertDeliverySmoke,
} from '../../../src/server/agent/agent-event-alert-delivery-smoke.js';
import type { AraonServer } from '../../../src/server/app.js';

interface ApiEnvelope<T> {
  readonly success: boolean;
  readonly data?: T;
}

const SIGNAL_PAYLOAD = {
  name: '로컬 알림 스모크',
  signalType: 'overheat',
  source: 'realtime-momentum',
  signalPrice: 900000,
  signalAt: '2026-05-12T03:00:00.000Z',
  baselinePrice: 861400,
  baselineAt: '2026-05-12T03:00:00.000Z',
  momentumPct: 4.48,
  momentumWindow: '30s',
  dailyChangePct: 1.2,
  volume: 1200,
  volumeSurgeRatio: 2.5,
  volumeBaselineStatus: 'ready',
};

async function main(): Promise<void> {
  const previousLogLevel = process.env['LOG_LEVEL'];
  process.env['LOG_LEVEL'] = 'silent';
  const [
    { createAraonServer },
    { closeDb },
    { clearConfiguredDataDirForTests },
  ] = await Promise.all([
    import('../../../src/server/app.js'),
    import('../../../src/server/db/database.js'),
    import('../../../src/server/runtime-paths.js'),
  ]);

  const dataDir = await mkdtemp(join(tmpdir(), 'araon-agent-alert-smoke-'));
  let server: AraonServer | null = null;
  const originalFetch = globalThis.fetch;
  let unexpectedExternalFetchCount = 0;

  globalThis.fetch = (async () => {
    unexpectedExternalFetchCount += 1;
    throw new Error('AGENT_EVENT_ALERT_DELIVERY_SMOKE_EXTERNAL_FETCH_BLOCKED');
  }) as typeof globalThis.fetch;

  try {
    server = await createAraonServer({ dataDir });
    const report = await runAgentEventAlertDeliverySmoke({
      addTrackedStock: async () => {
        const res = await server?.app.inject({
          method: 'POST',
          url: '/stocks',
          payload: {
            ticker: '005930',
            name: '삼성전자',
            market: 'KOSPI',
          },
        });
        if (res?.statusCode !== 201) {
          throw new Error('AGENT_EVENT_ALERT_DELIVERY_SMOKE_STOCK_SETUP_FAILED');
        }
      },
      createLocalSignal: async () => {
        const res = await server?.app.inject({
          method: 'POST',
          url: '/stocks/005930/signals',
          payload: SIGNAL_PAYLOAD,
        });
        if (res?.statusCode !== 201) {
          throw new Error('AGENT_EVENT_ALERT_DELIVERY_SMOKE_SIGNAL_SETUP_FAILED');
        }
      },
      getAgentEvents: async () => {
        const res = await server?.app.inject({
          method: 'GET',
          url: '/agent/events?limit=5',
        });
        return fetchData<{ readonly returnedCount: number }>(
          res,
          'AGENT_EVENT_ALERT_DELIVERY_SMOKE_EVENTS_FAILED',
        );
      },
      getDeliveries: async () => {
        const res = await server?.app.inject({
          method: 'GET',
          url: '/agent/event-alert-deliveries?limit=5',
        });
        return fetchData<AgentEventAlertDeliverySnapshot>(
          res,
          'AGENT_EVENT_ALERT_DELIVERY_SMOKE_DELIVERIES_FAILED',
        );
      },
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });

    console.log(JSON.stringify({
      ...report,
      isolatedTempData: true,
      unexpectedExternalFetchCount,
    }, null, 2));
    process.exitCode = report.outcome === 'ok' && unexpectedExternalFetchCount === 0 ? 0 : 1;
  } finally {
    globalThis.fetch = originalFetch;
    if (server !== null) {
      await server.close();
    } else {
      closeDb();
    }
    clearConfiguredDataDirForTests();
    await rm(dataDir, { recursive: true, force: true });
    if (previousLogLevel === undefined) {
      delete process.env['LOG_LEVEL'];
    } else {
      process.env['LOG_LEVEL'] = previousLogLevel;
    }
  }
}

function fetchData<T>(
  response: { readonly statusCode: number; json(): unknown } | undefined,
  errorCode: string,
): T {
  if (response === undefined || response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(errorCode);
  }
  const envelope = response.json() as ApiEnvelope<T>;
  if (envelope.success !== true || envelope.data === undefined) {
    throw new Error(errorCode);
  }
  return envelope.data;
}

main().catch(() => {
  console.error(JSON.stringify({
    provider: 'araon-agent-event-alert-delivery',
    outcome: 'failed',
    errorCode: 'AGENT_EVENT_ALERT_DELIVERY_SMOKE_FAILED',
    externalCallsEnabled: false,
  }));
  process.exitCode = 1;
});
