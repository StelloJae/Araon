import type { Stock } from '@shared/types';
import {
  getStocks,
  getThemesWithStocks,
  type ThemeDetail,
} from './api-client';

interface SyncTrackedCatalogDeps {
  getStocks?: () => Promise<Stock[]>;
  getThemesWithStocks?: () => Promise<ThemeDetail[]>;
  setCatalog: (stocks: Stock[]) => void;
  setThemes: (themes: ThemeDetail[]) => void;
}

export async function syncTrackedCatalogAfterMasterAdd({
  getStocks: loadStocks = getStocks,
  getThemesWithStocks: loadThemes = getThemesWithStocks,
  setCatalog,
  setThemes,
}: SyncTrackedCatalogDeps): Promise<void> {
  const stocks = await loadStocks();
  setCatalog(stocks);

  const themes = await loadThemes();
  setThemes(themes);
}
