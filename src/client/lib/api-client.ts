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
  LocalBackupPayload,
  LocalRestoreResult,
  PriceHistoryApiResponse,
  MarketTapeSummary,
  MarketTopMoversMarket,
  MarketTopMoversResponse,
  Price,
  Stock,
  AgentEventNotificationPayload,
  AgentEventNotificationType,
  StockDisclosurePage,
  StockNewsPage,
  StockSignalEvent,
  StockSignalOutcomeDashboard,
  TossRealtimeRankingMarket,
  TossRealtimeRankingResponse,
} from '@shared/types';
import type { AraonProductMarket } from '@shared/product-identity';
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

export async function getMarketSummary(): Promise<MarketTapeSummary> {
  const res = await fetch('/market/summary');
  return unwrap<MarketTapeSummary>(res);
}

export async function getMarketTopMovers(
  options: { limit?: number; market?: MarketTopMoversMarket } = {},
): Promise<MarketTopMoversResponse> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.market !== undefined) params.set('market', options.market);
  const query = params.toString();
  const res = await fetch(`/market/top-movers${query.length > 0 ? `?${query}` : ''}`);
  return unwrap<MarketTopMoversResponse>(res);
}

export async function getTossRealtimeRanking(
  options: { limit?: number; market?: TossRealtimeRankingMarket } = {},
): Promise<TossRealtimeRankingResponse> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.market !== undefined) params.set('market', options.market);
  const query = params.toString();
  const res = await fetch(`/market/toss/realtime-ranking${query.length > 0 ? `?${query}` : ''}`);
  return unwrap<TossRealtimeRankingResponse>(res);
}

export interface TossStockSearchItem {
  ticker: string;
  productCode: string;
  krTicker: string | null;
  name: string;
  market: AraonProductMarket;
  tossEligible: boolean;
  kisEligible: boolean;
  chartEligible: boolean;
  quoteEligible: boolean;
  matchType: string | null;
  source: 'toss-public-search';
}

export interface TossStockSearchPayload {
  providerId: 'toss-public';
  fetchedAt: string;
  query: string;
  requestedLimit: number;
  returnedCount: number;
  items: TossStockSearchItem[];
}

export async function searchTossStocks(
  query: string,
  limit: number = 8,
): Promise<TossStockSearchPayload> {
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('limit', String(limit));
  const res = await fetch(`/market/toss/search?${params.toString()}`);
  return unwrap<TossStockSearchPayload>(res);
}

// === Toss auth/realtime controls ==========================================

export type TossSessionState =
  | 'logged_out'
  | 'session_scoped'
  | 'persistent'
  | 'expiring'
  | 'expired';

export interface TossSessionStatusPayload {
  configured: boolean;
  state: TossSessionState;
  provider: 'toss' | null;
  persistent: boolean;
  cookieCount: number;
  localStorageKeyCount: number;
  sessionStorageKeyCount: number;
  retrievedAt: string | null;
  expiresAt: string | null;
  serverExpiresAt: string | null;
  effectiveExpiresAt: string | null;
  expiresInMs: number | null;
}

export type TossLoginJobState =
  | 'idle'
  | 'starting'
  | 'waiting_for_qr'
  | 'waiting_for_persistent'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface TossLoginStatusPayload {
  state: TossLoginJobState;
  startedAt: string | null;
  updatedAt: string | null;
  finishedAt: string | null;
  message: string | null;
  persistent: boolean;
  cookieCount: number;
  localStorageKeyCount: number;
  sessionStorageKeyCount: number;
  expiresAt: string | null;
  missingCookieCount: number;
  missingLocalStorageKeyCount: number;
}

export type TossSessionExtensionState =
  | 'succeeded'
  | 'failed'
  | 'timeout'
  | 'rejected';

export interface TossSessionExtensionPayload {
  state: TossSessionExtensionState;
  requestedAt: string;
  finishedAt: string;
  serverExpiresAt: string | null;
  approvalState: string | null;
}

export type TossRealtimeState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'stopped'
  | 'failed';

export interface TossSseStatusPayload {
  state: TossRealtimeState;
  startedAt: string | null;
  updatedAt: string | null;
  stoppedAt: string | null;
  eventCount: number;
  priceRefreshEventCount: number;
  userNotificationEventCount: number;
  priceRefreshDispatchCount: number;
  priceRefreshDispatchFailureCount: number;
  refreshHintCount: number;
  refreshHintDispatchCount: number;
  refreshHintDispatchFailureCount: number;
  refreshHints: Array<{ resource: string; count: number }>;
  eventTypes: Array<{ type: string; count: number }>;
  reconnectCount: number;
  lastEventType: string | null;
  lastStockCode: string | null;
  lastEventAt: string | null;
  lastPriceRefreshAt: string | null;
  lastUserNotificationAt: string | null;
  lastPriceRefreshDispatchAt: string | null;
  lastRefreshHintAt: string | null;
  lastRefreshHintResource: string | null;
  lastRefreshHintTicker: string | null;
  lastError: string | null;
  thinNotificationOnly: boolean;
}

export type TossSseRefreshResource =
  | 'quote'
  | 'pending-orders'
  | 'completed-orders'
  | 'account-summary'
  | 'portfolio-positions'
  | 'user-notifications'
  | 'preferences'
  | 'icons';

export type TossSseRefreshRecordedResult =
  | 'refreshed'
  | 'ignored'
  | 'throttled'
  | 'in_flight'
  | 'failed';

export interface TossSseRefreshResultItem {
  id: string;
  resource: TossSseRefreshResource;
  ticker: string | null;
  sourceType: string;
  receivedAt: string;
  result: TossSseRefreshRecordedResult;
  reason: string;
  recordedAt: string;
  error: string | null;
}

export interface TossSseRefreshResultsPayload {
  items: readonly TossSseRefreshResultItem[];
  returnedCount: number;
}

export async function getTossAuthStatus(): Promise<TossSessionStatusPayload> {
  const res = await fetch('/toss/auth/status');
  return unwrap<TossSessionStatusPayload>(res);
}

export async function clearTossSession(): Promise<TossSessionStatusPayload> {
  const res = await fetch('/toss/auth/session', { method: 'DELETE' });
  return unwrap<TossSessionStatusPayload>(res);
}

export async function extendTossSession(
  timeoutMs = 60_000,
): Promise<TossSessionExtensionPayload> {
  const res = await fetch('/toss/auth/session/extend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeoutMs }),
  });
  return unwrap<TossSessionExtensionPayload>(res);
}

export async function getTossLoginStatus(): Promise<TossLoginStatusPayload | null> {
  const res = await fetch('/toss/auth/login/status');
  return unwrap<TossLoginStatusPayload | null>(res);
}

export async function startTossLogin(timeoutMs = 10 * 60_000): Promise<TossLoginStatusPayload> {
  const res = await fetch('/toss/auth/login/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ headless: false, timeoutMs }),
  });
  return unwrap<TossLoginStatusPayload>(res);
}

export async function cancelTossLogin(): Promise<TossLoginStatusPayload> {
  const res = await fetch('/toss/auth/login/cancel', { method: 'POST' });
  return unwrap<TossLoginStatusPayload>(res);
}

export async function getTossSseStatus(): Promise<TossSseStatusPayload> {
  const res = await fetch('/toss/realtime/status');
  return unwrap<TossSseStatusPayload>(res);
}

export async function getTossSseRefreshResults(
  limit = 20,
): Promise<TossSseRefreshResultsPayload> {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  const res = await fetch(`/toss/realtime/refresh-results?${params.toString()}`);
  return unwrap<TossSseRefreshResultsPayload>(res);
}

