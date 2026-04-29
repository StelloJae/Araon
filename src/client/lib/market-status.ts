/**
 * Small helpers around `MarketStatus` so display code never has to know which
 * literal strings the backend uses internally.
 *
 * Domain (`@shared/types`): 'pre-open' | 'open' | 'closed' | 'snapshot'.
 * Header label words (UI):  'LIVE' | 'PRE-OPEN' | 'SNAPSHOT'.
 *
 * Anywhere we need the question "is the market actually live right now?" use
 * `isMarketLive` instead of comparing strings directly. That way a future
 * rename or new status value (e.g. 'auction') only changes one file.
 */

import type { MarketStatus } from '@shared/types';

export function isMarketLive(status: MarketStatus): boolean {
  return status === 'open';
}

export function isPreOpen(status: MarketStatus): boolean {
  return status === 'pre-open';
}
