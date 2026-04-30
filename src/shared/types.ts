/**
 * Shared domain types + SSE event schema.
 *
 * This module is the server-side domain and SSE event contract.
 * Phase 1, 2, 6, and 7 all depend on these definitions — changes here cascade.
 */

// === Domain types =========================================================

/**
 * App-level auto-classification name derived from KIS MST official index
 * industry codes, with KRX sector flags kept as a fallback when index industry
 * data is unavailable.
 * The mapping itself lives in `src/server/data/kis-industry-sector-map.ts` —
 * this type is here so both client and server can consume the result without
 * duplicating the literal union.
 */
export type AutoSectorName =
  | '음식료품'
  | '섬유의복'
  | '종이목재'
  | '화학'
  | '의약품'
  | '비금속광물'
  | '철강금속'
  | '기계'
  | '전기전자'
  | '의료정밀'
  | '운수장비'
  | '유통업'
  | '전기가스업'
  | '건설업'
  | '운수창고업'
  | '통신업'
  | '금융업'
  | '증권'
  | '보험'
  | '서비스업'
  | '제조업'
  | '부동산업'
  | 'IT서비스'
  | '오락문화'
  | '기타서비스'
  | '제조'
  | '건설'
  | '유통'
  | '운송'
  | '금융'
  | '음식료/담배'
  | '섬유/의류'
  | '종이/목재'
  | '출판/매체복제'
  | '제약'
  | '비금속'
  | '금속'
  | '기계/장비'
  | '일반전기전자'
  | '의료/정밀기기'
  | '운송장비/부품'
  | '기타제조'
  | '반도체'
  | '자동차'
  | '바이오'
  | '에너지화학'
  | '철강'
  | '미디어통신'
  | '조선'
  | '기타';

/**
 * A tradable Korean equity.
 * `ticker` is the KIS 6-digit code (e.g. '005930' for Samsung Electronics).
 * `name` is the Korean display name; `market` distinguishes KOSPI vs KOSDAQ.
 *
 * `autoSector` is filled in by `StockService.list()` when a master_stocks
 * row exists for the ticker; otherwise omitted. Optional so callers that
 * construct Stock literals don't have to opt into the field.
 */
export interface Stock {
  ticker: string;
  name: string;
  market: 'KOSPI' | 'KOSDAQ';
  autoSector?: AutoSectorName | null;
}

/**
 * A thematic grouping of stocks (e.g. 반도체, 2차전지).
 * Seeded statically in Phase 3c; may be user-editable in future versions.
 */
export interface Sector {
  id: string;
  name: string;
  order: number;
}

/**
 * A user-defined label attached to one or more stocks.
 * Tags provide a secondary, user-controlled grouping axis alongside sectors.
 */
export interface Tag {
  id: string;
  name: string;
  color: string;
}

/**
 * A user's favorite entry. `tier` determines whether this ticker gets a
 * realtime WebSocket subscription or polling updates.
 *
 * `addedAt` defines priority ordering when the realtime tier is saturated
 * (see `WS_MAX_SUBSCRIPTIONS` in `kis-constraints.ts`).
 */
export interface Favorite {
  ticker: string;
  tier: Tier;
  addedAt: string;
}

/**
 * Subscription tier for a ticker.
 * - 'realtime': subscribed via KIS WebSocket (capped by `WS_MAX_SUBSCRIPTIONS`).
 * - 'polling':  refreshed on the REST polling cycle.
 */
export type Tier = 'realtime' | 'polling';

/**
 * The current market phase, driving SSE status payloads and server scheduling.
 * - 'pre-open':  integrated-feed warmup window (07:55 KST onward), snapshot-only.
 * - 'open':      08:00–20:00 KST, integrated live tick stream active.
 * - 'closed':    post-close (20:05 KST onward), snapshot-only.
 * - 'snapshot':  cold-start before any live tick, used during initial render
 *                and on reconnect until the first fresh tick arrives.
 */
export type MarketStatus = 'pre-open' | 'open' | 'closed' | 'snapshot';

export type PriceSource = 'rest' | 'ws-krx' | 'ws-integrated' | 'ws-nxt';

export type VolumeBaselineStatus = 'collecting' | 'ready' | 'unavailable';

/**
 * A live-or-snapshot price point for a single ticker.
 * `isSnapshot` flags whether this value came from the warm snapshot store
 * (last persisted value) rather than a fresh WebSocket / REST tick.
 *
 * `updatedAt` is an ISO-8601 UTC timestamp (e.g. '2026-04-21T05:30:00.000Z').
 *
 * `changeAbs` is the signed 전일 대비 (원 단위). Sourced from KIS `prdy_vrss`
 * which is already signed (e.g. "-5000"). Optional + nullable so warm-start
 * snapshots that pre-date this field stay backward-compatible — clients
 * should render '-' or omit when null.
 */
export interface Price {
  ticker: string;
  price: number;
  changeRate: number;
  changeAbs?: number | null;
  volume: number;
  volumeSurgeRatio?: number | null;
  volumeBaselineStatus?: VolumeBaselineStatus;
  updatedAt: string;
  isSnapshot: boolean;
  source?: PriceSource;
}

/**
 * A row in the `price_snapshots` SQLite table — the persisted form of `Price`
 * used for warm-starts across restarts (every 30 minutes and at shutdown).
 */
export interface PriceSnapshot {
  ticker: string;
  price: number;
  changeRate: number;
  volume: number;
  snapshotAt: string;
}

// === SSE event schema =====================================================
// Shared contract for `src/server/sse/*` event emission.
// All events carry a monotonic `id` so consumers can detect gaps and request
// a fresh snapshot on reconnect via `Last-Event-ID`.

/** A single-ticker price update pushed during live market hours. */
export interface PriceUpdateEvent {
  type: 'price-update';
  id: number;
  price: Price;
}

/**
 * A full snapshot of all tracked tickers. Sent on initial connection AND on
 * reconnect — consumers should replace their price store wholesale to avoid stale state.
 */
export interface SnapshotEvent {
  type: 'snapshot';
  id: number;
  prices: Price[];
  marketStatus: MarketStatus;
}

/** Periodic keepalive to defeat proxy idle timeouts. */
export interface HeartbeatEvent {
  type: 'heartbeat';
  id: number;
}

/**
 * A server-side error surfaced over SSE.
 * `retryable` hints at whether callers should display a retry affordance.
 */
export interface ServerErrorEvent {
  type: 'error';
  id: number;
  code: string;
  message: string;
  retryable: boolean;
}

/**
 * Discriminated union over every event the server may emit on `/events`.
 * Narrow on `type` at the call site to get exhaustive handling.
 */
export type SSEEvent =
  | PriceUpdateEvent
  | SnapshotEvent
  | HeartbeatEvent
  | ServerErrorEvent;
