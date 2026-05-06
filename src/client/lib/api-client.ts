/**
 * Thin REST client for the Fastify backend.
 *
 * Every server route returns `{success: true, data: …}` or `{success: false, error: …}`
 * — `unwrap` collapses that envelope into a typed `data` value or throws
 * `ApiError` for the non-success branch. The throw carries the HTTP status so
 * Bootstrap and useSSE can map status codes to friendly Korean copy.
 */

import type {
  CandleApiResponse,
  CandleInterval,
  Favorite,
  Stock,
} from '@shared/types';
import type { SessionRealtimeCap } from './realtime-session-control';

interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

interface FailureEnvelope {
  success: false;
  error: unknown;
}

type Envelope<T> = SuccessEnvelope<T> | FailureEnvelope;

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function unwrap<T>(res: Response): Promise<T> {
  const text = await res.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ApiError(res.status, `Non-JSON response from ${res.url}`, text);
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, `${res.status} ${res.statusText}`, parsed);
  }

  // Some endpoints (e.g. GET /themes) return a raw array. Detect the envelope
  // shape and pass through if it's missing.
  if (parsed !== null && typeof parsed === 'object' && 'success' in parsed) {
    const env = parsed as Envelope<T>;
    if (env.success) return env.data;
    throw new ApiError(res.status, 'API returned success: false', env.error);
  }

  return parsed as T;
}

// === Endpoints ============================================================

export async function getStocks(): Promise<Stock[]> {
  const res = await fetch('/stocks');
  return unwrap<Stock[]>(res);
}

/**
 * Remove a tracked stock. Server cascades the FK so favorites/tags/prices
 * for this ticker are wiped server-side. Master catalog is independent.
 */
export async function removeStock(ticker: string): Promise<void> {
  const res = await fetch(`/stocks/${encodeURIComponent(ticker)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, `${res.status} ${res.statusText}`, text);
  }
}

export type CandleRange = '1d' | '1w' | '1m' | '3m' | '6m' | '1y';
export type DailyBackfillRange = '1m' | '3m' | '6m' | '1y';

export interface ServerRuntimeSettings {
  pollingCycleDelayMs: number;
  pollingMaxInFlight: number;
  pollingMinStartGapMs: number;
  pollingStartJitterMs: number;
  rateLimiterMode: 'live' | 'paper';
  websocketEnabled: boolean;
  applyTicksToPriceStore: boolean;
  backgroundDailyBackfillEnabled: boolean;
  backgroundDailyBackfillRange: DailyBackfillRange;
}

export async function getStockCandles(
  ticker: string,
  options: {
    interval: CandleInterval;
    range: CandleRange;
  },
): Promise<CandleApiResponse> {
  const params = new URLSearchParams({
    interval: options.interval,
    range: options.range,
  });
  const res = await fetch(`/stocks/${encodeURIComponent(ticker)}/candles?${params.toString()}`);
  return unwrap<CandleApiResponse>(res);
}

export async function backfillStockCandles(
  ticker: string,
  options: {
    interval: '1d';
    range: DailyBackfillRange;
  },
): Promise<{
  ticker: string;
  requested: number;
  inserted: number;
  updated: number;
  source: 'kis-daily';
}> {
  const res = await fetch(`/stocks/${encodeURIComponent(ticker)}/candles/backfill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  return unwrap<{
    ticker: string;
    requested: number;
    inserted: number;
    updated: number;
    source: 'kis-daily';
  }>(res);
}

export async function getServerSettings(): Promise<ServerRuntimeSettings> {
  const res = await fetch('/settings');
  return unwrap<ServerRuntimeSettings>(res);
}

export async function updateServerSettings(
  settings: ServerRuntimeSettings,
): Promise<ServerRuntimeSettings> {
  const res = await fetch('/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  return unwrap<ServerRuntimeSettings>(res);
}

// === Themes (sector catalog) ==============================================

export interface ThemeSummary {
  id: string;
  name: string;
  description?: string;
  stockCount: number;
}

export interface ThemeDetail {
  id: string;
  name: string;
  description?: string;
  stocks: Stock[];
}

export async function getThemes(): Promise<ThemeSummary[]> {
  const res = await fetch('/themes');
  return unwrap<ThemeSummary[]>(res);
}

export async function getTheme(id: string): Promise<ThemeDetail> {
  const res = await fetch(`/themes/${encodeURIComponent(id)}`);
  return unwrap<ThemeDetail>(res);
}

/**
 * Convenience: fetch the theme summary list, then fan out to fetch each
 * theme's full stock list in parallel. Returns one ThemeDetail per theme,
 * preserving the order of `/themes`.
 */
export async function getThemesWithStocks(): Promise<ThemeDetail[]> {
  const summaries = await getThemes();
  return Promise.all(summaries.map((s) => getTheme(s.id)));
}

export async function getFavorites(): Promise<Favorite[]> {
  const res = await fetch('/favorites');
  return unwrap<Favorite[]>(res);
}

export async function addFavorite(ticker: string): Promise<{ ticker: string; tier: 'realtime' | 'polling' }> {
  const res = await fetch('/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticker }),
  });
  return unwrap<{ ticker: string; tier: 'realtime' | 'polling' }>(res);
}

export async function removeFavorite(ticker: string): Promise<void> {
  const res = await fetch(`/favorites/${ticker}`, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, `${res.status} ${res.statusText}`, text);
  }
}

