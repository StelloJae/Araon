/**
 * Theme routes — read-only theme catalog + bulk stock registration from a theme.
 *
 * GET  /themes          → list of themes (id, name, description?, stockCount)
 * GET  /themes/:id      → full theme including stocks[]
 * POST /stocks/from-theme → bulk-register all stocks in a theme via StockRepository
 *
 * The route plugin accepts `{ stockRepo }` as options so callers inject the
 * repository; this module never imports `getDb()` directly.
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import type { StockRepository } from '../db/repositories.js';
import { themes, getThemeById } from '../data/theme-stocks.js';
import { createChildLogger } from '@shared/logger.js';

const log = createChildLogger('themes-routes');

// === Plugin options ===========================================================

export interface ThemeRoutesOptions extends FastifyPluginOptions {
  stockRepo: StockRepository;
}

// === Zod schemas ==============================================================

const fromThemeBodySchema = z.object({
  themeId: z.string().min(1),
  sectorName: z.string().min(1).optional(),
});

type FromThemeBody = z.infer<typeof fromThemeBodySchema>;

// === Plugin ==================================================================

export async function themeRoutes(
  app: FastifyInstance,
  opts: ThemeRoutesOptions,
): Promise<void> {
  const { stockRepo } = opts;

  // GET /themes — returns theme summaries (no stocks array)
  app.get('/themes', async (_req, reply) => {
    const summaries = themes.map(({ id, name, description, stocks }) => ({
      id,
      name,
      ...(description !== undefined ? { description } : {}),
      stockCount: stocks.length,
    }));

    log.debug({ count: summaries.length }, 'GET /themes');
    return reply.send(summaries);
  });

  // GET /themes/:id — returns full theme including stocks[]
  app.get<{ Params: { id: string } }>('/themes/:id', async (req, reply) => {
    const theme = getThemeById(req.params.id);

    if (theme === undefined) {
      return reply.status(404).send({ error: 'Theme not found' });
    }

    log.debug({ themeId: req.params.id, stockCount: theme.stocks.length }, 'GET /themes/:id');
    return reply.send(theme);
  });

  // POST /stocks/from-theme — bulk-register all stocks in a theme
  app.post<{ Body: FromThemeBody }>('/stocks/from-theme', async (req, reply) => {
    const parseResult = fromThemeBodySchema.safeParse(req.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const { themeId } = parseResult.data;
    const theme = getThemeById(themeId);

    if (theme === undefined) {
      return reply.status(404).send({ error: `Theme '${themeId}' not found` });
    }

    const existingTickers = new Set(stockRepo.findAll().map((s) => s.ticker));
    const toInsert = theme.stocks.filter((s) => !existingTickers.has(s.ticker));
    const skipped = theme.stocks.length - toInsert.length;

    if (toInsert.length > 0) {
      await stockRepo.bulkUpsert(toInsert);
    }

    log.info(
      { themeId, imported: toInsert.length, skipped },
      'POST /stocks/from-theme complete',
    );

    return reply.status(201).send({
      themeId,
      imported: toInsert.length,
      skipped,
    });
  });
}
