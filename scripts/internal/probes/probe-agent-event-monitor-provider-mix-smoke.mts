/**
 * Agent event monitor provider-mix smoke.
 *
 * Purpose:
 * - Start an isolated local Araon server with a temporary data directory.
 * - Optionally copy the already-encrypted local Toss session file into that
 *   temporary directory so session-gated read providers can be exercised
 *   without printing cookies, storage, account data, or raw session material.
 * - Enable the agent event monitor, add one tracked stock, run one manual tick,
 *   and print only sanitized count/status/provider observation metadata.
 *
 * Usage:
 *   npx tsx scripts/internal/probes/probe-agent-event-monitor-provider-mix-smoke.mts
 *   npx tsx scripts/internal/probes/probe-agent-event-monitor-provider-mix-smoke.mts \
 *     --copy-current-toss-session \
 *     --toss-signal-template-file=/tmp/araon-toss-intelligences-template.json \
 *     --toss-signal-endpoint-path=/api/v1/dashboard/intelligences/all
 */

import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { runAgentEventMonitorSmoke } from '../../../src/server/agent/agent-event-monitor-smoke.js';
import type {
  AgentEventMonitorRunResult,
  AgentEventMonitorStatus,
} from '../../../src/server/agent/agent-event-monitor.js';
import type { AraonServer } from '../../../src/server/app.js';

interface ApiEnvelope<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: {
    readonly code?: string;
  };
}

type TossSignalEndpointPath =
  | '/api/v2/dashboard/wts/overview/signals'
  | '/api/v1/dashboard/intelligences/all';

const DEFAULT_TICKER = '005930';
const DEFAULT_NAME = '삼성전자';
const DEFAULT_MARKET = 'KOSPI';
const TOSS_SIGNAL_ENDPOINT_PATHS = new Set<TossSignalEndpointPath>([
  '/api/v2/dashboard/wts/overview/signals',
  '/api/v1/dashboard/intelligences/all',
]);

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

