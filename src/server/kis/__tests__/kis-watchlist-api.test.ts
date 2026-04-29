/**
 * Unit tests for `kis-watchlist-api` and the `POST /import/kis-watchlist` route.
 *
 * The KIS rest client is mocked — no network calls are made.
 *
 * Scenarios covered:
 *   fetchWatchlistGroups:
 *     1. Happy path: 2 groups × 5 stocks each, 2 cross-group duplicates → 8 unique tickers after dedup at the route layer.
 *     2. KIS returns 404 (rest client throws KisRestError) → KisWatchlistUnavailableError is thrown.
 *     3. Payload missing required fields → zod parse error surfaces via KisWatchlistUnavailableError.
 *
 *   POST /import/kis-watchlist route:
 *     4. Mocked success → { imported, skipped, groups } 200.
 *     5. Mocked KIS failure → 502 with correct error shape.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

import { KIS_INTSTOCK_GROUPLIST_PATH } from '../../../shared/kis-constraints.js';
import { fetchWatchlistGroups, KisWatchlistUnavailableError } from '../kis-watchlist-api.js';
import type { FetchWatchlistDeps } from '../kis-watchlist-api.js';
import { KisRestError } from '../kis-rest-client.js';
import { registerRoutes } from '../../routes/import.js';
import type { StockRepository } from '../../db/repositories.js';
import type { Stock } from '../../../shared/types.js';
import type { KisRuntimeRef, KisRuntime } from '../../bootstrap-kis.js';

// === Helpers =================================================================

function makeDeps(responseOrError: unknown): FetchWatchlistDeps {
  const restClient = {
    request: vi.fn<() => Promise<unknown>>(),
    postToken: vi.fn<() => Promise<unknown>>(),
  };

  if (responseOrError instanceof Error) {
    restClient.request.mockRejectedValue(responseOrError);
  } else {
    restClient.request.mockResolvedValue(responseOrError);
  }

  const auth = {
    getAccessToken: vi.fn<() => Promise<string>>().mockResolvedValue('test-token'),
    invalidate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    peek: vi.fn().mockReturnValue(null),
  };

  return { restClient, auth };
}

/** Minimal StockRepository mock. */
function makeStockRepo(existing: Stock[] = []): StockRepository {
  return {
    findAll: vi.fn<() => Stock[]>().mockReturnValue(existing),
    bulkUpsert: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    findByTicker: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  } as unknown as StockRepository;
}

/** Wraps a FetchWatchlistDeps in a started KisRuntimeRef stub. */
function makeStartedRef(deps: FetchWatchlistDeps): KisRuntimeRef {
  return {
    get: () => ({
      status: 'started',
      runtime: {
        restClient: deps.restClient,
        auth: deps.auth,
      } as unknown as KisRuntime,
    }),
    start: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  };
}

// === fetchWatchlistGroups ====================================================

