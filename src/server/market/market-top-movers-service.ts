import type {
  MarketTopMoverDirection,
  MarketTopMoverItem,
  MarketTopMoversResponse,
} from '@shared/types.js';

import { KisRestError } from '../kis/kis-rest-client.js';

const DEFAULT_TTL_MS = 10_000;
const DEFAULT_STALE_AFTER_MS = 30_000;
const DEFAULT_COOLDOWN_MS = 30_000;
const DEFAULT_REFRESH_TIMEOUT_MS = 10_000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;

export interface FetchRankingInput {
  direction: MarketTopMoverDirection;
  count: number;
  now: Date;
}

export interface MarketTopMoversService {
  getTopMovers(input?: { limit?: number }): Promise<MarketTopMoversResponse>;
  snapshot(): MarketTopMoversServiceSnapshot;
}

export interface CreateMarketTopMoversServiceOptions {
  fetchRanking: (input: FetchRankingInput) => Promise<MarketTopMoverItem[]>;
  now?: () => Date;
  ttlMs?: number;
  staleAfterMs?: number;
  cooldownMs?: number;
  refreshTimeoutMs?: number;
}

interface CacheEntry {
  fetchedAt: Date;
  gainers: MarketTopMoverItem[];
  losers: MarketTopMoverItem[];
}

export interface MarketTopMoversServiceSnapshot {
  status: MarketTopMoversResponse['status'] | 'idle' | 'refreshing';
  source: MarketTopMoversResponse['source'];
  lastFetchedAt: string | null;
  lastGeneratedAt: string | null;
  cacheAgeMs: number | null;
  cacheTtlMs: number;
  staleAfterMs: number;
  cooldownUntil: string | null;
  cooldownActive: boolean;
  inflight: boolean;
  lastMessage: string | null;
  lastErrorCode:
    | 'KIS_RATE_LIMIT_SECOND_WINDOW'
    | 'RUNTIME_UNAVAILABLE'
    | 'REFRESH_TIMEOUT'
    | 'UNKNOWN'
    | null;
  coverage: MarketTopMoversResponse['coverage'];
}