export type KisWsSlotSource =
  | 'holding'
  | 'user_pin'
  | 'current_view'
  | 'recent_news'
  | 'recent_disclosure'
  | 'toss_signal'
  | 'agent_candidate'
  | 'manual_watchlist'
  | 'top100_rotation';

export interface KisWsSlotCandidatePayload {
  ticker: string;
  state: 'subscribed' | 'fallback';
  source: KisWsSlotSource;
  reason: string;
  score: number;
  ttlMs: number | null;
  lastSeenAt: string;
  pinned: boolean;
}

export interface KisWsSlotRebalancePayload {
  requestedAt: string;
  reason: string;
  outcome: 'rebalanced' | 'unchanged' | 'skipped' | 'no_candidates';
  skipReason: string | null;
  activeCount: number | null;
  fallbackCount: number | null;
  diff: {
    subscribe: string[];
    unsubscribe: string[];
  } | null;
}

export interface KisWsSlotStatusPayload {
  enabled: boolean;
  provider: 'kis';
  perProfileCap: number;
  activeCount: number;
  fallbackCount: number;
  churnCooldownMs: number;
  diff: {
    subscribe: string[];
    unsubscribe: string[];
  };
  lastRebalance?: KisWsSlotRebalancePayload | null;
  candidates: KisWsSlotCandidatePayload[];
}

export async function getKisWsSlotStatus(
  currentTicker?: string | null,
): Promise<KisWsSlotStatusPayload> {
  const params = new URLSearchParams();
  if (currentTicker !== undefined && currentTicker !== null && currentTicker.trim().length > 0) {
    params.set('currentTicker', currentTicker.trim().toUpperCase());
  }
  const qs = params.toString();
  const res = await fetch(`/runtime/realtime/kis-ws-slots${qs.length > 0 ? `?${qs}` : ''}`);
  return unwrap<KisWsSlotStatusPayload>(res);
}

export async function startTossSse(): Promise<TossSseStatusPayload> {
  const res = await fetch('/toss/realtime/start', { method: 'POST' });
  return unwrap<TossSseStatusPayload>(res);
}

export async function stopTossSse(): Promise<TossSseStatusPayload> {
  const res = await fetch('/toss/realtime/stop', { method: 'POST' });
  return unwrap<TossSseStatusPayload>(res);
}

export interface AgentEventMonitorStatusPayload {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  maxTickersPerCycle: number;
  providerCooldownMs: number;
  dispatchPolicy: AgentEventMonitorDispatchPolicyPayload;
  watchPolicy: {
    sources: readonly AgentEventMonitorWatchSourcePayload[];
    fullMarket: false;
  };
  providers: {
    news: boolean;
    tossNews: boolean;
    tossSignal: boolean;
    disclosure: boolean;
  };
  providerPolicies: AgentEventMonitorProviderPoliciesPayload;
  providerStates: {
    news: AgentEventMonitorProviderStatePayload;
    tossNews: AgentEventMonitorProviderStatePayload;
    tossSignal: AgentEventMonitorProviderStatePayload;
    disclosure: AgentEventMonitorProviderStatePayload;
  };
  providerObservations: AgentEventMonitorProviderObservationsPayload;
  tossSignalContract: AgentEventMonitorTossSignalContractPayload;
  cycleCount: number;
  watchedTickers: readonly string[];
  watchedCandidates: readonly AgentEventMonitorWatchCandidatePayload[];
  lastCycleAt: string | null;
  lastCycleDurationMs: number | null;
  lastSkippedRefreshes: number;
  lastErrorCode: string | null;
}

export type AgentEventMonitorWatchSourcePayload = 'favorite' | 'agent_event' | 'tracked';

export interface AgentEventMonitorDispatchPolicyPayload {
  mode: 'best_effort_after_first_seen';
  targetFirstSeenToDispatchMs: {
    min: number;
    max: number;
  };
  providerPublicationGuarantee: false;
  autoPollingRequiresOptIn: true;
  fullMarketPolling: false;
}

export interface AgentEventMonitorProviderPolicyPayload {
  enabled: boolean;
  cooldownMs: number;
  freshness: 'published_at_when_available';
  firstSeen: 'araon_observed_at';
}

export interface AgentEventMonitorProviderPoliciesPayload {
  news: AgentEventMonitorProviderPolicyPayload;
  tossNews: AgentEventMonitorProviderPolicyPayload;
  tossSignal: AgentEventMonitorProviderPolicyPayload;
  disclosure: AgentEventMonitorProviderPolicyPayload;
}

export interface AgentEventMonitorProviderStatePayload {
  enabled: boolean;
  reason:
    | 'refresh-ready'
    | 'session-gated'
    | 'session-required'
    | 'request-body-template-configured'
    | 'request-body-template-missing'
    | 'dart-configured'
    | 'dart-not-configured'
    | 'disclosure-store-missing';
}

export type AgentEventMonitorProviderObservationOutcomePayload =
  | 'refreshed'
  | 'skipped_cooldown'
  | 'failed'
  | null;

export interface AgentEventMonitorProviderObservationPayload {
  lastAttemptedAt: string | null;
  lastDurationMs: number | null;
  lastOutcome: AgentEventMonitorProviderObservationOutcomePayload;
  lastInsertedEvents: number;
  lastErrorCode: string | null;
}

export interface AgentEventMonitorProviderObservationsPayload {
  news: AgentEventMonitorProviderObservationPayload;
  tossNews: AgentEventMonitorProviderObservationPayload;
  tossSignal: AgentEventMonitorProviderObservationPayload;
  disclosure: AgentEventMonitorProviderObservationPayload;
}

export interface AgentEventMonitorTossSignalContractPayload {
  endpoint: {
    method: 'POST';
    host: 'wts-info-api.tossinvest.com';
    path:
      | '/api/v2/dashboard/wts/overview/signals'
      | '/api/v1/dashboard/intelligences/all';
  };
  bodyContract: 'capture_required' | 'configured';
  captureRequired: boolean;
  externalCallsEnabled: boolean;
  requestBodyTemplateSource: 'ARAON_TOSS_SIGNAL_REQUEST_BODY_TEMPLATE';
  rawTemplateExposed: false;
  shapeProbeCandidates: readonly AgentEventMonitorTossSignalShapeProbeCandidatePayload[];
  semanticPolicy: AgentEventMonitorTossSignalSemanticPolicyPayload;
  captureGuidance: AgentEventMonitorTossSignalCaptureGuidancePayload;
  reference: 'tossinvest-cli rpc-catalog';
}

export interface AgentEventMonitorTossSignalShapeProbeCandidatePayload {
  method: 'GET';
  host:
    | 'wts-info-api.tossinvest.com'
    | 'wts-cert-api.tossinvest.com';
  path: '/api/v1/trading/analysis/productCode/{productCode}';
  purpose: 'shape_probe_only';
  rawPayloadExposed: false;
  rawSessionExposed: false;
}

export interface AgentEventMonitorTossSignalSemanticPolicyPayload {
  emptyResponse: 'supported_empty_not_actionable';
  eventEmission: 'non_empty_items_only';
  agentEventType: 'toss_signal_detected';
  rawPayloadExposed: false;
}

export interface AgentEventMonitorTossSignalCaptureGuidancePayload {
  required: boolean;
  requiresUserLoginForCapture: boolean;
  requiresDevToolsForCapture: boolean;
  rawTemplateExposed: false;
  nextAction: 'user-assisted-capture-required' | 'configured';
}

