/**
 * Phase 6 acceptance tests for the SSE manager.
 *
 * Covered criteria:
 *  T1 — connect → first frame is SnapshotEvent with all current prices
 *  T2 — reconnect (second attachClient) → SnapshotEvent again (unconditional)
 *  T3 — 10 setPrice calls within throttle window → 10 PriceUpdateEvents after advance
 *  T4 — duplicate ticker within window → only latest value emitted
 *  T5 — heartbeat fires after SSE_HEARTBEAT_INTERVAL_MS
 *  T6 — detach / closeAll releases 'price-update' listener and stops heartbeat
 *  T7 — sequence ids are strictly monotonic across all event types
 *  T8 — broadcastError → all clients receive ServerErrorEvent
 *
 * Compile-time contract:
 *  createSseManager return type must satisfy the SseManager structural interface
 *  from graceful-shutdown.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PriceStore } from '../../price/price-store.js';
import { createSseManager } from '../sse-manager.js';
import type { SSEEvent, SnapshotEvent, PriceUpdateEvent, HeartbeatEvent, ServerErrorEvent, Price, MarketStatus } from '@shared/types.js';
import type { SseManager } from '../../lifecycle/graceful-shutdown.js';
import { SSE_HEARTBEAT_INTERVAL_MS, SSE_THROTTLE_MS } from '@shared/constants.js';

// ---------------------------------------------------------------------------
// Compile-time structural interface check
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _check: SseManager = {} as ReturnType<typeof createSseManager>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePrice(ticker: string, price = 10000): Price {
  return {
    ticker,
    price,
    changeRate: 0.01,
    volume: 1000,
    updatedAt: new Date().toISOString(),
    isSnapshot: false,
  };
}

function parseFrame(frame: string): SSEEvent {
  const dataLine = frame
    .split('\n')
    .find((l) => l.startsWith('data: '));
  if (dataLine === undefined) throw new Error(`No data line in frame: ${frame}`);
  return JSON.parse(dataLine.slice('data: '.length)) as SSEEvent;
}

function parseId(frame: string): number {
  const idLine = frame.split('\n').find((l) => l.startsWith('id: '));
  if (idLine === undefined) throw new Error(`No id line in frame: ${frame}`);
  return Number(idLine.slice('id: '.length));
}

// ---------------------------------------------------------------------------
// Suite setup — fake timers
// ---------------------------------------------------------------------------

describe('SseManager', () => {
  let store: PriceStore;
  const defaultMarketStatus: MarketStatus = 'snapshot';

  beforeEach(() => {
    vi.useFakeTimers();
    store = new PriceStore();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  function buildManager(overrides?: { heartbeatIntervalMs?: number; throttleMs?: number }) {
    return createSseManager({
      priceStore: store,
      getInitialSnapshot: () => store.getAllPrices(),
      getMarketStatus: () => defaultMarketStatus,
      heartbeatIntervalMs: overrides?.heartbeatIntervalMs ?? SSE_HEARTBEAT_INTERVAL_MS,
      throttleMs: overrides?.throttleMs ?? SSE_THROTTLE_MS,
    });
  }

  // -------------------------------------------------------------------------
  // T1 — connect → full snapshot
  // -------------------------------------------------------------------------

  describe('T1 — connect delivers full snapshot', () => {
    it('first frame is SnapshotEvent with all current prices', () => {
      store.setPrice(makePrice('000001'));
      store.setPrice(makePrice('000002'));
      store.setPrice(makePrice('000003'));

      const manager = buildManager();
      const frames: string[] = [];
      const detach = manager.attachClient((f) => frames.push(f), () => {});

      expect(frames).toHaveLength(1);
      const ev = parseFrame(frames[0]) as SnapshotEvent;
      expect(ev.type).toBe('snapshot');
      expect(ev.prices).toHaveLength(3);
      expect(ev.marketStatus).toBe('snapshot');

      detach();
      return manager.closeAll();
    });
  });

  // -------------------------------------------------------------------------
  // T2 — reconnect → full snapshot again
  // -------------------------------------------------------------------------

  describe('T2 — reconnect delivers full snapshot again', () => {
    it('second attachClient also receives SnapshotEvent unconditionally', () => {
      store.setPrice(makePrice('000001'));
      store.setPrice(makePrice('000002'));

      const manager = buildManager();
      const frames1: string[] = [];
      const detach1 = manager.attachClient((f) => frames1.push(f), () => {});
      detach1();

      const frames2: string[] = [];
      const detach2 = manager.attachClient((f) => frames2.push(f), () => {});

      expect(frames2).toHaveLength(1);
      const ev = parseFrame(frames2[0]) as SnapshotEvent;
      expect(ev.type).toBe('snapshot');
      expect(ev.prices).toHaveLength(2);

      detach2();
      return manager.closeAll();
    });
  });

  // -------------------------------------------------------------------------
  // T3 — 10 setPrice calls within throttle window → 10 PriceUpdateEvents
  // -------------------------------------------------------------------------

  describe('T3 — price update throttling', () => {
    it('10 setPrice calls → 10 PriceUpdateEvents after throttle window', () => {
      const manager = buildManager();
      const frames: string[] = [];
      const detach = manager.attachClient((f) => frames.push(f), () => {});

      // snapshot already received
      expect(frames).toHaveLength(1);

      for (let i = 1; i <= 10; i++) {
        store.setPrice(makePrice(`00000${i}`, 10000 + i));
      }

      // Before the window closes, no updates emitted yet
      expect(frames).toHaveLength(1);

      vi.advanceTimersByTime(SSE_THROTTLE_MS + 1);

      const updateFrames = frames.slice(1);
      expect(updateFrames).toHaveLength(10);
      for (const f of updateFrames) {
        const ev = parseFrame(f) as PriceUpdateEvent;
        expect(ev.type).toBe('price-update');
      }

      detach();
      return manager.closeAll();
    });
  });

  // -------------------------------------------------------------------------
  // T4 — duplicate ticker within window → latest value only
  // -------------------------------------------------------------------------

  describe('T4 — duplicate ticker within throttle window', () => {
    it('only the latest value for the ticker is emitted', () => {
      const manager = buildManager();
      const frames: string[] = [];
      const detach = manager.attachClient((f) => frames.push(f), () => {});

      // Three updates to the same ticker within the window
      store.setPrice(makePrice('000001', 10000));
      store.setPrice(makePrice('000001', 10500));
      store.setPrice(makePrice('000001', 11000));

      vi.advanceTimersByTime(SSE_THROTTLE_MS + 1);

      const updateFrames = frames.slice(1);
      expect(updateFrames).toHaveLength(1);
      const ev = parseFrame(updateFrames[0]) as PriceUpdateEvent;
      expect(ev.type).toBe('price-update');
      expect(ev.price.ticker).toBe('000001');
      expect(ev.price.price).toBe(11000);

      detach();
      return manager.closeAll();
    });
  });

  // -------------------------------------------------------------------------
  // T5 — heartbeat fires after SSE_HEARTBEAT_INTERVAL_MS
  // -------------------------------------------------------------------------

  describe('T5 — heartbeat', () => {
    it('delivers HeartbeatEvent after the heartbeat interval', () => {
      const manager = buildManager();
      const frames: string[] = [];
      const detach = manager.attachClient((f) => frames.push(f), () => {});

      vi.advanceTimersByTime(SSE_HEARTBEAT_INTERVAL_MS + 1);

      const hbFrames = frames.slice(1).filter((f) => {
        const ev = parseFrame(f);
        return ev.type === 'heartbeat';
      });
      expect(hbFrames.length).toBeGreaterThanOrEqual(1);
      const hbEv = parseFrame(hbFrames[0]) as HeartbeatEvent;
      expect(hbEv.type).toBe('heartbeat');

      detach();
      return manager.closeAll();
    });
  });

  // -------------------------------------------------------------------------
  // T6 — closeAll releases listener + stops heartbeat
  // -------------------------------------------------------------------------

  describe('T6 — closeAll cleans up listeners', () => {
    it('priceStore listener count drops to 0 and heartbeat stops', async () => {
      const manager = buildManager();
      const frames: string[] = [];
      manager.attachClient((f) => frames.push(f), () => {});

      expect(store.listenerCount('price-update')).toBe(1);

      await manager.closeAll();

      expect(store.listenerCount('price-update')).toBe(0);

      // Advance timers — no additional heartbeat frames should appear
      const countBeforeAdvance = frames.length;
      vi.advanceTimersByTime(SSE_HEARTBEAT_INTERVAL_MS * 3);
      expect(frames.length).toBe(countBeforeAdvance);
    });
  });

  // -------------------------------------------------------------------------
  // T7 — sequence ids are strictly monotonic
  // -------------------------------------------------------------------------

  describe('T7 — sequence ids monotonic', () => {
    it('all frame ids are strictly increasing', () => {
      const manager = buildManager();
      const frames: string[] = [];
      const detach = manager.attachClient((f) => frames.push(f), () => {});

      // Trigger some updates and a heartbeat
      store.setPrice(makePrice('000001', 10000));
      store.setPrice(makePrice('000002', 20000));
      vi.advanceTimersByTime(SSE_THROTTLE_MS + 1);
      vi.advanceTimersByTime(SSE_HEARTBEAT_INTERVAL_MS + 1);

      const ids = frames.map(parseId);
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i]).toBeGreaterThan(ids[i - 1]!);
      }

      detach();
      return manager.closeAll();
    });
  });

  // -------------------------------------------------------------------------
  // T8 — broadcastError reaches all clients
  // -------------------------------------------------------------------------

  describe('T8 — broadcastError', () => {
    it('delivers ServerErrorEvent to all connected clients', () => {
      const manager = buildManager();
      const frames1: string[] = [];
      const frames2: string[] = [];
      const detach1 = manager.attachClient((f) => frames1.push(f), () => {});
      const detach2 = manager.attachClient((f) => frames2.push(f), () => {});

      manager.broadcastError('KIS_TOKEN_EXPIRED', 'Token expired', true);

      const errorFrames1 = frames1.filter((f) => parseFrame(f).type === 'error');
      const errorFrames2 = frames2.filter((f) => parseFrame(f).type === 'error');
      expect(errorFrames1).toHaveLength(1);
      expect(errorFrames2).toHaveLength(1);

      const ev1 = parseFrame(errorFrames1[0]) as ServerErrorEvent;
      expect(ev1.code).toBe('KIS_TOKEN_EXPIRED');
      expect(ev1.retryable).toBe(true);

      detach1();
      detach2();
      return manager.closeAll();
    });
  });
});
