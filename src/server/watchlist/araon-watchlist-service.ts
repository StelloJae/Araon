import type { Favorite, Stock } from '@shared/types.js';
import {
  createAraonProductIdentity,
  krTickerFromTossProductCode,
  normalizeTossProductCode,
  type AraonCurrency,
  type AraonProductIdentity,
  type AraonProductMarket,
} from '@shared/product-identity.js';

import type {
  TossWatchlistClient,
  TossWatchlistItem,
} from '../toss/toss-watchlist-client.js';

export type AraonWatchlistPrimarySource = 'toss' | 'local';
export type AraonWatchlistStatus = 'ready' | 'local_fallback';
export type AraonWatchlistSource = 'toss' | 'local' | 'merged';
export type AraonWatchlistSyncState =
  | 'toss_synced'
  | 'local_only'
  | 'sync_pending'
  | 'sync_unavailable'
  | 'sync_failed';
export type AraonWatchlistTrackingState =
  | 'tracked'
  | 'waiting'
  | 'not_eligible'
  | 'disabled'
  | 'unknown';

export interface AraonWatchlistWarning {
  code: 'TOSS_SESSION_REQUIRED' | 'TOSS_READ_FAILED';
}

export interface AraonWatchlistItem {
  productCode: string;
  krTicker: string | null;
  symbol: string;
  name: string;
  market: AraonProductMarket;
  currency: AraonCurrency;
  source: AraonWatchlistSource;
  syncState: AraonWatchlistSyncState;
  kisEligible: boolean;
  tossEligible: boolean;
  chartEligible: boolean;
  quoteEligible: boolean;
  realtimeTrackingState: AraonWatchlistTrackingState;
  addedAt: string | null;
  groupName: string | null;
  base: number | null;
  last: number | null;
}

export interface AraonWatchlistPayload {
  provider: 'araon-watchlist';
  fetchedAt: string;
  primarySource: AraonWatchlistPrimarySource;
  status: AraonWatchlistStatus;
  warning: AraonWatchlistWarning | null;
  counts: {
    toss: number;
    local: number;
    merged: number;
    returned: number;
  };
  items: AraonWatchlistItem[];
}

export type AraonWatchlistMutationAction = 'added' | 'removed' | 'unchanged' | 'unsupported';
export type AraonWatchlistMutationReason =
  | 'local_fallback'
  | 'toss_mutation_disabled'
  | 'toss_mutation_succeeded'
  | 'toss_mutation_failed'
  | 'unsupported_product'
  | 'not_found';

export interface AraonWatchlistMutationInput {
  productCode: string;
  krTicker?: string | null | undefined;
  symbol?: string | null | undefined;
  name?: string | null | undefined;
  market?: AraonProductMarket | null | undefined;
  currency?: AraonCurrency | null | undefined;
}

export interface AraonWatchlistMutationResult {
  provider: 'araon-watchlist';
  action: AraonWatchlistMutationAction;
  syncState: AraonWatchlistSyncState;
  reason: AraonWatchlistMutationReason;
  item: AraonWatchlistItem | null;
}

export interface AraonWatchlistService {
  getWatchlist(): Promise<AraonWatchlistPayload>;
  addItem(input: AraonWatchlistMutationInput): Promise<AraonWatchlistMutationResult>;
  removeItem(input: AraonWatchlistMutationInput): Promise<AraonWatchlistMutationResult>;
}

export interface AraonWatchlistServiceOptions {
  watchlistClient: TossWatchlistClient;
  enableTossWatchlistMutation?: boolean;
  favoriteRepo: {
    findAll(): Favorite[];
    findByTicker(ticker: string): Favorite | null;
    upsert(favorite: Favorite): void;
    delete(ticker: string): void;
  };
  stockRepo: {
    findByTicker(ticker: string): Stock | null;
  };
  now?: () => Date;
}