export interface AgentEventMonitorWatchCandidatePayload {
  ticker: string;
  name: string;
  source: 'favorite' | 'agent_event' | 'tracked';
  reason: string;
}

export interface AgentEventMonitorRunResult {
  state: 'disabled' | 'completed';
  reason: string;
  tickers: string[];
  refreshedNews: number;
  refreshedTossNews: number;
  refreshedTossSignals: number;
  refreshedDisclosures: number;
  skippedRefreshes: number;
  insertedEvents: number;
}

export async function getAgentEventMonitorStatus(): Promise<AgentEventMonitorStatusPayload> {
  const res = await fetch('/agent/event-monitor/status');
  return unwrap<AgentEventMonitorStatusPayload>(res);
}

export async function runAgentEventMonitorTick(): Promise<AgentEventMonitorRunResult> {
  const res = await fetch('/agent/event-monitor/tick', { method: 'POST' });
  return unwrap<AgentEventMonitorRunResult>(res);
}

export async function startAgentEventMonitor(): Promise<AgentEventMonitorStatusPayload> {
  const res = await fetch('/agent/event-monitor/start', { method: 'POST' });
  return unwrap<AgentEventMonitorStatusPayload>(res);
}

export async function stopAgentEventMonitor(): Promise<AgentEventMonitorStatusPayload> {
  const res = await fetch('/agent/event-monitor/stop', { method: 'POST' });
  return unwrap<AgentEventMonitorStatusPayload>(res);
}

export type AgentEventPayload = AgentEventNotificationPayload;

export interface AgentEventsSnapshotPayload {
  items: AgentEventPayload[];
  returnedCount: number;
}

export async function getAgentEvents(limit = 20): Promise<AgentEventsSnapshotPayload> {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  const res = await fetch(`/agent/events?${params.toString()}`);
  return unwrap<AgentEventsSnapshotPayload>(res);
}

export interface AgentEventAlertDeliveryPayload {
  id: string;
  eventId: string;
  eventType: AgentEventNotificationType;
  ticker: string;
  channel: 'browser-sse';
  target: 'local-ui';
  status: 'dispatched' | 'skipped_no_client';
  clientCount: number;
  dispatchLatencyMs: number;
  reason: string;
  createdAt: string;
}

export interface AgentEventAlertDeliverySummaryPayload {
  targetFirstSeenToDispatchMs: number;
  totalCount: number;
  dispatchedCount: number;
  skippedNoClientCount: number;
  dispatchedWithinTargetCount: number;
  dispatchedLateCount: number;
  lastDispatchLatencyMs: number | null;
  maxDispatchLatencyMs: number | null;
}

export interface AgentEventAlertDeliveriesPayload {
  items: AgentEventAlertDeliveryPayload[];
  returnedCount: number;
  summary: AgentEventAlertDeliverySummaryPayload;
}

export async function getAgentEventAlertDeliveries(
  limit = 20,
): Promise<AgentEventAlertDeliveriesPayload> {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  const res = await fetch(`/agent/event-alert-deliveries?${params.toString()}`);
  return unwrap<AgentEventAlertDeliveriesPayload>(res);
}

export interface TossSettlementBucket {
  date: string | null;
  krw: number;
  usd: number;
}

export interface TossAccountMarketSummary {
  market: string;
  pendingBuyOrderAmount: number;
  evaluatedAmount: number;
  principalAmount: number;
  evaluatedProfitAmount: number;
  profitRate: number;
  totalAssetAmount: number;
  orderableAmountKrw: number;
  orderableAmountUsd: number;
}

export interface TossAccountSummaryPayload {
  provider: 'toss';
  fetchedAt: string;
  totalAssetAmount: number;
  evaluatedProfitAmount: number;
  profitRate: number;
  orderableAmountKrw: number;
  orderableAmountUsd: number;
  withdrawable: {
    kr: readonly TossSettlementBucket[];
    us: readonly TossSettlementBucket[];
  };
  markets: Readonly<Record<string, TossAccountMarketSummary>>;
}

export interface TossPortfolioPosition {
  productCode: string;
  symbol: string;
  name: string;
  marketType: string;
  marketCode: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  profitRate: number;
  dailyProfitLoss: number;
  dailyProfitRate: number;
  averagePriceUsd: number;
  currentPriceUsd: number;
  marketValueUsd: number;
  unrealizedPnlUsd: number;
  profitRateUsd: number;
  dailyProfitLossUsd: number;
  dailyProfitRateUsd: number;
}

export interface TossPortfolioPositionsPayload {
  provider: 'toss';
  fetchedAt: string;
  positions: readonly TossPortfolioPosition[];
}

export interface TossPendingOrderItem {
  ref: string;
  symbol: string;
  name: string;
  market: string;
  side: string;
  status: string;
  quantity: number;
  originalQuantity: number;
  price: number;
  orderedDate: string | null;
  submittedAt: string | null;
}

export interface TossPendingOrdersPayload {
  provider: 'toss';
  fetchedAt: string;
  orders: readonly TossPendingOrderItem[];
}

export type TossOrdersMarket = 'kr' | 'us' | 'all';

export interface TossCompletedOrderItem {
  ref: string;
  symbol: string;
  name: string;
  market: string;
  side: string;
  status: string;
  quantity: number;
  filledQuantity: number;
  price: number;
  averageExecutionPrice: number;
  orderedDate: string | null;
  submittedAt: string | null;
}

export interface TossCompletedOrdersRange {
  market: TossOrdersMarket;
  from: string;
  to: string;
  size: number;
  number: number;
}

export interface TossCompletedOrdersPayload {
  provider: 'toss';
  fetchedAt: string;
  range: TossCompletedOrdersRange;
  orders: readonly TossCompletedOrderItem[];
}

export type TossOrderDetailKind = 'pending' | 'completed';

export interface TossOrderDetailPayload {
  provider: 'toss';
  fetchedAt: string;
  ref: string;
  kind: TossOrderDetailKind;
  range?: TossCompletedOrdersRange;
  order: TossPendingOrderItem | TossCompletedOrderItem;
}

export interface TossCompletedOrdersOptions {
  market?: TossOrdersMarket;
  from?: string;
  to?: string;
  size?: number;
  number?: number;
}

export type TossTransactionsMarket = 'kr' | 'us';
export type TossTransactionsFilter = 'all' | 'trade' | 'cash' | 'inout' | 'cash-alt';

export interface TossTransactionItem {
  ref: string;
  market: TossTransactionsMarket;
  category: string;
  type: string;
  code: string;
  displayName: string;
  displayType: string;
  summary: string | null;
  symbol: string;
  name: string;
  currency: 'KRW' | 'USD';
  quantity: number;
  amount: number;
  adjustedAmount: number;
  commissionAmount: number;
  taxAmount: number;
  balanceAmount: number;
  date: string | null;
  dateTime: string | null;
  orderDate: string | null;
  settlementDate: string | null;
  tradeType: string;
  referenceType: string | null;
}

export interface TossTransactionsRange {
  market: TossTransactionsMarket;
  from: string;
  to: string;
  filter: TossTransactionsFilter;
  size: number;
  number: number;
}

export interface TossTransactionsNextPage {
  number: number;
  size: number;
  filters: string;
  type: string;
}

export interface TossTransactionsPayload {
  provider: 'toss';
  fetchedAt: string;
  market: TossTransactionsMarket;
  range: TossTransactionsRange;
  lastPage: boolean;
  next: TossTransactionsNextPage | null;
  items: readonly TossTransactionItem[];
}

