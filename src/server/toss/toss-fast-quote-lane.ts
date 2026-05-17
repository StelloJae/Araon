import { createChildLogger } from '@shared/logger.js';
import type { Favorite, MarketTopMoversResponse, Price } from '@shared/types.js';
import {
  krTickerFromTossProductCode,
  normalizeTossProductCode,
} from '@shared/product-identity.js';

import type { AgentEvent } from '../agent/agent-event-queue.js';
import type { OrderIntentPreview } from '../agent/order-intent-service.js';
import type { MarketQuoteBatchResult } from '../market/market-data-provider.js';

const log = createChildLogger('toss-fast-quote-lane');

export type TossFastQuoteCandidateSource =
  | 'current_view'
  | 'watchlist'
  | 'agent_candidate'
  | 'top100_gainer'
  | 'top100_loser'
  | 'kis_tracked';

export interface TossFastQuoteCandidate {
  readonly ticker: string;
  readonly source: TossFastQuoteCandidateSource;
  readonly reason: string;
  readonly score: number;
  readonly lastSeenAt: string;
}

export interface TossFastQuoteCandidateInput {
  readonly now: string;
  readonly currentTickers?: readonly string[];
  readonly favorites?: readonly Favorite[];
  readonly agentEvents?: readonly AgentEvent[];
  readonly orderIntentPreviews?: readonly OrderIntentPreview[];
  readonly topMovers?: MarketTopMoversResponse | null;
  readonly kisTrackedTickers?: readonly string[];
  readonly targetCap?: number;
  readonly hardCap?: number;
}

export interface TossFastQuoteLaneProvider {
  getQuoteBatch(input: { tickers: readonly string[] }): Promise<MarketQuoteBatchResult>;
}

export interface TossFastQuoteLanePriceStore {
  setPrice(price: Price): void;
}

export interface TossFastQuoteLaneSnapshot {
  readonly running: boolean;
  readonly enabled: boolean;
  readonly source: 'toss-fast-quote';
  readonly intervalMs: number;
  readonly targetCap: number;
  readonly hardCap: number;
  readonly candidateCount: number;
  readonly requestedCount: number;
  readonly returnedCount: number;
  readonly acceptedCount: number;
  readonly droppedUnchangedCount: number;
  readonly droppedStaleCount: number;
  readonly droppedInvalidCount: number;
  readonly skippedInFlightCount: number;
  readonly failureCount: number;
  readonly consecutiveFailureCount: number;
  readonly backoffUntil: string | null;
  readonly lastSuccessAt: string | null;
  readonly lastFailureAt: string | null;
  readonly lastErrorCode:
    | 'TOSS_FAST_QUOTE_RATE_LIMITED'
    | 'TOSS_FAST_QUOTE_FAILED'
    | null;
  readonly lastMessage: string | null;
}

export interface TossFastQuoteLane {
  start(): void;
  stop(): Promise<void>;
  refreshOnce(): Promise<TossFastQuoteLaneSnapshot>;
  snapshot(): TossFastQuoteLaneSnapshot;
}

export interface TossFastQuoteLaneOptions {
  readonly provider: TossFastQuoteLaneProvider;
  readonly priceStore: TossFastQuoteLanePriceStore;
  readonly collectCandidates:
    () => readonly TossFastQuoteCandidate[] | Promise<readonly TossFastQuoteCandidate[]>;
  readonly now?: () => number;
  readonly setTimeoutFn?: (cb: () => void, ms: number) => unknown;
  readonly intervalMs?: number;
  readonly targetCap?: number;
  readonly hardCap?: number;
  readonly batchSize?: number;
  readonly staleAfterMs?: number;
}

const DEFAULT_INTERVAL_MS = 500;
const DEFAULT_TARGET_CAP = 40;
const DEFAULT_HARD_CAP = 60;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_STALE_AFTER_MS = 5_000;
const RATE_LIMIT_BACKOFF_MS = 5_000;
const NETWORK_BACKOFF_MAX_MS = 5_000;

