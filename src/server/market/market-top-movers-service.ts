import type {
  MarketTopMoverDirection,
  MarketTopMoverItem,
  MarketTopMoversRankingDiagnostic,
  MarketTopMoversResponse,
  MarketTopMoversStopReason,
  MarketTopMoversSourcePhase,
} from '@shared/types.js';

import { KisRestError } from '../kis/kis-rest-client.js';

const DEFAULT_TTL_MS = 30_000;
const DEFAULT_STALE_AFTER_MS = 5 * 60_000;
const DEFAULT_COOLDOWN_MS = 30_000;
const DEFAULT_REFRESH_TIMEOUT_MS = 20_000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;
const KST_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const PREMARKET_START_MINUTES = 8 * 60;
const OPENING_FREEZE_START_MINUTES = 8 * 60 + 50;
const REGULAR_START_MINUTES = 9 * 60;
const AFTER_HOURS_START_MINUTES = 15 * 60 + 30;
const INTEGRATED_CLOSE_MINUTES = 20 * 60;

export interface FetchRankingInput {
  direction: MarketTopMoverDirection;
  count: number;
  now: Date;
  sourcePhase: MarketTopMoversSourcePhase;
  onDiagnostic?: (diagnostic: MarketTopMoversRankingDiagnostic) => void;
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
  sourceKind?: MarketTopMoversSourceKind;
}

interface CacheEntry {
  fetchedAt: Date;
  gainers: MarketTopMoverItem[];
  losers: MarketTopMoverItem[];
  sourcePhase: MarketTopMoversSourcePhase;
  rankingDiagnostics: RankingDiagnostics;
}

type RankingDiagnostics = MarketTopMoversResponse['rankingDiagnostics'];
type MarketTopMoversSourceKind = 'kis' | 'toss-overview-ranking';

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
    | 'TOSS_RATE_LIMITED'
    | 'RUNTIME_UNAVAILABLE'
    | 'REFRESH_TIMEOUT'
    | 'UNKNOWN'
    | null;
  coverage: MarketTopMoversResponse['coverage'];
  sourcePhase: MarketTopMoversResponse['sourcePhase'];
  sourceLabel: string;
  sourceReason: string | null;
  frozen: boolean;
  lastGoodAgeMs: number | null;
  partialReason: MarketTopMoversResponse['partialReason'];
  stopReason: MarketTopMoversResponse['stopReason'];
  rankingDiagnostics: RankingDiagnostics;
  rankingRateLimited: boolean;
}

