import type { AddressInfo } from 'node:net';
import Fastify, { type FastifyInstance } from 'fastify';
import { logger, createChildLogger } from '@shared/logger.js';

import { getDb, closeDb, runCheckpoint } from './db/database.js';
import { migrateUp } from './db/migrator.js';
import {
  StockRepository,
  SectorRepository,
  FavoriteRepository,
  PriceSnapshotRepository,
  PriceCandleRepository,
  StockNoteRepository,
  StockNewsRepository,
  StockSignalEventRepository,
  MasterStockRepository,
  MasterStockMetaRepository,
} from './db/repositories.js';
import { createSettingsStore } from './settings-store.js';
import { createFileCredentialStore } from './credential-store.js';
import { PriceStore } from './price/price-store.js';
import { SnapshotStore } from './price/snapshot-store.js';
import { createCandleAggregator, createCandleRecorder } from './price/candle-aggregator.js';
import { createBackgroundDailyBackfillScheduler } from './chart/background-backfill-scheduler.js';
import { createFileBackfillStateStore } from './chart/backfill-state-store.js';
import { createDailyBackfillService } from './chart/daily-backfill-service.js';
import { createTodayMinuteBackfillService } from './chart/today-minute-backfill-service.js';
import { createVolumeBaselineEnricher } from './volume/volume-baseline-service.js';
import { createKisRuntimeRef, defaultActuallyStart } from './bootstrap-kis.js';
import { fetchKisDailyCandles } from './kis/kis-daily-chart.js';
import { fetchKisTodayMinuteCandles } from './kis/kis-today-minute-chart.js';
import { createStockService } from './services/stock-service.js';
import { createStockNewsFeedService } from './news/news-feed-service.js';
import { createDataRetentionScheduler } from './maintenance/data-retention.js';
import { createMasterStockService } from './services/master-stock-service.js';
import { createCredentialSetupMutex, credentialsRoutes } from './routes/credentials.js';
import { stockRoutes } from './routes/stocks.js';
import { themeRoutes } from './routes/themes.js';
import { settingsRoutes } from './routes/settings.js';
import { favoritesRoutes } from './routes/favorites.js';
import { registerRoutes as importRoutes } from './routes/import.js';
import { eventsRoutes } from './routes/events.js';
import { masterRoutes } from './routes/master.js';
import { runtimeRoutes } from './routes/runtime.js';
import { launcherRoutes, type LauncherRoutesOptions } from './routes/launcher.js';
import { registerGracefulShutdown, type GracefulShutdownHandle } from './lifecycle/graceful-shutdown.js';
import { configureDataDir } from './runtime-paths.js';
import { registerStaticClient } from './static-client.js';

const log = createChildLogger('server');
type AraonFastifyInstance = FastifyInstance<any, any, any, any, any>;

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

  const db = getDb();
  migrateUp(db);

  const settingsStore = createSettingsStore();
  await settingsStore.load();

  const credentialStore = createFileCredentialStore();
  const snapshotRepo = new PriceSnapshotRepository(db);
  const stockRepo = new StockRepository(db);
  const snapshotStore = new SnapshotStore(snapshotRepo);
  const candleRepo = new PriceCandleRepository(db);
  const volumeBaselineEnricher = createVolumeBaselineEnricher({
    stockRepo,
    snapshotRepo,
  });
  const priceStore = new PriceStore({
    enrichPrice: (price) => volumeBaselineEnricher.enrich(price),
  });
  const noteRepo = new StockNoteRepository(db);
  const newsRepo = new StockNewsRepository(db);
  const signalEventRepo = new StockSignalEventRepository(db);
  const newsFeedService = createStockNewsFeedService({ repo: newsRepo });
  const candleRecorder = createCandleRecorder({
    priceStore,
    aggregator: createCandleAggregator({ writer: candleRepo }),
  });
  const sectorRepo = new SectorRepository(db);
  const favoriteRepo = new FavoriteRepository(db);
  const masterRepo = new MasterStockRepository(db);
  const masterMetaRepo = new MasterStockMetaRepository(db);
  const masterService = createMasterStockService({
    repo: masterRepo,
    meta: masterMetaRepo,
  });

  const runtimeRef = createKisRuntimeRef(
    { db, settingsStore, credentialStore, priceStore, snapshotStore, stockRepo, favoriteRepo },
    { actuallyStart: defaultActuallyStart },
  );
  const dailyBackfillService = createDailyBackfillService({
    repo: candleRepo,
    fetchDailyCandles: async ({ ticker, fromYmd, toYmd, now }) => {
      const state = runtimeRef.get();
      if (state.status !== 'started') {
        throw new Error('KIS runtime is not started');
      }
      return fetchKisDailyCandles({
        ticker,
        fromYmd,
        toYmd,
        restClient: state.runtime.restClient,
        now: () => now,
      });
    },
  });
  const todayMinuteBackfillService = createTodayMinuteBackfillService({
    repo: candleRepo,
    fetchMinuteCandles: async ({ ticker, toHms, now }) => {
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
  });
  const dataRetention = createDataRetentionScheduler({
    candleRepo,
    signalEventRepo,
    newsRepo,
  });

  const setupMutex = createCredentialSetupMutex();
  const app = Fastify({ loggerInstance: logger });

  await app.register(credentialsRoutes, {
    credentialStore,
    settingsStore,
    runtimeRef,
    setupMutex,
    onCredentialsConfigured: () => {
      void masterService.maybeRefreshOnBoot();
    },
  });
  await app.register(stockRoutes, {
    service: createStockService({ stockRepo, sectorRepo, masterRepo }),
    candleRepo,
    noteRepo,
    signalEventRepo,
    newsFeedService,
    dailyBackfillService,
    todayMinuteBackfillService,
  });
  await app.register(themeRoutes, { stockRepo });
  await app.register(settingsRoutes, { settingsStore });
  await app.register(favoritesRoutes, { favoriteRepo, runtimeRef });
  await app.register(async (inner) => { importRoutes(inner, { stockRepo, runtimeRef }); });
  await app.register(masterRoutes, { service: masterService, masterRepo, stockRepo, credentialStore });
  await app.register(eventsRoutes, { runtimeRef });
  await app.register(runtimeRoutes, {
    runtimeRef,
    settingsStore,
    credentialStore,
    stockRepo,
    favoriteRepo,
    candleRepo,
    priceStore,
    backfillStateStore,
    signalEventRepo,
    noteRepo,
    newsRepo,
    dataRetention,
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
    dataRetention.stop();
    await runtimeRef.stop();
    await candleRecorder.stop();
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

      // Background master refresh never blocks listen/render, but clean first-run
      // must not contact KIS endpoints before credentials are configured.
      if ((await credentialStore.load()) !== null) {
        void masterService.maybeRefreshOnBoot();
      } else {
        log.info('master cache refresh deferred until credentials are configured');
      }
      dataRetention.start();
      backgroundBackfill.start();

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
