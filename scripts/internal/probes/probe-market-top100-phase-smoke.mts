/**
 * Market TOP100 phase smoke.
 *
 * Purpose:
 * - Observe the running local Araon server's Toss-first TOP100/movers surfaces.
 * - Distinguish supported market-phase evidence from honest closed/unsupported
 *   state without printing ranking rows, tickers, names, prices, or raw payloads.
 *
 * Usage:
 *   npx tsx scripts/internal/probes/probe-market-top100-phase-smoke.mts
 *   npx tsx scripts/internal/probes/probe-market-top100-phase-smoke.mts --market=kr --limit=100
 */

import type {
  MarketTopMoversResponse,
  TossRealtimeRankingResponse,
} from '../../../src/shared/types.js';
import {
  getMarketTopMoversFetchWindow,
  isFetchableMarketTopMoversSourcePhase,
  millisecondsUntilMarketTopMoversFetchWindow,
  resolveMarketTopMoversSourcePhase,
} from '../../../src/server/market/market-top-movers-phase.js';

interface ApiEnvelope<T> {
  readonly success: boolean;
  readonly data?: T;
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:3000';
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;
const DEFAULT_MAX_WAIT_MS = 0;
const MAX_WAIT_MS = 3 * 60 * 60_000;

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

function boundedIntegerArg(name: string, fallback: number, min: number, max: number): number {
  const raw = argValue(name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function baseUrl(): string {
  const raw = argValue('base-url') ?? DEFAULT_BASE_URL;
  return raw.endsWith('/') ? raw : `${raw}/`;
}

function marketArg(): 'kr' | 'us' {
  return argValue('market') === 'us' ? 'us' : 'kr';
}

function limitArg(): number {
  const raw = argValue('limit');
  if (raw === undefined) return DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(parsed)));
}

async function fetchData<T>(path: string): Promise<T> {
  const response = await fetch(new URL(path, baseUrl()));
  if (!response.ok) throw new Error('MARKET_TOP100_PHASE_SMOKE_HTTP_FAILED');
  const envelope = await response.json() as ApiEnvelope<T>;
  if (envelope.success !== true || envelope.data === undefined) {
    throw new Error('MARKET_TOP100_PHASE_SMOKE_ROUTE_FAILED');
  }
  return envelope.data;
}

async function main(): Promise<void> {
  const market = marketArg();
  const limit = limitArg();
  const waitDecision = await waitForFetchablePhaseIfRequested();
  const observedAt = new Date();
  const localSourcePhase = resolveMarketTopMoversSourcePhase(observedAt);
  const fetchWindow = getMarketTopMoversFetchWindow(observedAt);
  const topMovers = await fetchData<MarketTopMoversResponse>(
    `/market/top-movers?limit=${limit}&market=${market}`,
  );
  const realtimeRanking = await fetchData<TossRealtimeRankingResponse>(
    `/market/toss/realtime-ranking?limit=${limit}&market=${market}`,
  );
  const topMoversReturnedCount = topMovers.gainers.length + topMovers.losers.length;
  const supportedPhase =
    topMovers.status === 'ready' ||
    (topMovers.status === 'partial' && topMoversReturnedCount > 0);

  console.log(JSON.stringify({
    provider: 'araon-market-top100-phase',
    outcome: supportedPhase ? 'market_phase_observed' : 'unsupported_or_empty',
    rawPayloadExposed: false,
    rawRowsExposed: false,
    market,
    requestedLimit: limit,
    wait: waitDecision,
    localPhase: {
      observedAt: observedAt.toISOString(),
      sourcePhase: localSourcePhase,
      fetchable: isFetchableMarketTopMoversSourcePhase(localSourcePhase),
      nextOrCurrentFetchWindow: fetchWindow,
    },
    topMovers: {
      source: topMovers.source,
      sourcePhase: topMovers.sourcePhase,
      status: topMovers.status,
      partialReason: topMovers.partialReason,
      stopReason: topMovers.stopReason,
      guaranteedTop100: topMovers.coverage.guaranteedTop100,
      requestedLimit: topMovers.coverage.requestedLimit,
      returnedCount: topMoversReturnedCount,
      gainersCount: topMovers.gainers.length,
      losersCount: topMovers.losers.length,
      rankingRateLimited: topMovers.rankingRateLimited,
    },
    tossRealtimeRanking: {
      source: realtimeRanking.source,
      status: realtimeRanking.status,
      rankingTimestampStatus: realtimeRanking.rankingTimestampStatus,
      requestedLimit: realtimeRanking.coverage.requestedLimit,
      returnedCount: realtimeRanking.coverage.returnedCount,
      pricedCount: realtimeRanking.coverage.pricedCount,
      market: realtimeRanking.coverage.market,
    },
  }, null, 2));
}

async function waitForFetchablePhaseIfRequested(): Promise<{
  readonly enabled: boolean;
  readonly maxWaitMs: number;
  readonly waitedMs: number;
  readonly skippedReason: 'disabled' | 'already_fetchable' | 'exceeds_max_wait' | null;
}> {
  const enabled = booleanArg('wait-until-fetchable');
  const maxWaitMs = boundedIntegerArg('max-wait-ms', DEFAULT_MAX_WAIT_MS, 0, MAX_WAIT_MS);
  if (!enabled) {
    return { enabled, maxWaitMs, waitedMs: 0, skippedReason: 'disabled' };
  }
  const waitMs = millisecondsUntilMarketTopMoversFetchWindow(new Date());
  if (waitMs === 0) {
    return { enabled, maxWaitMs, waitedMs: 0, skippedReason: 'already_fetchable' };
  }
  if (waitMs > maxWaitMs) {
    return { enabled, maxWaitMs, waitedMs: 0, skippedReason: 'exceeds_max_wait' };
  }
  await sleep(waitMs);
  return { enabled, maxWaitMs, waitedMs: waitMs, skippedReason: null };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(() => {
  console.error(JSON.stringify({
    provider: 'araon-market-top100-phase',
    outcome: 'failed',
    errorCode: 'MARKET_TOP100_PHASE_SMOKE_FAILED',
    rawPayloadExposed: false,
    rawRowsExposed: false,
  }));
  process.exitCode = 1;
});
