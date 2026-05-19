/**
 * Toss signal endpoint smoke.
 *
 * Purpose:
 * - Verify the optional Toss overview-signal collector after a vetted request
 *   body template has been captured.
 * - Fail closed without calling Toss when the template is missing.
 * - Print only sanitized contract/count metadata.
 *
 * Usage:
 *   npx tsx scripts/internal/probes/probe-toss-signal-smoke.mts
 *   npx tsx scripts/internal/probes/probe-toss-signal-smoke.mts --ticker=005930 --name=삼성전자
 *   npx tsx scripts/internal/probes/probe-toss-signal-smoke.mts --endpoint-path=/api/v1/dashboard/intelligences/all
 *
 * Required for external calls:
 *   ARAON_TOSS_SIGNAL_REQUEST_BODY_TEMPLATE='{"productCode":"{{productCode}}"}'
 */

import { runTossSignalSmoke } from '../../../src/server/toss/toss-signal-smoke.js';
import {
  createTossSignalClient,
  createTossSignalRequestBodyTemplate,
  type TossSignalEndpointPath,
} from '../../../src/server/toss/toss-signal-client.js';
import { createFileTossSessionStore } from '../../../src/server/toss/toss-session-store.js';

const DEFAULT_TOSS_SIGNAL_ENDPOINT_PATH: TossSignalEndpointPath =
  '/api/v2/dashboard/wts/overview/signals';
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

async function main(): Promise<void> {
  const sessionStore = createFileTossSessionStore();
  const endpointPath = endpointPathArg();
  const requestBody = createTossSignalRequestBodyTemplate(
    process.env['ARAON_TOSS_SIGNAL_REQUEST_BODY_TEMPLATE'],
  );
  const report = await runTossSignalSmoke({
    requestBodyConfigured: requestBody !== undefined,
    ...(requestBody !== undefined
      ? {
          client: createTossSignalClient({
            requestBody,
            endpointPath,
            sessionStore,
          }),
        }
      : {}),
    probe: {
      ticker: argValue('ticker') ?? '005930',
      name: argValue('name') ?? '삼성전자',
    },
    endpointPath,
  });

  console.log(JSON.stringify(report, null, 2));
  if (report.outcome === 'template_required') {
    process.exitCode = 2;
  } else if (report.outcome !== 'ok') {
    process.exitCode = 1;
  }
}

function endpointPathArg(): TossSignalEndpointPath {
  const raw = argValue('endpoint-path') ?? process.env['ARAON_TOSS_SIGNAL_ENDPOINT_PATH'];
  if (raw === undefined || raw.trim().length === 0) return DEFAULT_TOSS_SIGNAL_ENDPOINT_PATH;
  const trimmed = raw.trim() as TossSignalEndpointPath;
  return TOSS_SIGNAL_ENDPOINT_PATHS.has(trimmed)
    ? trimmed
    : DEFAULT_TOSS_SIGNAL_ENDPOINT_PATH;
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({
    provider: 'toss',
    outcome: 'failed',
    errorCode: message.includes('template')
      ? 'TOSS_SIGNAL_TEMPLATE_INVALID'
      : 'TOSS_SIGNAL_SMOKE_FAILED',
  }));
  process.exitCode = 1;
});
