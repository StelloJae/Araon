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
      expect(fetchRanking).toHaveBeenCalledTimes(2);

      const second = service.getTopMovers({ limit: 100 });
      await vi.advanceTimersByTimeAsync(101);
      await second;

      expect(fetchRanking).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
