import { describe, expect, it, vi } from 'vitest';

import { syncTrackedCatalogAfterMasterAdd } from '../tracked-catalog-sync';

describe('syncTrackedCatalogAfterMasterAdd', () => {
  it('reloads tracked stocks from /stocks so official KIS industry stays authoritative', async () => {
    const stocks = [
      {
        ticker: '005380',
        name: '현대차',
        market: 'KOSPI' as const,
        autoSector: '운수장비' as const,
      },
    ];
    const themes = [
      {
        id: 'auto',
        name: '운수장비',
        description: 'KIS 공식 지수업종',
        stocks: [],
      },
    ];
    const setCatalog = vi.fn();
    const setThemes = vi.fn();

    await syncTrackedCatalogAfterMasterAdd({
      getStocks: async () => stocks,
      getThemesWithStocks: async () => themes,
      setCatalog,
      setThemes,
    });

    expect(setCatalog).toHaveBeenCalledWith(stocks);
    expect(setThemes).toHaveBeenCalledWith(themes);
    expect(setCatalog.mock.invocationCallOrder[0]).toBeLessThan(
      setThemes.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });
});
