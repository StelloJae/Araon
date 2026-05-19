import { describe, expect, it, vi } from 'vitest';

import {
  createTossSessionExtensionService,
  type TossSessionExpiryRefreshResult,
  type TossSessionExtensionResult,
} from '../toss-session-extension-service.js';
import type { TossSession, TossSessionStore } from '../toss-session-store.js';

function session(overrides: Partial<TossSession> = {}): TossSession {
  return {
    provider: 'toss',
    cookies: {
      SESSION: '[test-session]',
      'XSRF-TOKEN': 'xsrf-value',
      UTK: 'utk-value',
      LTK: 'ltk-value',
      FTK: 'ftk-value',
    },
    localStorage: {
      'WTS-DEVICE-ID': 'device-value',
    },
    sessionStorage: {},
    retrievedAt: '2026-05-11T06:00:00.000Z',
    expiresAt: '2027-05-11T06:00:00.000Z',
    serverExpiresAt: '2026-05-12T06:00:00.000Z',
    persistent: true,
    ...overrides,
  };
}

function makeStore(initial: TossSession | null): TossSessionStore {
  let current = initial;
  return {
    load: vi.fn(async () => current),
    save: vi.fn(async (next: TossSession) => {
      current = next;
    }),
    clear: vi.fn(async () => {
      current = null;
    }),
    status: vi.fn(async () => ({
      configured: current !== null,
      state: current === null ? 'logged_out' : 'persistent',
      provider: current === null ? null : 'toss',
      persistent: current?.persistent ?? false,
      cookieCount: current === null ? 0 : Object.keys(current.cookies).length,
      localStorageKeyCount: current === null ? 0 : Object.keys(current.localStorage).length,
      sessionStorageKeyCount: current === null ? 0 : Object.keys(current.sessionStorage).length,
      retrievedAt: current?.retrievedAt ?? null,
      expiresAt: current?.expiresAt ?? null,
      serverExpiresAt: current?.serverExpiresAt ?? null,
      effectiveExpiresAt: current?.serverExpiresAt ?? current?.expiresAt ?? null,
      expiresInMs: null,
    })),
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('Toss session extension service', () => {
  it('requests phone approval, finalizes the extension, and persists the new server expiry', async () => {
    const store = makeStore(session());
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const path = new URL(String(url)).pathname;
      if (path === '/api/v1/wts-login-extend/doc/request') {
        return jsonResponse({ result: { txId: 'extension-doc-id' } });
      }
      if (path === '/api/v1/wts-login-extend/doc/extension-doc-id/status') {
        return jsonResponse({ result: 'COMPLETED' });
      }
      if (path === '/api/v1/wts-login-extend/extension-doc-id/state') {
        return jsonResponse({ result: true });
      }
      if (path === '/api/v1/session/expired-at') {
        return jsonResponse({ result: '2026-05-18T07:03:00+09:00' });
      }
      throw new Error(`unexpected URL ${url}`);
    });

    const service = createTossSessionExtensionService({
      sessionStore: store,
      fetchImpl,
      now: () => new Date('2026-05-11T06:00:00.000Z'),
    });

    const result: TossSessionExtensionResult = await service.extend({
      timeoutMs: 30_000,
      pollIntervalMs: 1,
    });

    expect(result).toEqual({
      state: 'succeeded',
      requestedAt: '2026-05-11T06:00:00.000Z',
      finishedAt: '2026-05-11T06:00:00.000Z',
      serverExpiresAt: '2026-05-17T22:03:00.000Z',
      approvalState: 'COMPLETED',
    });
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({
      serverExpiresAt: '2026-05-17T22:03:00.000Z',
    }));
    expect(JSON.stringify(result)).not.toContain('extension-doc-id');
    expect(JSON.stringify(result)).not.toContain('[test-session]');
    expect(fetchImpl.mock.calls.every(([, init]) => {
      const headers = new Headers(init?.headers as HeadersInit);
      return headers.get('Cookie')?.includes(
        ['SESSION', encodeURIComponent('[test-session]')].join('='),
      ) === true;
    })).toBe(true);
  });

  it('does not call Toss when no session is stored', async () => {
    const fetchImpl = vi.fn();
    const service = createTossSessionExtensionService({
      sessionStore: makeStore(null),
      fetchImpl,
    });

    const result = await service.extend({ timeoutMs: 30_000, pollIntervalMs: 1 });

    expect(result).toMatchObject({
      state: 'failed',
      serverExpiresAt: null,
      approvalState: null,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('SESSION');
  });

  it('refreshes the server-side expiry without starting a phone approval flow', async () => {
    const store = makeStore(session({ serverExpiresAt: null }));
    const fetchImpl = vi.fn(async (url: string | URL) => {
      expect(new URL(String(url)).pathname).toBe('/api/v1/session/expired-at');
      return jsonResponse({ result: '2026-05-18T07:03:00+09:00' });
    });
    const service = createTossSessionExtensionService({
      sessionStore: store,
      fetchImpl,
      now: () => new Date('2026-05-11T06:00:00.000Z'),
    });

    const result: TossSessionExpiryRefreshResult = await service.refreshServerExpiry();

    expect(result).toEqual({
      state: 'succeeded',
      checkedAt: '2026-05-11T06:00:00.000Z',
      serverExpiresAt: '2026-05-17T22:03:00.000Z',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({
      serverExpiresAt: '2026-05-17T22:03:00.000Z',
    }));
    expect(JSON.stringify(result)).not.toContain('[test-session]');
    expect(JSON.stringify(result)).not.toContain('SESSION');
  });
});
