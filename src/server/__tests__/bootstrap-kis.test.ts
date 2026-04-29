import { describe, it, expect, vi } from 'vitest';
import {
  connectRealtimeFavoritesOnWarmup,
  createKisRuntimeRef,
  type KisRuntimeStaticDeps,
} from '../bootstrap-kis.js';

function makeStubDeps(): KisRuntimeStaticDeps {
  return {} as KisRuntimeStaticDeps; // 현 단계에선 사용 안 함
}

describe('KisRuntimeRef — initial state', () => {
  it('starts in unconfigured state', () => {
    const ref = createKisRuntimeRef(makeStubDeps(), { actuallyStart: vi.fn() });
    expect(ref.get().status).toBe('unconfigured');
  });
});

describe('KisRuntimeRef — start dedup', () => {
  it('reuses in-flight promise for concurrent start calls', async () => {
    const fakeRuntime = { sentinel: true } as unknown as import('../bootstrap-kis.js').KisRuntime;
    const actuallyStart = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return fakeRuntime;
    });
    const ref = createKisRuntimeRef(makeStubDeps(), { actuallyStart });
    const creds = { appKey: 'k', appSecret: 's', isPaper: true };
    const [r1, r2] = await Promise.all([ref.start(creds), ref.start(creds)]);
    expect(r1).toBe(fakeRuntime);
    expect(r2).toBe(fakeRuntime);
    expect(actuallyStart).toHaveBeenCalledTimes(1);
    expect(ref.get().status).toBe('started');
  });

  it('transitions to failed when actuallyStart throws', async () => {
    const actuallyStart = vi.fn(async () => { throw new Error('BOOM'); });
    const ref = createKisRuntimeRef(makeStubDeps(), { actuallyStart });
    await expect(ref.start({ appKey: 'k', appSecret: 's', isPaper: true })).rejects.toThrow('BOOM');
    const s = ref.get();
    expect(s.status).toBe('failed');
    if (s.status === 'failed') expect(s.error.message).toContain('BOOM');
  });

  it('returns cached runtime on subsequent start after success', async () => {
    const fakeRuntime = {} as import('../bootstrap-kis.js').KisRuntime;
    const actuallyStart = vi.fn(async () => fakeRuntime);
    const ref = createKisRuntimeRef(makeStubDeps(), { actuallyStart });
    await ref.start({ appKey: 'k', appSecret: 's', isPaper: true });
    await ref.start({ appKey: 'k', appSecret: 's', isPaper: true });
    expect(actuallyStart).toHaveBeenCalledTimes(1);
  });

  it('throws when start is called in failed state without reset', async () => {
    const actuallyStart = vi.fn(async () => { throw new Error('fail1'); });
    const ref = createKisRuntimeRef(makeStubDeps(), { actuallyStart });
    await expect(ref.start({ appKey: 'k', appSecret: 's', isPaper: true })).rejects.toThrow('fail1');
    await expect(ref.start({ appKey: 'k', appSecret: 's', isPaper: true })).rejects.toThrow(/reset/);
  });
});

