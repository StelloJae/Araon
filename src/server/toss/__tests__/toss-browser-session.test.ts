import { describe, expect, it } from 'vitest';

import {
  assessTossBrowserSession,
  tossSessionFromBrowserState,
  type TossBrowserState,
} from '../toss-browser-session.js';

function browserState(overrides: Partial<TossBrowserState> = {}): TossBrowserState {
  return {
    url: 'https://www.tossinvest.com/account',
    cookies: [
      { name: 'SESSION', value: 'session-value', domain: '.tossinvest.com', expires: 1_808_604_800 },
      { name: 'XSRF-TOKEN', value: 'xsrf-value', domain: '.tossinvest.com' },
      { name: 'UTK', value: 'utk-value', domain: '.tossinvest.com' },
      { name: 'LTK', value: 'ltk-value', domain: '.tossinvest.com' },
      { name: 'FTK', value: 'ftk-value', domain: '.tossinvest.com' },
      { name: 'browserSessionId', value: 'browser-session-value', domain: '.tossinvest.com' },
      { name: 'ignored', value: 'foreign-value', domain: 'example.com' },
    ],
    localStorage: {
      'WTS-DEVICE-ID': 'device-value',
      'login-method': 'QR',
    },
    sessionStorage: {
      'WTS-BROWSER-TAB-ID': 'tab-value',
    },
    ...overrides,
  };
}

describe('Toss browser session capture', () => {
  it('classifies a persistent authenticated browser state without exposing values', () => {
    const assessment = assessTossBrowserSession(
      browserState(),
      new Date('2026-05-11T06:00:00.000Z'),
    );

    expect(assessment).toMatchObject({
      initialAuthDone: true,
      persistent: true,
      missingCookies: [],
      missingLocalStorageKeys: [],
      cookieCount: 6,
      localStorageKeyCount: 2,
      sessionStorageKeyCount: 1,
      expiresAt: '2027-04-24T22:13:20.000Z',
    });
    expect(JSON.stringify(assessment)).not.toContain('session-value');
    expect(JSON.stringify(assessment)).not.toContain('device-value');
  });

  it('keeps session-scoped login distinct from persistent login', () => {
    const assessment = assessTossBrowserSession(browserState({
      cookies: [
        { name: 'SESSION', value: 'session-value', domain: '.tossinvest.com', expires: -1 },
        { name: 'XSRF-TOKEN', value: 'xsrf-value', domain: '.tossinvest.com' },
        { name: 'UTK', value: 'utk-value', domain: '.tossinvest.com' },
        { name: 'LTK', value: 'ltk-value', domain: '.tossinvest.com' },
        { name: 'FTK', value: 'ftk-value', domain: '.tossinvest.com' },
        { name: 'browserSessionId', value: 'browser-session-value', domain: '.tossinvest.com' },
      ],
    }));

    expect(assessment.initialAuthDone).toBe(true);
    expect(assessment.persistent).toBe(false);
    expect(assessment.expiresAt).toBeNull();
  });

  it('converts only authenticated Toss state into the encrypted-session shape', () => {
    const session = tossSessionFromBrowserState(
      browserState(),
      new Date('2026-05-11T06:00:00.000Z'),
    );

    expect(session).toMatchObject({
      provider: 'toss',
      persistent: true,
      retrievedAt: '2026-05-11T06:00:00.000Z',
      expiresAt: '2027-04-24T22:13:20.000Z',
    });
    expect(session.cookies.SESSION).toBe('session-value');
    expect(session.cookies.ignored).toBeUndefined();
    expect(session.localStorage['WTS-DEVICE-ID']).toBe('device-value');

    expect(() => tossSessionFromBrowserState(browserState({
      localStorage: { 'WTS-DEVICE-ID': 'device-value' },
    }))).toThrow('not authenticated');
  });
});