describe('fetchWatchlistGroups', () => {
  it('happy path: parses 2 groups with 5 stocks each', async () => {
    const payload = {
      rt_cd: '0',
      output: [
        {
          그룹명: '그룹A',
          종목리스트: [
            { 종목코드: '005930', 종목명: '삼성전자', 시장: 'KOSPI' },
            { 종목코드: '000660', 종목명: 'SK하이닉스', 시장: 'KOSPI' },
            { 종목코드: '035420', 종목명: 'NAVER', 시장: 'KOSPI' },
            { 종목코드: '035720', 종목명: '카카오', 시장: 'KOSPI' },
            { 종목코드: '051910', 종목명: 'LG화학', 시장: 'KOSPI' },
          ],
        },
        {
          그룹명: '그룹B',
          종목리스트: [
            { 종목코드: '247540', 종목명: '에코프로비엠', 시장: 'KOSDAQ' },
            { 종목코드: '091990', 종목명: '셀트리온헬스케어', 시장: 'KOSDAQ' },
            { 종목코드: '196170', 종목명: '알테오젠', 시장: 'KOSDAQ' },
            // These two duplicate tickers from group A
            { 종목코드: '005930', 종목명: '삼성전자', 시장: 'KOSPI' },
            { 종목코드: '000660', 종목명: 'SK하이닉스', 시장: 'KOSPI' },
          ],
        },
      ],
    };

    const deps = makeDeps(payload);
    const groups = await fetchWatchlistGroups(deps);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.groupName).toBe('그룹A');
    expect(groups[0]?.stocks).toHaveLength(5);
    expect(groups[1]?.groupName).toBe('그룹B');
    expect(groups[1]?.stocks).toHaveLength(5);

    // Route-level dedup: 10 total - 2 duplicates = 8 unique
    const allStocks = groups.flatMap((g) => g.stocks);
    const uniqueTickers = new Set(allStocks.map((s) => s.ticker));
    expect(uniqueTickers.size).toBe(8);

    // Market parsing
    const hynix = groups[1]?.stocks.find((s) => s.ticker === '000660');
    expect(hynix?.market).toBe('KOSPI');
    const ecopro = groups[1]?.stocks.find((s) => s.ticker === '247540');
    expect(ecopro?.market).toBe('KOSDAQ');
  });

  it('KIS returns 404 → throws KisWatchlistUnavailableError', async () => {
    const restError = new KisRestError(
      `KIS HTTP 404 GET ${KIS_INTSTOCK_GROUPLIST_PATH}`,
      404,
      null,
      null,
      null,
    );
    const deps = makeDeps(restError);

    await expect(fetchWatchlistGroups(deps)).rejects.toBeInstanceOf(
      KisWatchlistUnavailableError,
    );
  });

  it('KIS returns 404 → error message is descriptive', async () => {
    const restError = new KisRestError(
      `KIS HTTP 404 GET ${KIS_INTSTOCK_GROUPLIST_PATH}`,
      404,
      null,
      null,
      null,
    );
    const deps = makeDeps(restError);

    await expect(fetchWatchlistGroups(deps)).rejects.toThrow(/endpoint unreachable/);
  });

  it('payload with missing required fields → KisWatchlistUnavailableError with parse detail', async () => {
    // `output` entries have items missing 종목코드 entirely
    const badPayload = {
      rt_cd: '0',
      output: [
        {
          그룹명: '그룹X',
          종목리스트: [
            { 종목명: '이름만있음', 시장: 'KOSPI' }, // missing 종목코드
          ],
        },
      ],
    };

    const deps = makeDeps(badPayload);

    await expect(fetchWatchlistGroups(deps)).rejects.toBeInstanceOf(
      KisWatchlistUnavailableError,
    );
  });
});

// === POST /import/kis-watchlist route ========================================

describe('POST /import/kis-watchlist', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(() => {
    app = Fastify({ logger: false });
  });

  it('mocked success → returns 200 with imported/skipped/groups', async () => {
    const watchlistPayload = {
      rt_cd: '0',
      output: [
        {
          그룹명: '테스트그룹',
          종목리스트: [
            { 종목코드: '005930', 종목명: '삼성전자', 시장: 'KOSPI' },
            { 종목코드: '000660', 종목명: 'SK하이닉스', 시장: 'KOSPI' },
            { 종목코드: '035420', 종목명: 'NAVER', 시장: 'KOSPI' },
          ],
        },
      ],
    };

    // One stock already exists → skipped=1, imported=2
    const stockRepo = makeStockRepo([
      { ticker: '005930', name: '삼성전자', market: 'KOSPI' },
    ]);

    registerRoutes(app, {
      stockRepo,
      runtimeRef: makeStartedRef(makeDeps(watchlistPayload)),
    });

    const resp = await app.inject({ method: 'POST', url: '/import/kis-watchlist' });

    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body) as { imported: number; skipped: number; groups: string[] };
    expect(body.imported).toBe(2);
    expect(body.skipped).toBe(1);
    expect(body.groups).toEqual(['테스트그룹']);
  });

  it('mocked KIS failure → returns 502 with kis-watchlist-unavailable error', async () => {
    const restError = new KisRestError(
      `KIS HTTP 404 GET ${KIS_INTSTOCK_GROUPLIST_PATH}`,
      404,
      null,
      null,
      null,
    );

    const stockRepo = makeStockRepo();

    registerRoutes(app, {
      stockRepo,
      runtimeRef: makeStartedRef(makeDeps(restError)),
    });

    const resp = await app.inject({ method: 'POST', url: '/import/kis-watchlist' });

    expect(resp.statusCode).toBe(502);
    const body = JSON.parse(resp.body) as { error: string; hint: string };
    expect(body.error).toBe('kis-watchlist-unavailable');
    expect(body.hint).toContain('관심종목');
  });
});