describe('KisRuntimeRef — stop/reset', () => {
  function makeFakeRuntime(dispose: { calls: string[] }): import('../bootstrap-kis.js').KisRuntime {
    return {
      pollingScheduler: { start: vi.fn(), stop: async () => { dispose.calls.push('polling.stop'); }, getStatus: vi.fn() } as unknown as import('../bootstrap-kis.js').KisRuntime['pollingScheduler'],
      bridge: { disconnectAll: async () => { dispose.calls.push('bridge.disconnectAll'); } } as unknown as import('../bootstrap-kis.js').KisRuntime['bridge'],
      wsClient: { disconnect: async () => { dispose.calls.push('ws.disconnect'); } } as unknown as import('../bootstrap-kis.js').KisRuntime['wsClient'],
      marketHoursScheduler: { stop: () => { dispose.calls.push('market.stop'); } } as unknown as import('../bootstrap-kis.js').KisRuntime['marketHoursScheduler'],
      sseManager: { closeAll: async () => { dispose.calls.push('sse.closeAll'); } } as unknown as import('../bootstrap-kis.js').KisRuntime['sseManager'],
      stopSnapshotTimer: () => { dispose.calls.push('snapshot.stop'); },
    } as unknown as import('../bootstrap-kis.js').KisRuntime;
  }

  it('stop() runs disposers in reverse order when started', async () => {
    const calls = { calls: [] as string[] };
    const runtime = makeFakeRuntime(calls);
    const actuallyStart = vi.fn(async () => runtime);
    const ref = createKisRuntimeRef(makeStubDeps(), { actuallyStart });
    await ref.start({ appKey: 'k', appSecret: 's', isPaper: true });
    await ref.stop();
    expect(ref.get().status).toBe('unconfigured');
    // polling -> sse -> bridge -> ws -> market -> snapshot
    expect(calls.calls).toEqual([
      'polling.stop',
      'sse.closeAll',
      'bridge.disconnectAll',
      'ws.disconnect',
      'market.stop',
      'snapshot.stop',
    ]);
  });

  it('stop() is idempotent', async () => {
    const calls = { calls: [] as string[] };
    const actuallyStart = vi.fn(async () => makeFakeRuntime(calls));
    const ref = createKisRuntimeRef(makeStubDeps(), { actuallyStart });
    await ref.start({ appKey: 'k', appSecret: 's', isPaper: true });
    await ref.stop();
    await ref.stop();
    const doubleCount = calls.calls.filter((c) => c === 'polling.stop').length;
    expect(doubleCount).toBe(1);
    expect(ref.get().status).toBe('unconfigured');
  });

  it('reset() transitions failed -> unconfigured', async () => {
    const actuallyStart = vi.fn(async () => { throw new Error('x'); });
    const ref = createKisRuntimeRef(makeStubDeps(), { actuallyStart });
    await ref.start({ appKey: 'k', appSecret: 's', isPaper: true }).catch(() => undefined);
    expect(ref.get().status).toBe('failed');
    ref.reset();
    expect(ref.get().status).toBe('unconfigured');
  });

  it('reset() throws when state is started', async () => {
    const calls = { calls: [] as string[] };
    const actuallyStart = vi.fn(async () => makeFakeRuntime(calls));
    const ref = createKisRuntimeRef(makeStubDeps(), { actuallyStart });
    await ref.start({ appKey: 'k', appSecret: 's', isPaper: true });
    expect(() => ref.reset()).toThrow(/started/i);
  });

  it('start works again after failed -> reset', async () => {
    const fakeRuntime = {} as import('../bootstrap-kis.js').KisRuntime;
    let call = 0;
    const actuallyStart = vi.fn(async () => {
      call += 1;
      if (call === 1) throw new Error('first');
      return fakeRuntime;
    });
    const ref = createKisRuntimeRef(makeStubDeps(), { actuallyStart });
    await ref.start({ appKey: 'k', appSecret: 's', isPaper: true }).catch(() => undefined);
    ref.reset();
    const r = await ref.start({ appKey: 'k', appSecret: 's', isPaper: true });
    expect(r).toBe(fakeRuntime);
  });

  it('stop() during starting — no state corruption after promise resolves', async () => {
    const calls = { calls: [] as string[] };
    let resolveStart!: (r: import('../bootstrap-kis.js').KisRuntime) => void;
    const actuallyStart = vi.fn(
      () => new Promise<import('../bootstrap-kis.js').KisRuntime>((res) => { resolveStart = res; }),
    );
    const ref = createKisRuntimeRef(makeStubDeps(), { actuallyStart });
    const startP = ref.start({ appKey: 'k', appSecret: 's', isPaper: true });
    expect(ref.get().status).toBe('starting');
    // Kick off stop() but do not await — it will await the starting promise internally.
    const stopP = ref.stop();
    // Now resolve actuallyStart so both startP and stopP can make progress.
    resolveStart(makeFakeRuntime(calls));
    await startP;
    await stopP;
    expect(ref.get().status).toBe('unconfigured');
    // All disposers should have been called exactly once.
    expect(calls.calls).toEqual([
      'polling.stop',
      'sse.closeAll',
      'bridge.disconnectAll',
      'ws.disconnect',
      'market.stop',
      'snapshot.stop',
    ]);
  });
});

describe('bootstrap realtime warmup', () => {
  it('connects and subscribes the current realtime favorite assignment', async () => {
    const bridge = {
      connect: vi.fn(async () => undefined),
      applyDiff: vi.fn(async () => undefined),
    };
    const tierManager = {
      getAssignment: vi.fn(() => ({
        realtimeTickers: ['005930', '000660'],
        pollingTickers: ['042700'],
      })),
    };

    await connectRealtimeFavoritesOnWarmup({ bridge, tierManager });

    expect(bridge.connect).toHaveBeenCalledTimes(1);
    expect(bridge.applyDiff).toHaveBeenCalledWith({
      subscribe: ['005930', '000660'],
      unsubscribe: [],
    });
  });

  it('connects without an empty subscribe diff when there are no realtime favorites', async () => {
    const bridge = {
      connect: vi.fn(async () => undefined),
      applyDiff: vi.fn(async () => undefined),
    };
    const tierManager = {
      getAssignment: vi.fn(() => ({
        realtimeTickers: [],
        pollingTickers: [],
      })),
    };

    await connectRealtimeFavoritesOnWarmup({ bridge, tierManager });

    expect(bridge.connect).toHaveBeenCalledTimes(1);
    expect(bridge.applyDiff).not.toHaveBeenCalled();
  });
});
