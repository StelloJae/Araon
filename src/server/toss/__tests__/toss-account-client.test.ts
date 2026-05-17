import { describe, expect, it, vi } from 'vitest';

import { createTossAccountClient } from '../toss-account-client.js';
import type { TossSession, TossSessionStore } from '../toss-session-store.js';

function session(): TossSession {
  return {
    provider: 'toss',
    cookies: { SESSION: 'redacted-session' },
    localStorage: {},
    sessionStorage: {},
    retrievedAt: '2026-05-11T06:00:00.000Z',
    expiresAt: null,
    serverExpiresAt: null,
    persistent: true,
  };
}

function makeStore(initial: TossSession | null): TossSessionStore {
  return {
    load: vi.fn(async () => initial),
    save: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
    status: vi.fn(async () => ({
      configured: initial !== null,
      state: initial === null ? 'logged_out' : 'persistent',
      provider: initial === null ? null : 'toss',
      persistent: initial?.persistent ?? false,
      cookieCount: initial === null ? 0 : Object.keys(initial.cookies).length,
      localStorageKeyCount: 0,
      sessionStorageKeyCount: 0,
      retrievedAt: initial?.retrievedAt ?? null,
      expiresAt: null,
      serverExpiresAt: null,
      expiresInMs: null,
    })),
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Toss account client', () => {
  it('maps account list into sanitized references without exposing raw account identifiers', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      result: {
        primaryKey: 'fixture-primary-ref',
        accountList: [
          {
            accountNo: 'fixture-ledger-ref',
            key: 'fixture-primary-ref',
            name: '종합위탁',
            displayName: '토스증권',
            type: 'STOCK',
            markets: ['KR', 'US'],
            buyMarkets: ['KR'],
            sellMarkets: ['US'],
          },
          {
            accountNo: 'fixture-second-account-ref',
            key: 'fixture-second-ref',
            name: 'ISA',
            displayName: 'ISA 계좌',
            type: 'ISA',
            markets: ['KR'],
          },
        ],
      },
    }));
    const client = createTossAccountClient({
      sessionStore: makeStore(session()),
      fetchImpl,
      apiBaseUrl: 'https://example.test',
    });

    const result = await client.listAccounts();

    expect(result).toEqual({
      provider: 'toss',
      fetchedAt: expect.any(String),
      accounts: [
        {
          ref: 'primary',
          displayName: '토스증권',
          name: '종합위탁',
          type: 'STOCK',
          markets: ['KR', 'US'],
          primary: true,
        },
        {
          ref: 'account-2',
          displayName: 'ISA 계좌',
          name: 'ISA',
          type: 'ISA',
          markets: ['KR'],
          primary: false,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('fixture-primary-ref');
    expect(JSON.stringify(result)).not.toContain('fixture-ledger-ref');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/api/v1/account/list',
      expect.objectContaining({
        method: 'GET',
        headers: expect.any(Headers),
      }),
    );
  });

  it('does not call Toss when no session is stored', async () => {
    const fetchImpl = vi.fn();
    const client = createTossAccountClient({
      sessionStore: makeStore(null),
      fetchImpl,
    });

    await expect(client.listAccounts()).rejects.toThrow('Toss session is required');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