export function createAraonWatchlistService(
  options: AraonWatchlistServiceOptions,
): AraonWatchlistService {
  const now = options.now ?? (() => new Date());

  async function getWatchlist(): Promise<AraonWatchlistPayload> {
    const localFavorites = options.favoriteRepo.findAll();
    const localItems = localFavorites.map((favorite) =>
      localFavoriteToWatchlistItem(favorite, options.stockRepo.findByTicker(favorite.ticker)),
    );

    try {
      const tossPayload = await options.watchlistClient.listWatchlist();
      const localByProductCode = new Map(localItems.map((item) => [item.productCode, item]));
      const items: AraonWatchlistItem[] = [];
      const seen = new Set<string>();
      let merged = 0;

      for (const tossItem of tossPayload.items) {
        const item = tossItemToWatchlistItem(
          tossItem,
          localStockForTossItem(tossItem, options.stockRepo),
          localByProductCode.has(normalizeTossProductCode(tossItem.productCode) ?? tossItem.productCode),
        );
        if (localByProductCode.has(item.productCode)) merged += 1;
        seen.add(item.productCode);
        items.push(item);
      }

      for (const localItem of localItems) {
        if (seen.has(localItem.productCode)) continue;
        items.push(withSyncState(localItem, 'sync_pending'));
      }

      return {
        provider: 'araon-watchlist',
        fetchedAt: now().toISOString(),
        primarySource: 'toss',
        status: 'ready',
        warning: null,
        counts: {
          toss: tossPayload.items.length,
          local: localItems.length,
          merged,
          returned: items.length,
        },
        items,
      };
    } catch (err: unknown) {
      const warning: AraonWatchlistWarning = {
        code: isTossSessionRequired(err) ? 'TOSS_SESSION_REQUIRED' : 'TOSS_READ_FAILED',
      };
      return {
        provider: 'araon-watchlist',
        fetchedAt: now().toISOString(),
        primarySource: 'local',
        status: 'local_fallback',
        warning,
        counts: {
          toss: 0,
          local: localItems.length,
          merged: 0,
          returned: localItems.length,
        },
        items: localItems,
      };
    }
  }

  async function addItem(
    input: AraonWatchlistMutationInput,
  ): Promise<AraonWatchlistMutationResult> {
    const identity = identityFromMutationInput(input);
    if (identity === null) {
      return unsupportedMutationResult(input);
    }

    if (identity.krTicker === null || !identity.kisEligible) {
      if (options.enableTossWatchlistMutation === true
        && options.watchlistClient.addProductToWatchlist !== undefined) {
        try {
          await options.watchlistClient.addProductToWatchlist({
            productCode: identity.productCode,
          });
          return {
            provider: 'araon-watchlist',
            action: 'added',
            syncState: 'toss_synced',
            reason: 'toss_mutation_succeeded',
            item: identityToWatchlistItem(identity, 'toss_synced'),
          };
        } catch {
          return {
            provider: 'araon-watchlist',
            action: 'unsupported',
            syncState: 'sync_failed',
            reason: 'toss_mutation_failed',
            item: identityToWatchlistItem(identity, 'sync_failed'),
          };
        }
      }
      return unsupportedMutationResult(input);
    }

    const existing = options.favoriteRepo.findByTicker(identity.krTicker);
    const favorite: Favorite = existing ?? {
      ticker: identity.krTicker,
      tier: 'polling',
      addedAt: now().toISOString(),
    };
    const stock = options.stockRepo.findByTicker(identity.krTicker);
    const productCode = identity.productCode;

    if (options.enableTossWatchlistMutation === true
      && options.watchlistClient.addProductToWatchlist !== undefined) {
      try {
        await options.watchlistClient.addProductToWatchlist({ productCode });
        options.favoriteRepo.upsert(favorite);
        return {
          provider: 'araon-watchlist',
          action: existing === null ? 'added' : 'unchanged',
          syncState: 'toss_synced',
          reason: 'toss_mutation_succeeded',
          item: withSyncState(localFavoriteToWatchlistItem(favorite, stock), 'toss_synced'),
        };
      } catch {
        options.favoriteRepo.upsert(favorite);
        return {
          provider: 'araon-watchlist',
          action: existing === null ? 'added' : 'unchanged',
          syncState: 'sync_failed',
          reason: 'toss_mutation_failed',
          item: withSyncState(localFavoriteToWatchlistItem(favorite, stock), 'sync_failed'),
        };
      }
    }

    options.favoriteRepo.upsert(favorite);
    const syncState = await canReadTossWatchlist()
      ? 'sync_pending'
      : 'local_only';
    const reason = syncState === 'sync_pending'
      ? 'toss_mutation_disabled'
      : 'local_fallback';
    const item = withSyncState(
      localFavoriteToWatchlistItem(favorite, stock),
      syncState,
    );

    return {
      provider: 'araon-watchlist',
      action: existing === null ? 'added' : 'unchanged',
      syncState: item.syncState,
      reason,
      item,
    };
  }

  async function removeItem(
    input: AraonWatchlistMutationInput,
  ): Promise<AraonWatchlistMutationResult> {
    const identity = identityFromMutationInput(input);
    if (identity === null) {
      return unsupportedMutationResult(input);
    }

    if (identity.krTicker === null || !identity.kisEligible) {
      if (options.enableTossWatchlistMutation === true
        && options.watchlistClient.removeProductFromWatchlist !== undefined) {
        try {
          const result = await options.watchlistClient.removeProductFromWatchlist({
            productCode: identity.productCode,
          });
          return {
            provider: 'araon-watchlist',
            action: result.action === 'removed' ? 'removed' : 'unchanged',
            syncState: 'toss_synced',
            reason: 'toss_mutation_succeeded',
            item: null,
          };
        } catch {
          return {
            provider: 'araon-watchlist',
            action: 'unsupported',
            syncState: 'sync_failed',
            reason: 'toss_mutation_failed',
            item: identityToWatchlistItem(identity, 'sync_failed'),
          };
        }
      }
      return unsupportedMutationResult(input);
    }

    const existing = options.favoriteRepo.findByTicker(identity.krTicker);

    if (options.enableTossWatchlistMutation === true
      && options.watchlistClient.removeProductFromWatchlist !== undefined) {
      try {
        const result = await options.watchlistClient.removeProductFromWatchlist({
          productCode: identity.productCode,
        });
        if (existing !== null) {
          options.favoriteRepo.delete(identity.krTicker);
        }
        return {
          provider: 'araon-watchlist',
          action: result.action === 'removed' ? 'removed' : 'unchanged',
          syncState: 'toss_synced',
          reason: 'toss_mutation_succeeded',
          item: existing === null
            ? null
            : withSyncState(
                localFavoriteToWatchlistItem(
                  existing,
                  options.stockRepo.findByTicker(identity.krTicker),
                ),
                'toss_synced',
              ),
        };
      } catch {
        return {
          provider: 'araon-watchlist',
          action: existing === null ? 'unchanged' : 'removed',
          syncState: 'sync_failed',
          reason: 'toss_mutation_failed',
          item: existing === null
            ? null
            : withSyncState(
                localFavoriteToWatchlistItem(
                  existing,
                  options.stockRepo.findByTicker(identity.krTicker),
                ),
                'sync_failed',
              ),
        };
      }
    }

    if (existing === null) {
      return {
        provider: 'araon-watchlist',
        action: 'unsupported',
        syncState: 'sync_unavailable',
        reason: 'toss_mutation_disabled',
        item: null,
      };
    }

    options.favoriteRepo.delete(identity.krTicker);
    const stock = options.stockRepo.findByTicker(identity.krTicker);
    return {
      provider: 'araon-watchlist',
      action: 'removed',
      syncState: 'local_only',
      reason: 'local_fallback',
      item: localFavoriteToWatchlistItem(existing, stock),
    };
  }

  async function canReadTossWatchlist(): Promise<boolean> {
    try {
      await options.watchlistClient.listWatchlist();
      return true;
    } catch {
      return false;
    }
  }

  return { getWatchlist, addItem, removeItem };
}

