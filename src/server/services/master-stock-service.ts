/**
 * Master stock service — owns refresh lifecycle for the KRX universe used
 * by client-side search.
 *
 * Lifecycle:
 *   - On boot, the orchestrator calls `maybeRefreshOnBoot()`. The call
 *     returns immediately; if the cache is stale (>24h) or empty, a
 *     background refresh starts and the existing DB rows continue to be
 *     served.
 *   - `refresh()` is also called from `POST /master/refresh`. A single
 *     in-flight refresh promise is reused — concurrent callers share the
 *     same Promise, so `POST /master/refresh` clicked twice never doubles
 *     the network work.
 *   - Failures keep the existing DB rows intact and update
 *     `master_stock_meta.last_error` instead.
 *
 * Honest data policy:
 *   - Empty fetch result = treat as failure (don't wipe to 0 rows).
 *   - Non-empty fetch = full atomic replace via `MasterStockRepository.swapAll`.
 *   - `refreshedAt` only advances on successful swap.
 */

import { createChildLogger } from '@shared/logger.js';
import {
  fetchMaster,
  KisMasterFetchError,
  type FetchMasterResult,
  type MasterStockRow,
} from '../kis/kis-master-fetcher.js';
import type {
  MasterStockEntry,
  MasterStockMetaRepository,
  MasterStockRepository,
} from '../db/repositories.js';

const log = createChildLogger('master-stock-service');

export const MASTER_REFRESH_TTL_MS = 24 * 60 * 60_000; // 24h
export const MASTER_STALE_WARNING_MS = 7 * 24 * 60 * 60_000; // 7d
const META_KEY_REFRESHED_AT = 'last_refreshed_at';
const META_KEY_LAST_ERROR = 'last_error';
const META_KEY_LAST_ROW_COUNT = 'last_row_count';
const META_KEY_SOURCE = 'source';
const SOURCE_KIS_MST = 'kis_mst';

export interface MasterRefreshStatus {
  status: 'idle' | 'running' | 'success' | 'failed';
  refreshedAt: string | null;
  rowCount: number;
  lastError: string | null;
  /** Convenience: true when refreshedAt is within MASTER_REFRESH_TTL_MS. */
  fresh: boolean;
  /** Convenience: true when refreshedAt is older than MASTER_STALE_WARNING_MS. */
  stale: boolean;
}

export interface MasterListPayload {
  items: MasterStockEntry[];
  refreshedAt: string | null;
  rowCount: number;
  fresh: boolean;
  stale: boolean;
  source: string;
}

export interface MasterStockServiceDeps {
  repo: MasterStockRepository;
  meta: MasterStockMetaRepository;
  fetcher?: (opts?: Parameters<typeof fetchMaster>[0]) => Promise<FetchMasterResult>;
  /** Override `Date.now()` for tests. */
  now?: () => number;
}

export interface MasterStockService {
  list(): MasterListPayload;
  status(): MasterRefreshStatus;
  /**
   * Force a refresh. Resolves to the new status. If a refresh is already
   * in flight, the existing promise is returned (no double work).
   */
  refresh(): Promise<MasterRefreshStatus>;
  /**
   * Boot-time check: if the cache is empty or older than the TTL, kick a
   * background refresh. Returns immediately. Errors are logged, not thrown.
   */
  maybeRefreshOnBoot(): Promise<MasterRefreshStatus | null>;
  /** Test-only: wait for any pending refresh. */
  waitIdle(): Promise<void>;
}