// === Runtime realtime status ===============================================

export interface RealtimeStatusPayload {
  configured: boolean;
  runtimeStatus: 'unconfigured' | 'starting' | 'started' | 'failed';
  state: 'idle' | 'connecting' | 'connected' | 'degraded' | 'disabled' | 'manual-disabled';
  source: 'integrated';
  websocketEnabled: boolean;
  applyTicksToPriceStore: boolean;
  canApplyTicksToPriceStore: boolean;
  subscribedTickerCount: number;
  subscribedTickers: string[];
  reconnectAttempts: number;
  nextReconnectAt: string | null;
  lastConnectedAt: string | null;
  lastTickAt: string | null;
  parsedTickCount: number;
  appliedTickCount: number;
  ignoredStaleTickCount: number;
  sessionLimitIgnoredCount: number;
  parseErrorCount: number;
  applyErrorCount: number;
  approvalKey: {
    status: 'none' | 'issuing' | 'ready' | 'failed' | 'unknown';
    issuedAt: string | null;
  };
  sessionRealtimeEnabled: boolean;
  sessionApplyTicksToPriceStore: boolean;
  sessionCap: number | null;
  sessionSource: 'integrated';
  sessionEnabledAt: string | null;
  sessionTickers: string[];
  session: {
    enabled: boolean;
    applyEnabled: boolean;
    cap: number | null;
    source: 'integrated';
    enabledAt: string | null;
    tickers: string[];
    maxSessionMs: number;
    expiresAt: string | null;
    maxAppliedTicks: number | null;
    maxParsedTicks: number | null;
    parsedTickCountAtSessionStart: number;
    appliedTickCountAtSessionStart: number;
    sessionAppliedTickCount: number;
    sessionParsedTickCount: number;
    sessionLimitIgnoredCount: number;
    parsedTickDelta: number;
    appliedTickDelta: number;
    endReason:
      | 'time_limit_reached'
      | 'applied_tick_limit_reached'
      | 'parsed_tick_limit_reached'
      | 'no_live_tick_observed'
      | 'safe_error'
      | 'operator_disabled'
      | null;
  };
  readiness: {
    cap1Ready: boolean;
    cap3Ready: boolean;
    cap5Ready: boolean;
    cap10RouteReady: boolean;
    cap10UiPathReady: boolean;
    cap10UiHardLimitReady: boolean;
    cap10UiHardLimitConditional: boolean;
    verifiedCaps: number[];
    nextCandidateCap: 20;
    cap20Readiness: {
      status: 'not_ready' | 'verified';
      blockers: string[];
      warnings: string[];
      sessionLimit?: {
        maxAppliedTicks: number;
        maxParsedTicks: number;
        maxSessionMs: number;
      };
    };
    cap20Preview: {
      requestedCap: number;
      effectiveCap: number;
      candidateCount: number;
      shortage: number;
      tickers: string[];
      usesFavoritesOnly: true;
    };
    cap40Readiness: {
      status: 'not_ready' | 'verified';
      blockers: string[];
      warnings: string[];
      sessionLimit?: {
        maxAppliedTicks: number;
        maxParsedTicks: number;
        maxSessionMs: number;
      };
    };
    readyForCap20: boolean;
    readyForCap40: boolean;
    blockers: string[];
    warnings: string[];
  };
  runtimeError?: {
    code: string;
    message: string;
  };
}

export async function getRealtimeStatus(): Promise<RealtimeStatusPayload> {
  const res = await fetch('/runtime/realtime/status');
  return unwrap<RealtimeStatusPayload>(res);
}

