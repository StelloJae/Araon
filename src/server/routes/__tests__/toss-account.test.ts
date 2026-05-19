import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { tossAccountRoutes } from '../toss-account.js';
import type { TossAccountClient } from '../../toss/toss-account-client.js';

describe('toss account routes', () => {
  it('returns sanitized Toss accounts through a read-only route', async () => {
    const accountClient: TossAccountClient = {
      listAccounts: vi.fn(async () => ({
        provider: 'toss',
        fetchedAt: '2026-05-11T06:00:00.000Z',
        accounts: [
          {
            ref: 'primary',
            displayName: '토스증권',
            name: '종합위탁',
            type: 'STOCK',
            markets: ['KR', 'US'],
            primary: true,
          },
        ],
      })),
    };
    const app = Fastify({ logger: false });
    await app.register(tossAccountRoutes, { accountClient });

    const res = await app.inject({ method: 'GET', url: '/toss/account/list' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: {
        provider: 'toss',
        fetchedAt: '2026-05-11T06:00:00.000Z',
        accounts: [
          {
            ref: 'primary',
            displayName: '토스증권',
            name: '종합위탁',
            type: 'STOCK',
            markets: ['KR', 'US'],
            primary: true,
          },
        ],
      },
    });
    expect(res.body).not.toContain('accountNo');
    expect(res.body).not.toContain('[test-account]');
  });

  it('maps missing Toss session to 503 without leaking internals', async () => {
    const accountClient: TossAccountClient = {
      listAccounts: vi.fn(async () => {
        throw new Error('Toss session is required');
      }),
    };
    const app = Fastify({ logger: false });
    await app.register(tossAccountRoutes, { accountClient });

    const res = await app.inject({ method: 'GET', url: '/toss/account/list' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      success: false,
      error: { code: 'TOSS_SESSION_REQUIRED' },
    });
  });

  it('sanitizes unexpected Toss account failures', async () => {
    const accountClient: TossAccountClient = {
      listAccounts: vi.fn(async () => {
        throw new Error('raw Toss account response SESSION=[test-session] accountNo=[test-account]');
      }),
    };
    const app = Fastify({ logger: false });
    await app.register(tossAccountRoutes, { accountClient });

    const res = await app.inject({ method: 'GET', url: '/toss/account/list' });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({
      success: false,
      error: {
        code: 'TOSS_READ_REQUEST_FAILED',
        message: 'Toss read request failed',
      },
    });
    expect(res.body).not.toContain(['SESSION', ''].join('='));
    expect(res.body).not.toContain('[test-session]');
    expect(res.body).not.toContain('accountNo');
  });
});
