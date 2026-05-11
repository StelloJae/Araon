import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { tossAuthRoutes } from '../toss-auth.js';
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
});