function booleanArg(name: string, fallback = false): boolean {
  if (process.argv.includes(`--${name}`)) return true;
  const raw = argValue(name);
  if (raw === undefined || raw.trim().length === 0) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

function endpointPathArg(): TossSignalEndpointPath | undefined {
  const raw = argValue('toss-signal-endpoint-path');
  if (raw === undefined || raw.trim().length === 0) return undefined;
  const trimmed = raw.trim() as TossSignalEndpointPath;
  return TOSS_SIGNAL_ENDPOINT_PATHS.has(trimmed) ? trimmed : undefined;
}

async function maybeLoadSignalTemplate(): Promise<'file' | 'env' | 'missing'> {
  const templateFile = argValue('toss-signal-template-file');
  if (templateFile !== undefined && templateFile.trim().length > 0) {
    process.env['ARAON_TOSS_SIGNAL_REQUEST_BODY_TEMPLATE'] =
      (await readFile(resolve(templateFile), 'utf8')).trim();
    return 'file';
  }
  return process.env['ARAON_TOSS_SIGNAL_REQUEST_BODY_TEMPLATE'] === undefined
    ? 'missing'
    : 'env';
}

async function main(): Promise<void> {
  const previous = snapshotEnv([
    'ARAON_AGENT_EVENT_MONITOR_ENABLED',
    'ARAON_TOSS_SIGNAL_ENDPOINT_PATH',
    'ARAON_TOSS_SIGNAL_REQUEST_BODY_TEMPLATE',
    'LOG_LEVEL',
  ]);

  const loadEnv = booleanArg('load-env', true);
  process.env['ARAON_AGENT_EVENT_MONITOR_ENABLED'] = '1';
  process.env['LOG_LEVEL'] = argValue('log-level') ?? 'silent';
  if (loadEnv) {
    const { loadLocalEnvFile } = await import('../../../src/server/env.js');
    loadLocalEnvFile();
  }
  const endpointPath = endpointPathArg();
  if (endpointPath !== undefined) {
    process.env['ARAON_TOSS_SIGNAL_ENDPOINT_PATH'] = endpointPath;
  }
  const templateSource = await maybeLoadSignalTemplate();

  const dataDir = await mkdtemp(join(tmpdir(), 'araon-agent-monitor-provider-mix-'));
  let server: AraonServer | null = null;
  let closeDb: (() => void) | null = null;
  let clearConfiguredDataDirForTests: (() => void) | null = null;
  let copiedEncryptedTossSession = false;

  try {
    await mkdir(dataDir, { recursive: true });
    if (booleanArg('copy-current-toss-session')) {
      const sessionPath = resolve('data/toss-session.enc');
      if (!existsSync(sessionPath)) {
        throw new Error('TOSS_ENCRYPTED_SESSION_FILE_MISSING');
      }
      await copyFile(sessionPath, join(dataDir, 'toss-session.enc'));
      copiedEncryptedTossSession = true;
    }

    const modules = await loadServerModules();
    closeDb = modules.closeDb;
    clearConfiguredDataDirForTests = modules.clearConfiguredDataDirForTests;
    server = await modules.createAraonServer({ dataDir });
    await addTrackedStock(server);
    const report = await runAgentEventMonitorSmoke({
      getStatus: () => fetchData<AgentEventMonitorStatus>(
        server,
        'GET',
        '/agent/event-monitor/status',
      ),
      runTick: () => fetchData<AgentEventMonitorRunResult>(
        server,
        'POST',
        '/agent/event-monitor/tick',
      ),
      runTickEnabled: true,
    });

    console.log(JSON.stringify({
      provider: 'araon-agent-event-monitor-provider-mix',
      isolatedTempData: true,
      envLoaded: loadEnv,
      copiedEncryptedTossSession,
      tossSignalTemplateSource: templateSource,
      trackedStockConfigured: true,
      report,
    }, null, 2));
    process.exitCode = report.outcome === 'ok' ? 0 : 1;
  } finally {
    if (server !== null) {
      await server.close();
    } else if (closeDb !== null) {
      closeDb();
    }
    clearConfiguredDataDirForTests?.();
    restoreEnv(previous);
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function loadServerModules(): Promise<{
  readonly createAraonServer: typeof import('../../../src/server/app.js').createAraonServer;
  readonly closeDb: typeof import('../../../src/server/db/database.js').closeDb;
  readonly clearConfiguredDataDirForTests: typeof import('../../../src/server/runtime-paths.js').clearConfiguredDataDirForTests;
}> {
  const [{ createAraonServer }, { closeDb }, { clearConfiguredDataDirForTests }] = await Promise.all([
    import('../../../src/server/app.js'),
    import('../../../src/server/db/database.js'),
    import('../../../src/server/runtime-paths.js'),
  ]);
  return { createAraonServer, closeDb, clearConfiguredDataDirForTests };
}

async function addTrackedStock(server: AraonServer): Promise<void> {
  const response = await server.app.inject({
    method: 'POST',
    url: '/stocks',
    payload: {
      ticker: argValue('ticker') ?? DEFAULT_TICKER,
      name: argValue('name') ?? DEFAULT_NAME,
      market: argValue('market') ?? DEFAULT_MARKET,
    },
  });
  if (response.statusCode !== 201) {
    throw new Error('AGENT_EVENT_MONITOR_PROVIDER_MIX_STOCK_SETUP_FAILED');
  }
}

async function fetchData<T>(
  server: AraonServer | null,
  method: 'GET' | 'POST',
  url: string,
): Promise<T> {
  if (server === null) throw new Error('AGENT_EVENT_MONITOR_PROVIDER_MIX_SERVER_MISSING');
  const response = await server.app.inject({ method, url });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error('AGENT_EVENT_MONITOR_PROVIDER_MIX_ROUTE_FAILED');
  }
  const envelope = response.json() as ApiEnvelope<T>;
  if (envelope.success !== true || envelope.data === undefined) {
    throw new Error(envelope.error?.code ?? 'AGENT_EVENT_MONITOR_PROVIDER_MIX_ROUTE_FAILED');
  }
  return envelope.data;
}

function snapshotEnv(keys: readonly string[]): Map<string, string | undefined> {
  return new Map(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: ReadonlyMap<string, string | undefined>): void {
  for (const [key, value] of snapshot) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

main().catch((err: unknown) => {
  const code = err instanceof Error ? err.message : 'AGENT_EVENT_MONITOR_PROVIDER_MIX_SMOKE_FAILED';
  const safeCode = /^[A-Z][A-Z0-9_]{1,79}$/.test(code)
    ? code
    : 'AGENT_EVENT_MONITOR_PROVIDER_MIX_SMOKE_FAILED';
  console.error(JSON.stringify({
    provider: 'araon-agent-event-monitor-provider-mix',
    outcome: 'failed',
    errorCode: safeCode,
  }));
  process.exitCode = 1;
});
