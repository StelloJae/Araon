import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Price, Stock } from '@shared/types';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  // No global side effects to clean up.
});

const STOCK_A: Stock = { ticker: '005930', name: '삼성전자', market: 'KOSPI' };
const STOCK_B: Stock = { ticker: '000660', name: 'SK하이닉스', market: 'KOSPI' };

const PRICE_A: Price = {
  ticker: '005930',
  price: 78_900,
  changeRate: 1.5,
  changeAbs: 1_200,
  volume: 1_000_000,
  updatedAt: '2026-04-27T01:00:00.000Z',
  isSnapshot: false,
};

describe('useStocksStore.removeStock', () => {
  it('applies live price bursts in one batched store update', async () => {
    const { useStocksStore } = await import('../stocks-store');
    const first = PRICE_A;
    const second: Price = {
      ...PRICE_A,
      price: 79_100,
      updatedAt: '2026-04-27T01:00:01.000Z',
    };
    const other: Price = {
      ...PRICE_A,
      ticker: '000660',
      price: 190_000,
      updatedAt: '2026-04-27T01:00:02.000Z',
    };

    useStocksStore.getState().applyPriceUpdates([first, second, other]);

    const next = useStocksStore.getState();
    expect(next.quotes['005930']).toBe(second);
    expect(next.quotes['000660']).toBe(other);
    expect(next.flashSeeds['005930']).toBe(2);
    expect(next.flashSeeds['000660']).toBe(1);
  });

  it('drops the ticker from catalog, quotes, and flashSeeds', async () => {
    const { useStocksStore } = await import('../stocks-store');
    const store = useStocksStore.getState();

    store.setCatalog([STOCK_A, STOCK_B]);
    store.applyPriceUpdate(PRICE_A);

    expect(useStocksStore.getState().catalog['005930']).toBeDefined();
    expect(useStocksStore.getState().quotes['005930']).toBeDefined();
    expect(useStocksStore.getState().flashSeeds['005930']).toBeGreaterThan(0);

    useStocksStore.getState().removeStock('005930');

    const next = useStocksStore.getState();
    expect(next.catalog['005930']).toBeUndefined();
    expect(next.quotes['005930']).toBeUndefined();
    expect(next.flashSeeds['005930']).toBeUndefined();
    // Sibling untouched
    expect(next.catalog['000660']).toBeDefined();
  });

  it('is a no-op when ticker is unknown', async () => {
    const { useStocksStore } = await import('../stocks-store');
    const store = useStocksStore.getState();
    store.setCatalog([STOCK_A]);

    const before = useStocksStore.getState();
    useStocksStore.getState().removeStock('999999');
    const after = useStocksStore.getState();

    expect(after.catalog).toBe(before.catalog);
    expect(after.quotes).toBe(before.quotes);
    expect(after.flashSeeds).toBe(before.flashSeeds);
  });
});
