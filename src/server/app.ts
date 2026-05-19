import type { AddressInfo } from 'node:net';
import Fastify, { type FastifyInstance } from 'fastify';
import { logger, createChildLogger } from '@shared/logger.js';
import type { MarketTopMoversResponse, Price } from '@shared/types.js';

import { getDb, closeDb, runCheckpoint } from './db/database.js';
import { migrateUp } from './db/migrator.js';
import {
  StockRepository,
  SectorRepository,
  FavoriteRepository,
  PriceSnapshotRepository,
  PriceHistoryPointRepository,
  PriceCandleRepository,
  StockNewsRepository,
  StockDisclosureRepository,
  DartCorpCodeRepository,
  StockSignalEventRepository,
  MasterStockRepository,
  MasterStockMetaRepository,
  CandleCoverageRepository,
  WatchlistSyncProvenanceRepository,
} from './db/repositories.js';
import { createSettingsStore } from './settings-store.js';
import { createFileCredentialStore } from './credential-store.js';
import { PriceStore } from './price/price-store.js';
import { SnapshotStore } from './price/snapshot-store.js';
import { createCandleAggregator, createCandleRecorder } from './price/candle-aggregator.js';
import {
  createPriceHistoryAggregator,
  createPriceHistoryRecorder,
} from './price/price-history-recorder.js';
import { createBackgroundDailyBackfillScheduler } from './chart/background-backfill-scheduler.js';
import { shouldBackfillDailyTicker } from './chart/daily-backfill-coverage.js';
import { createFileBackfillStateStore } from './chart/backfill-state-store.js';
import { createDailyBackfillService } from './chart/daily-backfill-service.js';
import { createHistoricalMinuteBackfillService } from './chart/historical-minute-backfill-service.js';
import { createTodayMinuteBackfillService } from './chart/today-minute-backfill-service.js';
import { createVolumeBaselineEnricher } from './volume/volume-baseline-service.js';
import {
  createKisRuntimeRef,
  defaultActuallyStart,
  fetchRuntimeRestQuoteWithFallback,
} from './bootstrap-kis.js';
import { createSseManager } from './sse/sse-manager.js';
import { fetchKisDailyCandles } from './kis/kis-daily-chart.js';
import { fetchKisHistoricalMinuteCandles } from './kis/kis-historical-minute-chart.js';
import { fetchKisTodayMinuteCandles } from './kis/kis-today-minute-chart.js';
import {
  shouldAutoRefreshLegacyKisMaster,
  shouldUseLegacyKisChartFallback,
  shouldUseLegacyKisPollingFallback,
  shouldUseLegacyKisQuoteFallback,
} from './kis/kis-legacy-fallback-policy.js';
import { mapKisInquirePriceToPrice } from './kis/kis-price-mapper.js';
import type { KisEndpointClass } from './kis/kis-outbound-limiter.js';
import { createStockService } from './services/stock-service.js';
import {
  createNaverSearchNewsProvider,
  createStockNewsFeedService,
} from './news/news-feed-service.js';
import { createDartDisclosureService } from './disclosures/dart-disclosure-service.js';
import { createDataRetentionScheduler } from './maintenance/data-retention.js';
import {
  createAgentEventMonitor,
  normalizeAgentEventMonitorWatchSources,
} from './agent/agent-event-monitor.js';
import { createAgentEventQueue, type AgentEvent } from './agent/agent-event-queue.js';
import {
  enqueueMarketMovementFromPrice,
  enqueueMarketMovementFromTopMover,
} from './agent/market-movement-agent-event.js';
import { createSqliteAgentEventStore } from './agent/agent-event-store.js';
import { createSqliteAgentEventAlertDeliveryStore } from './agent/agent-event-alert-delivery-store.js';
import { createSqliteOrderIntentStore } from './agent/order-intent-audit-store.js';
import { createOrderIntentService } from './agent/order-intent-service.js';
import { createMasterStockService } from './services/master-stock-service.js';
import { createMarketSummaryService } from './market/market-summary-service.js';
import { createMarketTopMoversService } from './market/market-top-movers-service.js';
import {
  createKisWsSlotSessionRebalancer,
  shouldRebalanceKisWsSlotsForAgentEvent,
} from './realtime/kis-ws-slot-session-rebalancer.js';
import { createKisWsSlotStateStore } from './realtime/kis-ws-slot-state.js';
import { createTossCdpLoginService } from './toss/toss-cdp-login-service.js';
import {
  buildTossFastQuoteCandidates,
  createTossFastQuoteLane,
  type TossFastQuoteLane,
} from './toss/toss-fast-quote-lane.js';
import {
  createTossQuotePollingService,
  type TossQuotePollingService,
} from './toss/toss-quote-polling-service.js';
import { fetchTossMinuteCandles } from './toss/toss-minute-chart.js';
import { createTossPublicMarketDataProvider } from './toss/toss-public-market-data-provider.js';
import { createTossRealtimeQuoteRefreshHandler } from './toss/toss-realtime-quote-refresh.js';
import { shouldAutoStartTossRealtime } from './toss/toss-realtime-autostart.js';
import { createTossRealtimeRefreshHandlers } from './toss/toss-realtime-refresh-handlers.js';
import { createTossRealtimeService } from './toss/toss-realtime-service.js';
import { createTossSseRefreshExecutor } from './toss/toss-sse-refresh-executor.js';
import { createTossSseRefreshResultStore } from './toss/toss-sse-refresh-result-store.js';
import { createFileTossSessionStore } from './toss/toss-session-store.js';
import { createTossSessionExtensionService } from './toss/toss-session-extension-service.js';
import {
  resolveRestQuoteMarketDivCode,
  type RestQuoteMarketDivCode,
} from './realtime/realtime-feed-route.js';
import { createCredentialSetupMutex, credentialsRoutes } from './routes/credentials.js';
import { stockRoutes } from './routes/stocks.js';
import { themeRoutes } from './routes/themes.js';
import { settingsRoutes } from './routes/settings.js';
import { favoritesRoutes } from './routes/favorites.js';
import { registerRoutes as importRoutes } from './routes/import.js';
import { eventsRoutes } from './routes/events.js';
import { agentEventAlertDeliveryRoutes } from './routes/agent-event-alert-deliveries.js';
import { agentEventsRoutes } from './routes/agent-events.js';
import { agentEventMonitorRoutes } from './routes/agent-event-monitor.js';
import { agentOrderIntentRoutes } from './routes/agent-order-intents.js';
import { masterRoutes } from './routes/master.js';
import { marketRoutes } from './routes/market.js';
import { runtimeRoutes } from './routes/runtime.js';
import { kisWsSlotsRoutes } from './routes/kis-ws-slots.js';
import { tossAccountRoutes } from './routes/toss-account.js';
import { tossAccountSummaryRoutes } from './routes/toss-account-summary.js';
import { tossAuthRoutes } from './routes/toss-auth.js';
import { tossOrdersRoutes } from './routes/toss-orders.js';
import { tossPortfolioRoutes } from './routes/toss-portfolio.js';
import { tossRealtimeRoutes } from './routes/toss-realtime.js';
import { tossTransactionsRoutes } from './routes/toss-transactions.js';
import { tossWatchlistRoutes } from './routes/toss-watchlist.js';
import { watchlistRoutes } from './routes/watchlist.js';
import { createTossAccountClient } from './toss/toss-account-client.js';
import { createTossAccountSummaryClient } from './toss/toss-account-summary-client.js';
import { createTossOrdersClient } from './toss/toss-orders-client.js';
import {
  createCachingTossPortfolioClient,
  createTossPortfolioClient,
  createTossPortfolioSnapshotStore,
} from './toss/toss-portfolio-client.js';
import {
  createTossSignalClient,
  createTossSignalRequestBodyTemplate,
  type TossSignalEndpointPath,
} from './toss/toss-signal-client.js';
import {
  createSessionGatedTossNewsService,
  createTossNewsClient,
} from './toss/toss-news-client.js';
import { createTossTransactionsClient } from './toss/toss-transactions-client.js';
import {
  createCachingTossWatchlistClient,
  createTossWatchlistClient,
  createTossWatchlistSnapshotStore,
} from './toss/toss-watchlist-client.js';
import { createTossProductIconCache } from './toss/toss-product-icon.js';
import { createAraonWatchlistService } from './watchlist/araon-watchlist-service.js';
import { createTelegramPhoneNotifier } from './notifications/phone-notifier.js';
import { launcherRoutes, type LauncherRoutesOptions } from './routes/launcher.js';
import { registerGracefulShutdown, type GracefulShutdownHandle } from './lifecycle/graceful-shutdown.js';
import { configureDataDir } from './runtime-paths.js';
import { registerStaticClient } from './static-client.js';