export interface TossTransactionsOptions {
  market?: TossTransactionsMarket;
  from?: string;
  to?: string;
  filter?: TossTransactionsFilter;
  size?: number;
  number?: number;
}

export interface TossTransactionSettlementEstimate {
  date: string | null;
  buyAmount: number;
  sellAmount: number;
}

export interface TossTransactionWithdrawableBottomSheetEntry {
  title: string;
  krw: number;
  usd: number;
}

export interface TossTransactionsOverviewPayload {
  provider: 'toss';
  fetchedAt: string;
  market: TossTransactionsMarket;
  orderableAmountKrw: number;
  orderableAmountUsd: number;
  withdrawable: readonly TossSettlementBucket[];
  displayWithdrawable: readonly TossSettlementBucket[];
  deposit: readonly TossSettlementBucket[];
  estimateSettlement: readonly TossTransactionSettlementEstimate[];
  withdrawableBottomSheet: readonly TossTransactionWithdrawableBottomSheetEntry[];
}

export interface TossWatchlistItem {
  ref: string;
  groupRef: string;
  groupName: string;
  productCode: string;
  symbol: string;
  name: string;
  currency: string;
  base: number;
  last: number;
}

export interface TossWatchlistGroup {
  ref: string;
  name: string;
  items: readonly TossWatchlistItem[];
}

export interface TossWatchlistPayload {
  provider: 'toss';
  fetchedAt: string;
  groups: readonly TossWatchlistGroup[];
  items: readonly TossWatchlistItem[];
}

export type AraonWatchlistSyncState =
  | 'toss_synced'
  | 'local_only'
  | 'sync_pending'
  | 'sync_unavailable'
  | 'sync_failed';

export type AraonWatchlistTrackingState =
  | 'tracked'
  | 'waiting'
  | 'not_eligible'
  | 'disabled'
  | 'unknown';

export interface AraonWatchlistItem {
  productCode: string;
  krTicker: string | null;
  symbol: string;
  name: string;
  market: AraonProductMarket;
  currency: 'KRW' | 'USD' | 'UNKNOWN';
  source: 'toss' | 'local' | 'merged';
  syncState: AraonWatchlistSyncState;
  kisEligible: boolean;
  tossEligible: boolean;
  chartEligible: boolean;
  quoteEligible: boolean;
  realtimeTrackingState: AraonWatchlistTrackingState;
  addedAt: string | null;
  groupName: string | null;
  base: number | null;
  last: number | null;
}

export interface AraonWatchlistPayload {
  provider: 'araon-watchlist';
  fetchedAt: string;
  primarySource: 'toss' | 'local';
  status: 'ready' | 'local_fallback';
  warning: { code: 'TOSS_SESSION_REQUIRED' | 'TOSS_READ_FAILED' } | null;
  counts: {
    toss: number;
    local: number;
    merged: number;
    returned: number;
  };
  items: readonly AraonWatchlistItem[];
}

export interface AraonWatchlistMutationInput {
  productCode: string;
  krTicker?: string | null;
  symbol?: string | null;
  name?: string | null;
  market?: AraonProductMarket | null;
  currency?: 'KRW' | 'USD' | 'UNKNOWN' | null;
}

export interface AraonWatchlistMutationResult {
  provider: 'araon-watchlist';
  action: 'added' | 'removed' | 'unchanged' | 'unsupported';
  syncState: AraonWatchlistSyncState;
  reason:
    | 'local_fallback'
    | 'toss_mutation_disabled'
    | 'toss_mutation_succeeded'
    | 'toss_mutation_failed'
    | 'unsupported_product'
    | 'not_found';
  item: AraonWatchlistItem | null;
}

export async function getTossAccountSummary(): Promise<TossAccountSummaryPayload> {
  const res = await fetch('/toss/account/summary');
  return unwrap<TossAccountSummaryPayload>(res);
}

export async function getTossPortfolioPositions(): Promise<TossPortfolioPositionsPayload> {
  const res = await fetch('/toss/portfolio/positions');
  return unwrap<TossPortfolioPositionsPayload>(res);
}

export async function getTossPendingOrders(): Promise<TossPendingOrdersPayload> {
  const res = await fetch('/toss/orders/pending');
  return unwrap<TossPendingOrdersPayload>(res);
}

export async function getTossCompletedOrders(
  options: TossCompletedOrdersOptions = {},
): Promise<TossCompletedOrdersPayload> {
  const params = new URLSearchParams();
  if (options.market !== undefined) params.set('market', options.market);
  if (options.from !== undefined) params.set('from', options.from);
  if (options.to !== undefined) params.set('to', options.to);
  if (options.size !== undefined) params.set('size', String(options.size));
  if (options.number !== undefined) params.set('number', String(options.number));
  const query = params.toString();
  const res = await fetch(`/toss/orders/completed${query.length > 0 ? `?${query}` : ''}`);
  return unwrap<TossCompletedOrdersPayload>(res);
}

export async function getTossOrder(
  ref: string,
  options: TossCompletedOrdersOptions = {},
): Promise<TossOrderDetailPayload> {
  const params = new URLSearchParams();
  if (options.market !== undefined) params.set('market', options.market);
  if (options.from !== undefined) params.set('from', options.from);
  if (options.to !== undefined) params.set('to', options.to);
  if (options.size !== undefined) params.set('size', String(options.size));
  if (options.number !== undefined) params.set('number', String(options.number));
  const query = params.toString();
  const res = await fetch(
    `/toss/orders/${encodeURIComponent(ref)}${query.length > 0 ? `?${query}` : ''}`,
  );
  return unwrap<TossOrderDetailPayload>(res);
}

export async function getTossTransactions(
  options: TossTransactionsOptions = {},
): Promise<TossTransactionsPayload> {
  const params = new URLSearchParams();
  if (options.market !== undefined) params.set('market', options.market);
  if (options.from !== undefined) params.set('from', options.from);
  if (options.to !== undefined) params.set('to', options.to);
  if (options.filter !== undefined) params.set('filter', options.filter);
  if (options.size !== undefined) params.set('size', String(options.size));
  if (options.number !== undefined) params.set('number', String(options.number));
  const query = params.toString();
  const res = await fetch(`/toss/transactions${query.length > 0 ? `?${query}` : ''}`);
  return unwrap<TossTransactionsPayload>(res);
}

export async function getTossTransactionsOverview(
  market: TossTransactionsMarket = 'kr',
): Promise<TossTransactionsOverviewPayload> {
  const params = new URLSearchParams({ market });
  const res = await fetch(`/toss/transactions/overview?${params.toString()}`);
  return unwrap<TossTransactionsOverviewPayload>(res);
}

export async function getTossWatchlist(): Promise<TossWatchlistPayload> {
  const res = await fetch('/toss/watchlist');
  return unwrap<TossWatchlistPayload>(res);
}

export async function getAraonWatchlist(): Promise<AraonWatchlistPayload> {
  const res = await fetch('/watchlist');
  return unwrap<AraonWatchlistPayload>(res);
}

