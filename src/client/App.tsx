/**
 * App — ARAON dashboard root.
 *
 * Layout (1680px max width, 3-col grid `2fr 1fr 2.5fr`):
 *
 *   ┌──────────────── Header (sticky) ────────────────┐
 *   │                                                 │
 *   │  ErrorBanner (fixed overlay)                    │
 *   │                                                 │
 *   │  ┌─ main ───────────────────────────────────┐   │
 *   │  │ [LeftCombined]   [Favorites]   [Sectors] │   │
 *   │  │  - Movers                       (sector/ │   │
 *   │  │  - Surge                        tag/mix) │   │
 *   │  │   sticky top:84      sticky top:84       │   │
 *   │  └──────────────────────────────────────────┘   │
 *   │                                                 │
 *   │  StatusBar (sticky)                             │
 *   └─────────────────────────────────────────────────┘
 *
 * Lifecycle:
 *   1. mount → fetch /stocks + /favorites + /themes (parallel) → seed stores
 *   2. open SSE → live updates flow into stocksStore + surgeStore
 *   3. user toggles fav → optimistic store update + POST/DELETE /favorites
 */

import { useEffect, useMemo, useState } from 'react';
import { useSSE } from './hooks/useSSE';
import { useMarketStore } from './stores/market-store';
import { useStocksStore, buildStockVM } from './stores/stocks-store';
import { useWatchlistStore } from './stores/watchlist-store';
import { useErrorStore } from './stores/error-store';
import { useSettingsStore } from './stores/settings-store';
import { usePriceHistoryStore } from './stores/price-history-store';
import { Header } from './components/Header';
import { ErrorBanner } from './components/ErrorBanner';
import { LeftCombinedBlock } from './components/MoversCombined';
import { FavoritesBlock } from './components/FavoritesBlock';
import { SectionStack } from './components/SectionStack';
import { StatusBar } from './components/StatusBar';
import { SettingsModal } from './components/SettingsModal';
import { StockDetailModal } from './components/StockDetailModal';
import { ToastStack } from './components/ToastStack';
import { DevMarketSimulator } from './components/DevMarketSimulator';
import { useAlertEvaluator } from './hooks/useAlertEvaluator';
import { useMasterStore } from './stores/master-store';
import { fmtClock } from './lib/format';
import {
  ApiError,
  addFavorite,
  getFavorites,
  getStocks,
  getThemesWithStocks,
  removeFavorite,
  removeStock as removeStockApi,
} from './lib/api-client';
import type { StockViewModel } from './lib/view-models';

const REALTIME_CAP = 40;

