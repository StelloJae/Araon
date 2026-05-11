import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { tossAuthRoutes } from '../toss-auth.js';
import type { TossLoginService, TossLoginStatus } from '../../toss/toss-cdp-login-service.js';
import type { TossSessionStore, TossSessionSummary } from '../../toss/toss-session-store.js';

function loggedOutStatus(): TossSessionSummary {
  return {
    configured: false,
    state: 'logged_out',
    provider: null,
    persistent: false,
    cookieCount: 0,
    localStorageKeyCount: 0,
    sessionStorageKeyCount: 0,
    retrievedAt: null,
    expiresAt: null,
    serverExpiresAt: null,
    expiresInMs: null,
  };
}

function makeStore(): TossSessionStore {
  return {
    load: vi.fn(async () => null),
    save: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    status: vi.fn(async () => loggedOutStatus()),
  };
}

function loginStatus(): TossLoginStatus {
  return {
    state: 'idle',
    startedAt: null,
    updatedAt: null,
    finishedAt: null,
    message: null,
    persistent: false,
    cookieCount: 0,
    localStorageKeyCount: 0,
    sessionStorageKeyCount: 0,
    expiresAt: null,
    missingCookieCount: 0,
    missingLocalStorageKeyCount: 0,
  };
}

function makeLoginService(): TossLoginService {
  return {
    start: vi.fn(async () => ({
      ...loginStatus(),
      state: 'starting',
      startedAt: '2026-05-11T06:00:00.000Z',
      updatedAt: '2026-05-11T06:00:00.000Z',
      message: 'Toss login browser is starting',
    })),
    status: vi.fn(() => loginStatus()),
    cancel: vi.fn(async () => ({
      ...loginStatus(),
      state: 'cancelled',
      updatedAt: '2026-05-11T06:00:01.000Z',
      finishedAt: '2026-05-11T06:00:01.000Z',
      message: 'Toss login capture cancelled',
    })),
  };
}

describe('toss auth routes', () => {
  it('returns sanitized Toss auth status', async () => {
    const store = makeStore();
    store.status = vi.fn(async () => ({
      ...loggedOutStatus(),
      configured: true,
      state: 'persistent',
      provider: 'toss',
      persistent: true,
      cookieCount: 5,
      localStorageKeyCount: 2,
      sessionStorageKeyCount: 1,
      retrievedAt: '2026-05-11T06:00:00.000Z',
      serverExpiresAt: '2026-05-18T06:00:00.000Z',
      expiresInMs: 604_800_000,
    }));
    const app = Fastify({ logger: false });
    await app.register(tossAuthRoutes, { sessionStore: store });

    const res = await app.inject({ method: 'GET', url: '/toss/auth/status' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        configured: true,
        state: 'persistent',
        provider: 'toss',
        cookieCount: 5,
      },
    });
    expect(JSON.stringify(res.json())).not.toContain('SESSION');
    expect(JSON.stringify(res.json())).not.toContain('UTK');
  });

  it('clears the stored Toss session', async () => {
    const store = makeStore();
    const app = Fastify({ logger: false });
    await app.register(tossAuthRoutes, { sessionStore: store });

    const res = await app.inject({ method: 'DELETE', url: '/toss/auth/session' });

    expect(res.statusCode).toBe(200);
    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(res.json()).toEqual({ success: true, data: loggedOutStatus() });
  });

  it('starts, reports, and cancels sanitized Toss login capture jobs', async () => {
    const store = makeStore();
    const loginService = makeLoginService();
    const app = Fastify({ logger: false });
    await app.register(tossAuthRoutes, { sessionStore: store, loginService });

    const start = await app.inject({
      method: 'POST',
      url: '/toss/auth/login/start',
      payload: { timeoutMs: 60_000 },
    });
    const status = await app.inject({ method: 'GET', url: '/toss/auth/login/status' });
    const cancel = await app.inject({ method: 'POST', url: '/toss/auth/login/cancel' });

    expect(start.statusCode).toBe(200);
    expect(loginService.start).toHaveBeenCalledWith({ timeoutMs: 60_000 });
    expect(start.json()).toMatchObject({
      success: true,
      data: { state: 'starting' },
    });
    expect(status.json()).toEqual({ success: true, data: loginStatus() });
    expect(cancel.json()).toMatchObject({
      success: true,
      data: { state: 'cancelled' },
    });
    expect(JSON.stringify(start.json())).not.toContain('session-value');
  });

  it('runs the login-success callback once when QR capture succeeds', async () => {
    const store = makeStore();
    const onLoginSucceeded = vi.fn(async () => undefined);
    const loginService = makeLoginService();
    loginService.status = vi.fn(() => ({
      ...loginStatus(),
      state: 'succeeded',
      updatedAt: '2026-05-11T06:00:05.000Z',
      finishedAt: '2026-05-11T06:00:05.000Z',
      persistent: true,
    }));
    const app = Fastify({ logger: false });
    await app.register(tossAuthRoutes, {
      sessionStore: store,
      loginService,
      onLoginSucceeded,
    });

    const first = await app.inject({ method: 'GET', url: '/toss/auth/login/status' });
    const second = await app.inject({ method: 'GET', url: '/toss/auth/login/status' });

    expect(first.json()).toMatchObject({
      success: true,
      data: { state: 'succeeded', persistent: true },
    });
    expect(second.statusCode).toBe(200);
    expect(onLoginSucceeded).toHaveBeenCalledTimes(1);
  });

  it('runs the session-clear callback after deleting Toss session state', async () => {
    const store = makeStore();
    const onSessionCleared = vi.fn(async () => undefined);
    const app = Fastify({ logger: false });
    await app.register(tossAuthRoutes, { sessionStore: store, onSessionCleared });

    const res = await app.inject({ method: 'DELETE', url: '/toss/auth/session' });

    expect(res.statusCode).toBe(200);
    expect(onSessionCleared).toHaveBeenCalledTimes(1);
  });

  it('rejects login start when the service is unavailable or body is invalid', async () => {
    const store = makeStore();
    const app = Fastify({ logger: false });
    await app.register(tossAuthRoutes, { sessionStore: store });

    const unavailable = await app.inject({
      method: 'POST',
      url: '/toss/auth/login/start',
      payload: {},
    });
    expect(unavailable.statusCode).toBe(503);

    const loginService = makeLoginService();
    const appWithLogin = Fastify({ logger: false });
    await appWithLogin.register(tossAuthRoutes, { sessionStore: store, loginService });
    const invalid = await appWithLogin.inject({
      method: 'POST',
      url: '/toss/auth/login/start',
      payload: { timeoutMs: 1 },
    });
    expect(invalid.statusCode).toBe(400);
  });
});
