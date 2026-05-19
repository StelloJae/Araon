const TOSS_ICON_HOST = 'static.toss.im';
const TOSS_SECURITIES_ICON_PREFIX = '/png-icons/securities/';

export interface TossProductIconCache {
  get(productKey: string | null | undefined): string | null;
  set(productKey: string | null | undefined, iconUrl: string | null | undefined): void;
  clear(): void;
  snapshot(): ReadonlyMap<string, string>;
}

export function sanitizeTossProductIconUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:') return null;
    if (url.hostname !== TOSS_ICON_HOST) return null;
    if (!url.pathname.startsWith(TOSS_SECURITIES_ICON_PREFIX)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function readTossProductIconUrl(
  record: Record<string, unknown>,
): string | null {
  return sanitizeTossProductIconUrl(record['logoImageUrl'])
    ?? sanitizeTossProductIconUrl(record['imageUrl']);
}

export function createTossProductIconCache(): TossProductIconCache {
  const entries = new Map<string, string>();
  return {
    get(productKey) {
      const key = normalizeProductIconCacheKey(productKey);
      return key === null ? null : entries.get(key) ?? null;
    },
    set(productKey, iconUrl) {
      const key = normalizeProductIconCacheKey(productKey);
      const safeIconUrl = sanitizeTossProductIconUrl(iconUrl);
      if (key === null || safeIconUrl === null) return;
      entries.set(key, safeIconUrl);
    },
    clear() {
      entries.clear();
    },
    snapshot() {
      return new Map(entries);
    },
  };
}

export function resolveTossProductIconUrl(input: {
  readonly record: Record<string, unknown>;
  readonly productCode?: string | null;
  readonly symbol?: string | null;
  readonly ticker?: string | null;
  readonly cache?: TossProductIconCache | undefined;
}): string | null {
  const direct = readTossProductIconUrl(input.record);
  const cacheKey = firstProductIconCacheKey(input.productCode, input.symbol, input.ticker);
  if (direct !== null) {
    input.cache?.set(cacheKey, direct);
    return direct;
  }
  return input.cache?.get(cacheKey) ?? null;
}

function firstProductIconCacheKey(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const key = normalizeProductIconCacheKey(value);
    if (key !== null) return key;
  }
  return null;
}

function normalizeProductIconCacheKey(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (normalized.length === 0) return null;
  if (/^A\d{6}$/.test(normalized)) return normalized.slice(1);
  if (/^\d{6}$/.test(normalized)) return normalized;
  if (/^US[A-Z0-9]{4,32}$/.test(normalized)) return normalized;
  return null;
}
