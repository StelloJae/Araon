import { describe, expect, it, vi } from 'vitest';
import { KisRestError } from '../../kis/kis-rest-client.js';
import { createMarketTopMoversService } from '../market-top-movers-service.js';

describe('market top movers service', () => {
  it('caches gainers and losers inside the refresh ttl', async () => {
    let now = 1_000;
    const fetchRanking = vi.fn(async ({ direction }) => [
      {
        rank: 1,
        ticker: direction === 'gainers' ? '005930' : '000660',
        name: direction === 'gainers' ? '삼성전자' : 'SK하이닉스',
        price: 70_000,
        changeAbs: direction === 'gainers' ? 2_500 : -5_000,
        changePct: direction === 'gainers' ? 3.7 : -2.7,
        volume: 1_000,
      },
    ]);
    const service = createMarketTopMoversService({
      now: () => new Date(now),
      ttlMs: 5_000,
      fetchRanking,
    });

    const first = await service.getTopMovers({ limit: 100 });
    now += 2_000;
    const second = await service.getTopMovers({ limit: 100 });

    expect(fetchRanking).toHaveBeenCalledTimes(2);
    expect(first.gainers[0]?.ticker).toBe('005930');
    expect(second.fetchedAt).toBe(first.fetchedAt);
  });

  it('uses a conservative default refresh interval for ranking traffic', async () => {
    const fetchRanking = vi.fn(async ({ direction }) => makeRows(direction, 1));
    const service = createMarketTopMoversService({
      now: () => new Date('2026-05-11T01:00:00.000Z'),
      fetchRanking,
    });

    const result = await service.getTopMovers({ limit: 100 });

    expect(result.refreshIntervalMs).toBeGreaterThanOrEqual(30_000);
    expect(result.cacheTtlMs).toBe(result.refreshIntervalMs);
  });

  it('enters cooldown on KIS rate-limit errors and keeps stale data', async () => {
    let now = 1_000;
    let fail = false;
    const fetchRanking = vi.fn(async ({ direction }) => {
      if (fail) throw new KisRestError('rate limited', 429, null, 'EGW00201', {});
      return [
        {
          rank: 1,
          ticker: direction === 'gainers' ? '005930' : '000660',
          name: direction === 'gainers' ? '삼성전자' : 'SK하이닉스',
          price: 70_000,
          changeAbs: 2_500,
          changePct: direction === 'gainers' ? 3.7 : -2.7,
          volume: 1_000,
        },
      ];
    });
    const service = createMarketTopMoversService({
      now: () => new Date(now),
      ttlMs: 1,
      cooldownMs: 10_000,
      fetchRanking,
    });

    await service.getTopMovers({ limit: 100 });
    now += 2;
    fail = true;
    const stale = await service.getTopMovers({ limit: 100 });

    expect(stale.status).toBe('stale');
    expect(stale.cooldownUntil).toBe('1970-01-01T00:00:11.002Z');
    expect(stale.gainers[0]?.ticker).toBe('005930');
  });

  it('clamps caller limit to the top 100 contract', async () => {
    const fetchRanking = vi.fn(async () =>
      Array.from({ length: 120 }, (_, idx) => ({
        rank: idx + 1,
        ticker: String(idx + 1).padStart(6, '0'),
        name: `종목${idx + 1}`,
        price: 1_000 + idx,
        changeAbs: idx,
        changePct: idx,
        volume: idx,
      })),
    );
    const service = createMarketTopMoversService({
      now: () => new Date('2026-05-08T08:00:00.000Z'),
      fetchRanking,
    });

    const result = await service.getTopMovers({ limit: 500 });

    expect(result.gainers).toHaveLength(100);
    expect(fetchRanking).toHaveBeenCalledWith(expect.objectContaining({ count: 100 }));
  });

  it('marks the KIS ranking as partial when fewer than the requested top100 rows arrive', async () => {
    const fetchRanking = vi.fn(async ({ direction }) => [
      {
        rank: 1,
        ticker: direction === 'gainers' ? '005930' : '000660',
        name: direction === 'gainers' ? '삼성전자' : 'SK하이닉스',
        price: 70_000,
        changeAbs: direction === 'gainers' ? 2_500 : -5_000,
        changePct: direction === 'gainers' ? 3.7 : -2.7,
        volume: 1_000,
      },
    ]);
    const service = createMarketTopMoversService({
      now: () => new Date('2026-05-08T08:00:00.000Z'),
      fetchRanking,
    });

    const result = await service.getTopMovers({ limit: 100 });

    expect(result.status).toBe('partial');
    expect(result.message).toContain('일부');
    expect(result.coverage).toEqual({
      requestedLimit: 100,
      gainersCount: 1,
      losersCount: 1,
      gainersComplete: false,
      losersComplete: false,
      marketUniverse: 'kis-full-market-ranking',
      guaranteedTop100: false,
      includesLocalFallback: false,
    });
  });

  it('keeps the larger last-good partial ranking when a later refresh shrinks under rate pressure', async () => {
    let now = Date.parse('2026-05-11T01:00:00.000Z');
    let sampleSize = 30;
    const fetchRanking = vi.fn(async ({ direction }) =>
      makeRows(direction, direction === 'gainers' ? sampleSize : Math.max(1, sampleSize - 9)),
    );
    const service = createMarketTopMoversService({
      now: () => new Date(now),
      ttlMs: 1,
      fetchRanking,
    });

    const first = await service.getTopMovers({ limit: 100 });
    now += 2;
    sampleSize = 3;
    const retained = await service.getTopMovers({ limit: 100 });

    expect(first.coverage.gainersCount).toBe(30);
    expect(first.coverage.losersCount).toBe(21);
    expect(retained.status).toBe('stale');
    expect(retained.sourcePhase).toBe('stale_snapshot');
    expect(retained.partialReason).toBe('smaller_refresh_retained');
    expect(retained.coverage.gainersCount).toBe(30);
    expect(retained.coverage.losersCount).toBe(21);
    expect(retained.lastGoodAgeMs).toBe(2);
  });

  it('routes fetches through the current TOP100 market source phase', async () => {
    const now = Date.parse('2026-05-10T23:30:00.000Z'); // 08:30 KST
    const fetchRanking = vi.fn(async ({ direction }) => makeRows(direction, 1));
    const service = createMarketTopMoversService({
      now: () => new Date(now),
      fetchRanking,
    });

    const result = await service.getTopMovers({ limit: 100 });

    expect(fetchRanking).toHaveBeenCalledWith(expect.objectContaining({
      sourcePhase: 'premarket',
    }));
    expect(result.sourcePhase).toBe('premarket');
    expect(result.sourceLabel).toBe('장전');
  });

  it('freezes the last premarket snapshot during the 08:50-09:00 handoff window', async () => {
    let now = Date.parse('2026-05-10T23:49:00.000Z'); // 08:49 KST
    const fetchRanking = vi.fn(async ({ direction }) => makeRows(direction, 12));
    const service = createMarketTopMoversService({
      now: () => new Date(now),
      ttlMs: 1,
      fetchRanking,
    });

    await service.getTopMovers({ limit: 100 });
    now = Date.parse('2026-05-10T23:55:00.000Z'); // 08:55 KST
    const frozen = await service.getTopMovers({ limit: 100 });

    expect(fetchRanking).toHaveBeenCalledTimes(2);
    expect(frozen.status).toBe('stale');
    expect(frozen.sourcePhase).toBe('opening_freeze');
    expect(frozen.frozen).toBe(true);
    expect(frozen.coverage.gainersCount).toBe(12);
  });

  it('does not label a non-premarket cache as opening freeze', async () => {
    let now = Date.parse('2026-05-11T01:00:00.000Z'); // 10:00 KST
    const fetchRanking = vi.fn(async ({ direction }) => makeRows(direction, 8));
    const service = createMarketTopMoversService({
      now: () => new Date(now),
      ttlMs: 1,
      fetchRanking,
    });

    await service.getTopMovers({ limit: 100 });
    now = Date.parse('2026-05-11T23:55:00.000Z'); // 08:55 KST next day
    const stale = await service.getTopMovers({ limit: 100 });

    expect(fetchRanking).toHaveBeenCalledTimes(2);
    expect(stale.status).toBe('stale');
    expect(stale.sourcePhase).toBe('stale_snapshot');
    expect(stale.frozen).toBe(false);
    expect(stale.coverage.gainersCount).toBe(8);
  });

  it('exposes sanitized cache and cooldown state for data-health', async () => {
    let now = 1_000;
    let fail = false;
    const fetchRanking = vi.fn(async ({ direction }) => {
      if (fail) throw new KisRestError('rate limited', 429, null, 'EGW00201', {});
      return Array.from({ length: 100 }, (_, idx) => ({
        rank: idx + 1,
        ticker: String(idx + 1).padStart(6, '0'),
        name: `${direction}-${idx + 1}`,
        price: 1_000 + idx,
        changeAbs: direction === 'gainers' ? idx : -idx,
        changePct: direction === 'gainers' ? idx + 1 : -(idx + 1),
        volume: idx,
      }));
    });
    const service = createMarketTopMoversService({
      now: () => new Date(now),
      ttlMs: 1,
      cooldownMs: 10_000,
      fetchRanking,
    });

    await service.getTopMovers({ limit: 100 });
    now += 2;
    fail = true;
    await service.getTopMovers({ limit: 100 });

    expect(service.snapshot()).toMatchObject({
      status: 'stale',
      source: 'kis-ranking-stale-snapshot',
      sourcePhase: 'stale_snapshot',
      sourceLabel: '직전',
      lastFetchedAt: '1970-01-01T00:00:01.000Z',
      cacheAgeMs: 2,
      cooldownUntil: '1970-01-01T00:00:11.002Z',
      cooldownActive: true,
      inflight: false,
      lastErrorCode: 'KIS_RATE_LIMIT_SECOND_WINDOW',
      partialReason: 'rate_limited',
      rankingRateLimited: true,
      coverage: {
        requestedLimit: 100,
        gainersCount: 100,
        losersCount: 100,
        guaranteedTop100: true,
        includesLocalFallback: false,
      },
    });
  });

  it('keeps a full top100 cache even when a smaller caller limit refreshes first', async () => {
    let now = 1_000;
    let fail = false;
    const fetchRanking = vi.fn(async ({ direction }) => {
      if (fail) throw new KisRestError('rate limited', 429, null, 'EGW00201', {});
      return Array.from({ length: 100 }, (_, idx) => ({
        rank: idx + 1,
        ticker: String(idx + 1).padStart(6, '0'),
        name: `${direction}-${idx + 1}`,
        price: 1_000 + idx,
        changeAbs: direction === 'gainers' ? idx : -idx,
        changePct: direction === 'gainers' ? idx : -idx,
        volume: idx,
      }));
    });
    const service = createMarketTopMoversService({
      now: () => new Date(now),
      ttlMs: 1,
      cooldownMs: 10_000,
      fetchRanking,
    });

    const compact = await service.getTopMovers({ limit: 3 });
    expect(compact.gainers).toHaveLength(3);
    expect(fetchRanking).toHaveBeenCalledWith(expect.objectContaining({ count: 100 }));

    now += 2;
    fail = true;
    const stale = await service.getTopMovers({ limit: 100 });

    expect(stale.status).toBe('stale');
    expect(stale.gainers).toHaveLength(100);
    expect(stale.losers).toHaveLength(100);
  });

  it('fails fast without duplicating ranking calls when KIS ranking hangs', async () => {
    vi.useFakeTimers();
    try {
      const fetchRanking = vi.fn(() => new Promise<never>(() => {}));
      const service = createMarketTopMoversService({
        now: () => new Date('2026-05-08T08:00:00.000Z'),
        refreshTimeoutMs: 100,
        fetchRanking,
      });

      const pending = service.getTopMovers({ limit: 100 });
      await vi.advanceTimersByTimeAsync(101);
      const result = await pending;

      expect(result.status).toBe('error');
      expect(result.gainers).toEqual([]);
      expect(result.losers).toEqual([]);
      expect(fetchRanking).toHaveBeenCalledTimes(1);

      const second = service.getTopMovers({ limit: 100 });
      await vi.advanceTimersByTimeAsync(101);
      await second;

      expect(fetchRanking).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

function makeRows(direction: 'gainers' | 'losers', count: number) {
  return Array.from({ length: count }, (_, idx) => ({
    rank: idx + 1,
    ticker: String(idx + 1).padStart(6, '0'),
    name: `${direction}-${idx + 1}`,
    price: 1_000 + idx,
    changeAbs: direction === 'gainers' ? idx + 1 : -(idx + 1),
    changePct: direction === 'gainers' ? idx + 1 : -(idx + 1),
    volume: idx,
  }));
}
