import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import {
  buildPreReleaseMarketEvidenceReport,
  type PreReleaseEvidenceEndpoint,
  type PreReleaseMarketEvidenceSample,
} from '../../../src/server/soak/pre-release-market-evidence.js';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://127.0.0.1:3000' },
    'duration-ms': { type: 'string', default: '60000' },
    'interval-ms': { type: 'string', default: '500' },
    ticker: { type: 'string', default: '005930' },
    tickers: { type: 'string' },
    out: { type: 'string' },
    'require-market-evidence': { type: 'boolean', default: false },
    'require-completion': { type: 'boolean', default: false },
  },
});

const targetUrl = String(values.url ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');
const durationMs = positiveInt(values['duration-ms'], 60_000);
const intervalMs = positiveInt(values['interval-ms'], 500);
const selectedTicker = sixDigitTicker(values.ticker) ?? '005930';
const quoteTickers = parseTickers(values.tickers, selectedTicker);
const out = values.out;
const requireMarketEvidence =
  values['require-market-evidence'] === true || values['require-completion'] === true;
const startedAt = new Date();
const deadline = Date.now() + durationMs;
const samples: PreReleaseMarketEvidenceSample[] = [];

while (Date.now() < deadline) {
  const cycleStartedAt = Date.now();
  samples.push(
    await sampleEndpoint(
      'top-movers',
      `${targetUrl}/market/top-movers?limit=100&market=kr`,
    ),
  );
  samples.push(
    await sampleEndpoint(
      'realtime-ranking',
      `${targetUrl}/market/toss/realtime-ranking?limit=100&market=kr`,
    ),
  );
  samples.push(
    await sampleEndpoint(
      'quote-batch',
      `${targetUrl}/market/toss/quotes?tickers=${encodeURIComponent(
        quoteTickers.join(','),
      )}`,
    ),
  );
  samples.push(
    await sampleEndpoint(
      'candles',
      `${targetUrl}/stocks/${selectedTicker}/candles?interval=1m&range=1d`,
    ),
  );
  samples.push(
    await sampleEndpoint(
      'runtime-health',
      `${targetUrl}/runtime/data-health`,
    ),
  );

  const remainingMs = deadline - Date.now();
  const elapsedMs = Date.now() - cycleStartedAt;
  await sleep(Math.min(Math.max(0, intervalMs - elapsedMs), Math.max(0, remainingMs)));
}

const report = buildPreReleaseMarketEvidenceReport({
  targetUrl,
  startedAt: startedAt.toISOString(),
  finishedAt: new Date().toISOString(),
  durationMs,
  intervalMs,
  selectedTicker,
  quoteTickers,
  samples,
});

const json = `${JSON.stringify(report, null, 2)}\n`;
if (typeof out === 'string' && out.length > 0) {
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, json, 'utf8');
}
console.log(json);
if (!report.ok || (requireMarketEvidence && !report.marketEvidenceReady)) process.exitCode = 1;

async function sampleEndpoint(
  endpoint: PreReleaseEvidenceEndpoint,
  url: string,
): Promise<PreReleaseMarketEvidenceSample> {
  const sampledAt = new Date().toISOString();
  const started = Date.now();
  try {
    const res = await fetch(url);
    return {
      endpoint,
      sampledAt,
      status: res.status,
      durationMs: Date.now() - started,
      bodyText: await res.text(),
    };
  } catch (err: unknown) {
    return {
      endpoint,
      sampledAt,
      status: 0,
      durationMs: Date.now() - started,
      bodyText: JSON.stringify({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      }),
    };
  }
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseTickers(raw: string | undefined, selectedTicker: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of (raw ?? selectedTicker).split(',')) {
    const ticker = sixDigitTicker(value);
    if (ticker === null || seen.has(ticker)) continue;
    seen.add(ticker);
    out.push(ticker);
  }
  return out.length > 0 ? out.slice(0, 60) : [selectedTicker];
}

function sixDigitTicker(raw: string | undefined): string | null {
  const ticker = raw?.trim() ?? '';
  return /^\d{6}$/.test(ticker) ? ticker : null;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