export async function addAraonWatchlistItem(
  input: AraonWatchlistMutationInput,
): Promise<AraonWatchlistMutationResult> {
  const res = await fetch('/watchlist/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return unwrap<AraonWatchlistMutationResult>(res);
}

export async function removeAraonWatchlistItem(
  productCode: string,
): Promise<AraonWatchlistMutationResult> {
  const res = await fetch(`/watchlist/items/${encodeURIComponent(productCode)}`, {
    method: 'DELETE',
  });
  return unwrap<AraonWatchlistMutationResult>(res);
}

export type OrderIntentSide = 'buy' | 'sell';
export type OrderIntentMarket = 'KR' | 'US';
export type OrderIntentOrderType = 'market' | 'limit';
export type OrderIntentRequestedMode = 'simulated' | 'paper' | 'live';
export type OrderIntentLivePolicyMissingConstraint =
  | 'policy_approval'
  | 'allowed_tickers'
  | 'max_order_amount'
  | 'max_daily_loss'
  | 'trading_hours'
  | 'order_type'
  | 'cooldown'
  | 'kill_switch_release';

export type OrderIntentAutomationReadinessGapCode =
  | 'decision_engine'
  | 'strategy_policy'
  | 'risk_policy'
  | 'paper_trading_ledger'
  | 'simulation_result_view'
  | 'toss_order_execution'
  | 'live_approval_executor'
  | 'execution_reconciliation'
  | 'agent_performance_audit'
  | 'intent_explanation'
  | 'provider_freshness'
  | 'event_dedupe';

export type OrderIntentAutomationReadinessGapStatus =
  | 'locked'
  | 'not_ready'
  | 'partial';

export interface OrderIntentAutomationReadinessGapPayload {
  code: OrderIntentAutomationReadinessGapCode;
  status: OrderIntentAutomationReadinessGapStatus;
  severity: 'blocking' | 'warning';
  label: string;
  detail: string;
}

export interface OrderIntentLivePolicyPayload {
  liveExecutionEnabled: false;
  policyApproved: false;
  killSwitch: 'engaged';
  allowedTickers: readonly string[];
  maxOrderKrw: number | null;
  maxDailyLossKrw: number | null;
  tradingHours: null;
  allowedOrderTypes: readonly OrderIntentOrderType[];
  cooldownMs: number | null;
  missingConstraints: readonly OrderIntentLivePolicyMissingConstraint[];
  automationReadinessGaps: readonly OrderIntentAutomationReadinessGapPayload[];
  generatedAt: string;
}

export interface OrderIntentRiskCheckPayload {
  code: string;
  status: 'pass' | 'warning' | 'blocked';
  message: string;
}

export type OrderIntentLifecycleStepCode =
  | 'candidate_observed'
  | 'evidence_collected'
  | 'strategy_evaluated'
  | 'risk_checked'
  | 'preview_created'
  | 'approval_required'
  | 'execution_locked';

export type OrderIntentLifecycleStepStatus =
  | 'complete'
  | 'pending'
  | 'blocked'
  | 'not_ready';

export interface OrderIntentLifecycleStepPayload {
  code: OrderIntentLifecycleStepCode;
  status: OrderIntentLifecycleStepStatus;
  label: string;
  detail: string;
}

export interface OrderIntentPreviewPayload {
  id: string;
  ticker: string;
  side: OrderIntentSide;
  market: OrderIntentMarket;
  requestedMode: Exclude<OrderIntentRequestedMode, 'live'>;
  executionMode: Exclude<OrderIntentRequestedMode, 'live'>;
  status: 'preview_ready';
  liveExecutionLocked: true;
  quantity: number | null;
  cashAmount: number | null;
  orderType: OrderIntentOrderType;
  limitPrice: number | null;
  triggerEventId: string | null;
  agentId: string | null;
  reason: string;
  riskChecks: OrderIntentRiskCheckPayload[];
  lifecycle: readonly OrderIntentLifecycleStepPayload[];
  createdAt: string;
  expiresAt: string;
  auditRef: string;
}

export interface OrderIntentAuditEntryPayload {
  id: string;
  intentId: string | null;
  event:
    | 'preview_created'
    | 'live_execution_blocked'
    | 'confirm_challenge_created'
    | 'confirm_token_verified_live_locked'
    | 'confirm_token_rejected'
    | 'confirm_token_expired';
  decision: 'allowed' | 'blocked';
  ticker: string;
  side: OrderIntentSide;
  requestedMode: OrderIntentRequestedMode;
  agentId: string | null;
  triggerEventId: string | null;
  reason: string;
  createdAt: string;
}

export interface OrderIntentListPayload {
  items: OrderIntentPreviewPayload[];
  returnedCount: number;
}

export interface OrderIntentAuditListPayload {
  items: OrderIntentAuditEntryPayload[];
  returnedCount: number;
}

export type OrderIntentApprovalChallengeStatus =
  | 'pending_confirmation'
  | 'confirmed_live_locked'
  | 'rejected'
  | 'expired';

export interface OrderIntentApprovalChallengePayload {
  id: string;
  intentId: string;
  ticker: string;
  side: OrderIntentSide;
  requestedMode: 'live';
  status: OrderIntentApprovalChallengeStatus;
  confirmationText: string;
  liveExecutionLocked: true;
  operatorId: string | null;
  createdAt: string;
  expiresAt: string;
  confirmedAt: string | null;
  auditRef: string;
}

export interface OrderIntentApprovalChallengeListPayload {
  items: OrderIntentApprovalChallengePayload[];
  returnedCount: number;
}

export interface OrderIntentLivePolicyResponsePayload {
  policy: OrderIntentLivePolicyPayload;
}

export interface CreateOrderIntentPreviewInput {
  ticker: string;
  side: OrderIntentSide;
  market?: OrderIntentMarket;
  quantity?: number | null;
  cashAmount?: number | null;
  orderType?: OrderIntentOrderType;
  limitPrice?: number | null;
  triggerEventId?: string | null;
  agentId?: string | null;
  reason: string;
  requestedMode?: OrderIntentRequestedMode;
}

export interface CreateOrderIntentPreviewPayload {
  preview: OrderIntentPreviewPayload;
}

export interface CreateOrderIntentApprovalChallengePayload {
  challenge: OrderIntentApprovalChallengePayload;
}

export interface ConfirmOrderIntentApprovalChallengePayload {
  challenge: OrderIntentApprovalChallengePayload;
  liveExecutionLocked: true;
  execution: null;
}

export async function createAgentOrderIntentPreview(
  input: CreateOrderIntentPreviewInput,
): Promise<CreateOrderIntentPreviewPayload> {
  const res = await fetch('/agent/order-intents/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return unwrap<CreateOrderIntentPreviewPayload>(res);
}

export async function createAgentOrderIntentApprovalChallenge(
  intentId: string,
): Promise<CreateOrderIntentApprovalChallengePayload> {
  const res = await fetch(
    `/agent/order-intents/${encodeURIComponent(intentId)}/approval-challenge`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
  );
  return unwrap<CreateOrderIntentApprovalChallengePayload>(res);
}

export async function confirmAgentOrderIntentApprovalChallenge(
  challengeId: string,
  confirmationText: string,
): Promise<ConfirmOrderIntentApprovalChallengePayload> {
  const res = await fetch(
    `/agent/order-intents/approval-challenges/${encodeURIComponent(challengeId)}/confirm`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmationText }),
    },
  );
  return unwrap<ConfirmOrderIntentApprovalChallengePayload>(res);
}

export async function getAgentOrderIntents(limit = 20): Promise<OrderIntentListPayload> {
  const params = new URLSearchParams({ limit: String(limit) });
  const res = await fetch(`/agent/order-intents?${params.toString()}`);
  return unwrap<OrderIntentListPayload>(res);
}

