import type { Price } from '@shared/types.js';

import type {
  AgentEventQueue,
  AgentEventQueueResult,
} from './agent-event-queue.js';
import type { MarketTopMoverRotationCandidate } from '../market/market-top-movers-service.js';

export interface EnqueueMarketMovementFromPriceInput {
  readonly queue: Pick<AgentEventQueue, 'enqueue'>;
  readonly price: Price;
  readonly source: 'kis-ws-tick' | 'toss-fast-quote' | 'toss-quote-refresh' | string;
  readonly thresholdPct?: number;
  readonly now?: () => string;
}

export interface EnqueueMarketMovementFromTopMoverInput {
  readonly queue: Pick<AgentEventQueue, 'enqueue'>;
  readonly candidate: MarketTopMoverRotationCandidate;
  readonly source: 'toss-top100-rotation' | string;
  readonly now?: () => string;
}

const MARKET_MOVEMENT_BUCKET_MS = 60_000;
const DEFAULT_PRICE_MOVEMENT_THRESHOLD_PCT = 3;

export function enqueueMarketMovementFromPrice(
  input: EnqueueMarketMovementFromPriceInput,
): AgentEventQueueResult | null {
  if (input.price.isSnapshot) return null;
  const ticker = normalizeKrTicker(input.price.ticker);
  if (ticker === null) return null;

  const firstSeenAt = validIsoOrNow(input.now?.() ?? new Date().toISOString());
  const publishedAt =
    validIso(input.price.tradeAt ?? null) ??
    validIso(input.price.updatedAt) ??
    firstSeenAt;
  const bucketAt = bucketIso(publishedAt, MARKET_MOVEMENT_BUCKET_MS);
  const changeRate = Number.isFinite(input.price.changeRate)
    ? input.price.changeRate
    : 0;
  const thresholdPct = normalizeThresholdPct(input.thresholdPct);
  if (Math.abs(changeRate) < thresholdPct) return null;
  const source = input.source.trim() || 'market-price';

  return input.queue.enqueue({
    type: 'market_movement_detected',
    ticker,
    source,
    publishedAt,
    firstSeenAt,
    relevance: relevanceFromChangeRate(changeRate),
    confidence: confidenceForSource(source),
    reason: `가격 업데이트 감지 · 등락률 ${changeRate.toFixed(2)}%`,
    dedupeKey: `market-movement:${source}:${ticker}:${bucketAt}`,
    payloadRef: null,
  });
}

export function enqueueMarketMovementFromTopMover(
  input: EnqueueMarketMovementFromTopMoverInput,
): AgentEventQueueResult | null {
  const ticker = normalizeKrTicker(input.candidate.ticker);
  if (ticker === null) return null;

  const firstSeenAt = validIsoOrNow(input.now?.() ?? new Date().toISOString());
  const publishedAt = validIso(input.candidate.lastSeenAt) ?? firstSeenAt;
  const source = input.source.trim() || 'top100-rotation';

  return input.queue.enqueue({
    type: 'market_movement_detected',
    ticker,
    source,
    publishedAt,
    firstSeenAt,
    relevance: input.candidate.score,
    confidence: confidenceForSource(source),
    reason: input.candidate.reason,
    dedupeKey: [
      'market-movement',
      source,
      input.candidate.direction,
      ticker,
      publishedAt,
    ].join(':'),
    payloadRef: null,
  });
}

function normalizeKrTicker(value: string): string | null {
  const trimmed = value.trim().toUpperCase();
  const ticker = trimmed.startsWith('A') ? trimmed.slice(1) : trimmed;
  return /^\d{6}$/.test(ticker) ? ticker : null;
}

function validIso(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function validIsoOrNow(value: string): string {
  return validIso(value) ?? new Date().toISOString();
}

function bucketIso(value: string, bucketMs: number): string {
  const ms = Date.parse(value);
  const bucket = Math.floor(ms / bucketMs) * bucketMs;
  return new Date(bucket).toISOString();
}

function relevanceFromChangeRate(changeRate: number): number {
  return Math.min(1, Math.abs(changeRate) / 10);
}

function normalizeThresholdPct(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value >= 0
    ? value
    : DEFAULT_PRICE_MOVEMENT_THRESHOLD_PCT;
}

function confidenceForSource(source: string): number {
  if (source === 'toss-top100-rotation') return 0.66;
  return source === 'kis-ws-tick' ? 0.78 : 0.68;
}
