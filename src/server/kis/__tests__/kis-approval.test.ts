import { describe, it, expect } from 'vitest';
import {
  createApprovalIssuer,
  ApprovalError,
  type ApprovalRequest,
  type ApprovalTransport,
} from '../kis-approval.js';

// === Helpers ================================================================

function makeTransport(behavior: () => Promise<unknown>): ApprovalTransport {
  return {
    request: <T>(_req: ApprovalRequest): Promise<T> =>
      behavior().then((v) => v as T),
  };
}

function captureTransport(
  behavior: () => Promise<unknown>,
): { transport: ApprovalTransport; lastReq: () => ApprovalRequest | null } {
  let last: ApprovalRequest | null = null;
  return {
    transport: {
      request: <T>(req: ApprovalRequest): Promise<T> => {
        last = req;
        return behavior().then((v) => v as T);
      },
    },
    lastReq: () => last,
  };
}

const FIXED_NOW = (): Date => new Date('2026-04-27T01:23:45.000Z');

// === Happy path =============================================================

describe('createApprovalIssuer — happy path', () => {
  it('returns the approval key from a successful response', async () => {
    const issuer = createApprovalIssuer({
      appKey: 'PUB',
      appSecret: 'PRI',
      transport: makeTransport(async () => ({ approval_key: 'abc-123' })),
    });
    expect(issuer.getState()).toEqual({ status: 'none' });
    const key = await issuer.issue();
    expect(key).toBe('abc-123');
    const s = issuer.getState();
    expect(s.status).toBe('ready');
    if (s.status === 'ready') expect(s.issuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('records issuedAt from the injected clock', async () => {
    const issuer = createApprovalIssuer({
      appKey: 'PUB',
      appSecret: 'PRI',
      transport: makeTransport(async () => ({ approval_key: 'k' })),
      now: FIXED_NOW,
    });
    await issuer.issue();
    const s = issuer.getState();
    if (s.status === 'ready') {
      expect(s.issuedAt).toBe('2026-04-27T01:23:45.000Z');
    } else {
      throw new Error(`expected ready, got ${s.status}`);
    }
  });

  it('passes through extra fields via passthrough but only returns approval_key', async () => {
    const issuer = createApprovalIssuer({
      appKey: 'PUB',
      appSecret: 'PRI',
      transport: makeTransport(async () => ({
        approval_key: 'k1',
        code: '0',
        message: '정상 처리',
      })),
    });
    expect(await issuer.issue()).toBe('k1');
  });
});

// === Request shape contract =================================================

describe('createApprovalIssuer — request shape', () => {
  it('uses POST /oauth2/Approval with grant_type=client_credentials, appkey, secretkey, unauthenticated=true', async () => {
    const cap = captureTransport(async () => ({ approval_key: 'k' }));
    const issuer = createApprovalIssuer({
      appKey: 'PUB_KEY',
      appSecret: 'PRI_SECRET',
      transport: cap.transport,
    });
    await issuer.issue();
    const req = cap.lastReq();
    expect(req).not.toBeNull();
    expect(req!.method).toBe('POST');
    expect(req!.path).toBe('/oauth2/Approval');
    expect(req!.unauthenticated).toBe(true);
    expect(req!.body).toMatchObject({
      grant_type: 'client_credentials',
      appkey: 'PUB_KEY',
      secretkey: 'PRI_SECRET',
    });
    // Critical: must NOT use the wrong field name from /oauth2/tokenP.
    expect(req!.body['appsecret']).toBeUndefined();
  });
});

// === Concurrent dedup =======================================================

describe('createApprovalIssuer — concurrent dedup', () => {
  it('shares a single transport request across overlapping issue() calls', async () => {
    let calls = 0;
    let resolveTransport: (v: unknown) => void = () => {};
    const issuer = createApprovalIssuer({
      appKey: 'k',
      appSecret: 's',
      transport: {
        request: <T>(): Promise<T> => {
          calls += 1;
          return new Promise<unknown>((resolve) => {
            resolveTransport = resolve;
          }) as Promise<T>;
        },
      },
    });
    const p1 = issuer.issue();
    const p2 = issuer.issue();
    expect(calls).toBe(1);
    resolveTransport({ approval_key: 'shared' });
    expect(await p1).toBe('shared');
    expect(await p2).toBe('shared');
  });

  it('makes a fresh transport request on subsequent successful issue()', async () => {
    let calls = 0;
    const issuer = createApprovalIssuer({
      appKey: 'k',
      appSecret: 's',
      transport: makeTransport(async () => {
        calls += 1;
        return { approval_key: `key-${calls}` };
      }),
    });
    expect(await issuer.issue()).toBe('key-1');
    expect(await issuer.issue()).toBe('key-2');
    expect(calls).toBe(2);
  });

  it('makes a fresh transport request on retry after failure', async () => {
    let calls = 0;
    const issuer = createApprovalIssuer({
      appKey: 'k',
      appSecret: 's',
      transport: makeTransport(async () => {
        calls += 1;
        if (calls === 1) throw new Error('first attempt failed');
        return { approval_key: 'second' };
      }),
    });
    await expect(issuer.issue()).rejects.toBeInstanceOf(ApprovalError);
    expect(await issuer.issue()).toBe('second');
  });
});

// === Schema failures ========================================================

describe('createApprovalIssuer — malformed responses', () => {
  it('classifies missing approval_key as malformed_response', async () => {
    const issuer = createApprovalIssuer({
      appKey: 'k',
      appSecret: 's',
      transport: makeTransport(async () => ({})),
    });
    await expect(issuer.issue()).rejects.toBeInstanceOf(ApprovalError);
    const s = issuer.getState();
    expect(s.status).toBe('failed');
    if (s.status === 'failed') expect(s.code).toBe('malformed_response');
  });

  it('classifies empty-string approval_key as malformed_response', async () => {
    const issuer = createApprovalIssuer({
      appKey: 'k',
      appSecret: 's',
      transport: makeTransport(async () => ({ approval_key: '' })),
    });
    await expect(issuer.issue()).rejects.toBeInstanceOf(ApprovalError);
    const s = issuer.getState();
    if (s.status === 'failed') expect(s.code).toBe('malformed_response');
  });

  it('classifies non-object response as malformed_response', async () => {
    const issuer = createApprovalIssuer({
      appKey: 'k',
      appSecret: 's',
      transport: makeTransport(async () => 'not-an-object'),
    });
    await expect(issuer.issue()).rejects.toBeInstanceOf(ApprovalError);
    const s = issuer.getState();
    if (s.status === 'failed') expect(s.code).toBe('malformed_response');
  });
});

// === Transport / network failures ==========================================

describe('createApprovalIssuer — transport failures', () => {
  it('classifies KisRestError-like with rtCd != "0" as auth_rejected', async () => {
    const issuer = createApprovalIssuer({
      appKey: 'k',
      appSecret: 's',
      transport: makeTransport(async () => {
        const e = new Error('KIS rejected');
        // Mimic KisRestError shape (kis-rest-client.ts:53)
        Object.assign(e, { name: 'KisRestError', status: 500, rtCd: '1', msgCd: 'EGW00121' });
        throw e;
      }),
    });
    await expect(issuer.issue()).rejects.toBeInstanceOf(ApprovalError);
    const s = issuer.getState();
    if (s.status === 'failed') expect(s.code).toBe('auth_rejected');
  });

  it('classifies HTTP 401 as auth_rejected', async () => {
    const issuer = createApprovalIssuer({
      appKey: 'k',
      appSecret: 's',
      transport: makeTransport(async () => {
        const e = new Error('Unauthorized');
        Object.assign(e, { status: 401, rtCd: null });
        throw e;
      }),
    });
    await expect(issuer.issue()).rejects.toBeInstanceOf(ApprovalError);
    const s = issuer.getState();
    if (s.status === 'failed') expect(s.code).toBe('auth_rejected');
  });

  it('classifies HTTP 403 as auth_rejected', async () => {
    const issuer = createApprovalIssuer({
      appKey: 'k',
      appSecret: 's',
      transport: makeTransport(async () => {
        const e = new Error('Forbidden');
        Object.assign(e, { status: 403, rtCd: null });
        throw e;
      }),
    });
    await expect(issuer.issue()).rejects.toBeInstanceOf(ApprovalError);
    const s = issuer.getState();
    if (s.status === 'failed') expect(s.code).toBe('auth_rejected');
  });

  it('classifies AbortError as network_error', async () => {
    const issuer = createApprovalIssuer({
      appKey: 'k',
      appSecret: 's',
      transport: makeTransport(async () => {
        const e = new Error('aborted');
        Object.assign(e, { name: 'AbortError' });
        throw e;
      }),
    });
    await expect(issuer.issue()).rejects.toBeInstanceOf(ApprovalError);
    const s = issuer.getState();
    if (s.status === 'failed') expect(s.code).toBe('network_error');
  });

  it('classifies plain TypeError("fetch failed") as network_error', async () => {
    const issuer = createApprovalIssuer({
      appKey: 'k',
      appSecret: 's',
      transport: makeTransport(async () => {
        throw new TypeError('fetch failed');
      }),
    });
    await expect(issuer.issue()).rejects.toBeInstanceOf(ApprovalError);
    const s = issuer.getState();
    if (s.status === 'failed') expect(s.code).toBe('network_error');
  });

  it('classifies unrecognised errors as unknown', async () => {
    const issuer = createApprovalIssuer({
      appKey: 'k',
      appSecret: 's',
      transport: makeTransport(async () => {
        throw new Error('mystery');
      }),
    });
    await expect(issuer.issue()).rejects.toBeInstanceOf(ApprovalError);
    const s = issuer.getState();
    if (s.status === 'failed') expect(s.code).toBe('unknown');
  });
});

// === Leak regression guards ================================================

describe('createApprovalIssuer — leak regression', () => {
  it('getState() never contains the approval key value (success path)', async () => {
    const SECRET_KEY = 'super-secret-approval-key-XYZ-12345';
    const issuer = createApprovalIssuer({
      appKey: 'PUB',
      appSecret: 'PRI',
      transport: makeTransport(async () => ({ approval_key: SECRET_KEY })),
    });
    await issuer.issue();
    const stateText = JSON.stringify(issuer.getState());
    expect(stateText).not.toContain(SECRET_KEY);
  });

  it('getState() never contains appKey/appSecret/upstream error text on failure', async () => {
    const issuer = createApprovalIssuer({
      appKey: 'PUBLIC_APP_KEY_123',
      appSecret: 'PRIVATE_APP_SECRET_XYZ',
      transport: makeTransport(async () => {
        throw new Error('upstream debug: appsecret=DEEPLY-SECRET-ABC bearer=lkj');
      }),
    });
    await expect(issuer.issue()).rejects.toBeInstanceOf(ApprovalError);
    const stateText = JSON.stringify(issuer.getState());
    expect(stateText).not.toContain('PUBLIC_APP_KEY_123');
    expect(stateText).not.toContain('PRIVATE_APP_SECRET_XYZ');
    expect(stateText).not.toContain('DEEPLY-SECRET-ABC');
    expect(stateText).not.toContain('bearer');
    expect(stateText).not.toContain('appsecret=');
  });

  it('ApprovalError.message uses generic descriptors instead of upstream text', async () => {
    const issuer = createApprovalIssuer({
      appKey: 'k',
      appSecret: 's',
      transport: makeTransport(async () => {
        throw new Error('upstream: appsecret=LEAKED secretkey=ALSO-LEAKED');
      }),
    });
    let caught: ApprovalError | null = null;
    try {
      await issuer.issue();
    } catch (err) {
      caught = err as ApprovalError;
    }
    expect(caught).toBeInstanceOf(ApprovalError);
    expect(caught!.message).not.toContain('LEAKED');
    expect(caught!.message).not.toContain('ALSO-LEAKED');
    expect(caught!.message).not.toContain('appsecret=');
    expect(caught!.message).not.toContain('secretkey=');
  });
});
