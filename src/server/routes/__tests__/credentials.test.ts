import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { credentialsRoutes } from '../credentials.js';
import type { KisRuntimeRef } from '../../bootstrap-kis.js';
import type { CredentialStore } from '../../credential-store.js';
import type { SettingsStore } from '../../settings-store.js';

function makeFakes(initial?: { configured?: boolean; isPaper?: boolean; runtime?: 'unconfigured' | 'starting' | 'started' | 'failed' }) {
  const stored = initial?.configured
    ? { credentials: { appKey: 'k'.repeat(10), appSecret: 's'.repeat(10), isPaper: initial.isPaper ?? true } }
    : null;
  const credentialStore: CredentialStore = {
    load: vi.fn(async () => stored),
    saveCredentials: vi.fn(async () => {}),
    saveToken: vi.fn(async () => {}),
    clearToken: vi.fn(async () => {}),
    clearCredentials: vi.fn(async () => {}),
  };
  const settingsStore: SettingsStore = {
    load: vi.fn(async () => ({ pollingCycleDelayMs: 1000, rateLimiterMode: 'paper', websocketEnabled: false })),
    save: vi.fn(async () => {}),
    subscribe: vi.fn(() => () => {}),
    snapshot: vi.fn(() => ({ pollingCycleDelayMs: 1000, rateLimiterMode: 'paper', websocketEnabled: false })),
  };
  const runtimeRef: KisRuntimeRef = {
    get: vi.fn(() => initial?.runtime === 'started' ? { status: 'started', runtime: {} as never } : { status: initial?.runtime ?? 'unconfigured' } as never),
    start: vi.fn(async () => ({}) as never),
    stop: vi.fn(async () => {}),
    reset: vi.fn(),
  };
  return { credentialStore, settingsStore, runtimeRef };
}