function tossItemToWatchlistItem(
  item: TossWatchlistItem,
  localStock: Stock | null,
  hasLocalFavorite: boolean,
): AraonWatchlistItem {
  const productCode = normalizeTossProductCode(item.productCode) ?? item.productCode;
  const currency = currencyFromProvider(item.currency);
  const identity = createAraonProductIdentity({
    productCode,
    symbol: item.symbol,
    name: item.name,
    market: localStock?.market ?? marketFromProduct(productCode, currency),
    currency,
    source: 'toss',
  });
  const krTicker = identity?.krTicker ?? krTickerFromTossProductCode(productCode);
  const kisEligible = identity?.kisEligible ?? false;
  return {
    productCode,
    krTicker,
    symbol: identity?.symbol ?? krTicker ?? productCode,
    name: identity?.name ?? item.name,
    market: identity?.market ?? 'UNKNOWN',
    currency: identity?.currency ?? currency,
    source: hasLocalFavorite ? 'merged' : 'toss',
    syncState: 'toss_synced',
    kisEligible,
    tossEligible: identity?.tossEligible ?? true,
    chartEligible: identity?.chartEligible ?? kisEligible,
    quoteEligible: identity?.quoteEligible ?? true,
    realtimeTrackingState: kisEligible ? 'waiting' : 'not_eligible',
    addedAt: null,
    groupName: item.groupName.length > 0 ? item.groupName : null,
    base: finiteOrNull(item.base),
    last: finiteOrNull(item.last),
  };
}