export async function getAgentOrderIntentAudit(limit = 20): Promise<OrderIntentAuditListPayload> {
  const params = new URLSearchParams({ limit: String(limit) });
  const res = await fetch(`/agent/order-intents/audit?${params.toString()}`);
  return unwrap<OrderIntentAuditListPayload>(res);
}

export async function getAgentOrderIntentApprovalChallenges(
  limit = 20,
): Promise<OrderIntentApprovalChallengeListPayload> {
  const params = new URLSearchParams({ limit: String(limit) });
  const res = await fetch(`/agent/order-intents/approval-challenges?${params.toString()}`);
  return unwrap<OrderIntentApprovalChallengeListPayload>(res);
}

export async function getAgentOrderIntentLivePolicy(): Promise<OrderIntentLivePolicyResponsePayload> {
  const res = await fetch('/agent/order-intents/live-policy');
  return unwrap<OrderIntentLivePolicyResponsePayload>(res);
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

export async function recordStockSignal(
  ticker: string,
  signal: Omit<StockSignalEvent, 'id' | 'ticker' | 'createdAt' | 'updatedAt'>,
): Promise<StockSignalEvent> {
  const res = await fetch(`/stocks/${encodeURIComponent(ticker)}/signals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signal),
  });
  return unwrap<StockSignalEvent>(res);
}

export async function getStockNews(
  ticker: string,
  options: { limit?: number; offset?: number } = {},
): Promise<StockNewsPage> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));
  const query = params.toString();
  const res = await fetch(
    `/stocks/${encodeURIComponent(ticker)}/news${query.length > 0 ? `?${query}` : ''}`,
  );
  return unwrap<StockNewsPage>(res);
}

export async function getStockDisclosures(
  ticker: string,
  options: { limit?: number; offset?: number } = {},
): Promise<StockDisclosurePage> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));
  const query = params.toString();
  const res = await fetch(
    `/stocks/${encodeURIComponent(ticker)}/disclosures${query.length > 0 ? `?${query}` : ''}`,
  );
  return unwrap<StockDisclosurePage>(res);
}

export async function refreshStockNews(ticker: string): Promise<StockNewsPage> {
  const res = await fetch(`/stocks/${encodeURIComponent(ticker)}/news/refresh`, {
    method: 'POST',
  });
  return unwrap<StockNewsPage>(res);
}

export async function refreshStockDisclosures(ticker: string): Promise<StockDisclosurePage> {
  const res = await fetch(`/stocks/${encodeURIComponent(ticker)}/disclosures/refresh`, {
    method: 'POST',
  });
  return unwrap<StockDisclosurePage>(res);
}

export async function refreshStockQuote(ticker: string): Promise<Price> {
  const res = await fetch(`/stocks/${encodeURIComponent(ticker)}/quote/refresh`, {
    method: 'POST',
  });
  return unwrap<Price>(res);
}

export async function setTossFastQuoteCurrentTickers(
  tickers: readonly string[],
): Promise<{ tickers: string[] }> {
  const res = await fetch('/market/toss/fast-quote/current', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tickers }),
  });
  return unwrap<{ tickers: string[] }>(res);
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
  tossQuotePollingEnabled: boolean;
  tossQuotePollingIntervalMs: number;
  tossQuotePollingBatchSize: number;
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

export async function getStockPriceHistory(
  ticker: string,
  options: {
    range?: '1d';
    from?: string;
    to?: string;
    limit?: number;
  } = {},
): Promise<PriceHistoryApiResponse> {
  const params = new URLSearchParams();
  params.set('range', options.range ?? '1d');
  if (options.from !== undefined) params.set('from', options.from);
  if (options.to !== undefined) params.set('to', options.to);
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  const res = await fetch(
    `/stocks/${encodeURIComponent(ticker)}/price-history?${params.toString()}`,
  );
  return unwrap<PriceHistoryApiResponse>(res);
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
  source: 'kis-daily' | 'toss-daily' | 'mixed';
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
    source: 'kis-daily' | 'toss-daily' | 'mixed';
  }>(res);
}

export async function backfillTodayMinuteCandles(
  ticker: string,
  options: { maxPages?: number } = {},
): Promise<{
  ticker: string;
  requested: number;
  inserted: number;
  updated: number;
  source: 'kis-time-today' | 'toss-time-today' | 'mixed';
  pages: number;
}> {
  const res = await fetch(`/stocks/${encodeURIComponent(ticker)}/candles/backfill-minute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ interval: '1m', maxPages: options.maxPages ?? 4 }),
  });
  return unwrap<{
    ticker: string;
    requested: number;
    inserted: number;
    updated: number;
    source: 'kis-time-today' | 'toss-time-today' | 'mixed';
    pages: number;
  }>(res);
}

