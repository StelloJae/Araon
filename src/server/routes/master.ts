/**
 * Fastify plugin: master stock routes.
 *
 * Endpoints:
 *   GET  /master/list        — full searchable KRX universe + freshness meta
 *   POST /master/refresh     — manually re-pull mst files (lock-protected)
 *   POST /stocks/from-master — promote a master ticker into the user's
 *                              tracked catalog (`stocks` table). Polling
 *                              picks it up on the next cycle automatically.
 *
 * No auth gating beyond what the rest of the local-only server already
 * enforces. `POST /master/refresh` is idempotent — concurrent calls share
 * one in-flight Promise via `MasterStockService`.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { createChildLogger } from '@shared/logger.js';
import type { CredentialStore } from '../credential-store.js';
import type { MasterStockService } from '../services/master-stock-service.js';
import type { TossStockSearchItem } from '../toss/toss-public-client.js';
import type {
  MasterStockRepository,
  StockRepository,
} from '../db/repositories.js';

const log = createChildLogger('routes/master');

interface MasterRoutesOptions {
  service: MasterStockService;
  masterRepo: MasterStockRepository;
  stockRepo: StockRepository;
  credentialStore: CredentialStore;
  tossStockLookup?: {
    getStockByTicker(input: { ticker: string }): Promise<TossStockSearchItem | null>;
  };
}

const fromMasterBodySchema = z.object({
  ticker: z.string().regex(/^\d{6}$/, 'ticker must be exactly 6 digits'),
});

export async function masterRoutes(
  app: FastifyInstance,
  opts: MasterRoutesOptions,
): Promise<void> {
  const { service, masterRepo, stockRepo, credentialStore, tossStockLookup } = opts;

  app.get('/master/list', async (_request, reply) => {
    const payload = service.list();
    return reply.send({ success: true, data: payload });
  });

  app.post('/master/refresh', async (_request, reply) => {
    const stored = await credentialStore.load();
    if (stored === null) {
      return reply.code(409).send({
        success: false,
        error: {
          code: 'MASTER_REFRESH_REQUIRES_CREDENTIALS',
          message: 'KIS credentials are required before refreshing public master files',
        },
      });
    }
    const status = await service.refresh();
    if (status.lastError !== null && status.refreshedAt === null) {
      return reply.code(502).send({
        success: false,
        error: 'master-refresh-failed',
        detail: status.lastError,
      });
    }
    return reply.send({ success: true, data: status });
  });

  app.post('/stocks/from-master', async (request, reply) => {
    const parsed = fromMasterBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ success: false, error: parsed.error.issues });
    }
    const { ticker } = parsed.data;

    // Already tracked? Idempotent — return existing entry.
    const existing = stockRepo.findByTicker(ticker);
    if (existing !== null) {
      return reply.send({
        success: true,
        data: { stock: existing, created: false },
      });
    }

    const master = masterRepo.findOne(ticker);
    if (master === null) {
      return reply.code(404).send({
        success: false,
        error: 'master-ticker-not-found',
        ticker,
      });
    }

    await stockRepo.bulkUpsert([
      { ticker: master.ticker, name: master.name, market: master.market },
    ]);
    log.info({ ticker, name: master.name }, 'promoted master ticker to tracked catalog');

    return reply.code(201).send({
      success: true,
      data: {
        stock: { ticker: master.ticker, name: master.name, market: master.market },
        created: true,
      },
    });
  });

  app.post('/stocks/from-toss-search', async (request, reply) => {
    if (tossStockLookup === undefined) {
      return reply.code(503).send({
        success: false,
        error: {
          code: 'TOSS_STOCK_LOOKUP_UNAVAILABLE',
          message: 'Toss stock lookup service is not configured.',
        },
      });
    }
    const parsed = fromMasterBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ success: false, error: parsed.error.issues });
    }
    const { ticker } = parsed.data;

    const existing = stockRepo.findByTicker(ticker);
    if (existing !== null) {
      return reply.send({
        success: true,
        data: { stock: existing, created: false, source: 'local' },
      });
    }

    let stock: TossStockSearchItem | null;
    try {
      stock = await tossStockLookup.getStockByTicker({ ticker });
    } catch {
      return reply.code(502).send({
        success: false,
        error: {
          code: 'TOSS_STOCK_LOOKUP_FAILED',
          message: 'Toss stock lookup failed.',
        },
      });
    }
    if (stock === null) {
      return reply.code(404).send({
        success: false,
        error: {
          code: 'TOSS_STOCK_NOT_FOUND',
          message: 'Toss stock lookup returned no supported KRX stock.',
        },
      });
    }

    await stockRepo.bulkUpsert([
      { ticker: stock.ticker, name: stock.name, market: stock.market },
    ]);
    log.info({ ticker, name: stock.name }, 'promoted Toss search ticker to tracked catalog');

    return reply.code(201).send({
      success: true,
      data: {
        stock: { ticker: stock.ticker, name: stock.name, market: stock.market },
        created: true,
        source: 'toss-public-search',
      },
    });
  });
}
