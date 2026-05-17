/**
 * App — ARAON dashboard root.
 *
 * Layout (1920px max width, desktop terminal grid):
 *
 *   ┌──────────────── Header (sticky) ────────────────┐
 *   │                                                 │
 *   │  ErrorBanner (fixed overlay)                    │
 *   │                                                 │
 *   │  ┌─ main ───────────────────────────────────────────────┐ │
 *   │  │ [Home 50:50 workspace] [Collapsible account rail]    │ │
 *   │  │  sticky top:84 on wide desktop                       │ │
 *   │  └──────────────────────────────────────────────────────┘ │
 *   │                                                 │
 *   │  StatusBar (sticky)                             │
 *   └─────────────────────────────────────────────────┘
 *
 * Lifecycle:
 *   1. mount → fetch /stocks + /watchlist + /themes (parallel) → seed stores
 *   2. open SSE → live updates flow into stocksStore + surgeStore
 *   3. user toggles fav → optimistic store update + normalized watchlist action
 */

import { Suspense, lazy, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSSE } from './hooks/useSSE';
import { useMarketStore } from './stores/market-store';
import { useStocksStore, buildStockVM } from './stores/stocks-store';
import { useWatchlistStore } from './stores/watchlist-store';
import { useErrorStore } from './stores/error-store';
import { useSettingsStore } from './stores/settings-store';
import { Header } from './components/Header';
import { ErrorBanner } from './components/ErrorBanner';
import { SurgeBlock } from './components/SurgeBlock';
import { FavoritesBlock } from './components/FavoritesBlock';
import { SectionStack } from './components/SectionStack';
import { StatusBar } from './components/StatusBar';
import { SettingsModal } from './components/SettingsModal';
import { ToastStack } from './components/ToastStack';
import { DashboardFocusPanel } from './components/DashboardFocusPanel';
import { AgentEventsRail } from './components/AgentEventsRail';
import { OrderIntentSafetyRail } from './components/OrderIntentSafetyRail';
import { TossAccountRail } from './components/TossAccountRail';
import { useAlertEvaluator } from './hooks/useAlertEvaluator';
import { useMasterStore } from './stores/master-store';
import { fmtClock } from './lib/format';
import {
  ApiError,
  addStockFromMaster,
  addStockFromTossSearch,
  addAraonWatchlistItem,
  createAgentOrderIntentPreview,
  getKisWsSlotStatus,
  getTossCompletedOrders,
  getTossAccountSummary,
  getTossAuthStatus,
  getTossLoginStatus,
  getTossPendingOrders,
  getTossPortfolioPositions,
  getTossTransactions,
  getTossTransactionsOverview,
  getTossWatchlist,
  getAraonWatchlist,
  getAgentEvents,
  getAgentOrderIntentApprovalChallenges,
  getAgentOrderIntentAudit,
  getAgentOrderIntents,
  getAgentOrderIntentLivePolicy,
  getMarketSummary,
  getStocks,
  getThemesWithStocks,
  removeAraonWatchlistItem,
  setTossFastQuoteCurrentTickers,
  startTossLogin,
  type AgentEventPayload,
  type KisWsSlotStatusPayload,
  type OrderIntentAuditEntryPayload,
  type OrderIntentApprovalChallengePayload,
  type OrderIntentLivePolicyPayload,
  type OrderIntentPreviewPayload,
  type TossAccountSummaryPayload,
  type TossCompletedOrdersPayload,
  type TossPendingOrdersPayload,
  type TossPortfolioPositionsPayload,
  type TossTransactionsOverviewPayload,
  type TossTransactionsPayload,
  type TossWatchlistPayload,
} from './lib/api-client';
import { buildSimulatedBuyPreviewInputFromAgentEvent } from './lib/agent-event-order-intent';
import {
  ARAON_AGENT_EVENT_EVENT,
  mergeAgentEventRailSnapshot,
} from './lib/agent-event-browser-event';
import { loadTossAccountRailSnapshot } from './lib/toss-account-rail';
import {
  isTossLoginRunningState,
  shouldRefreshTossAccountRailAfterLogin,
  shouldStopTossLoginPolling,
  tossLoginRailNotice,
} from './lib/toss-login-flow';
import {
  ARAON_TOSS_REFRESH_RESULT_EVENT,
  shouldRefreshTossAccountRailFromResult,
} from './lib/toss-refresh-result-event';
import { syncTrackedCatalogAfterMasterAdd } from './lib/tracked-catalog-sync';
import {
  buildWatchlistAddInput,
  productCodeForWatchlistUiCode,
} from './lib/watchlist-ui';
import {
  BotIcon,
  ChartIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CollapseIcon,
  ExpandIcon,
  HomeIcon,
  SettingsIcon,
} from './lib/icons';
import type { AgentEventNotificationPayload, TossSseRefreshResultPayload } from '@shared/types';
import type { StockViewModel } from './lib/view-models';
import type { MarketTapeSummary } from './components/StatusBar';