export interface RealtimeSessionStatePayload {
  outcome?: 'enabled' | 'no_candidates';
  sessionRealtimeEnabled: boolean;
  sessionApplyTicksToPriceStore: boolean;
  sessionCap: number | null;
  sessionSource: 'integrated';
  sessionEnabledAt: string | null;
  sessionTickers: string[];
  sessionMaxSessionMs: number;
  sessionExpiresAt: string | null;
  sessionMaxAppliedTicks: number | null;
  sessionMaxParsedTicks: number | null;
  sessionEndReason:
    | 'time_limit_reached'
    | 'applied_tick_limit_reached'
    | 'parsed_tick_limit_reached'
    | 'no_live_tick_observed'
    | 'safe_error'
    | 'operator_disabled'
    | null;
}

export async function enableRealtimeSession(
  request: { cap: SessionRealtimeCap; confirm: true; maxSessionMs?: number },
): Promise<RealtimeSessionStatePayload> {
  const res = await fetch('/runtime/realtime/session-enable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return unwrap<RealtimeSessionStatePayload>(res);
}

export async function disableRealtimeSession(): Promise<RealtimeSessionStatePayload> {
  const res = await fetch('/runtime/realtime/session-disable', {
    method: 'POST',
  });
  return unwrap<RealtimeSessionStatePayload>(res);
}

export interface RealtimeEmergencyDisablePayload {
  state: 'manual-disabled';
  persistedSettingsChanged: boolean;
}

export async function emergencyDisableRealtime(): Promise<RealtimeEmergencyDisablePayload> {
  const res = await fetch('/runtime/realtime/emergency-disable', {
    method: 'POST',
  });
  return unwrap<RealtimeEmergencyDisablePayload>(res);
}

// === Imports ==============================================================

export interface KisWatchlistImportResult {
  imported: number;
  skipped: number;
  groups: string[];
}

// === Master catalog =======================================================

export interface MasterStockEntry {
  ticker: string;
  name: string;
  market: 'KOSPI' | 'KOSDAQ';
  standardCode: string | null;
  marketCapTier: string | null;
}

export interface MasterListPayload {
  items: MasterStockEntry[];
  refreshedAt: string | null;
  rowCount: number;
  fresh: boolean;
  stale: boolean;
  source: string;
}

export interface MasterRefreshStatus {
  status: 'idle' | 'running' | 'success' | 'failed';
  refreshedAt: string | null;
  rowCount: number;
  lastError: string | null;
  fresh: boolean;
  stale: boolean;
}

export async function getMasterList(): Promise<MasterListPayload> {
  const res = await fetch('/master/list');
  return unwrap<MasterListPayload>(res);
}

export async function refreshMaster(): Promise<MasterRefreshStatus> {
  const res = await fetch('/master/refresh', { method: 'POST' });
  return unwrap<MasterRefreshStatus>(res);
}

export interface FromMasterResult {
  stock: Stock;
  created: boolean;
}

export async function addStockFromMaster(
  ticker: string,
): Promise<FromMasterResult> {
  const res = await fetch('/stocks/from-master', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticker }),
  });
  return unwrap<FromMasterResult>(res);
}

/**
 * Pull the user's KIS HTS/MTS watchlist groups and merge new tickers into
 * the local catalog. The polling scheduler reads `stockRepo.findAll()` each
 * cycle, so imported tickers begin receiving price updates on the next
 * cycle without an explicit reload hook on the server.
 */
export async function importKisWatchlist(): Promise<KisWatchlistImportResult> {
  const res = await fetch('/import/kis-watchlist', { method: 'POST' });
  const text = await res.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ApiError(res.status, `Non-JSON from /import/kis-watchlist`, text);
    }
  }
  if (!res.ok) {
    // The 502 path includes a Korean `hint` and a KIS-side `cause` — surface
    // them to the user instead of the bare HTTP status. Fall back gracefully
    // for shapes we don't recognize.
    let message = `${res.status} ${res.statusText}`;
    if (parsed !== null && typeof parsed === 'object') {
      const obj = parsed as { hint?: unknown; cause?: unknown; detail?: unknown };
      const parts: string[] = [];
      if (typeof obj.hint === 'string') parts.push(obj.hint);
      if (typeof obj.cause === 'string') parts.push(obj.cause);
      else if (typeof obj.detail === 'string') parts.push(obj.detail);
      if (parts.length > 0) message = parts.join(' — ');
    }
    throw new ApiError(res.status, message, parsed);
  }
  return parsed as KisWatchlistImportResult;
}
