import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import {
  createFileTossSessionStore,
  summarizeTossSession,
  type TossSession,
} from '../toss-session-store.js';

function session(overrides: Partial<TossSession> = {}): TossSession {
  return {
    provider: 'toss',
    cookies: {
      SESSION: 'session-value',
      UTK: 'utk-value',
      LTK: 'ltk-value',
      FTK: 'ftk-value',
      browserSessionId: 'browser-session-value',
    },
    localStorage: {
      'WTS-DEVICE-ID': 'device-value',
      'login-method': 'QR',
    },
    sessionStorage: {
      'WTS-BROWSER-TAB-ID': 'browser-tab-value',
    },
    retrievedAt: '2026-05-11T06:00:00.000Z',
    expiresAt: '2027-05-11T06:00:00.000Z',
    serverExpiresAt: '2026-05-18T06:00:00.000Z',
    persistent: true,
    ...overrides,
  };
}

describe('Toss session store', () => {
  it('saves encrypted session state and summarizes without raw values', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'araon-toss-session-'));
    const path = join(dir, 'toss-session.enc');
    const store = createFileTossSessionStore({ path });

    await store.save(session());

    const raw = await readFile(path, 'utf8');
    expect(raw).not.toContain('session-value');
    expect(raw).not.toContain('device-value');

    const loaded = await store.load();
    expect(loaded?.cookies.SESSION).toBe('session-value');

    const status = await store.status(new Date('2026-05-11T06:00:00.000Z'));
    expect(status).toMatchObject({
      configured: true,
      state: 'persistent',
      provider: 'toss',
      persistent: true,
      cookieCount: 5,
      localStorageKeyCount: 2,
      sessionStorageKeyCount: 1,
    });
    expect(JSON.stringify(status)).not.toContain('session-value');
    expect(JSON.stringify(status)).not.toContain('device-value');
  });

  it('classifies session-scoped, expiring, and expired states', () => {
    expect(summarizeTossSession(session({
      persistent: false,
      expiresAt: null,
      serverExpiresAt: null,
    }))).toMatchObject({ state: 'session_scoped' });

    expect(summarizeTossSession(
      session({ serverExpiresAt: '2026-05-11T20:00:00.000Z' }),
      new Date('2026-05-11T06:00:00.000Z'),
    )).toMatchObject({ state: 'expiring' });

    expect(summarizeTossSession(
      session({ serverExpiresAt: '2026-05-11T05:59:59.000Z' }),
      new Date('2026-05-11T06:00:00.000Z'),
    )).toMatchObject({ state: 'expired' });
  });

  it('clears missing sessions idempotently', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'araon-toss-session-'));
    const store = createFileTossSessionStore({ path: join(dir, 'toss-session.enc') });

    await store.clear();
    expect(await store.status()).toMatchObject({
      configured: false,
      state: 'logged_out',
      provider: null,
    });
  });
});
