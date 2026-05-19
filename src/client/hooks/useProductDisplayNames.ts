import { useMemo } from 'react';

import {
  normalizeDisplayName,
  normalizeDisplayTicker,
} from '../lib/product-display-name';
import { useProductDisplayNameStore } from '../stores/product-display-name-store';
import { useStocksStore } from '../stores/stocks-store';

export function useProductDisplayNames(
  override?: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const cachedNames = useProductDisplayNameStore((state) => state.names);
  const catalog = useStocksStore((state) => state.catalog);

  return useMemo(() => {
    if (override !== undefined) return override;
    const catalogNames: Record<string, string> = {};
    for (const [ticker, entry] of Object.entries(catalog)) {
      const normalizedTicker = normalizeDisplayTicker(ticker);
      const name = normalizeDisplayName(entry.name, normalizedTicker);
      if (normalizedTicker === null || name === null) continue;
      catalogNames[normalizedTicker] = name;
    }
    return { ...catalogNames, ...cachedNames };
  }, [cachedNames, catalog, override]);
}