export function buildTossFastQuoteCandidates(
  input: TossFastQuoteCandidateInput,
): TossFastQuoteCandidate[] {
  const now = normalizeTimestamp(input.now);
  const targetCap = normalizeCap(input.targetCap, DEFAULT_TARGET_CAP);
  const hardCap = normalizeCap(input.hardCap, DEFAULT_HARD_CAP);
  const cap = Math.min(targetCap, hardCap);
  const byTicker = new Map<string, TossFastQuoteCandidate>();

  for (const ticker of input.currentTickers ?? []) {
    addCandidate(byTicker, ticker, 'current_view', '현재 선택 종목', 700, now);
  }
  for (const favorite of input.favorites ?? []) {
    addCandidate(byTicker, favorite.ticker, 'watchlist', '즐겨찾기', 600, favorite.addedAt);
  }
  for (const event of input.agentEvents ?? []) {
    addCandidate(
      byTicker,
      event.krTicker ?? event.productCode ?? event.ticker,
      'agent_candidate',
      '에이전트 후보',
      500 + Math.round((event.relevance ?? event.confidence) * 100),
      event.firstSeenAt,
    );
  }
  for (const preview of input.orderIntentPreviews ?? []) {
    addCandidate(
      byTicker,
      preview.ticker,
      'agent_candidate',
      '주문 intent 후보',
      540,
      preview.createdAt,
    );
  }

  const topMovers = input.topMovers;
  if (topMovers !== undefined && topMovers !== null) {
    for (const item of topMovers.gainers.slice(0, 20)) {
      addCandidate(
        byTicker,
        item.ticker,
        'top100_gainer',
        `TOP100 상승 #${item.rank}`,
        400 - item.rank,
        topMovers.fetchedAt ?? topMovers.generatedAt,
      );
    }
    for (const item of topMovers.losers.slice(0, 10)) {
      addCandidate(
        byTicker,
        item.ticker,
        'top100_loser',
        `TOP100 하락 #${item.rank}`,
        300 - item.rank,
        topMovers.fetchedAt ?? topMovers.generatedAt,
      );
    }
  }

  for (const ticker of input.kisTrackedTickers ?? []) {
    addCandidate(byTicker, ticker, 'kis_tracked', '실시간 추적 companion', 200, now);
  }

  return [...byTicker.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.ticker.localeCompare(b.ticker);
    })
    .slice(0, cap);
}

export function createTossFastQuoteLane(
  options: TossFastQuoteLaneOptions,
): TossFastQuoteLane {
  const now = options.now ?? (() => Date.now());
  const intervalMs = normalizeCap(options.intervalMs, DEFAULT_INTERVAL_MS);
  const targetCap = normalizeCap(options.targetCap, DEFAULT_TARGET_CAP);
  const hardCap = normalizeCap(options.hardCap, DEFAULT_HARD_CAP);
  const batchSize = normalizeCap(options.batchSize, DEFAULT_BATCH_SIZE);
  const staleAfterMs = normalizeCap(options.staleAfterMs, DEFAULT_STALE_AFTER_MS);
  const scheduleTimeout =
    options.setTimeoutFn ??
    ((cb: () => void, ms: number): unknown => setTimeout(cb, ms));

  let running = false;
  let loopPromise: Promise<void> | null = null;
  let wakeWaiter: (() => void) | null = null;
  let inflight: Promise<TossFastQuoteLaneSnapshot> | null = null;
  let backoffUntilMs = 0;

  let candidateCount = 0;
  let requestedCount = 0;
  let returnedCount = 0;
  let acceptedCount = 0;
  let droppedUnchangedCount = 0;
  let droppedStaleCount = 0;
  let droppedInvalidCount = 0;
  let skippedInFlightCount = 0;
  let failureCount = 0;
  let consecutiveFailureCount = 0;
  let lastSuccessAt: string | null = null;
  let lastFailureAt: string | null = null;
  let lastErrorCode: TossFastQuoteLaneSnapshot['lastErrorCode'] = null;
  let lastMessage: string | null = null;
  const lastAcceptedByTicker = new Map<string, Price>();

  async function refreshOnce(): Promise<TossFastQuoteLaneSnapshot> {
    if (inflight !== null) {
      skippedInFlightCount += 1;
      lastMessage = 'in_flight';
      return snapshot();
    }
    const currentMs = now();
    if (backoffUntilMs > currentMs) {
      lastMessage = 'backoff';
      return snapshot();
    }
    inflight = runRefresh(currentMs).finally(() => {
      inflight = null;
    });
    return inflight;
  }

  async function runRefresh(startedAtMs: number): Promise<TossFastQuoteLaneSnapshot> {
    try {
      const candidates = (await options.collectCandidates())
        .slice(0, hardCap);
      candidateCount = candidates.length;
      requestedCount = 0;
      returnedCount = 0;
      acceptedCount = 0;
      droppedUnchangedCount = 0;
      droppedStaleCount = 0;
      droppedInvalidCount = 0;

      const tickers = uniqueTickers(candidates.map((candidate) => candidate.ticker)).slice(0, hardCap);
      if (tickers.length === 0) {
        lastMessage = 'no_candidates';
        lastErrorCode = null;
        return snapshot();
      }

      for (const batch of chunk(tickers, batchSize)) {
        const result = await options.provider.getQuoteBatch({ tickers: batch });
        requestedCount += result.requestedCount;
        returnedCount += result.returnedCount;
        for (const price of result.prices) {
          acceptPrice(price, startedAtMs);
        }
      }

      consecutiveFailureCount = 0;
      backoffUntilMs = 0;
      lastSuccessAt = new Date(now()).toISOString();
      lastErrorCode = null;
      lastMessage = acceptedCount > 0 ? 'ready' : 'no_changed_prices';
      return snapshot();
    } catch (err: unknown) {
      failureCount += 1;
      consecutiveFailureCount += 1;
      lastFailureAt = new Date(now()).toISOString();
      lastErrorCode = isRateLimitError(err)
        ? 'TOSS_FAST_QUOTE_RATE_LIMITED'
        : 'TOSS_FAST_QUOTE_FAILED';
      lastMessage = isRateLimitError(err)
        ? 'rate_limited'
        : 'quote_batch_failed';
      const backoffMs = isRateLimitError(err)
        ? RATE_LIMIT_BACKOFF_MS
        : Math.min(NETWORK_BACKOFF_MAX_MS, 1000 * 2 ** Math.min(3, consecutiveFailureCount - 1));
      backoffUntilMs = now() + backoffMs;
      log.warn(
        { code: lastErrorCode },
        'Toss fast quote refresh failed',
      );
      return snapshot();
    }
  }

  function acceptPrice(price: Price, cycleStartedAtMs: number): void {
    if (!isUsablePrice(price)) {
      droppedInvalidCount += 1;
      return;
    }
    const ticker = normalizeKrTicker(price.ticker);
    if (ticker === null) {
      droppedInvalidCount += 1;
      return;
    }
    const updatedAtMs = Date.parse(price.updatedAt);
    if (Number.isFinite(updatedAtMs) && updatedAtMs < cycleStartedAtMs - staleAfterMs) {
      droppedStaleCount += 1;
      return;
    }
    const normalized: Price = {
      ...price,
      ticker,
      isSnapshot: false,
      source: 'toss-fast-quote',
    };
    const previous = lastAcceptedByTicker.get(ticker);
    if (previous !== undefined && isSameEffectivePrice(previous, normalized)) {
      droppedUnchangedCount += 1;
      return;
    }
    lastAcceptedByTicker.set(ticker, normalized);
    acceptedCount += 1;
    options.priceStore.setPrice(normalized);
  }

  async function loop(): Promise<void> {
    while (running) {
      await wait(intervalMs);
      if (!running) break;
      await refreshOnce();
    }
  }

  function wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;
      const settle = (): void => {
        if (settled) return;
        settled = true;
        wakeWaiter = null;
        resolve();
      };
      wakeWaiter = settle;
      scheduleTimeout(settle, ms);
    });
  }

  function start(): void {
    if (running) return;
    running = true;
    loopPromise = loop().catch((err: unknown) => {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, 'Toss fast quote loop stopped');
    });
  }

  async function stop(): Promise<void> {
    if (!running) {
      if (loopPromise !== null) {
        await loopPromise;
        loopPromise = null;
      }
      return;
    }
    running = false;
    wakeWaiter?.();
    const pending = loopPromise;
    loopPromise = null;
    if (pending !== null) {
      await pending;
    }
  }

  function snapshot(): TossFastQuoteLaneSnapshot {
    return {
      running,
      enabled: true,
      source: 'toss-fast-quote',
      intervalMs,
      targetCap,
      hardCap,
      candidateCount,
      requestedCount,
      returnedCount,
      acceptedCount,
      droppedUnchangedCount,
      droppedStaleCount,
      droppedInvalidCount,
      skippedInFlightCount,
      failureCount,
      consecutiveFailureCount,
      backoffUntil: backoffUntilMs > now() ? new Date(backoffUntilMs).toISOString() : null,
      lastSuccessAt,
      lastFailureAt,
      lastErrorCode,
      lastMessage,
    };
  }

  return { start, stop, refreshOnce, snapshot };
}

