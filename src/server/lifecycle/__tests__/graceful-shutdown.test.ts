/**
 * Graceful shutdown tests.
 *
 * Uses `triggerShutdown()` (returned by `registerGracefulShutdown`) to directly
 * await the async shutdown sequence rather than relying on `process.emit` +
 * microtask flushing. process.exit is stubbed to throw so we can assert on the
 * exit code without actually terminating the process.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PriceStore } from '../../price/price-store.js';
import {
  registerGracefulShutdown,
  type SseManager,
  type WsBridge,
  type SnapshotSaver,
} from '../graceful-shutdown.js';

// === Helpers ==================================================================

function makeStore(): PriceStore {
  return {} as unknown as PriceStore;
}

function makeMocks() {
  const store = makeStore();

  const sse: SseManager = {
    closeAll: vi.fn().mockResolvedValue(undefined),
  };

  const ws: WsBridge = {
    disconnectAll: vi.fn().mockResolvedValue(undefined),
  };

  const snapshot: SnapshotSaver = {
    saveAll: vi.fn().mockResolvedValue(undefined),
  };

  const checkpoint = vi.fn();

  return { store, sse, ws, snapshot, checkpoint };
}

// === Tests ====================================================================

describe('graceful-shutdown', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(
      (_code?: number | string | null | undefined): never => {
        throw new Error(`process.exit(${_code})`);
      },
    );
    vi.useFakeTimers();
  });

  afterEach(() => {
    exitSpy.mockRestore();
    vi.useRealTimers();
  });

  // T1 ─────────────────────────────────────────────────────────────────────────
  it('T1: SIGTERM → steps fire in order: sse → ws → snapshot → checkpoint → exit(0)', async () => {
    const callOrder: string[] = [];
    const { store, ws, snapshot, checkpoint } = makeMocks();

    const sse: SseManager = {
      closeAll: vi.fn().mockImplementation(async () => { callOrder.push('sse'); }),
    };
    (ws.disconnectAll as ReturnType<typeof vi.fn>).mockImplementation(async () => { callOrder.push('ws'); });
    (snapshot.saveAll as ReturnType<typeof vi.fn>).mockImplementation(async () => { callOrder.push('snapshot'); });
    (checkpoint as ReturnType<typeof vi.fn>).mockImplementation(() => { callOrder.push('checkpoint'); });

    const { unregister, triggerShutdown } = registerGracefulShutdown({
      sse,
      ws,
      snapshot,
      store,
      checkpoint,
      signals: ['SIGTERM'],
      timeoutMs: 5_000,
    });

    await expect(triggerShutdown()).rejects.toThrow('process.exit(0)');

    expect(callOrder).toEqual(['sse', 'ws', 'snapshot', 'checkpoint']);
    expect(exitSpy).toHaveBeenCalledWith(0);

    unregister();
  });

  // T2 ─────────────────────────────────────────────────────────────────────────
  it('T2: sse=undefined → skips SSE step, continues ws/snapshot/checkpoint/exit(0)', async () => {
    const callOrder: string[] = [];
    const { store, ws, snapshot, checkpoint } = makeMocks();

    (ws.disconnectAll as ReturnType<typeof vi.fn>).mockImplementation(async () => { callOrder.push('ws'); });
    (snapshot.saveAll as ReturnType<typeof vi.fn>).mockImplementation(async () => { callOrder.push('snapshot'); });
    (checkpoint as ReturnType<typeof vi.fn>).mockImplementation(() => { callOrder.push('checkpoint'); });

    const { unregister, triggerShutdown } = registerGracefulShutdown({
      sse: undefined,
      ws,
      snapshot,
      store,
      checkpoint,
      signals: ['SIGTERM'],
      timeoutMs: 5_000,
    });

    await expect(triggerShutdown()).rejects.toThrow('process.exit(0)');

    expect(callOrder).toEqual(['ws', 'snapshot', 'checkpoint']);
    expect(exitSpy).toHaveBeenCalledWith(0);

    unregister();
  });

  // T3 ─────────────────────────────────────────────────────────────────────────
  it('T3: ws.disconnectAll throws → logs error, continues remaining steps, exits with code 1', async () => {
    const callOrder: string[] = [];

    const sse: SseManager = {
      closeAll: vi.fn().mockImplementation(async () => { callOrder.push('sse'); }),
    };
    const ws: WsBridge = {
      disconnectAll: vi.fn().mockImplementation(async () => {
        callOrder.push('ws-throw');
        throw new Error('ws connection refused');
      }),
    };
    const snapshot: SnapshotSaver = {
      saveAll: vi.fn().mockImplementation(async () => { callOrder.push('snapshot'); }),
    };
    const checkpoint = vi.fn().mockImplementation(() => { callOrder.push('checkpoint'); });
    const store = makeStore();

    const { unregister, triggerShutdown } = registerGracefulShutdown({
      sse,
      ws,
      snapshot,
      store,
      checkpoint,
      signals: ['SIGTERM'],
      timeoutMs: 5_000,
    });

    await expect(triggerShutdown()).rejects.toThrow('process.exit(1)');

    expect(callOrder).toEqual(['sse', 'ws-throw', 'snapshot', 'checkpoint']);
    expect(exitSpy).toHaveBeenCalledWith(1);

    unregister();
  });

  // T4 ─────────────────────────────────────────────────────────────────────────
  it('T4: snapshot.saveAll never resolves → hard timeout fires, exits with code 1', async () => {
    const sse: SseManager = { closeAll: vi.fn().mockResolvedValue(undefined) };
    const ws: WsBridge    = { disconnectAll: vi.fn().mockResolvedValue(undefined) };

    // Never resolves — simulates a hung snapshot save.
    const snapshot: SnapshotSaver = {
      saveAll: vi.fn().mockReturnValue(new Promise<void>(() => { /* intentionally never resolves */ })),
    };
    const checkpoint = vi.fn();
    const store = makeStore();

    const { unregister, triggerShutdown } = registerGracefulShutdown({
      sse,
      ws,
      snapshot,
      store,
      checkpoint,
      signals: ['SIGTERM'],
      timeoutMs: 3_000,
    });

    // Start the shutdown sequence (will hang at saveAll).
    const shutdownPromise = triggerShutdown();

    // Advance fake timers past the 3 s hard timeout — this fires process.exit(1).
    await expect(vi.advanceTimersByTimeAsync(3_001)).rejects.toThrow('process.exit(1)');

    // Suppress the unhandled rejection from the hung shutdownPromise.
    shutdownPromise.catch(() => { /* expected — shutdown sequence was interrupted */ });

    expect(exitSpy).toHaveBeenCalledWith(1);

    unregister();
  });

  // T5 ─────────────────────────────────────────────────────────────────────────
  it('T5: unregister() removes signal listeners (verified via process.listenerCount)', () => {
    const { store, sse, ws, snapshot, checkpoint } = makeMocks();

    const before = process.listenerCount('SIGTERM');

    const { unregister } = registerGracefulShutdown({
      sse,
      ws,
      snapshot,
      store,
      checkpoint,
      signals: ['SIGTERM'],
      timeoutMs: 5_000,
    });

    expect(process.listenerCount('SIGTERM')).toBe(before + 1);

    unregister();

    expect(process.listenerCount('SIGTERM')).toBe(before);
  });
});
