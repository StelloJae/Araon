/**
 * KIS '관심종목 그룹조회' API wrapper.
 *
 * Calls GET `KIS_INTSTOCK_GROUPLIST_PATH` with `tr_id = KIS_INTSTOCK_GROUPLIST_TR_ID`,
 * parses the KIS response shape defensively via zod, and returns typed groups.
 *
 * Note: the TR_ID is marked TODO in kis-constraints — if KIS returns an error
 * on the first real call, the full error detail (including the correct TR_ID)
 * is logged so the constant can be updated.
 */

import { z } from 'zod';

import {
  KIS_INTSTOCK_GROUPLIST_PATH,
  KIS_INTSTOCK_GROUPLIST_TR_ID,
} from '@shared/kis-constraints.js';
import { createChildLogger } from '@shared/logger.js';
import type { Stock } from '@shared/types.js';

import type { KisRestClient } from './kis-rest-client.js';
import type { KisAuth } from './kis-auth.js';

const log = createChildLogger('kis-watchlist-api');

// === Error ===================================================================

/**
 * Thrown when the KIS watchlist endpoint is unreachable, returns 404, or
 * returns a response that cannot be parsed. The route uses `instanceof` to
 * surface a 502 with a CSV fallback hint.
 */
export class KisWatchlistUnavailableError extends Error {
  readonly cause: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'KisWatchlistUnavailableError';
    this.cause = cause;
  }
}

// === KIS response schema =====================================================

/**
 * A single stock entry within a group. KIS field names are Korean — we accept
 * any unknown extras via `.passthrough()` and extract only what we need.
 */
const kisStockItemSchema = z
  .object({
    종목코드: z.string().min(1),
    종목명: z.string().default(''),
    시장: z.string().default(''),
  })
  .passthrough();

/**
 * A watchlist group returned in the `output` array. The field names reflect
 * the actual KIS payload; group-level extras are tolerated.
 */
const kisGroupSchema = z
  .object({
    그룹명: z.string().default(''),
    종목리스트: z.array(kisStockItemSchema).default([]),
  })
  .passthrough();

/**
 * Top-level KIS response envelope. `output` holds the list of groups.
 * `rt_cd` / `msg_cd` / `msg1` are already handled by `KisRestError` in the
 * rest client — by the time this schema runs, `rt_cd` must be "0".
 */
const kisWatchlistResponseSchema = z
  .object({
    output: z.array(kisGroupSchema).default([]),
  })
  .passthrough();

// === Types ===================================================================

export interface WatchlistGroup {
  groupName: string;
  stocks: Stock[];
}

export interface FetchWatchlistDeps {
  restClient: KisRestClient;
  auth: KisAuth;
}

// === Implementation ==========================================================

function marketToStockMarket(raw: string): Stock['market'] {
  const upper = raw.toUpperCase();
  if (upper.includes('KOSDAQ') || upper === 'Q') return 'KOSDAQ';
  return 'KOSPI';
}

/**
 * Fetches the user's KIS watchlist groups and converts each stock entry to a
 * `Stock`. Throws `KisWatchlistUnavailableError` on any network, HTTP, or
 * parse failure so the caller can return a clear 502 rather than a 500.
 */
export async function fetchWatchlistGroups(
  deps: FetchWatchlistDeps,
): Promise<WatchlistGroup[]> {
  log.info(
    { path: KIS_INTSTOCK_GROUPLIST_PATH, trId: KIS_INTSTOCK_GROUPLIST_TR_ID },
    'fetching KIS watchlist groups',
  );

  let raw: unknown;
  try {
    raw = await deps.restClient.request({
      method: 'GET',
      path: KIS_INTSTOCK_GROUPLIST_PATH,
      trId: KIS_INTSTOCK_GROUPLIST_TR_ID,
    });
  } catch (err: unknown) {
    log.error(
      { err, path: KIS_INTSTOCK_GROUPLIST_PATH, trId: KIS_INTSTOCK_GROUPLIST_TR_ID },
      'KIS watchlist request failed — check TR_ID if this is the first call',
    );
    throw new KisWatchlistUnavailableError(
      `KIS watchlist endpoint unreachable or returned an error: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  const parsed = kisWatchlistResponseSchema.safeParse(raw);
  if (!parsed.success) {
    log.error({ issues: parsed.error.issues, raw }, 'KIS watchlist response failed schema validation');
    throw new KisWatchlistUnavailableError(
      `KIS watchlist response did not match expected shape: ${parsed.error.message}`,
      parsed.error,
    );
  }

  const groups: WatchlistGroup[] = parsed.data.output.map((group) => {
    const stocks: Stock[] = group.종목리스트.map((item) => ({
      ticker: item.종목코드,
      name: item.종목명,
      market: marketToStockMarket(item.시장),
    }));
    return { groupName: group.그룹명, stocks };
  });

  log.info(
    { groupCount: groups.length, totalStocks: groups.reduce((n, g) => n + g.stocks.length, 0) },
    'KIS watchlist groups fetched',
  );

  return groups;
}
