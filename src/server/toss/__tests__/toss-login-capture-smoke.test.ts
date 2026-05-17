import { describe, expect, it, vi } from 'vitest';

import { runTossLoginCaptureSmoke } from '../toss-login-capture-smoke.js';
import type { TossLoginStatus } from '../toss-cdp-login-service.js';

const loggedOutSession = {
  configured: false,
  state: 'logged_out' as const,
  provider: null,
  persistent: false,
  cookieCount: 0,
  localStorageKeyCount: 0,
  sessionStorageKeyCount: 0,
  retrievedAt: null,
  expiresAt: null,
  serverExpiresAt: null,
  effectiveExpiresAt: null,
  expiresInMs: null,
};

const persistentSession = {
  configured: true,
  state: 'persistent' as const,
  provider: 'toss' as const,
  persistent: true,
  cookieCount: 5,
  localStorageKeyCount: 2,
  sessionStorageKeyCount: 1,
  retrievedAt: '2026-05-12T00:00:00.000Z',
  expiresAt: null,
  serverExpiresAt: '2026-05-19T00:00:00.000Z',
  effectiveExpiresAt: '2026-05-19T00:00:00.000Z',
  expiresInMs: 604_800_000,
};

function loginStatus(overrides: Partial<TossLoginStatus> = {}): TossLoginStatus {
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
    ...overrides,
  };
}

describe('toss login capture smoke', () => {
  it('skips browser capture when a usable Toss session already exists', async () => {
    const loginService = {
      start: vi.fn(),
      status: vi.fn(),
      cancel: vi.fn(),
    };

    const report = await runTossLoginCaptureSmoke({
      sessionStatus: async () => persistentSession,
      loginService,
      timeoutMs: 60_000,
      pollIntervalMs: 1000,
      sleep: vi.fn(),
      now: () => new Date('2026-05-12T01:00:00.000Z'),
    });

    expect(report.outcome).toBe('already_configured');
    expect(report.sessionBefore).toMatchObject({
      configured: true,
      state: 'persistent',
      persistent: true,
      effectiveExpiresAt: '2026-05-19T00:00:00.000Z',
    });
    expect(report.sessionAfter).toEqual(report.sessionBefore);
    expect(report.login).toMatchObject({
      state: 'idle',
      persistent: false,
      errorCode: null,
    });
    expect(loginService.start).not.toHaveBeenCalled();
    expect(loginService.status).not.toHaveBeenCalled();
  });

  it('does not open browser capture when an existing session is required but absent', async () => {
    const loginService = {
      start: vi.fn(),
      status: vi.fn(),
      cancel: vi.fn(),
    };

    const report = await runTossLoginCaptureSmoke({
      sessionStatus: async () => loggedOutSession,
      loginService,
      requireExistingSession: true,
      timeoutMs: 60_000,
      pollIntervalMs: 1000,
      sleep: vi.fn(),
      now: () => new Date('2026-05-12T01:00:00.000Z'),
    });

    expect(report.outcome).toBe('session_required');
    expect(report.sessionBefore.configured).toBe(false);
    expect(report.sessionAfter).toEqual(report.sessionBefore);
    expect(report.login).toMatchObject({
      state: 'idle',
      persistent: false,
      errorCode: null,
    });
    expect(loginService.start).not.toHaveBeenCalled();
    expect(loginService.status).not.toHaveBeenCalled();
  });

  it('starts QR capture and returns a sanitized success summary', async () => {
    const sleep = vi.fn(async () => undefined);
    const loginService = {
      start: vi.fn(async () => loginStatus({
        state: 'waiting_for_qr',
        message: 'Waiting for Toss QR login',
        startedAt: '2026-05-12T01:00:00.000Z',
      })),
      status: vi
        .fn()
        .mockReturnValueOnce(loginStatus({
          state: 'waiting_for_persistent',
          message: 'QR login completed; waiting for persistent device confirmation',
          persistent: false,
          cookieCount: 4,
          localStorageKeyCount: 1,
        }))
        .mockReturnValueOnce(loginStatus({
          state: 'succeeded',
          message: 'Toss persistent session captured',
          persistent: true,
          cookieCount: 5,
          localStorageKeyCount: 2,
          sessionStorageKeyCount: 1,
          expiresAt: '2027-04-24T22:13:20.000Z',
          finishedAt: '2026-05-12T01:00:04.000Z',
        })),
      cancel: vi.fn(),
    };

    const report = await runTossLoginCaptureSmoke({
      sessionStatus: vi
        .fn()
        .mockResolvedValueOnce(loggedOutSession)
        .mockResolvedValueOnce(persistentSession),
      loginService,
      timeoutMs: 60_000,
      pollIntervalMs: 1000,
      sleep,
      now: () => new Date('2026-05-12T01:00:00.000Z'),
    });

    expect(report.outcome).toBe('succeeded');
    expect(report.login).toMatchObject({
      state: 'succeeded',
      persistent: true,
      cookieCount: 5,
      localStorageKeyCount: 2,
      sessionStorageKeyCount: 1,
      errorCode: null,
    });
    expect(report.sessionBefore.configured).toBe(false);
    expect(report.sessionAfter).toMatchObject({ configured: true, state: 'persistent' });
    expect(loginService.start).toHaveBeenCalledWith({ timeoutMs: 60_000 });
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(JSON.stringify(report)).not.toContain('SESSION');
    expect(JSON.stringify(report)).not.toContain('UTK');
  });

  it('sanitizes login capture failures', async () => {
    const loginService = {
      start: vi.fn(async () => {
        throw new Error(`failed near ${['SESSION', 'raw'].join('=')} ${['accountNo', '1234'].join('=')}`);
      }),
      status: vi.fn(),
      cancel: vi.fn(),
    };

    const report = await runTossLoginCaptureSmoke({
      sessionStatus: async () => loggedOutSession,
      loginService,
      timeoutMs: 60_000,
      pollIntervalMs: 1000,
      sleep: vi.fn(),
      now: () => new Date('2026-05-12T01:00:00.000Z'),
    });

    expect(report.outcome).toBe('failed');
    expect(report.login).toMatchObject({
      state: 'failed',
      errorCode: 'TOSS_LOGIN_CAPTURE_SMOKE_FAILED',
      message: 'TOSS_LOGIN_CAPTURE_SMOKE_FAILED',
    });
    expect(JSON.stringify(report)).not.toContain('SESSION');
    expect(JSON.stringify(report)).not.toContain('accountNo');
    expect(JSON.stringify(report)).not.toContain('1234');
  });
});