const log = createChildLogger('server');
type AraonFastifyInstance = FastifyInstance<any, any, any, any, any>;
const AGENT_EVENT_MIN_DISPATCH_DELAY_MS = 10_000;
const AGENT_EVENT_MAX_DISPATCH_DELAY_MS = 30_000;
const TOSS_TOP_MOVERS_REFRESH_MS = 500;

export interface AraonServerOptions {
  dataDir?: string;
  serveStaticClient?: boolean;
  staticDir?: string;
  registerProcessShutdown?: boolean;
  launcher?: LauncherRoutesOptions;
}

export interface AraonListenOptions extends AraonServerOptions {
  host?: string;
  port?: number;
}

export interface AraonServer {
  app: AraonFastifyInstance;
  start(options?: { host?: string; port?: number }): Promise<AraonStartedServer>;
  close(): Promise<void>;
}

export interface AraonStartedServer extends AraonServer {
  host: string;
  port: number;
  url: string;
}

export {
  shouldAutoRefreshLegacyKisMaster,
  shouldUseLegacyKisChartFallback,
  shouldUseLegacyKisPollingFallback,
  shouldUseLegacyKisQuoteFallback,
} from './kis/kis-legacy-fallback-policy.js';

function getListeningPort(app: AraonFastifyInstance): number {
  const address = app.server.address();
  if (typeof address === 'string' || address === null) {
    throw new Error('server did not expose a TCP address');
  }
  return (address as AddressInfo).port;
}