export function App() {
  useSSE();

  const setCatalog = useStocksStore((s) => s.setCatalog);
  const setThemes = useStocksStore((s) => s.setThemes);
  const catalog = useStocksStore((s) => s.catalog);
  const quotes = useStocksStore((s) => s.quotes);
  const flashSeeds = useStocksStore((s) => s.flashSeeds);
  const removeStockLocal = useStocksStore((s) => s.removeStock);

  const setFavorites = useWatchlistStore((s) => s.setFavorites);
  const favorites = useWatchlistStore((s) => s.favorites);
  const view = useWatchlistStore((s) => s.view);
  const setView = useWatchlistStore((s) => s.setView);
  const toggleFavoriteLocal = useWatchlistStore((s) => s.toggleFavorite);
  const removeFavoriteLocal = useWatchlistStore((s) => s.removeFavorite);

  const clearHistoryForTicker = usePriceHistoryStore((s) => s.clearTicker);

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

  // Detail modal: a single open ticker code, or null when closed.
  const [detailCode, setDetailCode] = useState<string | null>(null);

  // Alert pipeline (Phase 6): watches quotes, fires toasts/sound/desktop push.
  useAlertEvaluator({ onPickStock: (ticker) => setDetailCode(ticker) });

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
      const [stocksResult, favoritesResult, themesResult] = await Promise.allSettled([
        getStocks(),
        getFavorites(),
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

      if (favoritesResult.status === 'fulfilled') {
        setFavorites(favoritesResult.value.map((f) => f.ticker));
      } else if (
        !(favoritesResult.reason instanceof ApiError && favoritesResult.reason.status === 503)
      ) {
        pushError({
          title: '즐겨찾기 로딩 실패',
          detail: describeError(favoritesResult.reason),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setCatalog, setThemes, setFavorites, pushError]);

  async function onToggleFav(ticker: string): Promise<void> {
    const wasFav = favorites.has(ticker);
    toggleFavoriteLocal(ticker);
    try {
      if (wasFav) {
        await removeFavorite(ticker);
      } else {
        await addFavorite(ticker);
      }
    } catch (err) {
      toggleFavoriteLocal(ticker);
      pushError({
        title: wasFav ? '즐겨찾기 해제 실패' : '즐겨찾기 추가 실패',
        detail: describeError(err),
      });
    }
  }

  async function handleUntrack(ticker: string): Promise<void> {
    const meta = catalog[ticker];
    const display = meta !== undefined ? `${meta.name} (${ticker})` : ticker;
    const ok = window.confirm(
      `${display} 종목을 대시보드 추적 목록에서 제거할까요?\n` +
        `전체 종목 검색에서는 계속 찾을 수 있습니다.`,
    );
    if (!ok) return;

    try {
      await removeStockApi(ticker);
      removeStockLocal(ticker);
      removeFavoriteLocal(ticker);
      clearHistoryForTicker(ticker);
      setDetailCode(null);
    } catch (err) {
      pushError({
        title: '추적 해제 실패',
        detail: describeError(err),
      });
    }
  }

  /**
   * Header search picks open the detail modal directly. Surface bonus: also
   * scroll the matching row into view so closing the modal reveals it.
   */
  function handlePickStock(stock: StockViewModel) {
    setDetailCode(stock.code);
    if (typeof document === 'undefined') return;
    const el = document.querySelector(`[data-stock-row="${stock.code}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function openDetail(code: string) {
    setDetailCode(code);
  }
  function closeDetail() {
    setDetailCode(null);
  }

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
  const realtimeCount = Math.min(REALTIME_CAP, favCount);
  const pollingCount = Math.max(0, totalCount - realtimeCount);
  const lastUpdateStr = lastUpdate !== null ? fmtClock(lastUpdate) : '—';

  // Resolve the open detail VM from `detailCode`. If the code disappears
  // from the catalog (e.g. user removed favorites and it was filtered out),
  // close the modal instead of holding a stale reference.
  const detailStock =
    detailCode !== null
      ? (allStockVMs.find((s) => s.code === detailCode) ?? null)
      : null;
  useEffect(() => {
    if (detailCode !== null && detailStock === null) {
      setDetailCode(null);
    }
  }, [detailCode, detailStock]);

  return (
    <div className="app-shell" data-screen-label="01 Dashboard">
      <Header
        marketStatus={marketStatus}
        view={view}
        onViewChange={setView}
        sseStatus={sseStatus}
        lastUpdate={lastUpdate}
        allStocks={allStockVMs}
        onPickStock={handlePickStock}
        onPickMasterTicker={openDetail}
        onOpenSettings={openSettings}
        notifEnabled={settings.notifGlobalEnabled}
        realtimeCount={realtimeCount}
        pollingCount={pollingCount}
      />
      <ErrorBanner errors={errors} onDismiss={dismissError} />
      <div className="main">
        <aside className="col-left">
          <LeftCombinedBlock
            allStocks={allStockVMs}
            marketStatus={marketStatus}
            onOpenDetail={openDetail}
          />
        </aside>
        <aside className="col-favs">
          <FavoritesBlock
            stocks={allStockVMs}
            favorites={favorites}
            onToggleFav={(t) => void onToggleFav(t)}
            onOpenDetail={openDetail}
            flashSeeds={flashSeeds}
          />
        </aside>
        <div className="col-sectors">
          <SectionStack
            onToggleFav={(t) => void onToggleFav(t)}
            onOpenDetail={openDetail}
          />
        </div>
      </div>
      <StatusBar
        totalCount={totalCount}
        favCount={favCount}
        pollingCount={pollingCount}
        lastUpdate={lastUpdateStr}
        onOpenSettings={openSettings}
      />
      {detailStock !== null && (
        <StockDetailModal
          stock={detailStock}
          allStocks={allStockVMs}
          isFavorite={favorites.has(detailStock.code)}
          onClose={closeDetail}
          onNavigate={openDetail}
          onToggleFav={(code) => void onToggleFav(code)}
          onUntrack={(code) => void handleUntrack(code)}
        />
      )}
      {settingsOpen && <SettingsModal onClose={closeSettings} />}
      <DevMarketSimulator />
      <ToastStack onPickStock={openDetail} />
    </div>
  );
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return `${err.status} ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}
