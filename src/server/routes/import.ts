/**
 * Fastify plugin: import routes.
 *
 * Routes:
 *   POST /import/kis-watchlist
 *     Calls the KIS '관심종목 그룹조회' endpoint, diffs against existing stocks,
 *     and inserts only new tickers.
 *
 *     Response 200: { imported: number; skipped: number; groups: string[] }
 *     Response 503: { success: false, error: { code: 'KIS_RUNTIME_NOT_READY', runtime: string } }
 *       when the KIS runtime has not been started yet.
 *     Response 502: { error: 'kis-watchlist-unavailable'; hint: string }
 *       on any KIS unavailability (network error, 404, TR_ID mismatch).
 */

import type { FastifyInstance } from 'fastify';

import { createChildLogger } from '@shared/logger.js';

import { fetchWatchlistGroups, KisWatchlistUnavailableError } from '../kis/kis-watchlist-api.js';
import type { StockRepository } from '../db/repositories.js';
import type { KisRuntimeRef } from '../bootstrap-kis.js';

const log = createChildLogger('route-import');

export interface ImportRouteOptions {
  stockRepo: StockRepository;
  runtimeRef: KisRuntimeRef;
}

export function registerRoutes(
  app: FastifyInstance,
  opts: ImportRouteOptions,
): void {
  app.post('/import/kis-watchlist', async (request, reply) => {
    const rs = opts.runtimeRef.get();
    if (rs.status !== 'started') {
      return reply.code(503).send({
        success: false,
        error: { code: 'KIS_RUNTIME_NOT_READY', runtime: rs.status },
      });
    }

    const { restClient, auth } = rs.runtime;

    log.info('POST /import/kis-watchlist received');

    let groups: Awaited<ReturnType<typeof fetchWatchlistGroups>>;
    try {
      groups = await fetchWatchlistGroups({ restClient, auth });
    } catch (err: unknown) {
      if (err instanceof KisWatchlistUnavailableError) {
        log.warn(
          { err: err.message, cause: (err as { cause?: unknown }).cause },
          'KIS watchlist unavailable — returning 502',
        );
        // Surface the KIS-side detail to the client so the user can act on it
        // (e.g. wrong TR_ID, no groups registered, paper-only restriction).
        const causeMsg =
          (err as { cause?: { message?: unknown } }).cause &&
          typeof (err as { cause?: { message?: unknown } }).cause?.message === 'string'
            ? ((err as { cause?: { message?: unknown } }).cause as { message: string }).message
            : null;
        return reply.status(502).send({
          error: 'kis-watchlist-unavailable',
          hint: 'KIS HTS/MTS에 관심종목 그룹이 등록되어 있는지 확인하세요.',
          detail: err.message,
          cause: causeMsg,
        });
      }
      throw err;
    }

    // Flatten all stocks across groups, dedup by ticker within the KIS response.
    const allStocks = groups.flatMap((g) => g.stocks);
    const uniqueByTicker = new Map(allStocks.map((s) => [s.ticker, s]));
    const incomingStocks = [...uniqueByTicker.values()];

    // Diff against existing DB stocks.
    const existing = opts.stockRepo.findAll();
    const existingTickers = new Set(existing.map((s) => s.ticker));

    const newStocks = incomingStocks.filter((s) => !existingTickers.has(s.ticker));
    const skipped = incomingStocks.length - newStocks.length;

    if (newStocks.length > 0) {
      await opts.stockRepo.bulkUpsert(newStocks);
    }

    const groupNames = groups.map((g) => g.groupName);

    log.info(
      { imported: newStocks.length, skipped, groups: groupNames },
      'KIS watchlist import complete',
    );

    return reply.status(200).send({
      imported: newStocks.length,
      skipped,
      groups: groupNames,
    });
  });
}
