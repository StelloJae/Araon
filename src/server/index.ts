import Fastify from 'fastify';
import { logger, createChildLogger } from '@shared/logger.js';

import { getDb, runCheckpoint } from './db/database.js';
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
import { registerGracefulShutdown } from './lifecycle/graceful-shutdown.js';

const log = createChildLogger('server');

async function main(): Promise<void> {
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

  const stored = await credentialStore.load();
  if (stored !== null) {
    try {
      await runtimeRef.start(stored.credentials);
      log.info('runtime auto-started from existing credentials');
    } catch (err: unknown) {
      log.error({ err: err instanceof Error ? err.message : String(err) }, 'auto-start failed — continuing with runtime=failed');
    }
  }

  await app.listen({ host: '127.0.0.1', port: 3000 });
  log.info('listening on 127.0.0.1:3000');

  // Background master refresh — never blocks listen / dashboard render.
  void masterService.maybeRefreshOnBoot();

  registerGracefulShutdown({
    ws: { disconnectAll: async () => { await runtimeRef.stop(); } },
    snapshot: snapshotStore,
    store: priceStore,
    checkpoint: runCheckpoint,
  });
}

main().catch((err: unknown) => {
  log.fatal({ err: err instanceof Error ? err.message : String(err) }, 'server bootstrap failed');
  process.exit(1);
});