const REALTIME_CAP = 40;
type WorkspaceMode = 'home' | 'chart' | 'agent';
const IS_DEV_BUILD =
  (import.meta as ImportMeta & { env: { DEV?: boolean } }).env.DEV === true;
const DevMarketSimulator = IS_DEV_BUILD
  ? lazy(() =>
      import('./components/DevMarketSimulator').then((mod) => ({
        default: mod.DevMarketSimulator,
      })),
    )
  : null;

export function App() {
  useSSE();

  const setCatalog = useStocksStore((s) => s.setCatalog);
  const setThemes = useStocksStore((s) => s.setThemes);
  const catalog = useStocksStore((s) => s.catalog);
  const quotes = useStocksStore((s) => s.quotes);
  const flashSeeds = useStocksStore((s) => s.flashSeeds);

  const setWatchlistItems = useWatchlistStore((s) => s.setWatchlistItems);
  const favorites = useWatchlistStore((s) => s.favorites);
  const watchlistItemsByCode = useWatchlistStore((s) => s.itemsByCode);
  const toggleFavoriteLocal = useWatchlistStore((s) => s.toggleFavorite);
  const marketStatus = useMarketStore((s) => s.marketStatus);
  const sseStatus = useMarketStore((s) => s.sseStatus);
  const lastUpdate = useMarketStore((s) => s.lastUpdate);

  const errors = useErrorStore((s) => s.errors);
  const dismissError = useErrorStore((s) => s.dismiss);
  const pushError = useErrorStore((s) => s.push);

  const settings = useSettingsStore((s) => s.settings);
  const settingsOpen = useSettingsStore((s) => s.settingsOpen);
  const openSettings = useSettingsStore((s) => s.openSettings);
  const closeSettings = useSettingsStore((s) => s.closeSettings);
  const [focusCode, setFocusCode] = useState<string | null>(() =>
    readLocalStorageValue('araon-selected-ticker') ?? '005930',
  );
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() =>
    readWorkspaceMode(),
  );
  const [accountRailCollapsed, setAccountRailCollapsed] = useState(false);
  const [kstTime, setKstTime] = useState(() => formatKstTime(new Date()));
  const [marketSummary, setMarketSummary] = useState<MarketTapeSummary | null>(null);
  const [agentEvents, setAgentEvents] = useState<AgentEventPayload[]>([]);
  const [agentEventsLoading, setAgentEventsLoading] = useState(false);
  const [orderIntentPreviews, setOrderIntentPreviews] = useState<OrderIntentPreviewPayload[]>([]);
  const [orderIntentAudit, setOrderIntentAudit] = useState<OrderIntentAuditEntryPayload[]>([]);
  const [orderIntentApprovalChallenges, setOrderIntentApprovalChallenges] =
    useState<OrderIntentApprovalChallengePayload[]>([]);
  const [orderIntentLivePolicy, setOrderIntentLivePolicy] =
    useState<OrderIntentLivePolicyPayload | null>(null);
  const [orderIntentLoading, setOrderIntentLoading] = useState(false);
  const [tossAccountSessionReady, setTossAccountSessionReady] = useState(false);
  const [tossAccountSummary, setTossAccountSummary] =
    useState<TossAccountSummaryPayload | null>(null);
  const [tossPortfolioPositions, setTossPortfolioPositions] =
    useState<TossPortfolioPositionsPayload | null>(null);
  const [tossPendingOrders, setTossPendingOrders] =
    useState<TossPendingOrdersPayload | null>(null);
  const [tossCompletedOrders, setTossCompletedOrders] =
    useState<TossCompletedOrdersPayload | null>(null);
  const [tossTransactionsOverview, setTossTransactionsOverview] =
    useState<TossTransactionsOverviewPayload | null>(null);
  const [tossTransactions, setTossTransactions] =
    useState<TossTransactionsPayload | null>(null);
  const [tossWatchlist, setTossWatchlist] =
    useState<TossWatchlistPayload | null>(null);
  const [tossAccountLoading, setTossAccountLoading] = useState(false);
  const [tossAccountError, setTossAccountError] = useState<string | null>(null);
  const [tossAccountNotice, setTossAccountNotice] = useState<string | null>(null);
  const [tossLoginPolling, setTossLoginPolling] = useState(false);
  const [kisWsSlotStatus, setKisWsSlotStatus] =
    useState<KisWsSlotStatusPayload | null>(null);
  const [kisWsSlotLoading, setKisWsSlotLoading] = useState(false);
  const [kisWsSlotError, setKisWsSlotError] = useState<string | null>(null);

  const selectTicker = useCallback((code: string) => {
    setFocusCode(code);
    writeLocalStorageValue('araon-selected-ticker', code);
  }, []);

  const openHome = useCallback(() => {
    setWorkspaceMode('home');
    writeLocalStorageValue('araon-workspace-mode', 'home');
  }, []);

  const openFullChart = useCallback(() => {
    setWorkspaceMode('chart');
    writeLocalStorageValue('araon-workspace-mode', 'chart');
  }, []);

  const openAgentDetail = useCallback(() => {
    setWorkspaceMode('agent');
    writeLocalStorageValue('araon-workspace-mode', 'agent');
  }, []);

  // Alert pipeline (Phase 6): watches quotes, fires toasts/sound/desktop push.
  useAlertEvaluator({ onPickStock: selectTicker });

  useEffect(() => {
    const update = () => setKstTime(formatKstTime(new Date()));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const summary = await getMarketSummary();
        if (!cancelled) setMarketSummary(summary);
      } catch {
        if (!cancelled) setMarketSummary(null);
      }
    }
    void load();
    const timer = setInterval(() => {
      void load();
    }, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    async function load() {
      if (!cancelled) setAgentEventsLoading(true);
      try {
        const snapshot = await getAgentEvents(10);
        if (!cancelled) setAgentEvents(snapshot.items);
      } catch {
        // Local queue snapshot is auxiliary. Toast SSE remains the primary
        // notification path if this panel cannot refresh.
      } finally {
        if (!cancelled) setAgentEventsLoading(false);
      }
    }
    void load();
    timer = setInterval(() => {
      void load();
    }, 15_000);
    return () => {
      cancelled = true;
      if (timer !== null) clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    function onAgentEvent(event: Event): void {
      const payload = (event as CustomEvent<AgentEventNotificationPayload>).detail;
      setAgentEvents((current) => mergeAgentEventRailSnapshot(current, payload, 10));
    }

    window.addEventListener(ARAON_AGENT_EVENT_EVENT, onAgentEvent);
    return () => {
      window.removeEventListener(ARAON_AGENT_EVENT_EVENT, onAgentEvent);
    };
  }, []);

  const loadTossAccountRail = useCallback(async (): Promise<void> => {
    setTossAccountLoading(true);
    try {
      const snapshot = await loadTossAccountRailSnapshot({
        getAuthStatus: getTossAuthStatus,
        getSummary: getTossAccountSummary,
        getPositions: getTossPortfolioPositions,
        getPendingOrders: getTossPendingOrders,
        getCompletedOrders: () => getTossCompletedOrders({ market: 'all', size: 5 }),
        getTransactionsOverview: () => getTossTransactionsOverview('kr'),
        getTransactions: () => getTossTransactions({ market: 'kr', size: 5 }),
        getWatchlist: getTossWatchlist,
      });
      setTossAccountSessionReady(snapshot.sessionReady);
      setTossAccountSummary(snapshot.summary);
      setTossPortfolioPositions(snapshot.positions);
      setTossPendingOrders(snapshot.pendingOrders);
      setTossCompletedOrders(snapshot.completedOrders);
      setTossTransactionsOverview(snapshot.transactionsOverview);
      setTossTransactions(snapshot.transactions);
      setTossWatchlist(snapshot.watchlist);
      setTossAccountError(null);
      setTossAccountNotice(null);
    } catch (err) {
      setTossAccountError(describeError(err));
      setTossAccountNotice(null);
    } finally {
      setTossAccountLoading(false);
    }
  }, []);

  const handleTossLoginStart = useCallback(async (): Promise<void> => {
    setTossAccountLoading(true);
    try {
      const status = await startTossLogin();
      setTossAccountError(null);
      setTossAccountNotice(tossLoginRailNotice(status));
      setTossLoginPolling(isTossLoginRunningState(status.state));
      if (shouldRefreshTossAccountRailAfterLogin(status)) {
        await loadTossAccountRail();
      }
    } catch (err) {
      setTossAccountError(describeError(err));
      setTossAccountNotice(null);
      setTossLoginPolling(false);
    } finally {
      setTossAccountLoading(false);
    }
  }, [loadTossAccountRail]);

  useEffect(() => {
    if (!tossLoginPolling) return;
    let cancelled = false;

    async function pollLoginStatus(): Promise<void> {
      try {
        const status = await getTossLoginStatus();
        if (cancelled) return;

        setTossAccountNotice(tossLoginRailNotice(status));
        if (shouldStopTossLoginPolling(status)) {
          setTossLoginPolling(false);
        }
        if (shouldRefreshTossAccountRailAfterLogin(status)) {
          await loadTossAccountRail();
        }
      } catch {
        if (!cancelled) {
          setTossLoginPolling(false);
          setTossAccountNotice(null);
          setTossAccountError('Toss 로그인 상태 확인에 실패했습니다.');
        }
      }
    }

    void pollLoginStatus();
    const timer = setInterval(() => {
      void pollLoginStatus();
    }, 3_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [loadTossAccountRail, tossLoginPolling]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    async function load() {
      if (cancelled) return;
      await loadTossAccountRail();
    }
    void load();
    timer = setInterval(() => {
      void load();
    }, 30_000);
    return () => {
      cancelled = true;
      if (timer !== null) clearInterval(timer);
    };
  }, [loadTossAccountRail]);

  useEffect(() => {
    function onTossRefreshResult(event: Event): void {
      const result = (event as CustomEvent<TossSseRefreshResultPayload>).detail;
      if (shouldRefreshTossAccountRailFromResult(result)) {
        void loadTossAccountRail();
      }
    }

    window.addEventListener(ARAON_TOSS_REFRESH_RESULT_EVENT, onTossRefreshResult);
    return () => {
      window.removeEventListener(ARAON_TOSS_REFRESH_RESULT_EVENT, onTossRefreshResult);
    };
  }, [loadTossAccountRail]);

  const loadKisWsSlotStatus = useCallback(async (): Promise<void> => {
    setKisWsSlotLoading(true);
    try {
      const status = await getKisWsSlotStatus(focusCode);
      setKisWsSlotStatus(status);
      setKisWsSlotError(null);
    } catch (err) {
      setKisWsSlotError(describeError(err));
    } finally {
      setKisWsSlotLoading(false);
    }
  }, [focusCode]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    async function load() {
      if (cancelled) return;
      await loadKisWsSlotStatus();
    }
    void load();
    timer = setInterval(() => {
      void load();
    }, 15_000);
    return () => {
      cancelled = true;
      if (timer !== null) clearInterval(timer);
    };
  }, [loadKisWsSlotStatus]);

  const loadOrderIntentRail = useCallback(async (): Promise<void> => {
    setOrderIntentLoading(true);
    try {
      const [previews, audit, approvalChallenges, livePolicy] = await Promise.all([
        getAgentOrderIntents(4),
        getAgentOrderIntentAudit(4),
        getAgentOrderIntentApprovalChallenges(4),
        getAgentOrderIntentLivePolicy(),
      ]);
      setOrderIntentPreviews(previews.items);
      setOrderIntentAudit(audit.items);
      setOrderIntentApprovalChallenges(approvalChallenges.items);
      setOrderIntentLivePolicy(livePolicy.policy);
    } catch {
      // Order-intent rail is a local safety snapshot. It should never block
      // the dashboard if the optional agent foundation is unavailable.
    } finally {
      setOrderIntentLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    async function load() {
      if (cancelled) return;
      await loadOrderIntentRail();
    }
    void load();
    timer = setInterval(() => {
      void load();
    }, 15_000);
    return () => {
      cancelled = true;
      if (timer !== null) clearInterval(timer);
    };
  }, [loadOrderIntentRail]);

  // Lazy-preload the master KRX universe so the search box has it ready
  // without blocking initial render. The master-store is the single source
  // of truth and de-dupes concurrent calls.
  const ensureMasterLoaded = useMasterStore((s) => s.ensureLoaded);
  useEffect(() => {
    type IdleWindow = typeof window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const w = window as IdleWindow;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;
    function run() {
      if (cancelled) return;
      void ensureMasterLoaded();
    }
    if (typeof w.requestIdleCallback === 'function') {
      idleId = w.requestIdleCallback(run);
    } else {
      timer = setTimeout(run, 0);
    }
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      if (idleId !== null && typeof w.cancelIdleCallback === 'function') {
        w.cancelIdleCallback(idleId);
      }
    };
  }, [ensureMasterLoaded]);

  // Initial REST seed (parallel).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [stocksResult, watchlistResult, themesResult] = await Promise.allSettled([
        getStocks(),
        getAraonWatchlist(),
        getThemesWithStocks(),
      ]);
      if (cancelled) return;

      if (themesResult.status === 'fulfilled') {
        setThemes(themesResult.value);
      } else {
        pushError({
          title: '테마 카탈로그 로딩 실패',
          detail: describeError(themesResult.reason),
        });
      }

      if (stocksResult.status === 'fulfilled') {
        setCatalog(stocksResult.value);
        if (themesResult.status === 'fulfilled') {
          // Re-apply theme mapping: setCatalog wipes sectorId for tickers it
          // didn't see before, so re-run setThemes to populate them now that
          // the catalog has the freshest entries.
          setThemes(themesResult.value);
        }
      } else {
        pushError({
          title: '종목 목록 로딩 실패',
          detail: describeError(stocksResult.reason),
        });
      }

      if (watchlistResult.status === 'fulfilled') {
        setWatchlistItems(watchlistResult.value.items);
      } else if (
        !(watchlistResult.reason instanceof ApiError && watchlistResult.reason.status === 503)
      ) {
        pushError({
          title: '즐겨찾기 로딩 실패',
          detail: describeError(watchlistResult.reason),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setCatalog, setThemes, setWatchlistItems, pushError]);

  const refreshWatchlist = useCallback(async (): Promise<void> => {
    const snapshot = await getAraonWatchlist();
    setWatchlistItems(snapshot.items);
  }, [setWatchlistItems]);

  const onToggleFav = useCallback(async (ticker: string): Promise<void> => {
    const wasFav = favorites.has(ticker);
    const existingWatchlistItem = watchlistItemsByCode[ticker];
    toggleFavoriteLocal(ticker);
    try {
      let result;
      if (wasFav) {
        const productCode = productCodeForWatchlistUiCode(ticker, existingWatchlistItem);
        if (productCode === null) throw new Error('지원 대기 상품입니다.');
        result = await removeAraonWatchlistItem(productCode);
      } else {
        const meta = catalog[ticker];
        const input = buildWatchlistAddInput(ticker, meta, existingWatchlistItem);
        if (input === null) throw new Error('지원 대기 상품입니다.');
        result = await addAraonWatchlistItem(input);
      }
      if (result.action === 'unsupported') {
        throw new Error('지원 대기 상품입니다.');
      }
      await refreshWatchlist();
    } catch (err) {
      toggleFavoriteLocal(ticker);
      pushError({
        title: wasFav ? '즐겨찾기 해제 실패' : '즐겨찾기 추가 실패',
        detail: describeError(err),
      });
    }
  }, [
    catalog,
    favorites,
    refreshWatchlist,
    toggleFavoriteLocal,
    watchlistItemsByCode,
    pushError,
  ]);

  const toggleFavoriteFromRow = useCallback((ticker: string): void => {
    void onToggleFav(ticker);
  }, [onToggleFav]);

  /**
   * Header/search/table picks replace the selected ticker inside Home.
   * Full Chart is a deliberate expansion action, not a separate ticker detail.
   */
  const handlePickStock = useCallback((stock: StockViewModel) => {
    selectTicker(stock.code);
    if (typeof document === 'undefined') return;
    const el = document.querySelector(`[data-stock-row="${stock.code}"]`);
    if (el instanceof HTMLElement) {
      const parent = el.closest('.home-cell, .home-bottom-split, .home-left, .home-right');
      if (parent instanceof HTMLElement) {
        parent.scrollTo({
          top: Math.max(0, el.offsetTop - parent.clientHeight / 2),
          behavior: 'smooth',
        });
      }
    }
  }, [selectTicker]);

  const handlePickRankingTicker = useCallback(async (ticker: string): Promise<void> => {
    if (catalog[ticker] !== undefined) {
      selectTicker(ticker);
      return;
    }
    try {
      try {
        await addStockFromMaster(ticker);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          await addStockFromTossSearch(ticker);
        } else {
          throw err;
        }
      }
      await syncTrackedCatalogAfterMasterAdd({ setCatalog, setThemes });
      selectTicker(ticker);
    } catch (err) {
      pushError({
        title: 'TOP100 종목 열기 실패',
        detail: describeError(err),
      });
    }
  }, [catalog, pushError, selectTicker, setCatalog, setThemes]);

  const handleCreateBuyPreviewFromAgentEvent = useCallback(async (
    event: AgentEventPayload,
  ): Promise<void> => {
    setOrderIntentLoading(true);
    try {
      await createAgentOrderIntentPreview(
        buildSimulatedBuyPreviewInputFromAgentEvent(event),
      );
      await loadOrderIntentRail();
    } catch (err) {
      pushError({
        title: 'order preview 생성 실패',
        detail: describeError(err),
      });
    } finally {
      setOrderIntentLoading(false);
    }
  }, [loadOrderIntentRail, pushError]);

  const allStockVMs = useMemo<StockViewModel[]>(() => {
    const out: StockViewModel[] = [];
    for (const ticker of Object.keys(catalog)) {
      const vm = buildStockVM(ticker, catalog, quotes);
      if (vm !== null) out.push(vm);
    }
    return out;
  }, [catalog, quotes]);

  const totalCount = allStockVMs.length;
  const favCount = favorites.size;
  const realtimeCount =
    kisWsSlotStatus?.enabled === true
      ? Math.min(totalCount, kisWsSlotStatus.activeCount)
      : Math.min(REALTIME_CAP, favCount);
  const pollingCount = Math.max(0, totalCount - realtimeCount);
  const lastUpdateStr = lastUpdate !== null ? fmtClock(lastUpdate) : '—';
  const focusedStock = useMemo<StockViewModel | null>(() => {
    if (focusCode !== null) {
      const focused = allStockVMs.find((s) => s.code === focusCode);
      if (focused !== undefined) return focused;
    }
    const samsung = allStockVMs.find((s) => s.code === '005930');
    if (samsung !== undefined) return samsung;
    const firstFavorite = allStockVMs.find((s) => favorites.has(s.code));
    return firstFavorite ?? allStockVMs[0] ?? null;
  }, [allStockVMs, favorites, focusCode]);

  useEffect(() => {
    void setTossFastQuoteCurrentTickers(
      focusedStock === null ? [] : [focusedStock.code],
    ).catch(() => undefined);
  }, [focusedStock?.code]);

  return (
    <div className="app-shell" data-screen-label="01 Dashboard">
      <Header
        marketStatus={marketStatus}
        onHome={openHome}
        sseStatus={sseStatus}
        lastUpdate={lastUpdate}
        allStocks={allStockVMs}
        onPickStock={handlePickStock}
        onPickMasterTicker={(ticker) => void handlePickRankingTicker(ticker)}
        onOpenSettings={openSettings}
        notifEnabled={settings.notifGlobalEnabled}
        realtimeCount={realtimeCount}
        pollingCount={pollingCount}
      />
      <ErrorBanner errors={errors} onDismiss={dismissError} />
      <div className={accountRailCollapsed ? 'main main--account-collapsed' : 'main'}>
        <main className="home-workspace">
          {workspaceMode === 'chart' ? (
            <div className="expanded-workspace expanded-workspace--chart" data-screen-label="02 Full Chart">
              <div className="expanded-workspace__toolbar">
                <div>
                  <div className="expanded-workspace__eyebrow">확장 차트</div>
                  <h2 className="expanded-workspace__title">
                    {focusedStock?.name ?? '선택 종목'} 차트
                  </h2>
                </div>
                <button
                  type="button"
                  className="araon-icon-action"
                  onClick={openHome}
                  aria-label="작게 보기"
                  title="작게 보기"
                >
                  <CollapseIcon size={16} />
                </button>
              </div>
              <DashboardFocusPanel
                stock={focusedStock}
                allStocks={allStockVMs}
                marketStatus={marketStatus}
                isFavorite={focusedStock !== null && favorites.has(focusedStock.code)}
                onOpenFullChart={openFullChart}
                onToggleFav={toggleFavoriteFromRow}
                presentation="fullChart"
              />
            </div>
          ) : workspaceMode === 'agent' ? (
            <div className="expanded-workspace expanded-workspace--agent" data-screen-label="03 Agent Detail">
              <div className="expanded-workspace__toolbar">
                <div>
                  <div className="expanded-workspace__eyebrow">확장 에이전트</div>
                  <h2 className="expanded-workspace__title">에이전트 이벤트와 거래 안전장치</h2>
                </div>
                <button
                  type="button"
                  className="araon-icon-action"
                  onClick={openHome}
                  aria-label="작게 보기"
                  title="작게 보기"
                >
                  <CollapseIcon size={16} />
                </button>
              </div>
              <div className="agent-detail-grid">
                <AgentEventsRail
                  events={agentEvents}
                  loading={agentEventsLoading}
                  onOpenTicker={(ticker) => void handlePickRankingTicker(ticker)}
                  onCreateBuyPreview={(event) => void handleCreateBuyPreviewFromAgentEvent(event)}
                />
                <OrderIntentSafetyRail
                  previews={orderIntentPreviews}
                  audit={orderIntentAudit}
                  approvalChallenges={orderIntentApprovalChallenges}
                  livePolicy={orderIntentLivePolicy}
                  loading={orderIntentLoading}
                />
              </div>
            </div>
          ) : (
            <div className="home-grid" data-screen-label="01 Home">
              <section className="home-left home-cell">
                <div className="home-cell__body">
                  <SectionStack
                    onToggleFav={toggleFavoriteFromRow}
                    onOpenDetail={selectTicker}
                    onOpenRankingTicker={(ticker) => void handlePickRankingTicker(ticker)}
                  />
                </div>
                <div className="home-bottom-split home-linked-split">
                  <FavoritesBlock
                    stocks={allStockVMs}
                    favorites={favorites}
                    watchlistItemsByCode={watchlistItemsByCode}
                    onToggleFav={toggleFavoriteFromRow}
                    onOpenDetail={selectTicker}
                    flashSeeds={flashSeeds}
                    kisStatus={kisWsSlotStatus}
                    kisLoading={kisWsSlotLoading}
                    kisError={kisWsSlotError}
                    flush
                  />
                  <SurgeBlock
                    allStocks={allStockVMs}
                    marketStatus={marketStatus}
                    onOpenDetail={selectTicker}
                    flush
                  />
                </div>
              </section>
              <section className="home-right home-cell">
                <DashboardFocusPanel
                  stock={focusedStock}
                  allStocks={allStockVMs}
                  marketStatus={marketStatus}
                  isFavorite={focusedStock !== null && favorites.has(focusedStock.code)}
                  onOpenFullChart={openFullChart}
                  onToggleFav={toggleFavoriteFromRow}
                  presentation="home"
                />
                <div className="home-agent-panel">
                  <div className="home-agent-panel__header">
                    <div>
                      <div className="home-agent-panel__eyebrow">에이전트</div>
                      <h2 className="home-agent-panel__title">이벤트 · 미리보기 · 실행 잠금</h2>
                    </div>
                    <button
                      type="button"
                      className="araon-icon-action"
                      onClick={openAgentDetail}
                      aria-label="에이전트 확장"
                      title="에이전트 확장"
                    >
                      <ExpandIcon size={15} />
                    </button>
                  </div>
                  <div className="home-agent-panel__body">
                    <AgentEventsRail
                      events={agentEvents}
                      loading={agentEventsLoading}
                      onOpenTicker={(ticker) => void handlePickRankingTicker(ticker)}
                      onCreateBuyPreview={(event) => void handleCreateBuyPreviewFromAgentEvent(event)}
                      onOpenDetails={openAgentDetail}
                    />
                    <OrderIntentSafetyRail
                      previews={orderIntentPreviews}
                      audit={orderIntentAudit}
                      approvalChallenges={orderIntentApprovalChallenges}
                      livePolicy={orderIntentLivePolicy}
                      loading={orderIntentLoading}
                      onOpenDetails={openAgentDetail}
                    />
                  </div>
                </div>
              </section>
            </div>
          )}
        </main>
        <aside
          className={accountRailCollapsed ? 'account-rail account-rail--collapsed' : 'account-rail'}
          aria-label="Toss account rail"
        >
          {!accountRailCollapsed && (
            <div className="account-rail__panel">
              <TossAccountRail
                sessionReady={tossAccountSessionReady}
                loading={tossAccountLoading}
                summary={tossAccountSummary}
                positions={tossPortfolioPositions}
                pendingOrders={tossPendingOrders}
                completedOrders={tossCompletedOrders}
                transactionsOverview={tossTransactionsOverview}
                transactions={tossTransactions}
                watchlist={tossWatchlist}
                error={tossAccountError}
                statusMessage={tossAccountNotice}
                onRefresh={() => void loadTossAccountRail()}
                onLoginStart={() => void handleTossLoginStart()}
              />
            </div>
          )}
          <nav className="account-icon-rail" aria-label="빠른 이동">
            <button
              type="button"
              className="account-rail__chevron"
              onClick={() => setAccountRailCollapsed((current) => !current)}
              aria-label={
                accountRailCollapsed
                  ? `계좌 펼치기 · ${tossAccountSessionReady ? 'Toss 준비됨' : 'Toss 로그인 필요'}`
                  : `계좌 접기 · ${tossAccountSessionReady ? 'Toss 준비됨' : 'Toss 로그인 필요'}`
              }
              title={
                accountRailCollapsed
                  ? `계좌 펼치기 · ${tossAccountSessionReady ? 'Toss 준비됨' : 'Toss 로그인 필요'}`
                  : `계좌 접기 · ${tossAccountSessionReady ? 'Toss 준비됨' : 'Toss 로그인 필요'}`
              }
            >
              {accountRailCollapsed ? <ChevronLeftIcon size={14} /> : <ChevronRightIcon size={14} />}
            </button>
            <AccountIconButton label="홈" icon={<HomeIcon size={15} />} active={workspaceMode === 'home'} onClick={openHome} />
            <AccountIconButton label="전체 차트" icon={<ChartIcon size={15} />} active={workspaceMode === 'chart'} onClick={openFullChart} />
            <AccountIconButton label="에이전트" icon={<BotIcon size={15} />} active={workspaceMode === 'agent'} onClick={openAgentDetail} />
            <AccountIconButton label="설정" icon={<SettingsIcon size={15} />} onClick={openSettings} />
          </nav>
        </aside>
      </div>
      <StatusBar
        totalCount={totalCount}
        favCount={favCount}
        pollingCount={pollingCount}
        lastUpdate={lastUpdateStr}
        kstTime={kstTime}
        marketSummary={marketSummary}
        onOpenSettings={openSettings}
      />
      {settingsOpen && (
        <SettingsModal onClose={closeSettings} currentTicker={focusCode} />
      )}
      {DevMarketSimulator !== null && (
        <Suspense fallback={null}>
          <DevMarketSimulator devModeEnabled={settings.devModeEnabled} />
        </Suspense>
      )}
      <ToastStack onPickStock={selectTicker} />
    </div>
  );
}

interface AccountIconButtonProps {
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick: () => void;
}

function AccountIconButton({
  label,
  icon,
  active = false,
  onClick,
}: AccountIconButtonProps) {
  return (
    <button
      type="button"
      className={active ? 'account-icon-rail__button account-icon-rail__button--active' : 'account-icon-rail__button'}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

function formatKstTime(date: Date): string {
  return `${new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)} KST`;
}

function readLocalStorageValue(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(key);
    return value === '' ? null : value;
  } catch {
    return null;
  }
}

function writeLocalStorageValue(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Local persistence is convenience-only. UI should still work without it.
  }
}

function readWorkspaceMode(): WorkspaceMode {
  const value = readLocalStorageValue('araon-workspace-mode');
  return value === 'chart' || value === 'agent' ? value : 'home';
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return `${err.status} ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}