export function createMarketTopMoversService({
  fetchRanking,
  now = () => new Date(),
  ttlMs = DEFAULT_TTL_MS,
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  refreshTimeoutMs = DEFAULT_REFRESH_TIMEOUT_MS,
  sourceKind = 'kis',
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
    const readyMessage = sourceKind === 'toss-overview-ranking'
      ? `토스 웹 랭킹 · ${Math.max(1, Math.round(ttlMs / 1000))}초마다 갱신`
      : `${Math.max(1, Math.round(ttlMs / 1000))}초마다 갱신`;
    const sourcePhase = resolveSourcePhase(current);
    if (!isFetchableSourcePhase(sourcePhase)) {
      return remember(nonFetchableResponse(current, sourcePhase, limit), lastErrorCode);
    }
    if (cache !== null && currentMs - cache.fetchedAt.getTime() <= ttlMs) {
      return remember(toResponse(current, cache, 'ready', readyMessage, limit), null);
    }

    if (cooldownUntilMs > currentMs) {
      return remember(cooldownResponse(current, limit), rateLimitErrorCodeForKind(sourceKind));
    }

    try {
      const next = await refresh(current, sourcePhase);
      if (cache !== null && shouldRetainPreviousCache(cache, next, limit)) {
        return remember(
          toResponse(
            current,
            cache,
            'stale',
            '새 랭킹이 더 적게 수신되어 직전 랭킹을 유지합니다.',
            limit,
            {
              sourcePhase: 'stale_snapshot',
              partialReason: 'smaller_refresh_retained',
              stopReason: 'smaller_refresh_retained',
            },
          ),
          null,
        );
      }
      cache = next;
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
              `${providerLabelForKind(sourceKind)} 호출 제한으로 직전 랭킹을 잠시 유지합니다.`,
              limit,
              {
                sourcePhase: 'stale_snapshot',
                partialReason: 'rate_limited',
                stopReason: 'rate_limited',
                rankingRateLimited: true,
              },
            ),
            rateLimitErrorCodeForKind(sourceKind),
          );
        }
        return remember(
          emptyResponse(
            current,
            'cooldown',
            `${providerLabelForKind(sourceKind)} 호출 제한으로 TOP100 갱신을 잠시 대기합니다.`,
            limit,
            {
              sourcePhase: 'unsupported',
              partialReason: 'rate_limited',
              stopReason: 'rate_limited',
              rankingRateLimited: true,
            },
          ),
          rateLimitErrorCodeForKind(sourceKind),
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
            { sourcePhase: 'stale_snapshot' },
          ),
          classifyErrorCode(err),
        );
      }
      return remember(
        emptyResponse(
          current,
          isRuntimeUnavailable(err) ? 'unconfigured' : 'error',
          isRuntimeUnavailable(err)
            ? unavailableMessageForKind(sourceKind)
            : 'TOP100 랭킹을 가져오지 못했습니다.',
          limit,
          { sourcePhase: 'unsupported', partialReason: 'source_unsupported' },
        ),
        classifyErrorCode(err),
      );
    }
  }

  async function refresh(
    current: Date,
    sourcePhase: MarketTopMoversSourcePhase,
  ): Promise<CacheEntry> {
    if (inflight !== null) return withTimeout(inflight, refreshTimeoutMs);
    const nextRefresh = (async () => {
      // Keep gainers/losers sequential so one TOP100 refresh cannot burst the
      // active provider, whether it is Toss primary or KIS legacy fallback.
      const rankingDiagnostics = emptyRankingDiagnostics();
      const gainers = await fetchRanking({
        direction: 'gainers',
        count: MAX_LIMIT,
        now: current,
        sourcePhase,
        onDiagnostic: (diagnostic) => {
          rankingDiagnostics.gainers = diagnostic;
        },
      });
      const losers = await fetchRanking({
        direction: 'losers',
        count: MAX_LIMIT,
        now: current,
        sourcePhase,
        onDiagnostic: (diagnostic) => {
          rankingDiagnostics.losers = diagnostic;
        },
      });
      const next = {
        fetchedAt: current,
        gainers: gainers.slice(0, MAX_LIMIT),
        losers: losers.slice(0, MAX_LIMIT),
        sourcePhase,
        rankingDiagnostics,
      };
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
        `${providerLabelForKind(sourceKind)} 호출 제한으로 직전 랭킹을 잠시 유지합니다.`,
        limit,
        {
          sourcePhase: 'stale_snapshot',
          partialReason: 'rate_limited',
          stopReason: 'rate_limited',
          rankingRateLimited: true,
        },
      );
    }
    return emptyResponse(
      current,
      'cooldown',
      `${providerLabelForKind(sourceKind)} 호출 제한으로 TOP100 갱신을 대기합니다.`,
      limit,
      {
        sourcePhase: 'unsupported',
        partialReason: 'rate_limited',
        stopReason: 'rate_limited',
        rankingRateLimited: true,
      },
    );
  }

  function nonFetchableResponse(
    current: Date,
    sourcePhase: MarketTopMoversSourcePhase,
    limit: number,
  ): MarketTopMoversResponse {
    if (sourcePhase === 'opening_freeze' && cache !== null && cache.sourcePhase === 'premarket') {
      return toResponse(
        current,
        cache,
        'stale',
        '시가 대기 구간이라 직전 장전 랭킹을 고정합니다.',
        limit,
        {
          sourcePhase: 'opening_freeze',
          frozen: true,
        },
      );
    }
    if (sourcePhase === 'opening_freeze' && cache !== null) {
      return toResponse(
        current,
        cache,
        'stale',
        '시가 대기 구간이지만 장전 랭킹이 없어 마지막 랭킹을 표시합니다.',
        limit,
        { sourcePhase: 'stale_snapshot' },
      );
    }
    if (sourcePhase === 'stale_snapshot' && cache !== null) {
      return toResponse(
        current,
        cache,
        'stale',
        '거래 시간 밖이라 마지막 랭킹을 표시합니다.',
        limit,
        { sourcePhase: 'stale_snapshot' },
      );
    }
    return emptyResponse(
      current,
      'unconfigured',
      '현재 시간대에 사용할 TOP100 랭킹 소스가 없습니다.',
      limit,
      { sourcePhase: 'unsupported', partialReason: 'source_unsupported' },
    );
  }

  function toResponse(
    current: Date,
    entry: CacheEntry,
    status: MarketTopMoversResponse['status'],
    message: string,
    limit: number,
    opts: {
      sourcePhase?: MarketTopMoversSourcePhase;
      partialReason?: MarketTopMoversResponse['partialReason'];
      stopReason?: MarketTopMoversResponse['stopReason'];
      rankingRateLimited?: boolean;
      frozen?: boolean;
    } = {},
  ): MarketTopMoversResponse {
    const coverage = buildCoverage(entry, limit, sourceKind);
    const partial = status === 'ready'
      && (!coverage.gainersComplete || !coverage.losersComplete);
    const sourcePhase = opts.sourcePhase ?? entry.sourcePhase;
    const stopReason = opts.stopReason
      ?? (partial ? stopReasonForDiagnostics(entry.rankingDiagnostics) : null);
    const partialReason = opts.partialReason
      ?? (partial ? partialReasonForStopReason(stopReason) : null);
    return {
      generatedAt: current.toISOString(),
      fetchedAt: entry.fetchedAt.toISOString(),
      cacheTtlMs: ttlMs,
      refreshIntervalMs: ttlMs,
      staleAfterMs,
      source: sourceForPhase(sourcePhase, sourceKind),
      sourcePhase,
      sourceLabel: labelForPhase(sourcePhase, sourceKind),
      sourceReason: reasonForPhase(sourcePhase, sourceKind),
      frozen: opts.frozen ?? sourcePhase === 'opening_freeze',
      lastGoodAgeMs: Math.max(0, current.getTime() - entry.fetchedAt.getTime()),
      partialReason,
      stopReason,
      rankingDiagnostics: entry.rankingDiagnostics,
      rankingRateLimited: opts.rankingRateLimited ?? false,
      status: partial ? 'partial' : status,
      message: partial
        ? partialMessageForKind(sourceKind, coverage, limit)
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
    opts: {
      sourcePhase?: MarketTopMoversSourcePhase;
      partialReason?: MarketTopMoversResponse['partialReason'];
      stopReason?: MarketTopMoversResponse['stopReason'];
      rankingRateLimited?: boolean;
      frozen?: boolean;
    } = {},
  ): MarketTopMoversResponse {
    const sourcePhase = opts.sourcePhase ?? 'unsupported';
    return {
      generatedAt: current.toISOString(),
      fetchedAt: null,
      cacheTtlMs: ttlMs,
      refreshIntervalMs: ttlMs,
      staleAfterMs,
      source: sourceForPhase(sourcePhase, sourceKind),
      sourcePhase,
      sourceLabel: labelForPhase(sourcePhase, sourceKind),
      sourceReason: reasonForPhase(sourcePhase, sourceKind),
      frozen: opts.frozen ?? sourcePhase === 'opening_freeze',
      lastGoodAgeMs: null,
      partialReason: opts.partialReason ?? (sourcePhase === 'unsupported' ? 'source_unsupported' : null),
      stopReason: opts.stopReason ?? (sourcePhase === 'unsupported' ? 'unsupported_source' : null),
      rankingDiagnostics: emptyRankingDiagnostics(),
      rankingRateLimited: opts.rankingRateLimited ?? false,
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
        marketUniverse: marketUniverseForKind(sourceKind),
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
      source: response?.source ?? (sourceKind === 'toss-overview-ranking' ? 'toss-overview-ranking' : 'kis-ranking-auto'),
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
      coverage: response?.coverage ?? emptyCoverage(DEFAULT_LIMIT, sourceKind),
      sourcePhase: response?.sourcePhase ?? 'unsupported',
      sourceLabel: response?.sourceLabel ?? labelForPhase('unsupported', sourceKind),
      sourceReason: response?.sourceReason ?? reasonForPhase('unsupported', sourceKind),
      frozen: response?.frozen ?? false,
      lastGoodAgeMs: response?.lastGoodAgeMs ?? null,
      partialReason: response?.partialReason ?? null,
      stopReason: response?.stopReason ?? null,
      rankingDiagnostics: response?.rankingDiagnostics ?? emptyRankingDiagnostics(),
      rankingRateLimited: response?.rankingRateLimited ?? false,
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

function buildCoverage(
  entry: CacheEntry,
  limit: number,
  sourceKind: MarketTopMoversSourceKind = 'kis',
): MarketTopMoversResponse['coverage'] {
  const gainersComplete = entry.gainers.length >= limit;
  const losersComplete = entry.losers.length >= limit;
  return {
    requestedLimit: limit,
    gainersCount: Math.min(entry.gainers.length, limit),
    losersCount: Math.min(entry.losers.length, limit),
    gainersComplete,
    losersComplete,
    marketUniverse: marketUniverseForKind(sourceKind),
    guaranteedTop100: gainersComplete && losersComplete,
    includesLocalFallback: false,
  };
}

function shouldRetainPreviousCache(
  previous: CacheEntry,
  next: CacheEntry,
  limit: number,
): boolean {
  const previousCoverage = buildCoverage(previous, limit);
  const nextCoverage = buildCoverage(next, limit);
  if (previousCoverage.guaranteedTop100) return !nextCoverage.guaranteedTop100;
  if (nextCoverage.guaranteedTop100) return false;
  return coverageScore(nextCoverage) < coverageScore(previousCoverage);
}

function coverageScore(coverage: MarketTopMoversResponse['coverage']): number {
  return coverage.gainersCount + coverage.losersCount;
}

function emptyCoverage(
  limit: number,
  sourceKind: MarketTopMoversSourceKind = 'kis',
): MarketTopMoversResponse['coverage'] {
  return {
    requestedLimit: limit,
    gainersCount: 0,
    losersCount: 0,
    gainersComplete: false,
    losersComplete: false,
    marketUniverse: marketUniverseForKind(sourceKind),
    guaranteedTop100: false,
    includesLocalFallback: false,
  };
}

function emptyRankingDiagnostics(): RankingDiagnostics {
  return {
    gainers: null,
    losers: null,
  };
}

function stopReasonForDiagnostics(
  diagnostics: RankingDiagnostics,
): MarketTopMoversStopReason {
  const reasons = [diagnostics.gainers?.stopReason, diagnostics.losers?.stopReason]
    .filter((reason): reason is MarketTopMoversStopReason => reason !== undefined);
  if (reasons.includes('rate_limited')) return 'rate_limited';
  if (reasons.includes('timeout')) return 'timeout';
  if (reasons.includes('malformed_response')) return 'malformed_response';
  if (reasons.includes('upstream_partial_limit_suspected')) {
    return 'upstream_partial_limit_suspected';
  }
  if (reasons.includes('no_continuation')) return 'no_continuation';
  if (reasons.includes('under_requested_limit')) return 'under_requested_limit';
  return 'under_requested_limit';
}

function partialReasonForStopReason(
  stopReason: MarketTopMoversStopReason | null,
): MarketTopMoversResponse['partialReason'] {
  switch (stopReason) {
    case 'rate_limited':
      return 'rate_limited';
    case 'timeout':
      return 'timeout';
    case 'malformed_response':
      return 'malformed_response';
    case 'no_continuation':
      return 'no_continuation';
    case 'upstream_partial_limit_suspected':
      return 'upstream_partial_limit_suspected';
    case 'unsupported_source':
      return 'source_unsupported';
    case 'smaller_refresh_retained':
      return 'smaller_refresh_retained';
    case 'under_requested_limit':
    case 'complete':
    case null:
      return 'under_requested_limit';
  }
}

function isFetchableSourcePhase(sourcePhase: MarketTopMoversSourcePhase): boolean {
  return sourcePhase === 'premarket'
    || sourcePhase === 'regular'
    || sourcePhase === 'after_hours';
}

function resolveSourcePhase(current: Date): MarketTopMoversSourcePhase {
  const minutes = minutesInKst(current);
  if (minutes >= PREMARKET_START_MINUTES && minutes < OPENING_FREEZE_START_MINUTES) {
    return 'premarket';
  }
  if (minutes >= OPENING_FREEZE_START_MINUTES && minutes < REGULAR_START_MINUTES) {
    return 'opening_freeze';
  }
  if (minutes >= REGULAR_START_MINUTES && minutes < AFTER_HOURS_START_MINUTES) {
    return 'regular';
  }
  if (minutes >= AFTER_HOURS_START_MINUTES && minutes < INTEGRATED_CLOSE_MINUTES) {
    return 'after_hours';
  }
  return 'stale_snapshot';
}

function minutesInKst(current: Date): number {
  const parts = KST_TIME_FORMATTER.formatToParts(current);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

function sourceForPhase(
  sourcePhase: MarketTopMoversSourcePhase,
  sourceKind: MarketTopMoversSourceKind = 'kis',
): MarketTopMoversResponse['source'] {
  if (sourceKind === 'toss-overview-ranking') {
    return 'toss-overview-ranking';
  }
  switch (sourcePhase) {
    case 'premarket':
      return 'kis-ranking-premarket-expected';
    case 'regular':
      return 'kis-ranking-fluctuation';
    case 'opening_freeze':
      return 'kis-ranking-freeze';
    case 'after_hours':
      return 'kis-ranking-overtime-fluctuation';
    case 'stale_snapshot':
      return 'kis-ranking-stale-snapshot';
    case 'unsupported':
      return 'kis-ranking-unsupported';
  }
}

function labelForPhase(
  sourcePhase: MarketTopMoversSourcePhase,
  sourceKind: MarketTopMoversSourceKind = 'kis',
): string {
  if (sourceKind === 'toss-overview-ranking') {
    return sourcePhase === 'opening_freeze' ? '토스 고정' : '토스 웹 랭킹';
  }
  switch (sourcePhase) {
    case 'premarket':
      return '장전';
    case 'regular':
      return '본장';
    case 'opening_freeze':
      return '고정';
    case 'after_hours':
      return '시간외';
    case 'stale_snapshot':
      return '직전';
    case 'unsupported':
      return '미지원';
  }
}

function reasonForPhase(
  sourcePhase: MarketTopMoversSourcePhase,
  sourceKind: MarketTopMoversSourceKind = 'kis',
): string | null {
  if (sourceKind === 'toss-overview-ranking') {
    return '토스증권 웹 overview ranking 기반 상승/하락 랭킹입니다.';
  }
  switch (sourcePhase) {
    case 'premarket':
      return '장전 예상체결 기반 랭킹입니다.';
    case 'regular':
      return '정규장 등락률 랭킹입니다.';
    case 'opening_freeze':
      return '08:50~09:00 시가 대기 구간에는 직전 장전 랭킹을 유지합니다.';
    case 'after_hours':
      return '시간외 등락률 랭킹입니다.';
    case 'stale_snapshot':
      return '현재 새로 조회하지 않고 마지막 랭킹을 유지합니다.';
    case 'unsupported':
      return '현재 시간대에 사용할 수 있는 KIS TOP100 소스가 없습니다.';
  }
}

function marketUniverseForKind(
  sourceKind: MarketTopMoversSourceKind,
): MarketTopMoversResponse['coverage']['marketUniverse'] {
  return sourceKind === 'toss-overview-ranking' ? 'toss-web-ranking' : 'kis-full-market-ranking';
}

function partialMessageForKind(
  sourceKind: MarketTopMoversSourceKind,
  coverage: MarketTopMoversResponse['coverage'],
  limit: number,
): string {
  const provider = sourceKind === 'toss-overview-ranking' ? '토스 웹 랭킹' : 'KIS 직접 랭킹';
  return `${provider} 일부만 수신했습니다. 상승 ${coverage.gainersCount}/${limit}, 하락 ${coverage.losersCount}/${limit}`;
}

function providerLabelForKind(sourceKind: MarketTopMoversSourceKind): string {
  return sourceKind === 'toss-overview-ranking' ? '토스 웹 랭킹' : 'KIS';
}

function rateLimitErrorCodeForKind(
  sourceKind: MarketTopMoversSourceKind,
): MarketTopMoversServiceSnapshot['lastErrorCode'] {
  return sourceKind === 'toss-overview-ranking'
    ? 'TOSS_RATE_LIMITED'
    : 'KIS_RATE_LIMIT_SECOND_WINDOW';
}

function unavailableMessageForKind(sourceKind: MarketTopMoversSourceKind): string {
  return sourceKind === 'toss-overview-ranking'
    ? '토스 웹 랭킹을 가져오지 못했습니다.'
    : 'KIS credentials 등록 후 TOP100 랭킹을 표시합니다.';
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`TOP100 ranking refresh timeout after ${timeoutMs}ms`));
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
