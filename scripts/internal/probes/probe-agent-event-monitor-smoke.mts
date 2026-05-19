/**
 * Agent event monitor smoke.
 *
 * Purpose:
 * - Inspect the running local Araon server's agent event monitor state without
 *   printing raw provider payloads, watched ticker lists, account data, or
 *   secret-like values.
 * - Optionally run a manual monitor tick only when --run-tick is explicitly
 *   provided. A tick can call configured external providers when the monitor is
 *   enabled, so status-only is the default.
 *
 * Usage:
 *   npx tsx scripts/internal/probes/probe-agent-event-monitor-smoke.mts
 *   npx tsx scripts/internal/probes/probe-agent-event-monitor-smoke.mts --run-tick
 *   npx tsx scripts/internal/probes/probe-agent-event-monitor-smoke.mts --base-url=http://127.0.0.1:3000
 */

import type {
  AgentEventMonitorRunResult,
  AgentEventMonitorStatus,
} from '../../../src/server/agent/agent-event-monitor.js';
import { runAgentEventMonitorSmoke } from '../../../src/server/agent/agent-event-monitor-smoke.js';

interface ApiEnvelope<T> {
  readonly success: boolean;
  readonly data?: T;
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:3000';

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

function booleanArg(name: string): boolean {
  if (process.argv.includes(`--${name}`)) return true;
  const raw = argValue(name);
  return raw === 'true' || raw === '1';
}

async function fetchData<T>(url: URL, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error('AGENT_EVENT_MONITOR_PROBE_HTTP_FAILED');
  }
  const envelope = await response.json() as ApiEnvelope<T>;
  if (envelope.success !== true || envelope.data === undefined) {
    throw new Error('AGENT_EVENT_MONITOR_PROBE_ROUTE_FAILED');
  }
  return envelope.data;
}

function endpoint(path: string): URL {
  const base = argValue('base-url') ?? DEFAULT_BASE_URL;
  return new URL(path, base.endsWith('/') ? base : `${base}/`);
}

async function main(): Promise<void> {
  const report = await runAgentEventMonitorSmoke({
    getStatus: () => fetchData<AgentEventMonitorStatus>(
      endpoint('/agent/event-monitor/status'),
    ),
    runTick: () => fetchData<AgentEventMonitorRunResult>(
      endpoint('/agent/event-monitor/tick'),
      { method: 'POST' },
    ),
    runTickEnabled: booleanArg('run-tick'),
  });

  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.outcome === 'ok' ? 0 : 1;
}

main().catch(() => {
  console.error(JSON.stringify({
    provider: 'araon-agent-event-monitor',
    outcome: 'failed',
    errorCode: 'AGENT_EVENT_MONITOR_SMOKE_FAILED',
  }));
  process.exitCode = 1;
});
