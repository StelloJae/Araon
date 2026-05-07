import type { PriceCandleSource } from './types.js';

export const PRICE_HISTORY_FALLBACK_SUPPRESS_MS = 30_000;

export function isRealtimePriceSource(
  source: PriceCandleSource | null | undefined,
): boolean {
  return source === 'ws-krx' || source === 'ws-integrated' || source === 'ws-nxt';
}