export function createMarketTopMoversService({
  fetchRanking,
  now = () => new Date(),
  ttlMs = DEFAULT_TTL_MS,
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  refreshTimeoutMs = DEFAULT_REFRESH_TIMEOUT_MS,
}: CreateMarketTopMoversServiceOptions): MarketTopMoversService {
  let cache: CacheEntry | null = null;
  let inflight: Promise<CacheEntry> | null = null;
  let cooldownUntilMs = 0;
  let lastResponse: MarketTopMoversResponse | null = null;
  let lastErrorCode: MarketTopMoversServiceSnapshot['lastErrorCode'] = null;

  async function getTopMovers(input: { limit?: number } = {}): Promise<MarketTopMoversResponse> {
    const current = now();
    const limit = clampLimit(input.limit);
    const currentMs = current.getTime();
    const readyMessage = `${Math.max(1, Math.round(ttlMs / 1000))}초마다 갱신`;
    if (cache !== null && currentMs - cache.fetchedAt.getTime() <= ttlMs) {
      return remember(toResponse(current, cache, 'ready', readyMessage, limit), null);
    }

    if (cooldownUntilMs > currentMs) {
      return remember(cooldownResponse(current, limit), 'KIS_RATE_LIMIT_SECOND_WINDOW');
    }

    try {
      const next = await refresh(current);
      return remember(toResponse(current, next, 'ready', readyMessage, limit), null);
    } catch (err) {
      if (isCooldownError(err)) {
        cooldownUntilMs = currentMs + cooldownMs;
        if (cache !== null) {
          return remember(
            toResponse(
              current,
              cache,
              'stale',
              'KIS 호출 제한으로 직전 랭킹을 잠시 유지합니다.',
              limit,
            ),
            'KIS_RATE_LIMIT_SECOND_WINDOW',
          );
        }
        return remember(
          emptyResponse(
            current,
            'cooldown',
            'KIS 호출 제한으로 TOP100 갱신을 잠시 대기합니다.',
            limit,
          ),
          'KIS_RATE_LIMIT_SECOND_WINDOW',
        );
      }

      if (cache !== null && currentMs - cache.fetchedAt.getTime() <= staleAfterMs) {
        return remember(
          toResponse(
            current,
            cache,
            'stale',
            '갱신 실패로 직전 랭킹을 잠시 유지합니다.',
            limit,
          ),
          classifyErrorCode(err),
        );
      }
      return remember(
        emptyResponse(
          current,
          isRuntimeUnavailable(err) ? 'unconfigured' : 'error',
          isRuntimeUnavailable(err)
            ? 'KIS credentials 등록 후 TOP100 랭킹을 표시합니다.'
            : 'TOP100 랭킹을 가져오지 못했습니다.',
          limit,
        ),
        classifyErrorCode(err),
      );
    }
  }

  async function refresh(current: Date): Promise<CacheEntry> {
    if (inflight !== null) return withTimeout(inflight, refreshTimeoutMs);
    const nextRefresh = (async () => {
      // TOP100 may require KIS continuation pages. Keep gainers/losers
      // sequential so we do not create a burst against the shared KIS limiter.
      const gainers = await fetchRanking({
        direction: 'gainers',
        count: MAX_LIMIT,
        now: current,
      });
      const losers = await fetchRanking({
        direction: 'losers',
        count: MAX_LIMIT,
        now: current,
      });
      const next = {
        fetchedAt: current,
        gainers: gainers.slice(0, MAX_LIMIT),
        losers: losers.slice(0, MAX_LIMIT),
      };
      cache = next;
      return next;
    })();
    inflight = nextRefresh.finally(() => {
      inflight = null;
    });
    return withTimeout(inflight, refreshTimeoutMs);
  }

  function cooldownResponse(current: Date, limit: number): MarketTopMoversResponse {
    if (cache !== null) {
      return toResponse(
        current,
        cache,
        'stale',
        'KIS 호출 제한으로 직전 랭킹을 잠시 유지합니다.',
        limit,
      );
    }
    return emptyResponse(current, 'cooldown', 'KIS 호출 제한으로 TOP100 갱신을 대기합니다.', limit);
  }

  function toResponse(
    current: Date,
    entry: CacheEntry,
    status: MarketTopMoversResponse['status'],
    message: string,
    limit: number,
  ): MarketTopMoversResponse {
    const coverage = buildCoverage(entry, limit);
    const partial = status === 'ready'
      && (!coverage.gainersComplete || !coverage.losersComplete);
    return {
      generatedAt: current.toISOString(),
      fetchedAt: entry.fetchedAt.toISOString(),
      cacheTtlMs: ttlMs,
      refreshIntervalMs: ttlMs,
      staleAfterMs,
      source: 'kis-ranking-auto',
      status: partial ? 'partial' : status,
      message: partial
        ? `KIS 직접 랭킹 일부만 수신했습니다. 상승 ${coverage.gainersCount}/${limit}, 하락 ${coverage.losersCount}/${limit}`
        : message,
      cooldownUntil: cooldownUntilMs > current.getTime()
        ? new Date(cooldownUntilMs).toISOString()
        : null,
      coverage,
      gainers: entry.gainers.slice(0, limit),
      losers: entry.losers.slice(0, limit),
    };
  }

  function emptyResponse(
    current: Date,
    status: MarketTopMoversResponse['status'],
    message: string,
    _limit: number,
  ): MarketTopMoversResponse {
    return {
      generatedAt: current.toISOString(),
      fetchedAt: null,
      cacheTtlMs: ttlMs,
      refreshIntervalMs: ttlMs,
      staleAfterMs,
      source: 'kis-ranking-auto',
      status,
      message,
      cooldownUntil: cooldownUntilMs > current.getTime()
        ? new Date(cooldownUntilMs).toISOString()
        : null,
      coverage: {
        requestedLimit: _limit,
        gainersCount: 0,
        losersCount: 0,
        gainersComplete: false,
        losersComplete: false,
        marketUniverse: 'kis-full-market-ranking',
        guaranteedTop100: false,
        includesLocalFallback: false,
      },
      gainers: [],
      losers: [],
    };
  }

  function snapshot(): MarketTopMoversServiceSnapshot {
    const current = now();
    const currentMs = current.getTime();
    const cooldownActive = cooldownUntilMs > currentMs;
    const response = lastResponse;
    const cacheAgeMs = cache !== null ? Math.max(0, currentMs - cache.fetchedAt.getTime()) : null;
    return {
      status: inflight !== null ? 'refreshing' : (response?.status ?? 'idle'),
      source: response?.source ?? 'kis-ranking-auto',
      lastFetchedAt: cache?.fetchedAt.toISOString() ?? response?.fetchedAt ?? null,
      lastGeneratedAt: response?.generatedAt ?? null,
      cacheAgeMs,
      cacheTtlMs: ttlMs,
      staleAfterMs,
      cooldownUntil: cooldownActive ? new Date(cooldownUntilMs).toISOString() : null,
      cooldownActive,
      inflight: inflight !== null,
      lastMessage: response?.message ?? null,
      lastErrorCode,
      coverage: response?.coverage ?? emptyCoverage(DEFAULT_LIMIT),
    };
  }

  function remember(
    response: MarketTopMoversResponse,
    errorCode: MarketTopMoversServiceSnapshot['lastErrorCode'],
  ): MarketTopMoversResponse {
    lastResponse = response;
    lastErrorCode = errorCode;
    return response;
  }

  return { getTopMovers, snapshot };
}

function buildCoverage(entry: CacheEntry, limit: number): MarketTopMoversResponse['coverage'] {
  const gainersComplete = entry.gainers.length >= limit;
  const losersComplete = entry.losers.length >= limit;
  return {
    requestedLimit: limit,
    gainersCount: Math.min(entry.gainers.length, limit),
    losersCount: Math.min(entry.losers.length, limit),
    gainersComplete,
    losersComplete,
    marketUniverse: 'kis-full-market-ranking',
    guaranteedTop100: gainersComplete && losersComplete,
    includesLocalFallback: false,
  };
}

function emptyCoverage(limit: number): MarketTopMoversResponse['coverage'] {
  return {
    requestedLimit: limit,
    gainersCount: 0,
    losersCount: 0,
    gainersComplete: false,
    losersComplete: false,
    marketUniverse: 'kis-full-market-ranking',
    guaranteedTop100: false,
    includesLocalFallback: false,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`KIS ranking refresh timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle !== null) clearTimeout(timeoutHandle);
  }
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)));
}

function isCooldownError(err: unknown): boolean {
  if (err instanceof KisRestError) {
    return err.status === 429 || err.msgCd === 'EGW00201';
  }
  const message = err instanceof Error ? err.message : String(err);
  return /429|EGW00201|rate.?limit|초당|throttle/i.test(message);
}

function isRuntimeUnavailable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /KIS runtime is not started|credentials|unconfigured/i.test(message);
}

function classifyErrorCode(err: unknown): MarketTopMoversServiceSnapshot['lastErrorCode'] {
  if (isCooldownError(err)) return 'KIS_RATE_LIMIT_SECOND_WINDOW';
  if (isRuntimeUnavailable(err)) return 'RUNTIME_UNAVAILABLE';
  const message = err instanceof Error ? err.message : String(err);
  if (/timeout/i.test(message)) return 'REFRESH_TIMEOUT';
  return 'UNKNOWN';
}
