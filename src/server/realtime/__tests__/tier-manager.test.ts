/**
 * NXT5a acceptance tests for the tier-manager + realtime-bridge pair.
 *
 * Tier 1 is filled by favorites only, oldest addedAt first, up to the current
 * rollout cap. NXT5a intentionally keeps that cap small (1~3) before any
 * later widening toward `WS_MAX_SUBSCRIPTIONS`. Tier 2 = everything else.
 *
 * A dedicated case also walks through the R3 rollback stage 2 side effect:
 * after `bridge.disconnectAll()`, every favorite in the DB with
 * `tier='realtime'` should be flipped to `tier='polling'` by the rollback SQL
 * (not the bridge itself — the migration is what does it). This test runs the
 * SQL inline against an in-memory DB to prove the rollback compiles.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

import type { Favorite, Price } from '@shared/types.js';
import {
  KIS_WS_TICK_TR_ID_INTEGRATED,
  WS_MAX_SUBSCRIPTIONS,
  WS_SUBSCRIBE_INTERVAL_MS,
} from '@shared/kis-constraints.js';

import { migrateUp } from '../../db/migrator.js';
import { FavoriteRepository } from '../../db/repositories.js';
import {
  computeTiers,
  createTierManager,
  previewRealtimeCandidates,
} from '../tier-manager.js';
import {
  createRealtimeBridge,
  type ParsedWsFrame,
  type WsTickParser,
} from '../realtime-bridge.js';
import type {
  KisWsClient,
  WsConnectionState,
  WsMessageHandler,
  WsSubscription,
} from '../../kis/kis-ws-client.js';

// === Helpers ==================================================================

function fav(ticker: string, addedAt: string): Favorite {
  return { ticker, tier: 'realtime', addedAt };
}

function padTicker(i: number): string {
  return String(i + 1).padStart(6, '0');
}

interface FakeWs {
  readonly client: KisWsClient;
  readonly subscribeCalls: WsSubscription[];
  readonly unsubscribeCalls: WsSubscription[];
  emitMessage(raw: string): void;
  setState(state: WsConnectionState): void;
  disconnectCalls: number;
}

function makeFakeWs(): FakeWs {
  const subscribeCalls: WsSubscription[] = [];
  const unsubscribeCalls: WsSubscription[] = [];
  const handlers = new Set<WsMessageHandler>();
  let state: WsConnectionState = 'idle';
  let disconnectCalls = 0;

  const client: KisWsClient = {
    async connect(): Promise<void> {
      state = 'connected';
    },
    async disconnect(): Promise<void> {
      disconnectCalls += 1;
      state = 'stopped';
    },
    async subscribe(sub: WsSubscription): Promise<void> {
      subscribeCalls.push(sub);
    },
    async unsubscribe(sub: WsSubscription): Promise<void> {
      unsubscribeCalls.push(sub);
    },
    onMessage(handler: WsMessageHandler): () => void {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    state(): WsConnectionState {
      return state;
    },
    activeSubscriptions(): readonly WsSubscription[] {
      return [];
    },
  };

  return {
    client,
    subscribeCalls,
    unsubscribeCalls,
    emitMessage(raw: string): void {
      for (const h of handlers) {
        h(raw);
      }
    },
    setState(next: WsConnectionState): void {
      state = next;
    },
    get disconnectCalls(): number {
      return disconnectCalls;
    },
    set disconnectCalls(v: number) {
      disconnectCalls = v;
    },
  };
}

function makePrice(ticker: string, price = 10000): Price {
  return {
    ticker,
    price,
    changeRate: 0.01,
    volume: 100,
    updatedAt: '2026-04-21T05:30:00.000Z',
    isSnapshot: false,
  };
}

function makeTestPriceStore(writes: Price[]): {
  setPrice(price: Price): void;
  getPrice(ticker: string): Price | undefined;
} {
  const prices = new Map<string, Price>();
  return {
    setPrice(p: Price): void {
      writes.push(p);
      prices.set(p.ticker, p);
    },
    getPrice(ticker: string): Price | undefined {
      return prices.get(ticker);
    },
  };
}

function openMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

// === Test 1: NXT5a tiering — first 3 favorites only ==========================

describe('computeTiers — NXT5a favorites-only rollout', () => {
  it('puts only the oldest 3 favorites on realtime and leaves the rest on polling', () => {
    const favorites: Favorite[] = Array.from({ length: 5 }, (_, i) =>
      fav(padTicker(i), `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
    );

    const result = computeTiers(favorites);

    expect(result.realtimeTickers).toEqual(['000001', '000002', '000003']);
    expect(result.pollingTickers).toEqual(['000004', '000005']);
  });

  it('does not promote non-favorites into realtime even when slots are open', () => {
    const favorites = [
      fav('005930', '2026-01-01T00:00:00Z'),
    ];
    const result = computeTiers(favorites, ['000660', '035420']);

    expect(result.realtimeTickers).toEqual(['005930']);
    expect(result.pollingTickers).toEqual(['000660', '035420']);
  });

  it('never exceeds the KIS WS subscription ceiling even if a higher cap is requested', () => {
    const favorites: Favorite[] = Array.from(
      { length: WS_MAX_SUBSCRIPTIONS + 2 },
      (_, i) =>
        fav(
          padTicker(i),
          `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
        ),
    );

    const result = computeTiers(favorites, [], WS_MAX_SUBSCRIPTIONS + 10);

    expect(result.realtimeTickers).toHaveLength(WS_MAX_SUBSCRIPTIONS);
    expect(result.pollingTickers).toHaveLength(2);
  });
});

describe('previewRealtimeCandidates — NXT9a cap20 readiness preview', () => {
  it('previews cap20 candidates from favorites only and reports shortage', () => {
    const favorites: Favorite[] = Array.from({ length: 7 }, (_, i) =>
      fav(padTicker(i), `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
    );

    const preview = previewRealtimeCandidates({
      favorites,
      nonFavoriteTickers: ['101010', '202020'],
      requestedCap: 20,
    });

    expect(preview).toEqual({
      requestedCap: 20,
      effectiveCap: 20,
      candidateCount: 7,
      shortage: 13,
      tickers: [
        '000001',
        '000002',
        '000003',
        '000004',
        '000005',
        '000006',
        '000007',
      ],
      usesFavoritesOnly: true,
    });
  });

  it('clamps preview effective cap at the KIS WebSocket hard ceiling', () => {
    const favorites: Favorite[] = Array.from(
      { length: WS_MAX_SUBSCRIPTIONS + 5 },
      (_, i) =>
        fav(
          padTicker(i),
          `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
        ),
    );

    const preview = previewRealtimeCandidates({
      favorites,
      requestedCap: WS_MAX_SUBSCRIPTIONS + 10,
    });

    expect(preview.effectiveCap).toBe(WS_MAX_SUBSCRIPTIONS);
    expect(preview.candidateCount).toBe(WS_MAX_SUBSCRIPTIONS);
    expect(preview.shortage).toBe(0);
  });
});

// === Test 2: overflow favorites stay polling and can be promoted ============

describe('TierManager — NXT5a overflow favorites stay on REST polling', () => {
  it('accepts the 4th favorite as polling without a WS subscribe diff', () => {
    const favorites: Favorite[] = Array.from({ length: 3 }, (_, i) =>
      fav(padTicker(i), `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
    );

    const tm = createTierManager({
      initialFavorites: favorites,
      cap: 3,
    });

    const before = tm.getAssignment();
    expect(before.realtimeTickers).toEqual(['000001', '000002', '000003']);

    const diff = tm.addFavorite(
      '000004',
      '2026-02-01T00:00:00Z',
    );

    expect(diff).toEqual({ subscribe: [], unsubscribe: [] });

    const after = tm.getAssignment();
    expect(after.realtimeTickers).toEqual(['000001', '000002', '000003']);
    expect(after.pollingTickers).toEqual(['000004']);

    expect(tm.listFavorites()).toEqual([
      fav('000001', '2026-01-01T00:00:00Z'),
      fav('000002', '2026-01-02T00:00:00Z'),
      fav('000003', '2026-01-03T00:00:00Z'),
      { ticker: '000004', tier: 'polling', addedAt: '2026-02-01T00:00:00Z' },
    ]);
  });

  it('promotes the next polling favorite when a realtime favorite is removed', () => {
    const tm = createTierManager({
      cap: 3,
      initialFavorites: Array.from({ length: 4 }, (_, i) =>
        fav(
          padTicker(i),
          `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        ),
      ),
    });

    const diff = tm.removeFavorite('000002');

    expect(diff).toEqual({
      subscribe: ['000004'],
      unsubscribe: ['000002'],
    });
    expect(tm.getAssignment()).toEqual({
      realtimeTickers: ['000001', '000003', '000004'],
      pollingTickers: [],
    });
    expect(tm.listFavorites()).toEqual([
      fav('000001', '2026-01-01T00:00:00Z'),
      fav('000003', '2026-01-03T00:00:00Z'),
      fav('000004', '2026-01-04T00:00:00Z'),
    ]);
  });

  it('keeps non-favorites on polling when they are registered in the universe', () => {
    const tm = createTierManager({
      cap: 3,
      initialFavorites: [
        fav('005930', '2026-01-01T00:00:00Z'),
      ],
      initialNonFavorites: ['000660'],
    });

    expect(tm.getAssignment()).toEqual({
      realtimeTickers: ['005930'],
      pollingTickers: ['000660'],
    });

    const diff = tm.addNonFavorite('035420');

    expect(diff).toEqual({ subscribe: [], unsubscribe: [] });
    expect(tm.getAssignment()).toEqual({
      realtimeTickers: ['005930'],
      pollingTickers: ['000660', '035420'],
    });
  });

  it('defaults to the NXT5a 3-favorite rollout cap', () => {
    const tm = createTierManager({
      initialFavorites: Array.from({ length: 4 }, (_, i) =>
        fav(
          padTicker(i),
          `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        ),
      ),
    });

    expect(tm.getCap()).toBe(3);
    expect(tm.getAssignment().realtimeTickers).toEqual([
      '000001',
      '000002',
      '000003',
    ]);
    expect(tm.getAssignment().pollingTickers).toEqual(['000004']);
  });
});

// === Test 3: WS reconnect → progressive re-subscribe at interval ============

describe('RealtimeBridge — progressive re-subscribe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-subscribes Tier 1 tickers spaced by WS_SUBSCRIBE_INTERVAL_MS', async () => {
    const ws = makeFakeWs();
    const writes: Price[] = [];
    const parseTick: WsTickParser = (): ParsedWsFrame => ({
      kind: 'ignore',
      reason: 'test',
    });

    const bridge = createRealtimeBridge({
      wsClient: ws.client,
      priceStore: makeTestPriceStore(writes),
      parseTick,
    });

    // Seed Tier 1 with a small set.
    const tickers = ['000001', '000002', '000003'];
    await bridge.applyDiff({ subscribe: tickers, unsubscribe: [] });
    expect(ws.subscribeCalls).toHaveLength(3);
    expect(bridge.getRealtimeTickers()).toEqual(tickers);

    // Reset the recorded calls to isolate the reconnect phase.
    ws.subscribeCalls.length = 0;

    const progress: Array<{ current: number; total: number }> = [];
    bridge.on('restore-progress', (p) => {
      progress.push({ current: p.current, total: p.total });
    });
    let completeTotal: number | null = null;
    bridge.on('restore-complete', (total) => {
      completeTotal = total;
    });

    const resubPromise = bridge.onReconnect();

    // First subscribe fires immediately — the stagger wait happens AFTER
    // each call. Drain microtasks + timers step by step.
    await vi.advanceTimersByTimeAsync(0);
    expect(ws.subscribeCalls.length).toBeGreaterThanOrEqual(1);

    // Advance across each inter-ticker gap to allow the full set to flush.
    await vi.advanceTimersByTimeAsync(WS_SUBSCRIBE_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(WS_SUBSCRIBE_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(WS_SUBSCRIBE_INTERVAL_MS);

    await resubPromise;

    expect(ws.subscribeCalls).toHaveLength(tickers.length);
    expect(progress).toHaveLength(tickers.length);
    expect(progress[progress.length - 1]).toEqual({
      current: tickers.length,
      total: tickers.length,
    });
    expect(completeTotal).toBe(tickers.length);
  });

  it('uses the integrated H0UNCNT0 tick TR_ID by default', async () => {
    const ws = makeFakeWs();
    const writes: Price[] = [];
    const parseTick: WsTickParser = (): ParsedWsFrame => ({
      kind: 'ignore',
      reason: 'test',
    });

    const bridge = createRealtimeBridge({
      wsClient: ws.client,
      priceStore: makeTestPriceStore(writes),
      parseTick,
    });

    await bridge.applyDiff({ subscribe: ['005930'], unsubscribe: [] });

    expect(ws.subscribeCalls).toEqual([
      { trId: KIS_WS_TICK_TR_ID_INTEGRATED, trKey: '005930' },
    ]);
  });
});

// === Test 4: realtime tick → priceStore.setPrice ============================

describe('RealtimeBridge — tick forwarding', () => {
  it('forwards parsed ticks to priceStore.setPrice when apply guard is enabled', () => {
    const ws = makeFakeWs();
    const writes: Price[] = [];
    const expected = makePrice('005930', 75000);
    const parseTick: WsTickParser = (raw): ParsedWsFrame => {
      if (raw === 'TICK') {
        return { kind: 'tick', price: expected };
      }
      return { kind: 'ignore', reason: 'unknown' };
    };

    const bridge = createRealtimeBridge({
      wsClient: ws.client,
      priceStore: makeTestPriceStore(writes),
      parseTick,
      applyTicksToPriceStore: true,
    });

    ws.emitMessage('TICK');
    ws.emitMessage('CONTROL-FRAME');

    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual(expected);
    void bridge; // retain reference
  });
});

// === Test 5: disconnectAll removes listeners + cleans state ==================

describe('RealtimeBridge — disconnectAll hygiene', () => {
  it('removes listeners, detaches events, clears tier1, and calls wsClient.disconnect', async () => {
    const ws = makeFakeWs();
    const writes: Price[] = [];
    const parseTick: WsTickParser = (): ParsedWsFrame => ({
      kind: 'tick',
      price: makePrice('005930', 42),
    });

    const bridge = createRealtimeBridge({
      wsClient: ws.client,
      priceStore: makeTestPriceStore(writes),
      parseTick,
    });

    await bridge.applyDiff({
      subscribe: ['000001', '000002'],
      unsubscribe: [],
    });
    expect(bridge.getRealtimeTickers()).toHaveLength(2);

    // Attach a progress listener to prove it is removed on disconnectAll.
    let progressEvents = 0;
    bridge.on('restore-progress', () => {
      progressEvents += 1;
    });

    await bridge.disconnectAll();

    expect(ws.disconnectCalls).toBe(1);
    expect(bridge.getRealtimeTickers()).toHaveLength(0);

    // Emitted messages after disconnectAll must not reach the priceStore
    // because the message handler disposer ran.
    writes.length = 0;
    ws.emitMessage('whatever');
    expect(writes).toHaveLength(0);

    // Progress listeners must have been removed.
    bridge.emit('restore-progress', { current: 0, total: 0 });
    expect(progressEvents).toBe(0);
  });
});

// === Test 6: R3 rollback stage 2 SQL — flip realtime favorites to polling ==

describe('Rollback patch R3 stage 2 — SQL compiles and flips tier', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openMemoryDb();
    migrateUp(db);
  });

  afterEach(() => {
    db.close();
  });

  it('after bridge.disconnectAll, UPDATE favorites SET tier=polling succeeds', async () => {
    // Seed stocks + favorites (5 realtime, 2 polling).
    const stockStmt = db.prepare(
      `INSERT INTO stocks (ticker, name, market, created_at) VALUES (?, ?, ?, ?)`,
    );
    const repo = new FavoriteRepository(db);
    const tickers = Array.from({ length: 7 }, (_, i) => padTicker(i));
    db.transaction(() => {
      for (const t of tickers) {
        stockStmt.run(t, `종목${t}`, 'KOSPI', '2026-01-01T00:00:00Z');
      }
    })();
    for (let i = 0; i < 7; i += 1) {
      repo.upsert({
        ticker: tickers[i]!,
        tier: i < 5 ? 'realtime' : 'polling',
        addedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      });
    }

    // Stage 1 — simulate bridge.disconnectAll.
    const ws = makeFakeWs();
    const parseTick: WsTickParser = (): ParsedWsFrame => ({
      kind: 'ignore',
      reason: 'test',
    });
    const bridge = createRealtimeBridge({
      wsClient: ws.client,
      priceStore: {
        setPrice: (): void => undefined,
        getPrice: (): Price | undefined => undefined,
      },
      parseTick,
    });
    await bridge.applyDiff({
      subscribe: tickers.slice(0, 5),
      unsubscribe: [],
    });
    await bridge.disconnectAll();
    expect(ws.disconnectCalls).toBe(1);

    // Stage 2 — run the R3 migration SQL inline. This is the exact statement
    // that would ship as a Phase 2 `down` migration on rollback.
    const R3_STAGE_2_SQL = `UPDATE favorites SET tier = 'polling' WHERE tier = 'realtime'`;
    const changes = db.prepare(R3_STAGE_2_SQL).run().changes;

    expect(changes).toBe(5);
    const all = repo.findAll();
    expect(all).toHaveLength(7);
    for (const f of all) {
      expect(f.tier).toBe('polling');
    }
    // Stage 3 — scheduler remains tier-agnostic; verified in Phase 4a tests.
    // Stage 4 — git revert is out of scope for unit tests.
  });
});
