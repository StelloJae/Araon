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
  it('builds display sector from manual sector before official KIS industry', async () => {
    const { buildStockVM, useStocksStore } = await import('../stocks-store');
    const store = useStocksStore.getState();

    store.setCatalog([{ ...STOCK_A, autoSector: '전기전자' }]);
    store.setThemes([
      {
        id: 'manual-semi',
        name: '반도체',
        description: '',
        stocks: [{ ticker: '005930', name: '삼성전자', market: 'KOSPI' }],
      },
    ]);

    expect(buildStockVM('005930', useStocksStore.getState().catalog, {}))
      .toMatchObject({
        effectiveSector: { name: '반도체', source: 'manual' },
      });
  });

  it('falls through from 기타 manual sector to official KIS industry', async () => {
    const { buildStockVM, useStocksStore } = await import('../stocks-store');
    const store = useStocksStore.getState();

    store.setCatalog([{ ...STOCK_A, autoSector: '전기전자' }]);
    store.setThemes([
      {
        id: 'manual-other',
        name: '기타',
        description: '',
        stocks: [{ ticker: '005930', name: '삼성전자', market: 'KOSPI' }],
      },
    ]);

    expect(buildStockVM('005930', useStocksStore.getState().catalog, {}))
      .toMatchObject({
        effectiveSector: { name: '전기전자', source: 'kis-industry' },
      });
  });

  it('groups official-industry-missing products as 미분류', async () => {
    const { buildStockVM, useStocksStore } = await import('../stocks-store');
    const store = useStocksStore.getState();

    store.setCatalog([{ ...STOCK_A, autoSector: null }]);

    expect(buildStockVM('005930', useStocksStore.getState().catalog, {}))
      .toMatchObject({
        effectiveSector: { name: '미분류', source: 'unclassified' },
      });
  });

  it('keeps ETF/ETN-like products without official industry as 미분류', async () => {
    const { buildStockVM, useStocksStore } = await import('../stocks-store');
    const store = useStocksStore.getState();

    store.setCatalog([
      {
        ticker: '069500',
        name: 'KODEX 200 ETF',
        market: 'KOSPI',
        autoSector: null,
      },
    ]);

    expect(buildStockVM('069500', useStocksStore.getState().catalog, {}))
      .toMatchObject({
        effectiveSector: { name: '미분류', source: 'unclassified' },
      });
  });

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

  it('keeps REST detail fields when a later live tick omits them', async () => {
    const { buildStockVM, useStocksStore } = await import('../stocks-store');
    const store = useStocksStore.getState();
    store.setCatalog([STOCK_A]);

    store.applyPriceUpdate({
      ...PRICE_A,
      openPrice: 78_000,
      highPrice: 79_500,
      lowPrice: 77_600,
      accumulatedTradeValue: 78_900_000_000,
      marketCapKrw: 471_000_000_000_000,
      per: 14.2,
      pbr: 1.1,
      foreignOwnershipRate: 52.4,
      week52High: 92_000,
      week52Low: 61_000,
      dividendYield: null,
    });

    store.applyPriceUpdate({
      ...PRICE_A,
      price: 79_100,
      changeRate: 1.7,
      changeAbs: 1_400,
      volume: 1_050_000,
      updatedAt: '2026-04-27T01:00:01.000Z',
      source: 'ws-integrated',
    });

    const quote = useStocksStore.getState().quotes['005930'];
    expect(quote).toMatchObject({
      price: 79_100,
      openPrice: 78_000,
      highPrice: 79_500,
      lowPrice: 77_600,
      marketCapKrw: 471_000_000_000_000,
      foreignOwnershipRate: 52.4,
      week52High: 92_000,
      week52Low: 61_000,
    });
    expect(
      buildStockVM(
        '005930',
        useStocksStore.getState().catalog,
        useStocksStore.getState().quotes,
      ),
    ).toMatchObject({
      openPrice: 78_000,
      highPrice: 79_500,
      lowPrice: 77_600,
      marketCapKrw: 471_000_000_000_000,
      foreignOwnershipRate: 52.4,
    });
  });

  it('does not flash for timestamp-only or volume-only updates', async () => {
    const { useStocksStore } = await import('../stocks-store');
    const store = useStocksStore.getState();

    store.applyPriceUpdate(PRICE_A);
    const firstFlash = useStocksStore.getState().flashSeeds['005930'];

    store.applyPriceUpdate({
      ...PRICE_A,
      volume: PRICE_A.volume + 1_000,
      updatedAt: '2026-04-27T01:00:01.000Z',
    });
    expect(useStocksStore.getState().flashSeeds['005930']).toBe(firstFlash);
    expect(useStocksStore.getState().quotes['005930']?.volume).toBe(
      PRICE_A.volume + 1_000,
    );

    store.applyPriceUpdate({
      ...PRICE_A,
      volume: PRICE_A.volume + 1_000,
      updatedAt: '2026-04-27T01:00:02.000Z',
    });
    expect(useStocksStore.getState().flashSeeds['005930']).toBe(firstFlash);
  });

  it('flashes when price, change rate, or absolute change moves', async () => {
    const { useStocksStore } = await import('../stocks-store');
    const store = useStocksStore.getState();

    store.applyPriceUpdate(PRICE_A);
    const firstFlash = useStocksStore.getState().flashSeeds['005930'] ?? 0;

    store.applyPriceUpdate({
      ...PRICE_A,
      price: PRICE_A.price + 100,
      updatedAt: '2026-04-27T01:00:01.000Z',
    });
    expect(useStocksStore.getState().flashSeeds['005930']).toBe(firstFlash + 1);

    store.applyPriceUpdate({
      ...PRICE_A,
      price: PRICE_A.price + 100,
      changeRate: PRICE_A.changeRate + 0.1,
      updatedAt: '2026-04-27T01:00:02.000Z',
    });
    expect(useStocksStore.getState().flashSeeds['005930']).toBe(firstFlash + 2);

    store.applyPriceUpdate({
      ...PRICE_A,
      price: PRICE_A.price + 100,
      changeRate: PRICE_A.changeRate + 0.1,
      changeAbs: (PRICE_A.changeAbs ?? 0) + 100,
      updatedAt: '2026-04-27T01:00:03.000Z',
    });
    expect(useStocksStore.getState().flashSeeds['005930']).toBe(firstFlash + 3);
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
