/**
 * Fastify plugin for favorite-list endpoints.
 *
 * Routes:
 *   GET    /favorites          – list every favorite (ordered by addedAt).
 *   POST   /favorites          – add one; triggers a tier-manager diff that
 *                                is forwarded to the realtime bridge.
 *   DELETE /favorites/:ticker  – remove one; same diff → bridge hand-off.
 *
 * This plugin is pure — it does NOT bind to a port. Phase 8 bootstrap owns
 * the Fastify instance and registers this plugin with the live dependencies.
 *
 * The KIS runtime is optional for Toss-first mode. When KIS is not started,
 * the route still reads/writes the local favorite repository and marks new
 * favorites as polling-only. When KIS is started, tier diffs are forwarded to
 * the realtime bridge.
 *
 * Error surface:
 *   - 400 on zod validation failure.
 *   - 404 when DELETE is asked to remove a non-existent favorite.
 *   - 503 when the KIS runtime is not yet started.
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';

import type { Favorite } from '@shared/types.js';
import { createChildLogger } from '@shared/logger.js';

import type { FavoriteRepository } from '../db/repositories.js';
import type { TierDiff, TierManager } from '../realtime/tier-manager.js';
import type { KisRuntimeRef } from '../bootstrap-kis.js';

const log = createChildLogger('routes/favorites');

// === Plugin options ===========================================================

export interface FavoritesRoutesOptions extends FastifyPluginOptions {
  favoriteRepo: FavoriteRepository;
  runtimeRef: KisRuntimeRef;
}

// === Request schemas ==========================================================

const postBodySchema = z.object({
  ticker: z.string().regex(/^\d{6}$/, 'ticker must be exactly 6 digits'),
});
type PostBody = z.infer<typeof postBodySchema>;

// === Response shapes ==========================================================

interface FavoriteAddResponse {
  ticker: string;
  tier: Favorite['tier'];
}

// === Plugin ===================================================================

function syncFavoriteTiers(
  favoriteRepo: FavoriteRepository,
  tierManager: TierManager,
): void {
  for (const favorite of tierManager.listFavorites()) {
    favoriteRepo.upsert(favorite);
  }
}

export async function favoritesRoutes(
  app: FastifyInstance,
  opts: FavoritesRoutesOptions,
): Promise<void> {
  const { favoriteRepo, runtimeRef } = opts;

  app.get('/favorites', async (_request, reply) => {
    const rs = runtimeRef.get();
    if (rs.status !== 'started') {
      return reply.send({ success: true, data: favoriteRepo.findAll() });
    }

    const favorites = rs.runtime.tierManager.listFavorites();
    syncFavoriteTiers(favoriteRepo, rs.runtime.tierManager);
    return reply.send({ success: true, data: favorites });
  });

  app.post<{ Body: PostBody }>('/favorites', async (request, reply) => {
    const parsed = postBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: parsed.error.issues });
    }

    const rs = runtimeRef.get();
    if (rs.status !== 'started') {
      const favorite: Favorite = {
        ticker: parsed.data.ticker,
        tier: 'polling',
        addedAt: new Date().toISOString(),
      };
      favoriteRepo.upsert(favorite);
      const body: FavoriteAddResponse = {
        ticker: favorite.ticker,
        tier: favorite.tier,
      };
      return reply.status(201).send({ success: true, data: body });
    }

    const { tierManager, bridge } = rs.runtime;

    const { ticker } = parsed.data;

    const addedAt = new Date().toISOString();
    const diff: TierDiff = tierManager.addFavorite(ticker, addedAt);
    syncFavoriteTiers(favoriteRepo, tierManager);

    const tier =
      tierManager.listFavorites().find((favorite) => favorite.ticker === ticker)
        ?.tier ?? 'polling';

    try {
      await bridge.applyDiff(diff);
    } catch (err: unknown) {
      log.warn(
        {
          ticker,
          err: err instanceof Error ? err.message : String(err),
        },
        'bridge.applyDiff threw on POST /favorites',
      );
    }

    const body: FavoriteAddResponse = { ticker, tier };
    return reply.status(201).send({ success: true, data: body });
  });

  app.delete<{ Params: { ticker: string } }>(
    '/favorites/:ticker',
    async (request, reply) => {
      const { ticker } = request.params;
      const rs = runtimeRef.get();
      if (rs.status !== 'started') {
        const existing = favoriteRepo.findByTicker(ticker);
        if (existing === null) {
          return reply.status(404).send({ success: false, error: 'not found' });
        }
        favoriteRepo.delete(ticker);
        return reply.status(204).send();
      }

      const { tierManager, bridge } = rs.runtime;
      const existing = favoriteRepo.findByTicker(ticker);
      if (existing === null) {
        return reply.status(404).send({ success: false, error: 'not found' });
      }

      const diff = tierManager.removeFavorite(ticker);
      favoriteRepo.delete(ticker);
      syncFavoriteTiers(favoriteRepo, tierManager);

      try {
        await bridge.applyDiff(diff);
      } catch (err: unknown) {
        log.warn(
          {
            ticker,
            err: err instanceof Error ? err.message : String(err),
          },
          'bridge.applyDiff threw on DELETE /favorites/:ticker',
        );
      }

      return reply.status(204).send();
    },
  );
}
