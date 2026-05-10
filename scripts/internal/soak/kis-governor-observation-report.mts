import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import {
  buildKisGovernorObservationReport,
  type TimedSoakHttpSample,
} from '../../../src/server/soak/kis-governor-observation.js';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://127.0.0.1:3000' },
    'duration-ms': { type: 'string', default: '600000' },
    'interval-ms': { type: 'string', default: '10000' },
    out: { type: 'string' },
  },
});

const targetUrl = String(values.url ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');
const durationMs = positiveInt(values['duration-ms'], 600_000);
const intervalMs = positiveInt(values['interval-ms'], 10_000);
const out = values.out;
const endpoint = '/runtime/data-health';
const samples: TimedSoakHttpSample[] = [];
const startedAt = new Date();
const deadline = Date.now() + durationMs;

while (Date.now() < deadline) {
  const sampledAt = new Date().toISOString();
  try {
    const res = await fetch(`${targetUrl}${endpoint}`);
    samples.push({
      endpoint,
      sampledAt,
      status: res.status,
      bodyText: await res.text(),
    });
  } catch (err: unknown) {
    samples.push({
      endpoint,
      sampledAt,
      status: 0,
      bodyText: JSON.stringify({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      }),
    });
  }

  await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
}

const report = buildKisGovernorObservationReport({
  targetUrl,
  startedAt: startedAt.toISOString(),
  finishedAt: new Date().toISOString(),
  durationMs,
  intervalMs,
  samples,
});

const json = `${JSON.stringify(report, null, 2)}\n`;
if (typeof out === 'string' && out.length > 0) {
  await writeFile(out, json, 'utf8');
}
console.log(json);
if (!report.ok) process.exitCode = 1;

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
