/**
 * Tier manager — decides which tickers receive realtime WebSocket subscriptions
 * (Tier 1) and which stay on the REST polling lane (Tier 2).
 *
 * NXT5a intentionally limits Tier 1 to the oldest 3 favorites before any
 * later widening toward the KIS session ceiling. Non-favorites remain on the
 * REST polling lane, and overflow favorites are accepted as polling entries.
 *
 * `computeTiers()` is a pure function useful for tests and cold-start logic.
 * `TierManager` is the stateful orchestrator used at runtime: each mutation
 * returns the minimal subscribe/unsubscribe diff so the realtime-bridge can
 * apply only the delta.
 */

import type { Favorite } from '@shared/types.js';
import { WS_MAX_SUBSCRIPTIONS } from '@shared/kis-constraints.js';

// === Types ====================================================================

export const NXT5A_REALTIME_FAVORITE_LIMIT = 3;

export interface TierAssignment {
  readonly realtimeTickers: readonly string[];
  readonly pollingTickers: readonly string[];
}

export interface TierDiff {
  readonly subscribe: readonly string[];
  readonly unsubscribe: readonly string[];
}

export interface RealtimeCandidatePreview {
  readonly requestedCap: number;
  readonly effectiveCap: number;
  readonly candidateCount: number;
  readonly shortage: number;
  readonly tickers: readonly string[];
  readonly usesFavoritesOnly: true;
}

export interface RealtimeCandidatePreviewInput {
  readonly favorites: readonly Favorite[];
  readonly nonFavoriteTickers?: readonly string[];
  readonly requestedCap: number;
}

// === Pure tier computation ====================================================

/**
 * Classify favorites into Tier 1 (realtime) and Tier 2 (polling).
 * NXT5a only promotes favorites; non-favorite tickers stay on the REST lane
 * even when realtime capacity is still available.
 */
export function computeTiers(
  favorites: readonly Favorite[],
  nonFavoriteTickers: readonly string[] = [],
  cap: number = NXT5A_REALTIME_FAVORITE_LIMIT,
): TierAssignment {
  const effectiveCap = normalizeRealtimeCap(cap);
  const favoritesSorted = [...favorites].sort((a, b) =>
    a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0,
  );
  const favoriteTickers = new Set(favoritesSorted.map((fav) => fav.ticker));

  const realtime: string[] = [];
  const polling: string[] = [];

  for (const fav of favoritesSorted) {
    if (realtime.length < effectiveCap) {
      realtime.push(fav.ticker);
    } else {
      polling.push(fav.ticker);
    }
  }

  const nonFavSorted = [...nonFavoriteTickers]
    .filter((ticker) => !favoriteTickers.has(ticker))
    .sort();
  polling.push(...nonFavSorted);

  return { realtimeTickers: realtime, pollingTickers: polling };
}

export function previewRealtimeCandidates(
  input: RealtimeCandidatePreviewInput,
): RealtimeCandidatePreview {
  const effectiveCap = normalizeRealtimeCap(input.requestedCap);
  const assignment = computeTiers(input.favorites, [], effectiveCap);
  const tickers = assignment.realtimeTickers;
  return {
    requestedCap: input.requestedCap,
    effectiveCap,
    candidateCount: tickers.length,
    shortage: Math.max(0, effectiveCap - tickers.length),
    tickers,
    usesFavoritesOnly: true,
  };
}

function normalizeRealtimeCap(cap: number): number {
  if (!Number.isFinite(cap) || !Number.isInteger(cap) || cap < 0) {
    throw new RangeError('realtime tier cap must be a non-negative integer');
  }
  return Math.min(cap, WS_MAX_SUBSCRIPTIONS);
}

// === Stateful manager =========================================================

export interface TierManager {
  /** Returns the current realtime/polling split. */
  getAssignment(): TierAssignment;

  /** The soft cap applied to favorites (and Tier 1 as a whole). */
  getCap(): number;