export async function ensureStockCandleCoverage(
  ticker: string,
  options: {
    interval: CandleInterval;
    range: CandleRange;
    force?: boolean;
  },
): Promise<{
  state: 'backfilled' | 'current' | 'empty' | 'skipped';
  reason?: string;
  source:
    | 'kis-daily'
    | 'kis-time-daily'
    | 'kis-time-today'
    | 'toss-daily'
    | 'toss-time-daily'
    | 'toss-time-today'
    | 'mixed'
    | null;
  requested: number;
  inserted: number;
  updated: number;
  message: string;
}> {
  const res = await fetch(`/stocks/${encodeURIComponent(ticker)}/candles/ensure-coverage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  return unwrap<{
    state: 'backfilled' | 'current' | 'empty' | 'skipped';
    reason?: string;
    source:
      | 'kis-daily'
      | 'kis-time-daily'
      | 'kis-time-today'
      | 'toss-daily'
      | 'toss-time-daily'
      | 'toss-time-today'
      | 'mixed'
      | null;
    requested: number;
    inserted: number;
    updated: number;
    message: string;
  }>(res);
}

export async function getServerSettings(): Promise<ServerRuntimeSettings> {
  const res = await fetch('/settings');
  return unwrap<ServerRuntimeSettings>(res);
}

export interface CredentialProfileSummary {
  id: string;
  label: string;
  isPaper: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getCredentialProfiles(): Promise<CredentialProfileSummary[]> {
  const res = await fetch('/credentials/profiles');
  const data = await unwrap<{ profiles: CredentialProfileSummary[] }>(res);
  return data.profiles;
}

export interface CredentialsStatusPayload {
  configured: boolean;
  isPaper: boolean | null;
  runtime: 'unconfigured' | 'starting' | 'started' | 'failed';
  error?: { code: string; message: string };
}

export async function getCredentialsStatus(): Promise<CredentialsStatusPayload> {
  const res = await fetch('/credentials/status');
  return unwrap<CredentialsStatusPayload>(res);
}

export async function addCredentialProfile(input: {
  label: string;
  appKey: string;
  appSecret: string;
}): Promise<CredentialProfileSummary> {
  const res = await fetch('/credentials/profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, isPaper: false }),
  });
  return unwrap<CredentialProfileSummary>(res);
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
  source: 'integrated' | 'nxt';
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
  coverage: {
    profileCount: number;
    enabledProfileCount: number;
    activeSessionCount: number;
    perSessionCap: number;
    totalCapacity: number;
    candidateCount: number;
    assignedTickerCount: number;
    fallbackTickerCount: number;
    sessions: Array<{
      profileId: string;
      label: string;
      cap: number;
      assignedTickerCount: number;
      state: 'active' | 'planned' | 'disabled';
    }>;
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
  request: {
    cap: SessionRealtimeCap;
    confirm: true;
    maxSessionMs?: number;
    currentTicker?: string;
  },
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

export interface PhoneNotificationStatusPayload {
  configured: boolean;
  provider: 'telegram';
  mode: 'env';
}

export interface PhoneAlertPayload {
  ticker: string;
  name: string;
  title: string;
  detail: string;
  kind: 'fav-pct' | 'rule';
  direction: 'up' | 'down';
  changePct: number;
}

export async function getPhoneNotificationStatus(): Promise<PhoneNotificationStatusPayload> {
  const res = await fetch('/runtime/notifications/telegram/status');
  return unwrap<PhoneNotificationStatusPayload>(res);
}

export async function sendPhoneNotificationAlert(
  payload: PhoneAlertPayload,
): Promise<{ sent: boolean; reason?: string }> {
  const res = await fetch('/runtime/notifications/telegram/alert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return unwrap<{ sent: boolean; reason?: string }>(res);
}

export async function sendPhoneNotificationTest(): Promise<{ sent: boolean; reason?: string }> {
  const res = await fetch('/runtime/notifications/telegram/test', {
    method: 'POST',
  });
  return unwrap<{ sent: boolean; reason?: string }>(res);
}

interface KisBudgetWindowPayload {
  windowMs: number;
  startedCount: number;
  successCount: number;
  failureCount: number;
  throttleCount: number;
  callPerSec: number;
  successPerSec: number;
  failurePerMin: number;
  throttlePerMin: number;
  byClass: Array<{
    profileId: string;
    endpointClass: string | null;
    priorityClass: string;
    startedCount: number;
    successCount: number;
    failureCount: number;
    throttleCount: number;
    callPerSec: number;
    successPerSec: number;
    failurePerMin: number;
    throttlePerMin: number;
    queueDepth: number;
    currentAllowedRps: number | null;
  }>;
}

export interface RuntimeDataHealthPayload {
  tracking: {
    trackedCount: number;
    favoriteCount: number;
  };
  candles: Array<{
    interval: '1m' | '1d';
    tickerCount: number;
    candleCount: number;
    newestBucketAt: string | null;
  }>;
  backfill: {
    enabled: boolean;
    range: DailyBackfillRange;
    running: boolean;
    lastRunAt: string | null;
    lastFinishedAt: string | null;
    lastAttempted: number;
    lastSucceeded: number;
    lastFailed: number;
    lastSkippedReason:
      | 'disabled'
      | 'market_not_allowed'
      | 'no_tickers'
      | 'no_stale_tickers'
      | 'already_running'
      | 'cooldown'
      | null;
    budgetDateKey: string | null;
    dailyCallCount: number;
    dailyCallBudget: number | null;
    cooldownUntil: string | null;
    cooldownActive: boolean;
    noWorkCooldownCount: number;
    nextNoWorkRetryAt: string | null;
    recent: Array<{
      ticker: string;
      status: 'success' | 'no_change' | 'failed';
      requested: number;
      inserted: number;
      updated: number;
      source: 'kis-daily' | 'toss-daily' | 'mixed' | null;
      finishedAt: string;
      errorCode: string | null;
    }>;
  };
  kisOutboundLimiter: {
    configured: boolean;
    currentState: string;
    ratePerSec: number | null;
    burst: number | null;
    tokens: number | null;
    globalMinStartGapMs: number | null;
    queueDepth: number;
    queuedByPriority: Record<string, number>;
    currentAllowedRps: number | null;
    lastThrottleAt: string | null;
    lastThrottleClass: string | null;
    lastThrottleCode: string | null;
    recoveryAttemptCount: number;
    circuitBreakerUntil: string | null;
    recentThrottleCount: number;
    recentSuccessCount: number;
    budget: {
      generatedAt: string | null;
      riskState: 'idle' | 'safe' | 'busy' | 'recovering' | 'risky' | 'throttled';
      riskLabel: string;
      riskReason: string | null;
      windows: {
        tenSec: KisBudgetWindowPayload;
        sixtySec: KisBudgetWindowPayload;
      };
    };
    aimd: {
      enabled: boolean;
      mode: 'observe_only' | 'active';
      currentPollingMinStartGapMs: number;
      currentPollingRecoveryRatePerSec: number;
      baselinePollingMinStartGapMs: number;
      lastAdjustmentAt: string | null;
      lastAdjustmentDirection: 'increase_gap' | 'decrease_gap' | 'none';
      lastAdjustmentReason: string | null;
      nextEvaluationAt: string | null;
      cleanRegularMarketWindowCount: number;
      degradedWindowCount: number;
      lastDecision: {
        evaluatedAt: string | null;
        source: 'telemetry_snapshot';
        action: string;
        reason: string;
        currentPollingMinStartGapMs: number;
        proposedPollingMinStartGapMs: number;
        applyRuntimeChange: boolean;
      } | null;
      observationWindow: {
        classification: string;
        durationMs: number;
        completedPollingCycles: number;
        throttleCount: number;
        circuitBreakerCount: number;
        throttleImmediatelyAfterNormal: boolean;
        maxRecoveryAttemptCount: number;
        queueStuckAfterRecovery: boolean;
        telemetryMalformed: boolean;
        dataHealthDisagrees: boolean;
        cleanRegularMarketWindowCount: number;
      } | null;
      rollbackBaseline: {
        pollingMinStartGapMs: number;
        pollingRecoveryRatePerSec: number;
      };
    };
    telemetry: {
      capacity: number;
      eventCount: number;
      oldestAt: string | null;
      newestAt: string | null;
      recent: Array<{
        at: string | null;
        event: 'throttle' | 'half_open' | 'recovered' | 'normal' | 'circuit_breaker';
        profileId: string;
        endpointClass: string | null;
        priorityClass: string;
        state: string;
        throttleCode: string | null;
        recoveryAttemptCount: number;
        observedRecoveryMs: number | null;
        currentAllowedRps: number;
        minStartGapMs: number;
        maxInFlight: number;
      }>;
    };
    policies: Array<{
      endpointClass: string;
      priorityClass: string;
      minStartGapMs: number;
      maxInFlight: number;
      recoveryRatePerSec: number;
    }>;
    profiles: Array<{
      profileId: string;
      endpointClass: string | null;
      priorityClass: string;
      state: string;
      cooldownUntil: string | null;
      cooldownActive: boolean;
      firstLimitedAt: string | null;
      lastLimitedAt: string | null;
      recoveredAt: string | null;
      observedRecoveryMs: number | null;
      nextRetryAt: string | null;
      circuitBreakerUntil: string | null;
      lastThrottleCode: string | null;
      recoveryAttemptCount: number;
      recentThrottleCount: number;
      recentSuccessCount: number;
      currentAllowedRps: number;
      minStartGapMs: number;
      maxInFlight: number;
    }>;
  };
  kisRestProfiles: {
    configured: boolean;
    primaryProfileId: string | null;
    profileCount: number;
    eligibleProfileCount: number;
    endpointPolicies: Array<{
      endpointClass: string;
      selection: string;
      failoverEnabled: boolean;
    }>;
    profiles: Array<{
      profileId: string;
      label: string;
      isPaper: boolean;
      enabled: boolean;
      eligible: boolean;
      ineligibleReason: string | null;
      selectedCount: number;
      successCount: number;
      failureCount: number;
      failoverFromCount: number;
      failoverToCount: number;
      lastSelectedAt: string | null;
      lastSuccessAt: string | null;
      lastFailureAt: string | null;
      lastFailureKind: string | null;
      lastFailureCode: string | null;
      lastThrottleAt: string | null;
      governorState: string;
      cooldownActive: boolean;
      activeEndpointClasses: string[];
      currentAllowedRps: number | null;
    }>;
  };
  tossQuotePolling: {
    configured: boolean;
    running: boolean;
    enabled: boolean;
    source: 'toss-public' | null;
    cycleCount: number;
    lastCycleMs: number;
    tickersInCycle: number;
    requestedCount: number;
    returnedCount: number;
    missingCount: number;
    errorCount: number;
    consecutiveFailureCount: number;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastErrorCode: string | null;
    lastMessage: string | null;
    intervalMs: number | null;
    batchSize: number | null;
    suppressingKisPolling: boolean;
  };
  tossFastQuoteLane: {
    configured: boolean;
    running: boolean;
    enabled: boolean;
    source: 'toss-fast-quote' | null;
    intervalMs: number | null;
    targetCap: number | null;
    hardCap: number | null;
    candidateCount: number;
    requestedCount: number;
    returnedCount: number;
    acceptedCount: number;
    droppedUnchangedCount: number;
    droppedStaleCount: number;
    droppedInvalidCount: number;
    skippedInFlightCount: number;
    failureCount: number;
    consecutiveFailureCount: number;
    backoffUntil: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastErrorCode: string | null;
    lastMessage: string | null;
  };
  kisLegacyRest: {
    role: 'optional_fallback';
    runtimeStatus: 'unconfigured' | 'starting' | 'started' | 'failed';
    accountOrderTruthSource: boolean;
    liveTradingTruthSource: boolean;
    realtimeRail: 'kis-ws-only';
    externalCallsWithoutCredentials: boolean;
    surfaces: Array<{
      id:
        | 'foreground-quote-fallback'
        | 'watchlist-polling-fallback'
        | 'daily-chart-fallback'
        | 'minute-chart-fallback'
        | 'master-metadata-refresh'
        | 'kis-watchlist-import';
      label: string;
      state: 'off' | 'available' | 'suppressed';
      mode:
        | 'credentials_required'
        | 'suppressed_by_default'
        | 'explicit_opt_in'
        | 'conditional_fallback'
        | 'manual_only';
      automatic: boolean;
      envGate:
        | 'ARAON_KIS_QUOTE_FALLBACK_ENABLED'
        | 'ARAON_KIS_POLLING_FALLBACK_ENABLED'
        | 'ARAON_KIS_CHART_FALLBACK_ENABLED'
        | 'ARAON_KIS_MASTER_AUTO_REFRESH'
        | null;
      primaryProvider: string;
      reason: string;
    }>;
  };
  marketDataProviders: Array<{
    providerId: 'kis-legacy' | 'toss-public' | 'toss-authenticated';
    label: string;
    status: 'ready' | 'degraded' | 'unavailable';
    requiresAuth: boolean;
    authenticated: boolean;
    capabilities: Array<
      | 'top-movers'
      | 'quote-batch'
      | 'realtime-ranking'
      | 'trade-subscribe'
      | 'daily-candles'
      | 'stock-metadata'
      | 'search'
    >;
    lastErrorCode: string | null;
    lastErrorAt: string | null;
    message: string | null;
  }>;
  marketTopMovers: {
    configured: boolean;
    status: string;
    source: string | null;
    sourcePhase: string | null;
    sourceLabel: string | null;
    sourceReason: string | null;
    frozen: boolean;
    lastGoodAgeMs: number | null;
    partialReason: string | null;
    stopReason: string | null;
    rankingDiagnostics: {
      gainers: {
        direction: 'gainers' | 'losers';
        pagesAttempted: number;
        rowsReceived: number;
        rowsAccepted: number;
        rowsPerPage: number[];
        continuationValues: Array<string | null>;
        stopReason: string;
        durationMs: number | null;
      } | null;
      losers: {
        direction: 'gainers' | 'losers';
        pagesAttempted: number;
        rowsReceived: number;
        rowsAccepted: number;
        rowsPerPage: number[];
        continuationValues: Array<string | null>;
        stopReason: string;
        durationMs: number | null;
      } | null;
    } | null;
    rankingRateLimited: boolean;
    lastFetchedAt: string | null;
    lastGeneratedAt: string | null;
    cacheAgeMs: number | null;
    cacheTtlMs: number | null;
    staleAfterMs: number | null;
    cooldownUntil: string | null;
    cooldownActive: boolean;
    inflight: boolean;
    lastMessage: string | null;
    lastErrorCode: string | null;
    coverage: {
      requestedLimit: number;
      gainersCount: number;
      losersCount: number;
      gainersComplete: boolean;
      losersComplete: boolean;
      marketUniverse: 'kis-full-market-ranking' | 'toss-web-ranking';
      guaranteedTop100: boolean;
      includesLocalFallback: boolean;
    } | null;
  };
  volumeBaseline: {
    total: number;
    ready: number;
    collecting: number;
    unavailable: number;
  };
  growth: {
    signals: {
      eventCount: number;
      oldestSignalEventAt: string | null;
      newestSignalEventAt: string | null;
      retentionDays: number;
    };
    news: {
      itemCount: number;
      staleItemCount: number;
      oldestFetchedAt: string | null;
      newestFetchedAt: string | null;
      failedFetchCount: number;
      lastFetchStatus: 'success' | 'failed' | null;
      lastFetchErrorCode: string | null;
      lastFetchedAt: string | null;
      ttlHours: number;
      pruneAfterDays: number;
    };
    disclosures: {
      itemCount: number;
      staleItemCount: number;
      oldestFetchedAt: string | null;
      newestFetchedAt: string | null;
      ttlHours: number;
    };
  };
  notifications: {
    phoneConfigured: boolean;
    phoneDeliveryCount: number;
    phoneSentCount: number;
    phoneFailedCount: number;
    phoneSkippedCount: number;
    phoneLastStatus: 'sent' | 'failed' | 'skipped' | null;
    phoneLastAt: string | null;
    phoneLastErrorCode: string | null;
  };
  maintenance: {
    lastRunAt: string | null;
    candlePruneLastRunAt: string | null;
    candlePruneLastError: string | null;
  };
  signalOutcomes: StockSignalOutcomeDashboard;
}

export async function getRuntimeDataHealth(): Promise<RuntimeDataHealthPayload> {
  const res = await fetch('/runtime/data-health');
  return unwrap<RuntimeDataHealthPayload>(res);
}

export async function exportLocalBackup(): Promise<LocalBackupPayload> {
  const res = await fetch('/runtime/backup/export');
  return unwrap<LocalBackupPayload>(res);
}

export async function restoreLocalBackup(
  backup: LocalBackupPayload,
): Promise<LocalRestoreResult> {
  const res = await fetch('/runtime/backup/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(backup),
  });
  return unwrap<LocalRestoreResult>(res);
}

// === Imports ==============================================================

export interface KisWatchlistImportResult {
  imported: number;
  skipped: number;
  groups: string[];
  source: 'kis-legacy-watchlist-import';
  role: 'optional_migration_helper';
  primaryWatchlistProvider: 'toss-watchlist';
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
  source?: 'local' | 'toss-public-search';
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

export async function addStockFromTossSearch(
  ticker: string,
): Promise<FromMasterResult> {
  const res = await fetch('/stocks/from-toss-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticker }),
  });
  return unwrap<FromMasterResult>(res);
}

/**
 * Pull the user's KIS HTS/MTS watchlist groups as a legacy migration helper
 * and merge new tickers into the local catalog. Toss watchlist remains the
 * primary account-aware watchlist provider after Toss login.
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