export function createMasterStockService(
  deps: MasterStockServiceDeps,
): MasterStockService {
  const fetcher = deps.fetcher ?? fetchMaster;
  const now = deps.now ?? (() => Date.now());

  let inflight: Promise<MasterRefreshStatus> | null = null;
  let refreshing = false;

  function freshness(refreshedAtIso: string | null): {
    fresh: boolean;
    stale: boolean;
  } {
    if (refreshedAtIso === null) return { fresh: false, stale: false };
    const ageMs = now() - new Date(refreshedAtIso).getTime();
    return {
      fresh: ageMs < MASTER_REFRESH_TTL_MS,
      stale: ageMs >= MASTER_STALE_WARNING_MS,
    };
  }

  function readStatus(): MasterRefreshStatus {
    const refreshedAt = deps.meta.get(META_KEY_REFRESHED_AT);
    const rowCountStr = deps.meta.get(META_KEY_LAST_ROW_COUNT);
    const rowCount =
      rowCountStr !== null && Number.isFinite(Number(rowCountStr))
        ? Number(rowCountStr)
        : deps.repo.count();
    const lastError = deps.meta.get(META_KEY_LAST_ERROR);
    const { fresh, stale } = freshness(refreshedAt);
    return {
      status: refreshing ? 'running' : refreshedAt !== null ? 'success' : lastError !== null ? 'failed' : 'idle',
      refreshedAt,
      rowCount,
      lastError,
      fresh,
      stale,
    };
  }

  async function doRefresh(): Promise<MasterRefreshStatus> {
    refreshing = true;
    try {
      log.info('master refresh starting');
      const result = await fetcher();
      if (result.combined.length === 0) {
        throw new KisMasterFetchError('parsed master result is empty');
      }
      // Atomic swap — if this throws, the previous catalog is preserved.
      deps.repo.swapAll(
        result.combined.map((row: MasterStockRow) => ({
          ticker: row.ticker,
          name: row.name,
          market: row.market,
          standardCode: row.standardCode,
          marketCapTier: row.marketCapTier,
          // B1a: classification fields parsed from rear payload.
          securityGroupCode: row.classification.securityGroupCode,
          marketCapSize: row.classification.marketCapSize,
          indexIndustryLarge: row.classification.indexIndustryLarge,
          indexIndustryMiddle: row.classification.indexIndustryMiddle,
          indexIndustrySmall: row.classification.indexIndustrySmall,
          krxSectorFlags: JSON.stringify(row.classification.krxSector),
          listedAt: row.classification.listedAt,
        })),
        SOURCE_KIS_MST,
      );
      const refreshedAt = new Date(now()).toISOString();
      deps.meta.set(META_KEY_REFRESHED_AT, refreshedAt);
      deps.meta.set(META_KEY_LAST_ROW_COUNT, String(result.combined.length));
      deps.meta.set(META_KEY_SOURCE, SOURCE_KIS_MST);
      deps.meta.delete(META_KEY_LAST_ERROR);
      log.info(
        { rowCount: result.combined.length, refreshedAt },
        'master refresh succeeded',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn({ err: message }, 'master refresh failed — keeping existing cache');
      deps.meta.set(META_KEY_LAST_ERROR, message);
      // do NOT touch refreshed_at / row_count
    } finally {
      refreshing = false;
    }
    return readStatus();
  }

  return {
    list() {
      const status = readStatus();
      return {
        items: deps.repo.findAll(),
        refreshedAt: status.refreshedAt,
        rowCount: status.rowCount,
        fresh: status.fresh,
        stale: status.stale,
        source: deps.meta.get(META_KEY_SOURCE) ?? SOURCE_KIS_MST,
      };
    },

    status: readStatus,

    refresh() {
      if (inflight !== null) return inflight;
      inflight = doRefresh().finally(() => {
        inflight = null;
      });
      return inflight;
    },

    async maybeRefreshOnBoot() {
      const status = readStatus();
      if (status.fresh && status.rowCount > 0) {
        log.info(
          { rowCount: status.rowCount, refreshedAt: status.refreshedAt },
          'master cache fresh — skipping boot refresh',
        );
        return null;
      }
      log.info('master cache stale or empty — triggering background refresh');
      // Fire and forget — caller (bootstrap) does not await.
      this.refresh().catch((err) => {
        log.warn({ err: err instanceof Error ? err.message : String(err) }, 'background master refresh threw');
      });
      return readStatus();
    },

    async waitIdle() {
      while (inflight !== null) {
        await inflight;
      }
    },
  };
}
