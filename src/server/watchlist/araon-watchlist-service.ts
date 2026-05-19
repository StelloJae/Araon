import type { Favorite, Price, Stock } from '@shared/types.js';
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
import type {
  TossPortfolioPosition,
  TossPortfolioPositionsPayload,
} from '../toss/toss-portfolio-client.js';

export type AraonWatchlistPrimarySource = 'toss' | 'local';
export type AraonWatchlistStatus = 'ready' | 'local_fallback';
export type AraonWatchlistSource = 'toss' | 'local' | 'merged' | 'toss_position';
export type AraonWatchlistMembershipSource =
  | 'toss_watchlist'
  | 'holding_auto'
  | 'araon_local'
  | 'merged';
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
  iconUrl?: string | null;
  market: AraonProductMarket;
  currency: AraonCurrency;
  source: AraonWatchlistSource;
  syncState: AraonWatchlistSyncState;
  kisEligible: boolean;
  tossEligible: boolean;
  chartEligible: boolean;
  quoteEligible: boolean;
  realtimeTrackingState: AraonWatchlistTrackingState;
  watchSurfaceMember: boolean;
  watchlistMember: boolean;
  membershipSource: AraonWatchlistMembershipSource;
  manualWatchlist: boolean;
  autoSyncedFromHolding: boolean;
  localFallback: boolean;
  holding: boolean;
  addedAt: string | null;
  groupName: string | null;
  base: number | null;
  last: number | null;
  changePct: number | null;
}