function localFavoriteToWatchlistItem(
  favorite: Favorite,
  stock: Stock | null,
): AraonWatchlistItem {
  const productCode = normalizeTossProductCode(favorite.ticker) ?? `A${favorite.ticker}`;
  const identity = createAraonProductIdentity({
    productCode,
    symbol: favorite.ticker,
    name: stock?.name ?? favorite.ticker,
    market: stock?.market ?? 'UNKNOWN',
    currency: 'KRW',
    source: 'local',
  });
  return {
    productCode,
    krTicker: favorite.ticker,
    symbol: favorite.ticker,
    name: identity?.name ?? stock?.name ?? favorite.ticker,
    market: identity?.market ?? stock?.market ?? 'UNKNOWN',
    currency: 'KRW',
    source: 'local',
    syncState: 'local_only',
    kisEligible: identity?.kisEligible ?? true,
    tossEligible: identity?.tossEligible ?? true,
    chartEligible: identity?.chartEligible ?? true,
    quoteEligible: identity?.quoteEligible ?? true,
    realtimeTrackingState: favorite.tier === 'realtime' ? 'tracked' : 'waiting',
    addedAt: favorite.addedAt,
    groupName: null,
    base: null,
    last: null,
  };
}

function localStockForTossItem(
  item: TossWatchlistItem,
  stockRepo: AraonWatchlistServiceOptions['stockRepo'],
): Stock | null {
  const krTicker = krTickerFromTossProductCode(item.productCode);
  return krTicker === null ? null : stockRepo.findByTicker(krTicker);
}

function currencyFromProvider(value: string): AraonCurrency {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'KRW') return 'KRW';
  if (normalized === 'USD') return 'USD';
  return 'UNKNOWN';
}

function marketFromProduct(productCode: string, currency: AraonCurrency): AraonProductMarket {
  if (currency === 'USD') return 'US';
  if (krTickerFromTossProductCode(productCode) === null) return 'TOSS_ONLY';
  return 'UNKNOWN';
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function identityFromMutationInput(input: AraonWatchlistMutationInput) {
  return createAraonProductIdentity({
    productCode: input.productCode,
    symbol: input.symbol ?? input.krTicker ?? null,
    name: input.name ?? input.krTicker ?? input.productCode,
    market: input.market ?? null,
    currency: input.currency ?? null,
    source: 'toss',
  });
}

function unsupportedMutationResult(
  input: AraonWatchlistMutationInput,
): AraonWatchlistMutationResult {
  const identity = identityFromMutationInput(input);
  return {
    provider: 'araon-watchlist',
    action: 'unsupported',
    syncState: 'sync_unavailable',
    reason: 'unsupported_product',
    item: identity === null
      ? null
      : {
          productCode: identity.productCode,
          krTicker: identity.krTicker,
          symbol: identity.symbol,
          name: identity.name,
          market: identity.market,
          currency: identity.currency,
          source: 'toss',
          syncState: 'sync_unavailable',
          kisEligible: identity.kisEligible,
          tossEligible: identity.tossEligible,
          chartEligible: identity.chartEligible,
          quoteEligible: identity.quoteEligible,
          realtimeTrackingState: 'not_eligible',
          addedAt: null,
          groupName: null,
          base: null,
          last: null,
        },
  };
}

function identityToWatchlistItem(
  identity: AraonProductIdentity,
  syncState: AraonWatchlistSyncState,
): AraonWatchlistItem {
  return {
    productCode: identity.productCode,
    krTicker: identity.krTicker,
    symbol: identity.symbol,
    name: identity.name,
    market: identity.market,
    currency: identity.currency,
    source: 'toss',
    syncState,
    kisEligible: identity.kisEligible,
    tossEligible: identity.tossEligible,
    chartEligible: identity.chartEligible,
    quoteEligible: identity.quoteEligible,
    realtimeTrackingState: identity.kisEligible ? 'waiting' : 'not_eligible',
    addedAt: null,
    groupName: null,
    base: null,
    last: null,
  };
}

function withSyncState(
  item: AraonWatchlistItem,
  syncState: AraonWatchlistSyncState,
): AraonWatchlistItem {
  return { ...item, syncState };
}

function isTossSessionRequired(err: unknown): boolean {
  return err instanceof Error && err.message === 'Toss session is required';
}
