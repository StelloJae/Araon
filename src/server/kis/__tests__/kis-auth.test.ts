/**
 * Unit tests for `kis-auth`.
 *
 * Covers the contract acceptance matrix from Phase 1:
 *   - first-time issuance populates the store,
 *   - a still-valid cached token is reused (no transport call),
 *   - proactive refresh within the `TOKEN_REFRESH_LEADTIME_SEC` window,
 *   - expired tokens trigger a fresh issuance,
 *   - the 1-token-per-minute KIS guard surfaces a typed error,
 *   - concurrent callers share one in-flight issuance promise,
 *   - `invalidate()` forces a re-issuance on the next call.
 *
 * The REST layer and the credential store are mocked; the test never touches
 * the network or the filesystem.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TOKEN_MIN_ISSUANCE_INTERVAL_MS,
  TOKEN_REFRESH_LEADTIME_SEC,
  TOKEN_TTL_SEC,
} from '../../../shared/kis-constraints.js';
import type {
  CredentialStore,
  KisCredentials,
  PersistedToken,
  StoredPayload,
} from '../../credential-store.js';
import {
  createKisAuth,
  KisCredentialsMissingError,
  KisTokenThrottledError,
  type KisTokenTransport,
} from '../kis-auth.js';

function makeStore(initial: StoredPayload | null): {
  store: CredentialStore;
  reads: number;
  saveTokenCalls: PersistedToken[];
} {
  let current: StoredPayload | null = initial;
  const saveTokenCalls: PersistedToken[] = [];
  let reads = 0;
  const store: CredentialStore = {
    async load() {
      reads += 1;
      return current;
    },
    async saveCredentials(credentials: KisCredentials) {
      current =
        current === null
          ? { credentials }
          : current.token !== undefined
            ? { credentials, token: current.token }
            : { credentials };
    },
    async saveToken(token: PersistedToken) {
      saveTokenCalls.push(token);
      if (current === null) throw new Error('no credentials');
      current = { credentials: current.credentials, token };
    },
    async clearToken() {
      if (current === null) return;
      current = { credentials: current.credentials };
    },
    async clearCredentials() {
      current = null;
    },
  };
  return {
    store,
    get reads() {
      return reads;
    },
    saveTokenCalls,
  };
}

function makeTransport(
  responses: unknown[],
): {
  transport: KisTokenTransport;
  calls: number;
} {
  let i = 0;
  let calls = 0;
  const transport: KisTokenTransport = {
    async postToken() {
      calls += 1;
      const res = responses[i];
      i += 1;
      if (res === undefined) {
        throw new Error('no more mock responses configured');
      }
      return res;
    },
  };
  return {
    transport,
    get calls() {
      return calls;
    },
  };
}

const CREDS: KisCredentials = {
  appKey: 'test-app-key',
  appSecret: 'test-app-secret',
  isPaper: true,
};

describe('kis-auth', () => {
  let nowMs = 1_700_000_000_000;
  const now = (): number => nowMs;

  beforeEach(() => {
    nowMs = 1_700_000_000_000;
  });

  it('issues a token on first call and persists it', async () => {
    const storeFx = makeStore({ credentials: CREDS });
    const transportFx = makeTransport([
      {
        access_token: 'AT1',
        token_type: 'Bearer',
        expires_in: TOKEN_TTL_SEC,
      },
    ]);
    const auth = createKisAuth({
      store: storeFx.store,
      transport: transportFx.transport,
      now,
    });

    const token = await auth.getAccessToken();

    expect(token).toBe('AT1');
    expect(transportFx.calls).toBe(1);
    expect(storeFx.saveTokenCalls).toHaveLength(1);
    expect(storeFx.saveTokenCalls[0]?.accessToken).toBe('AT1');
    expect(storeFx.saveTokenCalls[0]?.expiresAtMs).toBe(
      nowMs + TOKEN_TTL_SEC * 1_000,
    );
  });

  it('reuses a still-valid token without calling the transport', async () => {
    const storeFx = makeStore({
      credentials: CREDS,
      token: {
        accessToken: 'CACHED',
        tokenType: 'Bearer',
        expiresAtMs: nowMs + TOKEN_TTL_SEC * 1_000,
        issuedAtMs: nowMs - 60 * 60 * 1_000,
      },
    });
    const transportFx = makeTransport([]);
    const auth = createKisAuth({
      store: storeFx.store,
      transport: transportFx.transport,
      now,
    });

    const token = await auth.getAccessToken();

    expect(token).toBe('CACHED');
    expect(transportFx.calls).toBe(0);
  });

  it('refreshes proactively inside the leadtime window', async () => {
    // Cached token that expires 1s before the leadtime cutoff → must refresh.
    const leadtimeMs = TOKEN_REFRESH_LEADTIME_SEC * 1_000;
    const storeFx = makeStore({
      credentials: CREDS,
      token: {
        accessToken: 'STALE',
        tokenType: 'Bearer',
        expiresAtMs: nowMs + leadtimeMs - 1_000,
        // Issued over a minute ago so the 1-per-minute guard doesn't block.
        issuedAtMs: nowMs - (TOKEN_MIN_ISSUANCE_INTERVAL_MS + 1_000),
      },
    });
    const transportFx = makeTransport([
      {
        access_token: 'FRESH',
        token_type: 'Bearer',
        expires_in: TOKEN_TTL_SEC,
      },
    ]);
    const auth = createKisAuth({
      store: storeFx.store,
      transport: transportFx.transport,
      now,
    });

    const token = await auth.getAccessToken();

    expect(token).toBe('FRESH');
    expect(transportFx.calls).toBe(1);
  });

  it('reissues when the cached token is fully expired', async () => {
    const storeFx = makeStore({
      credentials: CREDS,
      token: {
        accessToken: 'EXPIRED',
        tokenType: 'Bearer',
        expiresAtMs: nowMs - 1_000,
        issuedAtMs: nowMs - (TOKEN_TTL_SEC + 10) * 1_000,
      },
    });
    const transportFx = makeTransport([
      {
        access_token: 'NEW',
        token_type: 'Bearer',
        expires_in: TOKEN_TTL_SEC,
      },
    ]);
    const auth = createKisAuth({
      store: storeFx.store,
      transport: transportFx.transport,
      now,
    });

    const token = await auth.getAccessToken();

    expect(token).toBe('NEW');
    expect(transportFx.calls).toBe(1);
  });

  it('throws KisTokenThrottledError inside the 1-per-minute guard', async () => {
    const storeFx = makeStore({
      credentials: CREDS,
      token: {
        accessToken: 'EXPIRED',
        tokenType: 'Bearer',
        // Already expired — we must refresh…
        expiresAtMs: nowMs - 1_000,
        // …but we issued it 5s ago, tripping the KIS throttle.
        issuedAtMs: nowMs - 5_000,
      },
    });
    const transportFx = makeTransport([
      {
        access_token: 'WOULD_NEVER_BE_USED',
        token_type: 'Bearer',
        expires_in: TOKEN_TTL_SEC,
      },
    ]);
    const auth = createKisAuth({
      store: storeFx.store,
      transport: transportFx.transport,
      now,
    });

    await expect(auth.getAccessToken()).rejects.toBeInstanceOf(
      KisTokenThrottledError,
    );
    expect(transportFx.calls).toBe(0);
  });

  it('deduplicates concurrent issuance into a single transport call', async () => {
    const storeFx = makeStore({ credentials: CREDS });
    let resolveCall: ((v: unknown) => void) | null = null;
    const transport: KisTokenTransport = {
      async postToken() {
        return new Promise<unknown>((r) => {
          resolveCall = r;
        });
      },
    };
    const spy = vi.spyOn(transport, 'postToken');

    const auth = createKisAuth({
      store: storeFx.store,
      transport,
      now,
    });

    const [p1, p2, p3] = [
      auth.getAccessToken(),
      auth.getAccessToken(),
      auth.getAccessToken(),
    ];

    // Yield so `ensureLoaded()` + the initial transport call resolve past
    // the first `await`. The transport itself is still pending (blocked on
    // `resolveCall`), so all three callers must share the in-flight promise.
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }
    expect(spy).toHaveBeenCalledTimes(1);

    resolveCall?.({
      access_token: 'AT_SHARED',
      token_type: 'Bearer',
      expires_in: TOKEN_TTL_SEC,
    });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).toBe('AT_SHARED');
    expect(r2).toBe('AT_SHARED');
    expect(r3).toBe('AT_SHARED');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(storeFx.saveTokenCalls).toHaveLength(1);
  });

  it('invalidate() clears the cache and forces a reissue', async () => {
    const storeFx = makeStore({
      credentials: CREDS,
      token: {
        accessToken: 'OLD',
        tokenType: 'Bearer',
        expiresAtMs: nowMs + TOKEN_TTL_SEC * 1_000,
        issuedAtMs: nowMs - (TOKEN_MIN_ISSUANCE_INTERVAL_MS + 1_000),
      },
    });
    const transportFx = makeTransport([
      {
        access_token: 'AFTER_INVALIDATE',
        token_type: 'Bearer',
        expires_in: TOKEN_TTL_SEC,
      },
    ]);
    const auth = createKisAuth({
      store: storeFx.store,
      transport: transportFx.transport,
      now,
    });

    const before = await auth.getAccessToken();
    expect(before).toBe('OLD');

    await auth.invalidate();
    const after = await auth.getAccessToken();
    expect(after).toBe('AFTER_INVALIDATE');
    expect(transportFx.calls).toBe(1);
  });

  it('raises KisCredentialsMissingError when the store has no credentials', async () => {
    const storeFx = makeStore(null);
    const transportFx = makeTransport([]);
    const auth = createKisAuth({
      store: storeFx.store,
      transport: transportFx.transport,
      now,
    });

    await expect(auth.getAccessToken()).rejects.toBeInstanceOf(
      KisCredentialsMissingError,
    );
    expect(transportFx.calls).toBe(0);
  });
});