export interface AraonWatchlistPayload {
  provider: 'araon-watchlist';
  fetchedAt: string;
  primarySource: AraonWatchlistPrimarySource;
  status: AraonWatchlistStatus;
  warning: AraonWatchlistWarning | null;
  counts: {
    toss: number;
    positions: number;
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

export type AraonWatchlistReconcileStatus =
  | 'preview'
  | 'applied'
  | 'mutation_disabled'
  | 'watchlist_unavailable'
  | 'failed';
export type AraonWatchlistReconcileReason =
  | 'holding_missing_in_toss_watchlist'
  | 'local_favorite_missing_in_toss_watchlist'
  | 'auto_holding_no_longer_held';
export type AraonWatchlistReconcileMutationAction = 'add' | 'remove';
export type AraonWatchlistReconcileMutationStatus =
  | 'succeeded'
  | 'unchanged'
  | 'failed'
  | 'skipped';

export interface AraonWatchlistReconcileInput {
  dryRun?: boolean | undefined;
  maxMutations?: number | undefined;
}

export interface AraonWatchlistReconcileCandidate {
  productCode: string;
  krTicker: string | null;
  name: string;
  reason: AraonWatchlistReconcileReason;
}

export interface AraonWatchlistReconcileMutation {
  productCode: string;
  krTicker: string | null;
  name: string;
  action: AraonWatchlistReconcileMutationAction;
  status: AraonWatchlistReconcileMutationStatus;
  reason: AraonWatchlistMutationReason | 'max_mutations_reached';
}

export interface AraonWatchlistReconcileResult {
  provider: 'araon-watchlist';
  fetchedAt: string;
  dryRun: boolean;
  status: AraonWatchlistReconcileStatus;
  counts: {
    addCandidates: number;
    removeCandidates: number;
    attempted: number;
    added: number;
    removed: number;
    unchanged: number;
    failed: number;
    skipped: number;
  };
  addCandidates: AraonWatchlistReconcileCandidate[];
  removeCandidates: AraonWatchlistReconcileCandidate[];
  mutations: AraonWatchlistReconcileMutation[];
}

export interface AraonWatchlistService {
  getWatchlist(): Promise<AraonWatchlistPayload>;
  addItem(input: AraonWatchlistMutationInput): Promise<AraonWatchlistMutationResult>;
  removeItem(input: AraonWatchlistMutationInput): Promise<AraonWatchlistMutationResult>;
  reconcileHoldingsWithTossWatchlist(
    input?: AraonWatchlistReconcileInput,
  ): Promise<AraonWatchlistReconcileResult>;
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
  portfolioPositions?: {
    snapshot(): TossPortfolioPositionsPayload | null;
  };
  priceStore?: {
    getPrice(ticker: string): Price | undefined;
  };
  watchlistProvenanceRepo?: {
    findActiveHoldingAuto(): Array<{
      productCode: string;
      krTicker: string | null;
    }>;
    markHoldingAutoActive(input: {
      productCode: string;
      krTicker: string | null;
      now: string;
    }): void;
    markRemoved(productCode: string, now: string): void;
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
      hydrateWatchlistItemPrice(
        localFavoriteToWatchlistItem(favorite, options.stockRepo.findByTicker(favorite.ticker)),
        options.priceStore,
      ),
    );

    try {
      const tossPayload = await options.watchlistClient.listWatchlist();
      const localByProductCode = new Map(localItems.map((item) => [item.productCode, item]));
      const portfolioSnapshot = options.portfolioPositions?.snapshot() ?? null;
      const items: AraonWatchlistItem[] = [];
      const itemIndexByProductCode = new Map<string, number>();
      const seen = new Set<string>();
      let merged = 0;

      for (const tossItem of tossPayload.items) {
        const item = hydrateWatchlistItemPrice(
          tossItemToWatchlistItem(
            tossItem,
            localStockForTossItem(tossItem, options.stockRepo),
            localByProductCode.has(normalizeTossProductCode(tossItem.productCode) ?? tossItem.productCode),
          ),
          options.priceStore,
        );
        if (localByProductCode.has(item.productCode)) merged += 1;
        seen.add(item.productCode);
        itemIndexByProductCode.set(item.productCode, items.length);
        items.push(item);
      }

      for (const position of portfolioSnapshot?.positions ?? []) {
        const item = hydrateWatchlistItemPrice(
          positionToWatchlistItem(
            position,
            localStockForPortfolioPosition(position, options.stockRepo),
            localByProductCode.has(positionProductCode(position)),
            seen.has(positionProductCode(position)),
          ),
          options.priceStore,
        );
        if (item === null) continue;
        const existingIndex = itemIndexByProductCode.get(item.productCode);
        if (existingIndex !== undefined) {
          items[existingIndex] = mergePositionIntoWatchlistItem(items[existingIndex], item);
          merged += 1;
        } else {
          seen.add(item.productCode);
          itemIndexByProductCode.set(item.productCode, items.length);
          items.push(item);
        }
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
          positions: portfolioSnapshot?.positions.length ?? 0,
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
          positions: 0,
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
          options.watchlistProvenanceRepo?.markRemoved(identity.productCode, now().toISOString());
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
        options.watchlistProvenanceRepo?.markRemoved(productCode, now().toISOString());
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
          options.watchlistProvenanceRepo?.markRemoved(identity.productCode, now().toISOString());
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
        options.watchlistProvenanceRepo?.markRemoved(identity.productCode, now().toISOString());
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

  async function reconcileHoldingsWithTossWatchlist(
    input: AraonWatchlistReconcileInput = {},
  ): Promise<AraonWatchlistReconcileResult> {
    const dryRun = input.dryRun ?? true;
    const maxMutations = normalizeMaxMutations(input.maxMutations);
    const fetchedAt = now().toISOString();
    let tossPayload;

    try {
      tossPayload = await options.watchlistClient.listWatchlist();
    } catch {
      return emptyReconcileResult({
        fetchedAt,
        dryRun,
        status: 'watchlist_unavailable',
      });
    }

    const localItems = options.favoriteRepo.findAll().map((favorite) =>
      localFavoriteToWatchlistItem(favorite, options.stockRepo.findByTicker(favorite.ticker)),
    );
    const localByProductCode = new Map(localItems.map((item) => [item.productCode, item]));
    const tossByProductCode = new Map(
      tossPayload.items.map((item) => [
        normalizeTossProductCode(item.productCode) ?? item.productCode,
        item,
      ]),
    );
    const portfolioSnapshot = options.portfolioPositions?.snapshot() ?? null;
    const heldItems = (portfolioSnapshot?.positions ?? [])
      .map((position) => positionToWatchlistItem(
        position,
        localStockForPortfolioPosition(position, options.stockRepo),
        localByProductCode.has(positionProductCode(position)),
        tossByProductCode.has(positionProductCode(position)),
      ))
      .filter((item): item is AraonWatchlistItem => item !== null);
    const heldProductCodes = new Set(heldItems.map((item) => item.productCode));

    const holdingAddCandidates = heldItems
      .filter((item) => item.tossEligible && !tossByProductCode.has(item.productCode))
      .map((item): AraonWatchlistReconcileCandidate => ({
        productCode: item.productCode,
        krTicker: item.krTicker,
        name: item.name,
        reason: 'holding_missing_in_toss_watchlist',
      }));
    const holdingAddProductCodes = new Set(holdingAddCandidates.map((candidate) => candidate.productCode));
    const localAddCandidates = localItems
      .filter((item) =>
        item.tossEligible &&
        !tossByProductCode.has(item.productCode) &&
        !holdingAddProductCodes.has(item.productCode)
      )
      .map((item): AraonWatchlistReconcileCandidate => ({
        productCode: item.productCode,
        krTicker: item.krTicker,
        name: item.name,
        reason: 'local_favorite_missing_in_toss_watchlist',
      }));
    const addCandidates = [...holdingAddCandidates, ...localAddCandidates];

    const removeCandidates = (options.watchlistProvenanceRepo?.findActiveHoldingAuto() ?? [])
      .filter((record) =>
        !heldProductCodes.has(record.productCode) &&
        !localByProductCode.has(record.productCode) &&
        tossByProductCode.has(record.productCode),
      )
      .map((record): AraonWatchlistReconcileCandidate => {
        const tossItem = tossByProductCode.get(record.productCode);
        return {
          productCode: record.productCode,
          krTicker: record.krTicker,
          name: tossItem?.name ?? record.krTicker ?? record.productCode,
          reason: 'auto_holding_no_longer_held',
        };
      });

    if (dryRun) {
      return reconcileResult({
        fetchedAt,
        dryRun,
        status: 'preview',
        addCandidates,
        removeCandidates,
        mutations: [],
      });
    }

    if (
      options.enableTossWatchlistMutation !== true ||
      options.watchlistClient.addProductToWatchlist === undefined ||
      options.watchlistClient.removeProductFromWatchlist === undefined
    ) {
      return reconcileResult({
        fetchedAt,
        dryRun,
        status: addCandidates.length + removeCandidates.length > 0 ? 'mutation_disabled' : 'applied',
        addCandidates,
        removeCandidates,
        mutations: [],
      });
    }

    const mutations: AraonWatchlistReconcileMutation[] = [];
    let remaining = maxMutations;
    let failed = false;

    for (const candidate of addCandidates) {
      if (remaining <= 0) {
        mutations.push(skippedMutation(candidate, 'add'));
        continue;
      }
      remaining -= 1;
      try {
        const result = await options.watchlistClient.addProductToWatchlist({
          productCode: candidate.productCode,
        });
        if (
          candidate.reason === 'holding_missing_in_toss_watchlist' &&
          (result.action === 'added' || result.action === 'unchanged')
        ) {
          options.watchlistProvenanceRepo?.markHoldingAutoActive({
            productCode: candidate.productCode,
            krTicker: candidate.krTicker,
            now: now().toISOString(),
          });
        }
        mutations.push({
          productCode: candidate.productCode,
          krTicker: candidate.krTicker,
          name: candidate.name,
          action: 'add',
          status: result.action === 'unchanged' ? 'unchanged' : 'succeeded',
          reason: 'toss_mutation_succeeded',
        });
      } catch {
        failed = true;
        mutations.push(failedMutation(candidate, 'add'));
        break;
      }
    }

    if (!failed) {
      for (const candidate of removeCandidates) {
        if (remaining <= 0) {
          mutations.push(skippedMutation(candidate, 'remove'));
          continue;
        }
        remaining -= 1;
        try {
          const result = await options.watchlistClient.removeProductFromWatchlist({
            productCode: candidate.productCode,
          });
          if (result.action === 'removed' || result.action === 'unchanged') {
            options.watchlistProvenanceRepo?.markRemoved(candidate.productCode, now().toISOString());
          }
          mutations.push({
            productCode: candidate.productCode,
            krTicker: candidate.krTicker,
            name: candidate.name,
            action: 'remove',
            status: result.action === 'unchanged' ? 'unchanged' : 'succeeded',
            reason: 'toss_mutation_succeeded',
          });
        } catch {
          failed = true;
          mutations.push(failedMutation(candidate, 'remove'));
          break;
        }
      }
    }

    if (mutations.length > 0) {
      try {
        await options.watchlistClient.listWatchlist();
      } catch {
        failed = true;
      }
    }

    return reconcileResult({
      fetchedAt,
      dryRun,
      status: failed ? 'failed' : 'applied',
      addCandidates,
      removeCandidates,
      mutations,
    });
  }

  return { getWatchlist, addItem, removeItem, reconcileHoldingsWithTossWatchlist };
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
  const base = finiteOrNull(item.base);
  const last = finiteOrNull(item.last);
  return {
    productCode,
    krTicker,
    symbol: identity?.symbol ?? krTicker ?? productCode,
    name: identity?.name ?? item.name,
    ...(item.iconUrl !== undefined ? { iconUrl: item.iconUrl } : {}),
    market: identity?.market ?? 'UNKNOWN',
    currency: identity?.currency ?? currency,
    source: hasLocalFavorite ? 'merged' : 'toss',
    syncState: 'toss_synced',
    kisEligible,
    tossEligible: identity?.tossEligible ?? true,
    chartEligible: identity?.chartEligible ?? kisEligible,
    quoteEligible: identity?.quoteEligible ?? true,
    realtimeTrackingState: kisEligible ? 'waiting' : 'not_eligible',
    watchSurfaceMember: true,
    watchlistMember: true,
    membershipSource: hasLocalFavorite ? 'merged' : 'toss_watchlist',
    manualWatchlist: true,
    autoSyncedFromHolding: false,
    localFallback: false,
    holding: false,
    addedAt: null,
    groupName: item.groupName.length > 0 ? item.groupName : null,
    base,
    last,
    changePct: deriveChangePct(last, base),
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
    watchSurfaceMember: true,
    watchlistMember: true,
    membershipSource: 'araon_local',
    manualWatchlist: true,
    autoSyncedFromHolding: false,
    localFallback: true,
    holding: false,
    addedAt: favorite.addedAt,
    groupName: null,
    base: null,
    last: null,
    changePct: null,
  };
}

function localStockForTossItem(
  item: TossWatchlistItem,
  stockRepo: AraonWatchlistServiceOptions['stockRepo'],
): Stock | null {
  const krTicker = krTickerFromTossProductCode(item.productCode);
  return krTicker === null ? null : stockRepo.findByTicker(krTicker);
}

function positionToWatchlistItem(
  position: TossPortfolioPosition,
  localStock: Stock | null,
  hasLocalFavorite: boolean,
  hasTossWatchlist: boolean,
): AraonWatchlistItem | null {
  const productCode = positionProductCode(position);
  const currency = positionCurrency(position);
  const identity = createAraonProductIdentity({
    productCode,
    symbol: position.symbol,
    name: position.name,
    market: localStock?.market ?? positionMarket(position),
    currency,
    source: 'toss',
  });
  if (identity === null) return null;
  return {
    productCode: identity.productCode,
    krTicker: identity.krTicker,
    symbol: identity.symbol,
    name: identity.name,
    ...(position.iconUrl !== undefined ? { iconUrl: position.iconUrl } : {}),
    market: identity.market,
    currency: identity.currency,
    source: hasTossWatchlist || hasLocalFavorite ? 'merged' : 'toss_position',
    syncState: hasTossWatchlist ? 'toss_synced' : 'sync_pending',
    kisEligible: identity.kisEligible,
    tossEligible: identity.tossEligible,
    chartEligible: identity.chartEligible,
    quoteEligible: identity.quoteEligible,
    realtimeTrackingState: identity.kisEligible ? 'waiting' : 'not_eligible',
    watchSurfaceMember: true,
    watchlistMember: hasTossWatchlist || hasLocalFavorite,
    membershipSource: hasTossWatchlist
      ? hasLocalFavorite ? 'merged' : 'toss_watchlist'
      : hasLocalFavorite ? 'merged' : 'holding_auto',
    manualWatchlist: hasTossWatchlist || hasLocalFavorite,
    autoSyncedFromHolding: !hasTossWatchlist && !hasLocalFavorite,
    localFallback: hasLocalFavorite && !hasTossWatchlist,
    holding: true,
    addedAt: null,
    groupName: null,
    base: null,
    last: finiteOrNull(position.currentPrice),
    changePct: null,
  };
}

function mergePositionIntoWatchlistItem(
  existing: AraonWatchlistItem | undefined,
  positionItem: AraonWatchlistItem,
): AraonWatchlistItem {
  if (existing === undefined) return positionItem;
  const iconUrl = positionItem.iconUrl ?? existing.iconUrl;
  return {
    ...existing,
    source: existing.source === 'toss_position' ? 'toss_position' : 'merged',
    watchSurfaceMember: true,
    watchlistMember: true,
    membershipSource: existing.membershipSource === 'araon_local'
      ? 'merged'
      : existing.membershipSource,
    manualWatchlist: existing.manualWatchlist || positionItem.manualWatchlist,
    autoSyncedFromHolding: existing.autoSyncedFromHolding && !positionItem.manualWatchlist,
    localFallback: existing.localFallback,
    holding: true,
    ...(iconUrl !== undefined ? { iconUrl } : {}),
    base: positionItem.base ?? existing.base,
    last: positionItem.last ?? existing.last,
    changePct: positionItem.changePct ?? existing.changePct,
  };
}

function hydrateWatchlistItemPrice(
  item: AraonWatchlistItem,
  priceStore: AraonWatchlistServiceOptions['priceStore'],
): AraonWatchlistItem;
function hydrateWatchlistItemPrice(
  item: AraonWatchlistItem | null,
  priceStore: AraonWatchlistServiceOptions['priceStore'],
): AraonWatchlistItem | null;
function hydrateWatchlistItemPrice(
  item: AraonWatchlistItem | null,
  priceStore: AraonWatchlistServiceOptions['priceStore'],
): AraonWatchlistItem | null {
  if (item === null || priceStore === undefined) return item;
  const price = firstPriceForWatchlistItem(item, priceStore);
  if (price === undefined || !Number.isFinite(price.price) || price.price <= 0) return item;
  const changePct = finiteOrNull(price.changeRate) ?? item.changePct;
  return {
    ...item,
    base: deriveBaseFromChangePct(price.price, changePct) ?? item.base,
    last: price.price,
    changePct,
  };
}

function firstPriceForWatchlistItem(
  item: AraonWatchlistItem,
  priceStore: NonNullable<AraonWatchlistServiceOptions['priceStore']>,
) {
  for (const key of watchlistPriceKeys(item)) {
    const price = priceStore.getPrice(key);
    if (price !== undefined) return price;
  }
  return undefined;
}

function watchlistPriceKeys(item: AraonWatchlistItem): string[] {
  const keys = [
    item.krTicker,
    normalizeTossProductCode(item.productCode) ?? item.productCode,
    item.symbol,
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    if (typeof key !== 'string') continue;
    const trimmed = key.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function positionProductCode(position: TossPortfolioPosition): string {
  return normalizeTossProductCode(position.productCode)
    ?? normalizeTossProductCode(position.symbol)
    ?? position.productCode;
}

function localStockForPortfolioPosition(
  position: TossPortfolioPosition,
  stockRepo: AraonWatchlistServiceOptions['stockRepo'],
): Stock | null {
  const ticker = krTickerFromTossProductCode(positionProductCode(position));
  return ticker === null ? null : stockRepo.findByTicker(ticker);
}

function positionCurrency(position: TossPortfolioPosition): AraonCurrency {
  if (position.marketType.toUpperCase() === 'US') return 'USD';
  if (position.marketCode.toUpperCase().includes('US')) return 'USD';
  if (position.productCode.toUpperCase().startsWith('US')) return 'USD';
  return 'KRW';
}

function positionMarket(position: TossPortfolioPosition): AraonProductMarket {
  if (positionCurrency(position) === 'USD') return 'US';
  const productCode = positionProductCode(position);
  if (krTickerFromTossProductCode(productCode) !== null) return 'UNKNOWN';
  return 'TOSS_ONLY';
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
          watchSurfaceMember: false,
          watchlistMember: false,
          membershipSource: 'toss_watchlist',
          manualWatchlist: false,
          autoSyncedFromHolding: false,
          localFallback: false,
          holding: false,
          addedAt: null,
          groupName: null,
          base: null,
          last: null,
          changePct: null,
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
    watchSurfaceMember: true,
    watchlistMember: true,
    membershipSource: 'toss_watchlist',
    manualWatchlist: true,
    autoSyncedFromHolding: false,
    localFallback: false,
    holding: false,
    addedAt: null,
    groupName: null,
    base: null,
    last: null,
    changePct: null,
  };
}

function withSyncState(
  item: AraonWatchlistItem,
  syncState: AraonWatchlistSyncState,
): AraonWatchlistItem {
  if (syncState !== 'toss_synced') return { ...item, syncState };
  return {
    ...item,
    syncState,
    membershipSource: item.membershipSource === 'araon_local'
      ? 'toss_watchlist'
      : item.membershipSource,
    localFallback: false,
  };
}

function normalizeMaxMutations(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(10, Math.trunc(value)));
}

function emptyReconcileResult(input: {
  fetchedAt: string;
  dryRun: boolean;
  status: AraonWatchlistReconcileStatus;
}): AraonWatchlistReconcileResult {
  return reconcileResult({
    fetchedAt: input.fetchedAt,
    dryRun: input.dryRun,
    status: input.status,
    addCandidates: [],
    removeCandidates: [],
    mutations: [],
  });
}

function reconcileResult(input: {
  fetchedAt: string;
  dryRun: boolean;
  status: AraonWatchlistReconcileStatus;
  addCandidates: AraonWatchlistReconcileCandidate[];
  removeCandidates: AraonWatchlistReconcileCandidate[];
  mutations: AraonWatchlistReconcileMutation[];
}): AraonWatchlistReconcileResult {
  return {
    provider: 'araon-watchlist',
    fetchedAt: input.fetchedAt,
    dryRun: input.dryRun,
    status: input.status,
    counts: {
      addCandidates: input.addCandidates.length,
      removeCandidates: input.removeCandidates.length,
      attempted: input.mutations.filter((mutation) => mutation.status !== 'skipped').length,
      added: input.mutations.filter((mutation) =>
        mutation.action === 'add' && mutation.status === 'succeeded',
      ).length,
      removed: input.mutations.filter((mutation) =>
        mutation.action === 'remove' && mutation.status === 'succeeded',
      ).length,
      unchanged: input.mutations.filter((mutation) => mutation.status === 'unchanged').length,
      failed: input.mutations.filter((mutation) => mutation.status === 'failed').length,
      skipped: input.mutations.filter((mutation) => mutation.status === 'skipped').length,
    },
    addCandidates: input.addCandidates,
    removeCandidates: input.removeCandidates,
    mutations: input.mutations,
  };
}

function skippedMutation(
  candidate: AraonWatchlistReconcileCandidate,
  action: AraonWatchlistReconcileMutationAction,
): AraonWatchlistReconcileMutation {
  return {
    productCode: candidate.productCode,
    krTicker: candidate.krTicker,
    name: candidate.name,
    action,
    status: 'skipped',
    reason: 'max_mutations_reached',
  };
}

function failedMutation(
  candidate: AraonWatchlistReconcileCandidate,
  action: AraonWatchlistReconcileMutationAction,
): AraonWatchlistReconcileMutation {
  return {
    productCode: candidate.productCode,
    krTicker: candidate.krTicker,
    name: candidate.name,
    action,
    status: 'failed',
    reason: 'toss_mutation_failed',
  };
}

function deriveChangePct(
  last: number | null,
  base: number | null,
): number | null {
  if (last === null || base === null || base <= 0) return null;
  return ((last - base) / base) * 100;
}

function deriveBaseFromChangePct(
  last: number,
  changePct: number | null,
): number | null {
  if (changePct === null) return null;
  const divisor = 1 + changePct / 100;
  if (!Number.isFinite(divisor) || divisor <= 0) return null;
  const base = last / divisor;
  return Number.isFinite(base) && base > 0 ? base : null;
}

function isTossSessionRequired(err: unknown): boolean {
  return err instanceof Error && err.message === 'Toss session is required';
}
