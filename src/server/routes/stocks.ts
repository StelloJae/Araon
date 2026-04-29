/**
 * Fastify plugin for stock CRUD endpoints.
 *
 * Routes:
 *   POST   /stocks         – add one stock
 *   GET    /stocks         – list all stocks
 *   DELETE /stocks/:ticker – remove a stock
 *   POST   /stocks/bulk    – bulk-add via CSV text
 *
 * The plugin accepts a `service` option at registration time so the caller
 * (Phase 8+ bootstrap) can inject the real or test implementation.
 * No port binding occurs here.
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import type { StockService } from '../services/stock-service.js';
import { parseStockCsv } from '../parsers/csv-parser.js';
import { createChildLogger } from '@shared/logger.js';

const log = createChildLogger('routes/stocks');

// === Plugin options ===========================================================

export interface StockRoutesOptions extends FastifyPluginOptions {
  service: StockService;
}

// === Request/response schemas =================================================

const addOneBodySchema = z.object({
  ticker: z.string().regex(/^\d{6}$/, 'ticker must be exactly 6 digits'),
  name: z.string().min(1),
  market: z.enum(['KOSPI', 'KOSDAQ']).default('KOSPI'),
  sectorName: z.string().optional(),
});

const bulkBodySchema = z.object({
  csv: z.string().min(1),
});

type AddOneBody = z.infer<typeof addOneBodySchema>;
type BulkBody = z.infer<typeof bulkBodySchema>;

// === Plugin ===================================================================

export async function stockRoutes(
  app: FastifyInstance,
  opts: StockRoutesOptions,
): Promise<void> {
  const { service } = opts;

  // POST /stocks
  app.post<{ Body: AddOneBody }>('/stocks', async (request, reply) => {
    const parsed = addOneBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.issues });
    }

    const { ticker, name, market, sectorName } = parsed.data;
    const addInput =
      sectorName !== undefined
        ? { ticker, name, market, sectorName }
        : { ticker, name, market };
    const result = await service.addOne(addInput);
    log.debug({ ticker: result.stock.ticker }, 'POST /stocks');
    return reply.status(201).send({ success: true, data: result });
  });

  // GET /stocks
  app.get('/stocks', async (_request, reply) => {
    const stocks = service.list();
    return reply.send({ success: true, data: stocks });
  });

  // DELETE /stocks/:ticker
  app.delete<{ Params: { ticker: string } }>('/stocks/:ticker', async (request, reply) => {
    const { ticker } = request.params;
    service.remove(ticker);
    log.debug({ ticker }, 'DELETE /stocks/:ticker');
    return reply.status(204).send();
  });

  // POST /stocks/bulk
  app.post<{ Body: BulkBody }>('/stocks/bulk', async (request, reply) => {
    const parsed = bulkBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.issues });
    }

    const { valid, errors: parseErrors } = parseStockCsv(parsed.data.csv);
    const result = await service.addBulk(valid, parseErrors);

    log.debug(
      { succeeded: result.succeeded, failed: result.failed },
      'POST /stocks/bulk',
    );

    return reply.status(207).send({
      success: result.failed === 0,
      data: {
        succeeded: result.succeeded,
        failed: result.failed,
        errors: result.errors,
      },
    });
  });
}