export async function createAraonServer(options: AraonServerOptions = {}): Promise<AraonServer> {
  if (options.dataDir !== undefined) {
    configureDataDir(options.dataDir);
  }

  const useLegacyKisChartFallback = shouldUseLegacyKisChartFallback();
  const useLegacyKisPollingFallback = shouldUseLegacyKisPollingFallback();
  const useLegacyKisQuoteFallback = shouldUseLegacyKisQuoteFallback();
  const db = getDb();
  migrateUp(db);

  const settingsStore = createSettingsStore();
  await settingsStore.load();

  const credentialStore = createFileCredentialStore();
  const snapshotRepo = new PriceSnapshotRepository(db);
  const stockRepo = new StockRepository(db);
  const snapshotStore = new SnapshotStore(snapshotRepo, {
    shouldPersistTicker: (ticker) => stockRepo.findByTicker(ticker) !== null,
  });
  const candleRepo = new PriceCandleRepository(db);
  const priceHistoryRepo = new PriceHistoryPointRepository(db);
  const candleCoverageRepo = new CandleCoverageRepository(db);
  const volumeBaselineEnricher = createVolumeBaselineEnricher({
    stockRepo,
    snapshotRepo,
  });
  const priceStore = new PriceStore({
    enrichPrice: (price) => volumeBaselineEnricher.enrich(price),
  });
  const newsRepo = new StockNewsRepository(db);
  const disclosureRepo = new StockDisclosureRepository(db);
  const dartCorpCodeRepo = new DartCorpCodeRepository(db);
  const signalEventRepo = new StockSignalEventRepository(db);
  const naverSearchNews = createNaverSearchNewsProvider({
    clientId: process.env['NAVER_SEARCH_CLIENT_ID'] ?? '',
    clientSecret: process.env['NAVER_SEARCH_CLIENT_SECRET'] ?? '',
  });
  const newsFeedService = createStockNewsFeedService(
    naverSearchNews === undefined
      ? { repo: newsRepo }
      : { repo: newsRepo, searchNews: naverSearchNews },
  );
  const dartDisclosureService = createDartDisclosureService({
    apiKey: process.env['DART_API_KEY'] ?? '',
    corpCodeRepo: dartCorpCodeRepo,
    disclosureRepo,
  });
  const candleRecorder = createCandleRecorder({
    priceStore,
    aggregator: createCandleAggregator({ writer: candleRepo }),
  });
  const priceHistoryRecorder = createPriceHistoryRecorder({
    priceStore,
    aggregator: createPriceHistoryAggregator({ writer: priceHistoryRepo }),
  });
  const sectorRepo = new SectorRepository(db);
  const favoriteRepo = new FavoriteRepository(db);
  const watchlistProvenanceRepo = new WatchlistSyncProvenanceRepository(db);
  const masterRepo = new MasterStockRepository(db);
  const masterMetaRepo = new MasterStockMetaRepository(db);
  let tossQuotePollingService: TossQuotePollingService | null = null;
  let tossFastQuoteLane: TossFastQuoteLane | null = null;
  let tossFastQuoteCurrentTickers: string[] = [];
  let enqueueKisRealtimeMarketMovement:
    | ((price: Price) => void)
    | null = null;
  const runtimeRef = createKisRuntimeRef(
    {
      db,
      settingsStore,
      credentialStore,
      priceStore,
      snapshotStore,
      stockRepo,
      favoriteRepo,
      shouldSkipKisPolling: () =>
        !useLegacyKisPollingFallback
        || tossQuotePollingService?.shouldSuppressKisPolling() === true,
      shouldStartKisPollingScheduler: () => useLegacyKisPollingFallback,
      onRealtimePriceApplied: (price) => {
        enqueueKisRealtimeMarketMovement?.(price);
      },
    },
    { actuallyStart: defaultActuallyStart },
  );
  const appSseManager = createSseManager({
    priceStore,
    getInitialSnapshot: () => priceStore.getAllPrices(),
    getMarketStatus: () => {
      const state = runtimeRef.get();
      return state.status === 'started'
        ? state.runtime.marketHoursScheduler.getCurrentPhase()
        : 'snapshot';
    },
  });
  const masterService = createMasterStockService({
    repo: masterRepo,
    meta: masterMetaRepo,
    outboundLimiter: () => {
      const state = runtimeRef.get();
      return state.status === 'started' ? state.runtime.outboundLimiter : null;
    },
  });
  const marketSummaryService = createMarketSummaryService();
  const backfillCooldownEndpointClasses = new Set<KisEndpointClass>([
    'daily-backfill',
    'selected_backfill',
    'background_backfill',
    'selected-minute',
  ]);
  const hasActiveOutboundCooldown = (
    endpointClasses: ReadonlySet<KisEndpointClass>,
  ): boolean => {
    const state = runtimeRef.get();
    return state.status === 'started'
      && state.runtime.outboundLimiter
        .snapshot()
        .profiles.some((profile) =>
          profile.cooldownActive
          && profile.endpointClass !== null
          && endpointClasses.has(profile.endpointClass),
        );
  };
  const tossPublicMarketDataProvider = createTossPublicMarketDataProvider();
  const refreshForegroundQuote = async (ticker: string) => {
    let tossQuoteFailure: unknown = null;
    try {
      const batch = await tossPublicMarketDataProvider.getQuoteBatch({ tickers: [ticker] });
      const price = batch.prices[0];
      if (price !== undefined) {
        priceStore.setPrice(price);
        return priceStore.getPrice(ticker) ?? price;
      }
      tossQuoteFailure = new Error('Toss quote refresh returned no price');
    } catch (err: unknown) {
      tossQuoteFailure = err;
    }

    if (!useLegacyKisQuoteFallback) {
      throw tossQuoteFailure instanceof Error
        ? tossQuoteFailure
        : new Error('Toss quote refresh failed');
    }

    log.warn(
      {
        ticker,
        err: tossQuoteFailure instanceof Error
          ? tossQuoteFailure.message
          : String(tossQuoteFailure),
      },
      'Toss foreground quote refresh failed; falling back to KIS because legacy quote fallback is enabled',
    );

    const state = runtimeRef.get();
    if (state.status !== 'started') {
      throw new Error('Toss quote refresh failed and KIS runtime is not started');
    }
    const trId = 'FHKST01010100';
    const price = await fetchRuntimeRestQuoteWithFallback({
      primaryMarketDivCode: resolveRestQuoteMarketDivCode(),
      fetchByMarketDivCode: async (marketDivCode: RestQuoteMarketDivCode) => {
        const resp = await state.runtime.restClient.request<Record<string, unknown>>({
          method: 'GET',
          path: '/uapi/domestic-stock/v1/quotations/inquire-price',
          endpointClass: 'foreground',
          query: {
            FID_COND_MRKT_DIV_CODE: marketDivCode,
            FID_INPUT_ISCD: ticker,
          },
          trId,
        });
        return mapKisInquirePriceToPrice(ticker, resp);
      },
    });
    priceStore.setPrice(price);
    return priceStore.getPrice(ticker) ?? price;
  };
  const dailyBackfillService = createDailyBackfillService({
    repo: candleRepo,
    fetchDailyCandles: async ({ ticker, fromYmd, toYmd, now, endpointClass }) => {
      try {
        return await tossPublicMarketDataProvider.getDailyCandles({
          ticker,
          fromYmd,
          toYmd,
          now,
        });
      } catch (err: unknown) {
        const state = runtimeRef.get();
        if (!useLegacyKisChartFallback || state.status !== 'started') {
          throw err;
        }
        log.warn(
          { ticker, err: err instanceof Error ? err.message : String(err) },
          'Toss daily candle backfill failed; falling back to KIS when available',
        );
      }

      const state = runtimeRef.get();
      if (state.status !== 'started') {
        throw new Error('KIS runtime is not started');
      }
      return fetchKisDailyCandles({
        ticker,
        fromYmd,
        toYmd,
        restClient: state.runtime.restClient,
        ...(endpointClass !== undefined ? { endpointClass } : {}),
        now: () => now,
      });
    },
  });
  const todayMinuteBackfillService = createTodayMinuteBackfillService({
    repo: candleRepo,
    fetchMinuteCandles: async ({ ticker, toHms, now }) => {
      const dateYmd = kstYmd(now);
      try {
        return await fetchTossMinuteCandles({
          ticker,
          dateYmd,
          toHms,
          source: 'toss-time-today',
          now: () => now,
        });
      } catch (err: unknown) {
        const state = runtimeRef.get();
        if (!useLegacyKisChartFallback || state.status !== 'started') {
          throw err;
        }
        log.warn(
          { ticker, err: err instanceof Error ? err.message : String(err) },
          'Toss today minute backfill failed; falling back to KIS when available',
        );
      }

      const state = runtimeRef.get();
      if (state.status !== 'started') {
        throw new Error('KIS runtime is not started');
      }
      return fetchKisTodayMinuteCandles({
        ticker,
        toHms,
        restClient: state.runtime.restClient,
        now: () => now,
      });
    },
  });
  const historicalMinuteBackfillService = createHistoricalMinuteBackfillService({
    repo: candleRepo,
    fetchMinuteCandles: async ({ ticker, dateYmd, toHms, now }) => {
      try {
        return await fetchTossMinuteCandles({
          ticker,
          dateYmd,
          toHms,
          source: 'toss-time-daily',
          now: () => now,
        });
      } catch (err: unknown) {
        const state = runtimeRef.get();
        if (!useLegacyKisChartFallback || state.status !== 'started') {
          throw err;
        }
        log.warn(
          { ticker, err: err instanceof Error ? err.message : String(err) },
          'Toss historical minute backfill failed; falling back to KIS when available',
        );
      }

      const state = runtimeRef.get();
      if (state.status !== 'started') {
        throw new Error('KIS runtime is not started');
      }
      return fetchKisHistoricalMinuteCandles({
        ticker,
        dateYmd,
        toHms,
        restClient: state.runtime.restClient,
        now: () => now,
      });
    },
  });
  const backfillStateStore = createFileBackfillStateStore();
  const backgroundBackfill = createBackgroundDailyBackfillScheduler({
    settingsStore,
    stockRepo,
    favoriteRepo,
    dailyBackfillService,
    stateStore: backfillStateStore,
    marketPhase: () => {
      const state = runtimeRef.get();
      return state.status === 'started'
        ? state.runtime.marketHoursScheduler.getCurrentPhase()
        : 'unknown';
    },
    shouldBackfillTicker: ({ ticker, range, now }) =>
      shouldBackfillDailyTicker({ ticker, range, now, repo: candleRepo }),
    isUpstreamCooldownActive: () => hasActiveOutboundCooldown(backfillCooldownEndpointClasses),
  });
  const dataRetention = createDataRetentionScheduler({
    candleRepo,
    priceHistoryRepo,
    signalEventRepo,
    newsRepo,
  });
  const tossSessionStore = createFileTossSessionStore();
  const tossLoginService = createTossCdpLoginService({ sessionStore: tossSessionStore });
  const tossSessionExtensionService = createTossSessionExtensionService({
    sessionStore: tossSessionStore,
  });
  const tossAccountClient = createTossAccountClient({ sessionStore: tossSessionStore });
  const tossAccountSummaryClient = createTossAccountSummaryClient({ sessionStore: tossSessionStore });
  const tossOrdersClient = createTossOrdersClient({ sessionStore: tossSessionStore });
  const tossProductIconCache = createTossProductIconCache();
  const tossPortfolioSnapshotStore = createTossPortfolioSnapshotStore();
  const tossPortfolioClient = createCachingTossPortfolioClient(
    createTossPortfolioClient({ sessionStore: tossSessionStore, iconCache: tossProductIconCache }),
    tossPortfolioSnapshotStore,
  );
  const tossTransactionsClient = createTossTransactionsClient({ sessionStore: tossSessionStore });
  const tossWatchlistSnapshotStore = createTossWatchlistSnapshotStore();
  const tossWatchlistClient = createCachingTossWatchlistClient(
    createTossWatchlistClient({ sessionStore: tossSessionStore, iconCache: tossProductIconCache }),
    tossWatchlistSnapshotStore,
  );
  const enableTossWatchlistMutation = process.env['ARAON_ENABLE_TOSS_WATCHLIST_MUTATION'] === '1';
  const araonWatchlistService = createAraonWatchlistService({
    watchlistClient: tossWatchlistClient,
    favoriteRepo,
    stockRepo,
    portfolioPositions: tossPortfolioSnapshotStore,
    priceStore,
    watchlistProvenanceRepo,
    enableTossWatchlistMutation,
  });
  const tossNewsClient = createTossNewsClient({ sessionStore: tossSessionStore });
  const tossNewsService = createSessionGatedTossNewsService({
    sessionStore: tossSessionStore,
    client: tossNewsClient,
  });
  const kisWsSlotState = createKisWsSlotStateStore();
  const agentEventStore = createSqliteAgentEventStore(db);
  const agentEventAlertDeliveryStore = createSqliteAgentEventAlertDeliveryStore(db);
  let scheduleKisWsSlotRebalance:
    | ((reason: string) => void)
    | null = null;
  const pendingAgentEventDeliveryTimers = new Set<ReturnType<typeof setTimeout>>();

  function calculateAgentEventDispatchDelayMs(event: AgentEvent): number {
    const firstSeenAtMs = Date.parse(event.firstSeenAt);
    if (!Number.isFinite(firstSeenAtMs)) {
      return AGENT_EVENT_MIN_DISPATCH_DELAY_MS;
    }
    const elapsedMs = Math.max(0, Date.now() - firstSeenAtMs);
    if (elapsedMs >= AGENT_EVENT_MAX_DISPATCH_DELAY_MS) {
      return 0;
    }
    return Math.max(0, AGENT_EVENT_MIN_DISPATCH_DELAY_MS - Math.trunc(elapsedMs));
  }

  function deliverAgentEvent(event: AgentEvent): void {
    const clientCount = appSseManager.broadcastAgentEvent(event);
    agentEventAlertDeliveryStore.append({
      event,
      channel: 'browser-sse',
      target: 'local-ui',
      status: clientCount > 0 ? 'dispatched' : 'skipped_no_client',
      clientCount,
      reason: 'agent-event SSE notification',
    });
    if (shouldRebalanceKisWsSlotsForAgentEvent(event.type)) {
      scheduleKisWsSlotRebalance?.(`agent-event:${event.type}`);
    }
  }

  const agentEventQueue = createAgentEventQueue({
    initialEvents: agentEventStore.snapshot(500),
    onInsert: (event) => {
      agentEventStore.append(event);
      const delayMs = calculateAgentEventDispatchDelayMs(event);
      if (delayMs <= 0) {
        deliverAgentEvent(event);
        return;
      }

      const timer = setTimeout(() => {
        pendingAgentEventDeliveryTimers.delete(timer);
        deliverAgentEvent(event);
      }, delayMs);
      timer.unref?.();
      pendingAgentEventDeliveryTimers.add(timer);
    },
  });
  enqueueKisRealtimeMarketMovement = (price): void => {
    enqueueMarketMovementFromPrice({
      queue: agentEventQueue,
      price,
      source: 'kis-ws-tick',
    });
  };
  const orderIntentService = createOrderIntentService({
    store: createSqliteOrderIntentStore(db),
    agentEventQueue,
  });
  const tossRealtimeQuoteRefresh = createTossRealtimeQuoteRefreshHandler({
    provider: tossPublicMarketDataProvider,
    stockRepo,
    priceStore,
  });
  const tossSseRefreshExecutor = createTossSseRefreshExecutor({
    ordersClient: tossOrdersClient,
    accountSummaryClient: tossAccountSummaryClient,
    portfolioClient: tossPortfolioClient,
    productIconCache: tossProductIconCache,
  });
  const tossSseRefreshResultStore = createTossSseRefreshResultStore({ db });
  const tossRealtimeRefreshHandlers = createTossRealtimeRefreshHandlers({
    quoteRefresh: tossRealtimeQuoteRefresh,
    refreshExecutor: tossSseRefreshExecutor,
    resultStore: tossSseRefreshResultStore,
    broadcastRefreshResult: (entry) => {
      appSseManager.broadcastTossRefreshResult(entry);
    },
    onSkipped: (event) => {
      if (event.kind === 'price-refresh') {
        log.debug({ result: event.result }, 'Toss realtime quote refresh skipped');
        return;
      }
      log.debug(
        { result: event.result, resource: event.hint.resource, ticker: event.hint.ticker },
        'Toss SSE REST refresh skipped',
      );
    },
  });
  const tossRealtimeService = createTossRealtimeService({
    sessionStore: tossSessionStore,
    agentEventQueue,
    onPriceRefresh: tossRealtimeRefreshHandlers.onPriceRefresh,
    onRefreshHint: tossRealtimeRefreshHandlers.onRefreshHint,
    onUserNotification: (notification) => {
      const clientCount = appSseManager.broadcastTossUserNotification(notification);
      if (clientCount === 0) {
        log.debug(
          { ticker: notification.ticker, receivedAt: notification.receivedAt },
          'Toss user notification skipped because no SSE clients are connected',
        );
      }
    },
  });
  const startTossRealtimeIfSessionReady = async (reason: string): Promise<void> => {
    const session = await tossSessionStore.status();
    if (!shouldAutoStartTossRealtime(session)) return;
    const status = await tossRealtimeService.start();
    log.info(
      { reason, state: status.state, thinNotificationOnly: status.thinNotificationOnly },
      'Toss realtime auto-start requested',
    );
  };
  tossQuotePollingService = createTossQuotePollingService({
    provider: tossPublicMarketDataProvider,
    stockRepo,
    priceStore,
    settings: settingsStore,
  });
  const tossUsTopMoversProvider = createTossPublicMarketDataProvider({ market: 'us' });
  const krMarketTopMoversService = createMarketTopMoversService({
    fetchRanking: async ({ direction, count, sourcePhase, onDiagnostic }) => {
      return tossPublicMarketDataProvider.getTopMoversRanking({
        direction,
        count,
        sourcePhase,
        ...(onDiagnostic !== undefined ? { onDiagnostic } : {}),
      });
    },
    sourceKind: 'toss-overview-ranking',
    ttlMs: TOSS_TOP_MOVERS_REFRESH_MS,
    onRotationSampleEntered: ({ candidate }) => {
      enqueueMarketMovementFromTopMover({
        queue: agentEventQueue,
        candidate,
        source: 'toss-top100-rotation',
      });
    },
  });
  const usMarketTopMoversService = createMarketTopMoversService({
    fetchRanking: async ({ direction, count, sourcePhase, onDiagnostic }) => {
      return tossUsTopMoversProvider.getTopMoversRanking({
        direction,
        count,
        sourcePhase,
        ...(onDiagnostic !== undefined ? { onDiagnostic } : {}),
      });
    },
    sourceKind: 'toss-overview-ranking',
    ttlMs: TOSS_TOP_MOVERS_REFRESH_MS,
  });
  let cachedKrTopMoversForFastQuote: MarketTopMoversResponse | null = null;
  const marketTopMoversService = {
    getTopMovers: async (input: { limit?: number; market?: 'kr' | 'us' } = {}) => {
      const service = input.market === 'us'
        ? usMarketTopMoversService
        : krMarketTopMoversService;
      const response = await service.getTopMovers(
        input.limit === undefined ? {} : { limit: input.limit },
      );
      if (input.market !== 'us' && (response.gainers.length > 0 || response.losers.length > 0)) {
        cachedKrTopMoversForFastQuote = response;
      }
      return response;
    },
    snapshot: () => krMarketTopMoversService.snapshot(),
  };
  tossFastQuoteLane = createTossFastQuoteLane({
    provider: tossPublicMarketDataProvider,
    priceStore,
    collectCandidates: async () => {
      const now = new Date().toISOString();
      return buildTossFastQuoteCandidates({
        now,
        currentTickers: tossFastQuoteCurrentTickers,
        favorites: favoriteRepo.findAll(),
        watchlistSnapshot: tossWatchlistSnapshotStore.snapshot(),
        portfolioSnapshot: tossPortfolioSnapshotStore.snapshot(),
        agentEvents: agentEventQueue.snapshot(30),
        orderIntentPreviews: orderIntentService.snapshotPreviews(30),
        topMovers: cachedKrTopMoversForFastQuote,
        kisTrackedTickers: kisWsSlotState.snapshot().map((slot) => slot.ticker),
      });
    },
  });
  const kisWsSlotSessionRebalancer = createKisWsSlotSessionRebalancer({
    runtimeRef,
    favoriteRepo,
    orderIntentService,
    agentEventQueue,
    portfolioPositions: tossPortfolioSnapshotStore,
    watchlistSnapshot: tossWatchlistSnapshotStore,
    marketTopMoversService,
    kisWsSlotState,
  });
  scheduleKisWsSlotRebalance = (reason: string): void => {
    void kisWsSlotSessionRebalancer.rebalance(reason).catch(() => {
      log.warn(
        { code: 'KIS_WS_SLOT_REBALANCE_FAILED' },
        'KIS WS slot rebalance failed',
      );
    });
  };
  const tossRealtimeRankingService = {
    getRealtimeRanking: tossPublicMarketDataProvider.getRealtimeRanking,
  };
  const stockService = createStockService({ stockRepo, sectorRepo, masterRepo });
  const agentEventMonitorIntervalMs = parseOptionalPositiveInt(
    process.env['ARAON_AGENT_EVENT_MONITOR_INTERVAL_MS'],
  );
  const agentEventMonitorMaxTickers = parseOptionalPositiveInt(
    process.env['ARAON_AGENT_EVENT_MONITOR_MAX_TICKERS'],
  );
  const agentEventMonitorProviderCooldownMs = parseOptionalPositiveInt(
    process.env['ARAON_AGENT_EVENT_MONITOR_PROVIDER_COOLDOWN_MS'],
  );
  const agentEventMonitorWatchSources = normalizeAgentEventMonitorWatchSources(
    process.env['ARAON_AGENT_EVENT_MONITOR_WATCH_SOURCES'],
  );
  const tossSignalRequestBody = createTossSignalRequestBodyTemplate(
    process.env['ARAON_TOSS_SIGNAL_REQUEST_BODY_TEMPLATE'],
  );
  const tossSignalEndpointPath = normalizeTossSignalEndpointPath(
    process.env['ARAON_TOSS_SIGNAL_ENDPOINT_PATH'],
  );
  const tossSignalService = tossSignalRequestBody === undefined
    ? undefined
    : createTossSignalClient({
        requestBody: tossSignalRequestBody,
        endpointPath: tossSignalEndpointPath,
        sessionStore: tossSessionStore,
      });
  const agentEventMonitor = createAgentEventMonitor({
    enabled: process.env['ARAON_AGENT_EVENT_MONITOR_ENABLED'] === '1',
    ...(agentEventMonitorIntervalMs !== undefined ? { intervalMs: agentEventMonitorIntervalMs } : {}),
    ...(agentEventMonitorMaxTickers !== undefined ? { maxTickersPerCycle: agentEventMonitorMaxTickers } : {}),
    ...(agentEventMonitorProviderCooldownMs !== undefined ? { providerCooldownMs: agentEventMonitorProviderCooldownMs } : {}),
    ...(agentEventMonitorWatchSources !== undefined ? { watchSources: agentEventMonitorWatchSources } : {}),
    stockService,
    favoriteRepo,
    newsFeedService,
    disclosureRepo,
    dartDisclosureService,
    tossNewsService,
    tossSignalEndpointPath,
    ...(tossSignalService !== undefined ? { tossSignalService } : {}),
    agentEventQueue,
  });

  const setupMutex = createCredentialSetupMutex();
  const app = Fastify({ loggerInstance: logger });
  const autoRefreshLegacyKisMaster = shouldAutoRefreshLegacyKisMaster();

  function maybeQueueLegacyKisMasterRefresh(reason: 'server-start' | 'credentials-configured'): void {
    if (!autoRefreshLegacyKisMaster) {
      log.info({ reason }, 'legacy KIS master auto refresh disabled');
      return;
    }
    void masterService.maybeRefreshOnBoot();
  }

  await app.register(credentialsRoutes, {
    credentialStore,
    settingsStore,
    runtimeRef,
    setupMutex,
    onCredentialsConfigured: () => {
      maybeQueueLegacyKisMasterRefresh('credentials-configured');
    },
  });
  await app.register(stockRoutes, {
    service: stockService,
    candleRepo,
    priceHistoryRepo,
    candleCoverageRepo,
    signalEventRepo,
    newsFeedService,
    disclosureRepo,
    dartDisclosureService,
    agentEventQueue,
    dailyBackfillService,
    todayMinuteBackfillService,
    historicalMinuteBackfillService,
    refreshQuote: refreshForegroundQuote,
    fetchSparklineSeedCandles: async ({ ticker, window, now }) => {
      const seedCursor = new Date(window.to);
      return fetchTossMinuteCandles({
        ticker,
        dateYmd: kstYmd(seedCursor),
        toHms: kstHms(seedCursor),
        source: 'toss-time-today',
        now: () => now,
      });
    },
  });
  await app.register(themeRoutes, { stockRepo });
  await app.register(settingsRoutes, { settingsStore });
  await app.register(favoritesRoutes, { favoriteRepo, runtimeRef });
  await app.register(async (inner) => { importRoutes(inner, { stockRepo, runtimeRef }); });
  await app.register(masterRoutes, {
    service: masterService,
    masterRepo,
    stockRepo,
    credentialStore,
    tossStockLookup: tossPublicMarketDataProvider,
  });
  await app.register(marketRoutes, {
    service: marketSummaryService,
    topMoversService: marketTopMoversService,
    tossRealtimeRankingService,
    tossQuoteService: tossPublicMarketDataProvider,
    tossSearchService: tossPublicMarketDataProvider,
    tossFastQuoteSelectionService: {
      setCurrentTickers: (tickers) => {
        tossFastQuoteCurrentTickers = [...tickers];
      },
    },
  });
  await app.register(tossAuthRoutes, {
    sessionStore: tossSessionStore,
    loginService: tossLoginService,
    extensionService: tossSessionExtensionService,
    onLoginSucceeded: async () => {
      const expiryRefresh = await tossSessionExtensionService.refreshServerExpiry();
      if (expiryRefresh.state !== 'succeeded') {
        log.debug(
          { state: expiryRefresh.state },
          'Toss session server expiry refresh skipped after login',
        );
      }
      await startTossRealtimeIfSessionReady('login-succeeded');
    },
    onSessionCleared: async () => {
      tossProductIconCache.clear();
      tossPortfolioSnapshotStore.clear();
      tossWatchlistSnapshotStore.clear();
      kisWsSlotState.clear();
      await tossRealtimeService.stop().catch(() => undefined);
    },
  });
  await app.register(tossRealtimeRoutes, {
    realtimeService: tossRealtimeService,
    refreshResultStore: tossSseRefreshResultStore,
  });
  await app.register(tossAccountRoutes, { accountClient: tossAccountClient });
  await app.register(tossAccountSummaryRoutes, { summaryClient: tossAccountSummaryClient });
  await app.register(tossOrdersRoutes, { ordersClient: tossOrdersClient });
  await app.register(tossPortfolioRoutes, { portfolioClient: tossPortfolioClient });
  await app.register(tossTransactionsRoutes, { transactionsClient: tossTransactionsClient });
  await app.register(tossWatchlistRoutes, { watchlistClient: tossWatchlistClient });
  await app.register(watchlistRoutes, { service: araonWatchlistService });
  await app.register(agentEventsRoutes, { queue: agentEventQueue });
  await app.register(agentEventAlertDeliveryRoutes, { store: agentEventAlertDeliveryStore });
  await app.register(agentEventMonitorRoutes, { monitor: agentEventMonitor });
  await app.register(agentOrderIntentRoutes, { service: orderIntentService });
  await app.register(kisWsSlotsRoutes, {
    favoriteRepo,
    runtimeRef,
    orderIntentService,
    agentEventQueue,
    portfolioPositions: tossPortfolioSnapshotStore,
    watchlistSnapshot: tossWatchlistSnapshotStore,
    marketTopMoversService,
    kisWsSlotState,
  });
  await app.register(eventsRoutes, { runtimeRef, sseManager: appSseManager });
  await app.register(runtimeRoutes, {
    runtimeRef,
    settingsStore,
    credentialStore,
    stockRepo,
    favoriteRepo,
    candleRepo,
    priceStore,
    backfillStateStore,
    backgroundBackfill,
    signalEventRepo,
    newsRepo,
    disclosureRepo,
    dataRetention,
    marketTopMoversService,
    marketDataProviders: [tossPublicMarketDataProvider],
    tossQuotePolling: tossQuotePollingService,
    tossFastQuoteLane,
    phoneNotifier: createTelegramPhoneNotifier(),
    orderIntentService,
    agentEventQueue,
    portfolioPositions: tossPortfolioSnapshotStore,
    watchlistSnapshot: tossWatchlistSnapshotStore,
    kisWsSlotState,
  });
  await app.register(launcherRoutes, options.launcher ?? {});

  if (options.serveStaticClient === true) {
    if (options.staticDir === undefined) {
      throw new Error('staticDir is required when serveStaticClient is true');
    }
    await registerStaticClient(app, options.staticDir);
  }

  const stored = await credentialStore.load();
  if (stored !== null) {
    try {
      await runtimeRef.start(stored.credentials);
      log.info('runtime auto-started from existing credentials');
    } catch (err: unknown) {
      log.error({ err: err instanceof Error ? err.message : String(err) }, 'auto-start failed — continuing with runtime=failed');
    }
  }

  let shutdownHandle: GracefulShutdownHandle | null = null;

  async function close(): Promise<void> {
    if (shutdownHandle !== null) {
      shutdownHandle.unregister();
      shutdownHandle = null;
    }
    backgroundBackfill.stop();
    for (const timer of pendingAgentEventDeliveryTimers) {
      clearTimeout(timer);
    }
    pendingAgentEventDeliveryTimers.clear();
    await tossRealtimeService.stop().catch(() => undefined);
    await tossQuotePollingService?.stop();
    await tossFastQuoteLane?.stop();
    agentEventMonitor.stop();
    dataRetention.stop();
    await appSseManager.closeAll();
    await runtimeRef.stop();
    await candleRecorder.stop();
    await priceHistoryRecorder.stop();
    await snapshotStore.saveAll(priceStore);
    runCheckpoint();
    await app.close();
    closeDb();
  }

  if (options.registerProcessShutdown === true) {
    shutdownHandle = registerGracefulShutdown({
      ws: { disconnectAll: async () => { await runtimeRef.stop(); } },
      snapshot: {
        saveAll: async (store) => {
          await candleRecorder.stop();
          await priceHistoryRecorder.stop();
          await snapshotStore.saveAll(store);
        },
      },
      store: priceStore,
      checkpoint: runCheckpoint,
    });
  }

  const server: AraonServer = {
    app,
    close,
    async start(listenOptions = {}): Promise<AraonStartedServer> {
      const host = listenOptions.host ?? '127.0.0.1';
      const requestedPort = listenOptions.port ?? 3000;
      await app.listen({ host, port: requestedPort });
      const port = getListeningPort(app);
      const url = `http://${host}:${port}`;
      log.info(`listening on ${host}:${port}`);

      // Legacy KIS master refresh is manual by default in the Toss-first model.
      // It can still be explicitly enabled for maintenance with
      // ARAON_KIS_MASTER_AUTO_REFRESH=1.
      if ((await credentialStore.load()) !== null) {
        maybeQueueLegacyKisMasterRefresh('server-start');
      } else {
        log.info('master cache refresh deferred until credentials are configured');
      }
      dataRetention.start();
      tossQuotePollingService?.start();
      tossFastQuoteLane?.start();
      agentEventMonitor.start();
      backgroundBackfill.start();
      void startTossRealtimeIfSessionReady('server-start').catch((err: unknown) => {
        log.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'Toss realtime auto-start skipped',
        );
      });

      return { ...server, host, port, url };
    },
  };

  return server;
}

export async function startAraonServer(options: AraonListenOptions = {}): Promise<AraonStartedServer> {
  const server = await createAraonServer(options);
  const listenOptions: { host?: string; port?: number } = {};
  if (options.host !== undefined) listenOptions.host = options.host;
  if (options.port !== undefined) listenOptions.port = options.port;
  return server.start(listenOptions);
}

function kstYmd(date: Date): string {
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, '0'),
    String(shifted.getUTCDate()).padStart(2, '0'),
  ].join('');
}

function kstHms(date: Date): string {
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return [
    String(shifted.getUTCHours()).padStart(2, '0'),
    String(shifted.getUTCMinutes()).padStart(2, '0'),
    String(shifted.getUTCSeconds()).padStart(2, '0'),
  ].join('');
}

function parseOptionalPositiveInt(value: string | undefined): number | undefined {
  if (value === undefined || value.trim().length === 0) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.trunc(parsed);
}

function normalizeTossSignalEndpointPath(value: string | undefined): TossSignalEndpointPath {
  if (value === '/api/v1/dashboard/intelligences/all') return value;
  return '/api/v2/dashboard/wts/overview/signals';
}