describe('GET /credentials/status', () => {
  let app: FastifyInstance;

  async function build(fakes: ReturnType<typeof makeFakes>) {
    app = Fastify();
    await app.register(credentialsRoutes, { ...fakes, setupMutex: { run: <T>(fn: () => Promise<T>) => fn() } });
    return app;
  }

  it('returns unconfigured when no credential file', async () => {
    const fakes = makeFakes({ configured: false, runtime: 'unconfigured' });
    const app = await build(fakes);
    const res = await app.inject({ method: 'GET', url: '/credentials/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { configured: false, isPaper: null, runtime: 'unconfigured' } });
  });

  it('returns started when configured and runtime is up', async () => {
    const fakes = makeFakes({ configured: true, isPaper: true, runtime: 'started' });
    const app = await build(fakes);
    const res = await app.inject({ method: 'GET', url: '/credentials/status' });
    expect(res.json()).toEqual({ success: true, data: { configured: true, isPaper: true, runtime: 'started' } });
  });

  it('returns failed with error message when runtime failed', async () => {
    const fakes = makeFakes({ configured: true, isPaper: false });
    fakes.runtimeRef.get = vi.fn(() => ({ status: 'failed', error: { code: 'X', message: 'fail' } } as never));
    const app = await build(fakes);
    const res = await app.inject({ method: 'GET', url: '/credentials/status' });
    expect(res.json().data).toMatchObject({ configured: true, isPaper: false, runtime: 'failed', error: { code: 'X', message: 'fail' } });
  });
});

describe('POST /credentials', () => {
  async function build(fakes: ReturnType<typeof makeFakes>) {
    const app = Fastify();
    await app.register(credentialsRoutes, { ...fakes, setupMutex: { run: <T>(fn: () => Promise<T>) => fn() } });
    return app;
  }

  it('saves credentials, syncs settings, starts runtime', async () => {
    const fakes = makeFakes({ configured: false, runtime: 'unconfigured' });
    fakes.runtimeRef.start = vi.fn(async () => ({}) as never);
    // runtime 상태 전이를 흉내
    let state = 'unconfigured';
    fakes.runtimeRef.get = vi.fn(() => ({ status: state } as never));
    fakes.runtimeRef.start = vi.fn(async () => { state = 'started'; return {} as never; });

    const app = await build(fakes);
    const res = await app.inject({
      method: 'POST',
      url: '/credentials',
      payload: { appKey: 'a'.repeat(36), appSecret: 'b'.repeat(180), isPaper: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { configured: true, isPaper: true, runtime: 'started' } });
    expect(fakes.credentialStore.saveCredentials).toHaveBeenCalledTimes(1);
    expect(fakes.settingsStore.save).toHaveBeenCalledWith(expect.objectContaining({ rateLimiterMode: 'paper' }));
    expect(fakes.runtimeRef.start).toHaveBeenCalledTimes(1);
  });

  it('returns 400 on invalid body', async () => {
    const fakes = makeFakes({ configured: false });
    const app = await build(fakes);
    const res = await app.inject({ method: 'POST', url: '/credentials', payload: { appKey: 'x', appSecret: 'y', isPaper: true } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 409 when runtime is started', async () => {
    const fakes = makeFakes({ configured: true, isPaper: true, runtime: 'started' });
    const app = await build(fakes);
    const res = await app.inject({ method: 'POST', url: '/credentials', payload: { appKey: 'a'.repeat(36), appSecret: 'b'.repeat(180), isPaper: true } });
    expect(res.statusCode).toBe(409);
  });

  it('allows re-registration when runtime is failed', async () => {
    const fakes = makeFakes({ configured: true, isPaper: false });
    let state: 'failed' | 'unconfigured' | 'started' = 'failed';
    fakes.runtimeRef.get = vi.fn(() => state === 'failed' ? { status: 'failed', error: { code: 'X', message: 'm' } } as never : { status: state } as never);
    fakes.runtimeRef.stop = vi.fn(async () => { state = 'unconfigured'; });
    fakes.runtimeRef.reset = vi.fn(() => { state = 'unconfigured'; });
    fakes.runtimeRef.start = vi.fn(async () => { state = 'started'; return {} as never; });

    const app = await build(fakes);
    const res = await app.inject({ method: 'POST', url: '/credentials', payload: { appKey: 'a'.repeat(36), appSecret: 'b'.repeat(180), isPaper: false } });
    expect(res.statusCode).toBe(200);
    expect(fakes.runtimeRef.stop).toHaveBeenCalled();
    expect(fakes.credentialStore.clearCredentials).toHaveBeenCalled();
    expect(fakes.runtimeRef.reset).toHaveBeenCalled();
  });

  it('rolls back credential and settings when runtimeRef.start throws', async () => {
    const fakes = makeFakes({ configured: false, runtime: 'unconfigured' });
    let state: 'unconfigured' | 'failed' = 'unconfigured';
    fakes.runtimeRef.get = vi.fn(() => ({ status: state } as never));
    fakes.runtimeRef.start = vi.fn(async () => { state = 'failed'; throw new Error('BOOM'); });
    fakes.settingsStore.snapshot = vi.fn(() => ({ pollingCycleDelayMs: 1000, rateLimiterMode: 'paper', websocketEnabled: false }));

    const app = await build(fakes);
    const res = await app.inject({ method: 'POST', url: '/credentials', payload: { appKey: 'a'.repeat(36), appSecret: 'b'.repeat(180), isPaper: false } });
    expect(res.statusCode).toBe(502);
    expect(fakes.credentialStore.clearCredentials).toHaveBeenCalled();
    // settings는 previous snapshot으로 복구돼야 함
    const lastSaveArg = (fakes.settingsStore.save as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
    expect(lastSaveArg).toMatchObject({ rateLimiterMode: 'paper' });
  });
});

describe('createCredentialSetupMutex', () => {
  it('serializes concurrent callers so only one fn runs at a time', async () => {
    const { createCredentialSetupMutex } = await import('../credentials.js');
    const mutex = createCredentialSetupMutex();
    let active = 0;
    let maxActive = 0;
    const callOrder: number[] = [];
    async function slow(id: number): Promise<number> {
      active += 1;
      maxActive = Math.max(maxActive, active);
      callOrder.push(id);
      await new Promise((r) => setTimeout(r, 15));
      active -= 1;
      return id;
    }
    const results = await Promise.all([
      mutex.run(() => slow(1)),
      mutex.run(() => slow(2)),
      mutex.run(() => slow(3)),
    ]);
    expect(results).toEqual([1, 2, 3]);
    expect(callOrder).toEqual([1, 2, 3]);
    expect(maxActive).toBe(1);
  });

  it('allows subsequent callers to proceed when a prior fn rejects', async () => {
    const { createCredentialSetupMutex } = await import('../credentials.js');
    const mutex = createCredentialSetupMutex();
    await expect(mutex.run(async () => { throw new Error('first'); })).rejects.toThrow('first');
    const result = await mutex.run(async () => 'second');
    expect(result).toBe('second');
  });
});
