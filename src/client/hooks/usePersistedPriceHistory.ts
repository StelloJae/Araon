import { useEffect } from 'react';
import { getStockPriceHistory } from '../lib/api-client';
import { usePriceHistoryStore } from '../stores/price-history-store';

const HYDRATION_TTL_MS = 60_000;
const MAX_ACTIVE_HYDRATIONS = 4;
const HYDRATION_START_GAP_MS = 50;
const hydrationByTicker = new Map<string, number>();
const pendingHydrationByTicker = new Map<string, Promise<void>>();
const queuedHydrationTickers = new Set<string>();
const hydrationQueue: string[] = [];
let activeHydrations = 0;
let lastHydrationStartAt = 0;
let drainTimer: ReturnType<typeof setTimeout> | null = null;

export function usePersistedPriceHistory(ticker: string, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const now = Date.now();
    const lastHydrated = hydrationByTicker.get(ticker) ?? 0;
    if (now - lastHydrated < HYDRATION_TTL_MS) return;
    enqueueHydration(ticker);
  }, [enabled, ticker]);
}

function enqueueHydration(ticker: string): void {
  if (
    pendingHydrationByTicker.has(ticker) ||
    queuedHydrationTickers.has(ticker)
  ) {
    return;
  }
  queuedHydrationTickers.add(ticker);
  hydrationQueue.push(ticker);
  drainHydrationQueue();
}

function drainHydrationQueue(): void {
  if (activeHydrations >= MAX_ACTIVE_HYDRATIONS || hydrationQueue.length === 0) {
    return;
  }

  const waitMs = Math.max(
    0,
    lastHydrationStartAt + HYDRATION_START_GAP_MS - Date.now(),
  );
  if (waitMs > 0) {
    if (drainTimer === null) {
      drainTimer = setTimeout(() => {
        drainTimer = null;
        drainHydrationQueue();
      }, waitMs);
    }
    return;
  }

  const ticker = hydrationQueue.shift();
  if (ticker === undefined) return;

  queuedHydrationTickers.delete(ticker);
  activeHydrations += 1;
  lastHydrationStartAt = Date.now();

  const pending = getStockPriceHistory(ticker, { range: '1d', includeCandleSeed: true })
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
      activeHydrations = Math.max(0, activeHydrations - 1);
      pendingHydrationByTicker.delete(ticker);
      drainHydrationQueue();
    });
  pendingHydrationByTicker.set(ticker, pending);
  drainHydrationQueue();
}
