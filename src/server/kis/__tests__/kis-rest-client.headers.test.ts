import { describe, it, expect, vi } from 'vitest';
import { createKisRestClient } from '../kis-rest-client.js';
import type { KisAuth } from '../kis-auth.js';
import type { KisCredentials, PersistedToken } from '../../credential-store.js';

// Live-verified 2026-04-24: KIS rejects quote requests with
// '고객식별키... 유효하지 않습니다' if appkey/appsecret/custtype headers
// are omitted, even when the Bearer token is valid. This test pins the
// header contract so the fix doesn't silently regress.

function makeAuth(credentials: KisCredentials, token = 'test-access-token'): KisAuth {
  return {
    getAccessToken: vi.fn(async () => token),
    getCredentials: vi.fn(async () => credentials),
    invalidate: vi.fn(async () => {}),
    peek: vi.fn((): PersistedToken | null => null),
  };
}

describe('createKisRestClient — authenticated header contract', () => {
  const creds: KisCredentials = {
    appKey: 'APPKEY_XYZ',
    appSecret: 'APPSECRET_ABC',
    isPaper: false,
  };

  it('sends appkey, appsecret, Bearer token, and custtype=P on authenticated requests', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchFn = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify({ rt_cd: '0', output: {} }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createKisRestClient({
      isPaper: false,
      auth: makeAuth(creds),
      fetchFn,
    });

    await client.request({ method: 'GET', path: '/uapi/domestic-stock/v1/quotations/inquire-price', trId: 'FHKST01010100' });

    expect(fetchFn).toHaveBeenCalledOnce();
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers).toBeDefined();
    expect(headers['authorization']).toBe('Bearer test-access-token');
    expect(headers['appkey']).toBe('APPKEY_XYZ');
    expect(headers['appsecret']).toBe('APPSECRET_ABC');
    expect(headers['custtype']).toBe('P');
    expect(headers['tr_id']).toBe('FHKST01010100');
    expect(headers['Content-Type']).toMatch(/application\/json/);
  });

  it('allows per-request override of custtype via req.headers', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchFn = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify({ rt_cd: '0', output: {} }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createKisRestClient({
      isPaper: false,
      auth: makeAuth(creds),
      fetchFn,
    });

    await client.request({
      method: 'GET',
      path: '/uapi/domestic-stock/v1/quotations/inquire-price',
      trId: 'FHKST01010100',
      headers: { custtype: 'B' },
    });

    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers['custtype']).toBe('B');
  });

  it('skips appkey/appsecret/Bearer when unauthenticated=true (token exchange path)', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchFn = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify({ access_token: 'xxx', expires_in: 86400 }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createKisRestClient({
      isPaper: false,
      auth: makeAuth(creds),
      fetchFn,
    });

    await client.request({
      method: 'POST',
      path: '/oauth2/tokenP',
      body: { grant_type: 'client_credentials', appkey: 'x', appsecret: 'y' },
      unauthenticated: true,
    });

    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers['authorization']).toBeUndefined();
    // For token path these SHOULD be unset at header level — the OAuth body
    // carries the appkey/appsecret. The client's header-injection path must
    // be skipped entirely under unauthenticated=true.
    expect(headers['appkey']).toBeUndefined();
    expect(headers['appsecret']).toBeUndefined();
    expect(headers['custtype']).toBeUndefined();
  });
});
