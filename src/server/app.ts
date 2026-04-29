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
  MasterStockRepository,
  MasterStockMetaRepository,
} from './db/repositories.js';
import { createSettingsStore } from './settings-store.js';
import { createFileCredentialStore } from './credential-store.js';
import { PriceStore } from './price/price-store.js';
import { SnapshotStore } from './price/snapshot-store.js';
import { createKisRuntimeRef, defaultActuallyStart } from './bootstrap-kis.js';
import { createStockService } from './services/stock-service.js';
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
  const priceStore = new PriceStore();
  const snapshotRepo = new PriceSnapshotRepository(db);
  const snapshotStore = new SnapshotStore(snapshotRepo);
  const stockRepo = new StockRepository(db);
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

  const setupMutex = createCredentialSetupMutex();
  const app = Fastify({ loggerInstance: logger });

  await app.register(credentialsRoutes, { credentialStore, settingsStore, runtimeRef, setupMutex });
  await app.register(stockRoutes, {
    service: createStockService({ stockRepo, sectorRepo, masterRepo }),
  });
  await app.register(themeRoutes, { stockRepo });
  await app.register(settingsRoutes, { settingsStore });
  await app.register(favoritesRoutes, { favoriteRepo, runtimeRef });
  await app.register(async (inner) => { importRoutes(inner, { stockRepo, runtimeRef }); });
  await app.register(masterRoutes, { service: masterService, masterRepo, stockRepo });
  await app.register(eventsRoutes, { runtimeRef });
  await app.register(runtimeRoutes, { runtimeRef, settingsStore, credentialStore });

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
    await runtimeRef.stop();
    await snapshotStore.saveAll(priceStore);
    runCheckpoint();
    await app.close();
    closeDb();
  }

  if (options.registerProcessShutdown === true) {
    shutdownHandle = registerGracefulShutdown({
      ws: { disconnectAll: async () => { await runtimeRef.stop(); } },
      snapshot: snapshotStore,
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

      // Background master refresh — never blocks listen / dashboard render.
      void masterService.maybeRefreshOnBoot();

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
