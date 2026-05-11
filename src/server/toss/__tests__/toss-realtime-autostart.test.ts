import { describe, expect, it } from 'vitest';

import { shouldAutoStartTossRealtime } from '../toss-realtime-autostart.js';
import type { TossSessionSummary } from '../toss-session-store.js';

function summary(state: TossSessionSummary['state'], configured = true): TossSessionSummary {
  return {
    configured,
    state,
    provider: configured ? 'toss' : null,
    persistent: state === 'persistent',
    cookieCount: configured ? 5 : 0,
    localStorageKeyCount: configured ? 1 : 0,
    sessionStorageKeyCount: configured ? 1 : 0,
    retrievedAt: configured ? '2026-05-11T06:00:00.000Z' : null,
    expiresAt: null,
    serverExpiresAt: null,
    expiresInMs: null,
  };
}

describe('shouldAutoStartTossRealtime', () => {
  it('starts only for usable Toss sessions', () => {
    expect(shouldAutoStartTossRealtime(summary('persistent'))).toBe(true);
    expect(shouldAutoStartTossRealtime(summary('session_scoped'))).toBe(true);
    expect(shouldAutoStartTossRealtime(summary('expiring'))).toBe(true);
    expect(shouldAutoStartTossRealtime(summary('expired'))).toBe(false);
    expect(shouldAutoStartTossRealtime(summary('logged_out', false))).toBe(false);
  });
});