function addCandidate(
  byTicker: Map<string, TossFastQuoteCandidate>,
  rawTicker: string,
  source: TossFastQuoteCandidateSource,
  reason: string,
  score: number,
  lastSeenAt: string,
): void {
  const ticker = normalizeKrTicker(rawTicker);
  if (ticker === null) return;
  const existing = byTicker.get(ticker);
  const candidate: TossFastQuoteCandidate = {
    ticker,
    source,
    reason,
    score,
    lastSeenAt: normalizeTimestamp(lastSeenAt),
  };
  if (
    existing === undefined ||
    candidate.score > existing.score ||
    (candidate.score === existing.score && candidate.lastSeenAt > existing.lastSeenAt)
  ) {
    byTicker.set(ticker, candidate);
  }
}

function normalizeKrTicker(value: string): string | null {
  const productCode = normalizeTossProductCode(value);
  if (productCode === null) return null;
  return krTickerFromTossProductCode(productCode);
}

function normalizeTimestamp(value: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return new Date(0).toISOString();
  return new Date(ms).toISOString();
}

function normalizeCap(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.trunc(value));
}

function uniqueTickers(tickers: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const ticker of tickers) {
    const normalized = normalizeKrTicker(ticker);
    if (normalized === null || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function isUsablePrice(price: Price): boolean {
  return Number.isFinite(price.price)
    && price.price > 0
    && typeof price.ticker === 'string'
    && price.ticker.trim().length > 0;
}

function isSameEffectivePrice(previous: Price, next: Price): boolean {
  return previous.price === next.price
    && previous.volume === next.volume
    && (previous.changeRate ?? null) === (next.changeRate ?? null)
    && (previous.changeAbs ?? null) === (next.changeAbs ?? null)
    && (previous.tradeAt ?? null) === (next.tradeAt ?? null);
}

function isRateLimitError(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return /\b429\b|rate.?limit|too many requests/i.test(text);
}
