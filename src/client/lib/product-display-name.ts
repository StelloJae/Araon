import type { MarketTopMoversResponse } from '@shared/types';

export interface ProductDisplayNameEntry {
  ticker: string;
  name: string;
}

export function normalizeDisplayTicker(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim().toUpperCase();
  if (normalized.length === 0) return null;
  const krTicker = normalized.startsWith('A') ? normalized.slice(1) : normalized;
  if (/^\d{6}$/.test(krTicker)) return krTicker;
  if (/^[A-Z][A-Z0-9.-]{0,15}$/.test(normalized)) return normalized;
  return null;
}

export function normalizeDisplayName(
  value: string | null | undefined,
  ticker: string | null,
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const normalizedTicker = normalizeDisplayTicker(ticker);
  if (
    normalizedTicker !== null &&
    normalizeDisplayTicker(trimmed) === normalizedTicker
  ) {
    return null;
  }
  return trimmed;
}

export function resolveProductDisplayName(
  ticker: string | null | undefined,
  fallbackName: string | null | undefined,
  names: Readonly<Record<string, string>>,
): string | undefined {
  const normalizedTicker = normalizeDisplayTicker(ticker);
  const cached =
    normalizedTicker === null ? undefined : names[normalizedTicker];
  if (cached !== undefined) return cached;
  return normalizeDisplayName(fallbackName, normalizedTicker) ?? undefined;
}

export function marketTopMoversDisplayNameEntries(
  response: MarketTopMoversResponse,
): ProductDisplayNameEntry[] {
  const out: ProductDisplayNameEntry[] = [];
  for (const item of [...response.gainers, ...response.losers]) {
    const ticker = normalizeDisplayTicker(item.ticker);
    const name = normalizeDisplayName(item.name, ticker);
    if (ticker === null || name === null) continue;
    out.push({ ticker, name });
  }
  return out;
}
