import { useEffect } from 'react';
import { getStockPriceHistory } from '../lib/api-client';
import { usePriceHistoryStore } from '../stores/price-history-store';

const HYDRATION_TTL_MS = 60_000;
const hydrationByTicker = new Map<string, number>();
const pendingHydrationByTicker = new Map<string, Promise<void>>();

export function usePersistedPriceHistory(ticker: string, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const now = Date.now();
    const lastHydrated = hydrationByTicker.get(ticker) ?? 0;
    if (now - lastHydrated < HYDRATION_TTL_MS) return;
    if (pendingHydrationByTicker.has(ticker)) return;

    const pending = getStockPriceHistory(ticker, { range: '1d' })
      .then((history) => {
        usePriceHistoryStore.getState().seedTicker(
          ticker,
          history.items.map((item) => ({
            price: item.price,
            changePct: item.changePct,
            ts: new Date(item.bucketAt).getTime(),
            source: item.source,
          })),
        );
        hydrationByTicker.set(ticker, Date.now());
      })
      .catch(() => {
        hydrationByTicker.delete(ticker);
      })
      .finally(() => {
        pendingHydrationByTicker.delete(ticker);
      });
    pendingHydrationByTicker.set(ticker, pending);
  }, [enabled, ticker]);
}
