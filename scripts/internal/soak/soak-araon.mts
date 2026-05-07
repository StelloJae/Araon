import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { createAraonServer } from '../src/server/app.js';
import {
  evaluateSoakSamples,
  type SoakHttpSample,
} from '../src/server/soak/soak-evaluator.js';

const { values } = parseArgs({
  options: {
    'duration-ms': { type: 'string', default: '60000' },
    'interval-ms': { type: 'string', default: '5000' },
    'data-dir': { type: 'string' },
  },
});

const durationMs = positiveInt(values['duration-ms'], 60_000);
const intervalMs = positiveInt(values['interval-ms'], 5_000);
const dataDir =
  values['data-dir'] ?? await mkdtemp(join(tmpdir(), 'araon-soak-data-'));

const endpoints = [
  '/credentials/status',
  '/stocks',
  '/runtime/realtime/status',
  '/runtime/data-health',
  '/runtime/signals/outcomes',
  '/runtime/backup/export',
] as const;

const server = await createAraonServer({
  dataDir,
  registerProcessShutdown: false,
});

let sampleCount = 0;
const issues: ReturnType<typeof evaluateSoakSamples>['issues'] = [];
const startedAt = new Date();

try {
  const started = await server.start({ host: '127.0.0.1', port: 0 });
  const deadline = Date.now() + durationMs;

  while (Date.now() < deadline) {
    const samples: SoakHttpSample[] = [];
    for (const endpoint of endpoints) {
      const res = await fetch(`${started.url}${endpoint}`);
      samples.push({
        endpoint,
        status: res.status,
        bodyText: await res.text(),
      });
      sampleCount += 1;
    }
    const evaluated = evaluateSoakSamples(samples);
    issues.push(...evaluated.issues);
    await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
  }

  const ok = issues.length === 0;
  const report = {
    ok,
    mode: 'no-live',
    dataDir,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs,
    intervalMs,
    endpoints,
    sampleCount,
    issueCount: issues.length,
    issues,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!ok) process.exitCode = 1;
} finally {
  await server.close();
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
