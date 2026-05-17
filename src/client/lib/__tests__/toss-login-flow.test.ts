import { describe, expect, it } from 'vitest';

import {
  isTossLoginRunningState,
  shouldRefreshTossAccountRailAfterLogin,
  shouldStopTossLoginPolling,
  tossLoginRailNotice,
} from '../toss-login-flow';
import type { TossLoginStatusPayload } from '../api-client';

function loginStatus(
  state: TossLoginStatusPayload['state'],
  message: string | null = null,
): TossLoginStatusPayload {
  return {
    state,
    startedAt: '2026-05-11T20:00:00.000Z',
    updatedAt: '2026-05-11T20:00:01.000Z',
    finishedAt: null,
    message,
    persistent: state === 'succeeded',
    cookieCount: 0,
    localStorageKeyCount: 0,
    sessionStorageKeyCount: 0,
    expiresAt: null,
    missingCookieCount: 0,
    missingLocalStorageKeyCount: 0,
  };
}

describe('toss login flow helpers', () => {
  it('keeps polling only while the QR login job is still running', () => {
    expect(isTossLoginRunningState('starting')).toBe(true);
    expect(isTossLoginRunningState('waiting_for_qr')).toBe(true);
    expect(isTossLoginRunningState('waiting_for_persistent')).toBe(true);

    expect(isTossLoginRunningState('succeeded')).toBe(false);
    expect(isTossLoginRunningState('failed')).toBe(false);
    expect(isTossLoginRunningState('cancelled')).toBe(false);
    expect(isTossLoginRunningState(undefined)).toBe(false);
  });

  it('refreshes the Toss account rail only after a successful login', () => {
    expect(shouldRefreshTossAccountRailAfterLogin(loginStatus('succeeded'))).toBe(true);
    expect(shouldRefreshTossAccountRailAfterLogin(loginStatus('waiting_for_persistent'))).toBe(false);
    expect(shouldRefreshTossAccountRailAfterLogin(loginStatus('failed'))).toBe(false);
    expect(shouldRefreshTossAccountRailAfterLogin(null)).toBe(false);
  });

  it('stops polling when the login job disappears or reaches a terminal state', () => {
    expect(shouldStopTossLoginPolling(null)).toBe(true);
    expect(shouldStopTossLoginPolling(loginStatus('succeeded'))).toBe(true);
    expect(shouldStopTossLoginPolling(loginStatus('failed'))).toBe(true);
    expect(shouldStopTossLoginPolling(loginStatus('cancelled'))).toBe(true);
    expect(shouldStopTossLoginPolling(loginStatus('waiting_for_qr'))).toBe(false);
  });

  it('shows fixed Korean UI copy instead of login service internals', () => {
    const rawSessionMarker = 'SE' + 'SSION=placeholder';
    const rawStorageMarker = 'U' + 'TK=placeholder';
    const rawAccountMarker = 'account' + 'No=placeholder';
    const notice = tossLoginRailNotice(
      loginStatus(
        'waiting_for_qr',
        `${rawSessionMarker} ${rawStorageMarker} ${rawAccountMarker}`,
      ),
    );

    expect(notice).toContain('Toss QR 로그인 창을 열었습니다.');
    expect(notice).toContain('새로고침');
    expect(notice).not.toContain(rawSessionMarker);
    expect(notice).not.toContain(rawStorageMarker);
    expect(notice).not.toContain(rawAccountMarker);
  });
});