  /**
   * Add a favorite. Returns the subscribe/unsubscribe diff relative to the
   * previous assignment.
   * If the rollout cap is full, the favorite is still accepted and stays on
   * the REST polling lane until an older realtime favorite is removed.
   */
  addFavorite(ticker: string, addedAt?: string): TierDiff;

  /** Remove a favorite. Returns the subscribe/unsubscribe diff. */
  removeFavorite(ticker: string): TierDiff;

  /**
   * Register a non-favorite ticker into the universe. In NXT5a this always
   * stays on the REST polling lane and therefore returns an empty diff.
   */
  addNonFavorite(ticker: string): TierDiff;

  /** Remove a non-favorite ticker from the universe. Returns the diff. */
  removeNonFavorite(ticker: string): TierDiff;

  /** Returns the current favorites in priority order (oldest first). */
  listFavorites(): readonly Favorite[];
}

export interface TierManagerOptions {
  initialFavorites?: readonly Favorite[];
  initialNonFavorites?: readonly string[];
  cap?: number;
  /** Injected clock for deterministic tests. Defaults to `() => new Date().toISOString()`. */
  now?: () => string;
}

function diffAssignment(
  previous: TierAssignment,
  next: TierAssignment,
): TierDiff {
  const prevSet = new Set(previous.realtimeTickers);
  const nextSet = new Set(next.realtimeTickers);
  const subscribe: string[] = [];
  const unsubscribe: string[] = [];
  for (const t of nextSet) {
    if (!prevSet.has(t)) subscribe.push(t);
  }
  for (const t of prevSet) {
    if (!nextSet.has(t)) unsubscribe.push(t);
  }
  return { subscribe, unsubscribe };
}

export function createTierManager(
  options: TierManagerOptions = {},
): TierManager {
  const cap = normalizeRealtimeCap(
    options.cap ?? NXT5A_REALTIME_FAVORITE_LIMIT,
  );
  const nowIso =
    options.now ?? ((): string => new Date().toISOString());

  const favorites = new Map<string, Favorite>();
  for (const fav of options.initialFavorites ?? []) {
    favorites.set(fav.ticker, fav);
  }

  const nonFavorites = new Set<string>(options.initialNonFavorites ?? []);

  let assignment = recompute();

  function recompute(): TierAssignment {
    const favList = Array.from(favorites.values());
    const nonFavList = Array.from(nonFavorites).filter(
      (t) => !favorites.has(t),
    );
    return computeTiers(favList, nonFavList, cap);
  }

  function mutate(apply: () => void): TierDiff {
    const previous = assignment;
    apply();
    assignment = recompute();
    return diffAssignment(previous, assignment);
  }

  return {
    getAssignment(): TierAssignment {
      return assignment;
    },
    getCap(): number {
      return cap;
    },
    addFavorite(ticker: string, addedAt?: string): TierDiff {
      if (favorites.has(ticker)) {
        return { subscribe: [], unsubscribe: [] };
      }
      return mutate(() => {
        favorites.set(ticker, {
          ticker,
          tier: 'realtime',
          addedAt: addedAt ?? nowIso(),
        });
      });
    },
    removeFavorite(ticker: string): TierDiff {
      if (!favorites.has(ticker)) {
        return { subscribe: [], unsubscribe: [] };
      }
      return mutate(() => {
        favorites.delete(ticker);
      });
    },
    addNonFavorite(ticker: string): TierDiff {
      if (favorites.has(ticker) || nonFavorites.has(ticker)) {
        return { subscribe: [], unsubscribe: [] };
      }
      return mutate(() => {
        nonFavorites.add(ticker);
      });
    },
    removeNonFavorite(ticker: string): TierDiff {
      if (!nonFavorites.has(ticker)) {
        return { subscribe: [], unsubscribe: [] };
      }
      return mutate(() => {
        nonFavorites.delete(ticker);
      });
    },
    listFavorites(): readonly Favorite[] {
      const realtime = new Set(assignment.realtimeTickers);
      return Array.from(favorites.values()).sort((a, b) =>
        a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0,
      ).map((favorite) => ({
        ...favorite,
        tier: realtime.has(favorite.ticker) ? 'realtime' : 'polling',
      }));
    },
  };
}
