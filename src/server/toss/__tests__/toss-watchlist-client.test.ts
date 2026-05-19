import { describe, expect, it, vi } from 'vitest';

import { createTossWatchlistClient } from '../toss-watchlist-client.js';
import { createTossProductIconCache } from '../toss-product-icon.js';
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

describe('Toss watchlist client', () => {
  it('maps Toss watchlist groups without raw list identifiers', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === 'https://api.example.test/api/v1/account/list') {
        return jsonResponse({
          result: {
            primaryKey: 'raw-primary-account-key',
            accountList: [{ key: 'raw-primary-account-key', type: '위탁' }],
          },
        });
      }

      expect(String(url)).toBe('https://cert.example.test/api/v2/dashboard/asset/sections/all');
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('X-Tossinvest-Account')).toBe('raw-primary-account-key');
      expect(init?.body).toBe(JSON.stringify({ types: ['WATCHLIST'] }));
      return jsonResponse({
        result: {
          sections: [
            { type: 'SORTED_OVERVIEW', data: { ignored: true } },
            {
              type: 'WATCHLIST',
              data: {
                groups: [
                  {
                    id: 46533678,
                    name: '관심 그룹',
                    ordering: -20099,
                    items: [
                      {
                        id: 561751794,
                        parentListId: 46533678,
                        assetType: 'STOCK',
                        stockCode: 'US20170510003',
                        stockName: '비스트라 에너지',
                        prices: {
                          code: 'US20170510003',
                          base: 164.4,
                          close: 165.92,
                          currency: 'USD',
                        },
                      },
                      {
                        id: 561751795,
                        parentListId: 46533678,
                        assetType: 'STOCK',
                        stockCode: 'A005930',
                        stockName: '삼성전자',
                        logoImageUrl: 'https://static.toss.im/png-icons/securities/icn-sec-fill-005930.png',
                        prices: {
                          code: 'A005930',
                          base: 70000,
                          close: 71000,
                          currency: 'KRW',
                        },
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      });
    });
    const client = createTossWatchlistClient({
      sessionStore: makeStore(session()),
      fetchImpl,
      apiBaseUrl: 'https://api.example.test',
      certBaseUrl: 'https://cert.example.test',
      now: () => new Date('2026-05-11T06:45:00.000Z'),
    });

    const result = await client.listWatchlist();

    expect(result).toEqual({
      provider: 'toss',
      fetchedAt: '2026-05-11T06:45:00.000Z',
      groups: [
        {
          ref: 'watchlist-group-1',
          name: '관심 그룹',
          items: [
            {
              ref: 'watchlist-item-1',
              groupRef: 'watchlist-group-1',
              groupName: '관심 그룹',
              productCode: 'US20170510003',
              symbol: 'US20170510003',
              name: '비스트라 에너지',
              currency: 'USD',
              base: 164.4,
              last: 165.92,
            },
            {
              ref: 'watchlist-item-2',
              groupRef: 'watchlist-group-1',
              groupName: '관심 그룹',
              productCode: 'A005930',
              symbol: 'A005930',
              name: '삼성전자',
              iconUrl: 'https://static.toss.im/png-icons/securities/icn-sec-fill-005930.png',
              currency: 'KRW',
              base: 70000,
              last: 71000,
            },
          ],
        },
      ],
      items: [
        {
          ref: 'watchlist-item-1',
          groupRef: 'watchlist-group-1',
          groupName: '관심 그룹',
          productCode: 'US20170510003',
          symbol: 'US20170510003',
          name: '비스트라 에너지',
          currency: 'USD',
          base: 164.4,
          last: 165.92,
        },
        {
          ref: 'watchlist-item-2',
          groupRef: 'watchlist-group-1',
          groupName: '관심 그룹',
          productCode: 'A005930',
          symbol: 'A005930',
          name: '삼성전자',
          iconUrl: 'https://static.toss.im/png-icons/securities/icn-sec-fill-005930.png',
          currency: 'KRW',
          base: 70000,
          last: 71000,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('46533678');
    expect(JSON.stringify(result)).not.toContain('561751794');
    expect(JSON.stringify(result)).not.toContain('parentListId');
    expect(JSON.stringify(result)).not.toContain('raw-primary-account-key');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not call Toss when no session is stored', async () => {
    const fetchImpl = vi.fn();
    const client = createTossWatchlistClient({
      sessionStore: makeStore(null),
      fetchImpl,
    });

    await expect(client.listWatchlist()).rejects.toThrow('Toss session is required');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('prepares Toss watchlist add mutation with product-aware item body', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === 'https://cert.example.test/api/v1/new-watchlists/groups/simple?includeItemInfo=false') {
        expect(init?.method).toBe('GET');
        return jsonResponse({
          watchlists: [{ id: 46533678, name: '기본', type: 'NORMAL', items: [] }],
        });
      }

      expect(String(url)).toBe('https://cert.example.test/api/v1/new-watchlists/items');
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(JSON.stringify({
        watchlistIds: [46533678],
        items: [{ code: 'A005930', itemType: 'STOCK' }],
      }));
      return jsonResponse({ ok: true });
    });
    const client = createTossWatchlistClient({
      sessionStore: makeStore(session()),
      fetchImpl,
      certBaseUrl: 'https://cert.example.test',
      now: () => new Date('2026-05-14T01:00:00.000Z'),
    });

    const result = await client.addProductToWatchlist?.({ productCode: 'A005930' });

    expect(result).toEqual({
      provider: 'toss',
      productCode: 'A005930',
      mutatedAt: '2026-05-14T01:00:00.000Z',
      action: 'added',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('prepares Toss watchlist remove mutation from the matching group', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === 'https://cert.example.test/api/v1/new-watchlists/groups/simple?includeItemInfo=true') {
        expect(init?.method).toBe('GET');
        return jsonResponse({
          watchlists: [
            {
              id: 46533678,
              name: '기본',
              type: 'NORMAL',
              items: [{ code: 'A005930' }],
            },
          ],
        });
      }

      expect(String(url)).toBe('https://cert.example.test/api/v1/new-watchlists/items/remove');
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(JSON.stringify({
        watchlistId: 46533678,
        items: [{ code: 'A005930', itemType: 'STOCK' }],
      }));
      return jsonResponse({ ok: true });
    });
    const client = createTossWatchlistClient({
      sessionStore: makeStore(session()),
      fetchImpl,
      certBaseUrl: 'https://cert.example.test',
      now: () => new Date('2026-05-14T01:00:00.000Z'),
    });

    const result = await client.removeProductFromWatchlist?.({ productCode: 'A005930' });

    expect(result).toEqual({
      provider: 'toss',
      productCode: 'A005930',
      mutatedAt: '2026-05-14T01:00:00.000Z',
      action: 'removed',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('falls back to full watchlist endpoint when simple groups omit item info', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === 'https://cert.example.test/api/v1/new-watchlists/groups/simple?includeItemInfo=true') {
        expect(init?.method).toBe('GET');
        return jsonResponse({
          watchlists: [
            {
              id: 46533678,
              name: '기본',
              type: 'NORMAL',
              items: [],
            },
          ],
        });
      }

      if (String(url) === 'https://cert.example.test/api/v1/new-watchlists?includeItemInfo=true') {
        expect(init?.method).toBe('GET');
        return jsonResponse({
          watchlists: [
            {
              id: 46533678,
              name: '기본',
              type: 'USER_MADE',
              items: [{ code: 'A0011T0', itemType: 'STOCK' }],
            },
          ],
        });
      }

      expect(String(url)).toBe('https://cert.example.test/api/v1/new-watchlists/items/remove');
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(JSON.stringify({
        watchlistId: 46533678,
        items: [{ code: 'A0011T0', itemType: 'STOCK' }],
      }));
      return jsonResponse({ ok: true });
    });
    const client = createTossWatchlistClient({
      sessionStore: makeStore(session()),
      fetchImpl,
      certBaseUrl: 'https://cert.example.test',
      now: () => new Date('2026-05-14T01:00:00.000Z'),
    });

    const result = await client.removeProductFromWatchlist?.({ productCode: 'A0011T0' });

    expect(result).toEqual({
      provider: 'toss',
      productCode: 'A0011T0',
      mutatedAt: '2026-05-14T01:00:00.000Z',
      action: 'removed',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('removes from user-made watchlist instead of recent watch history', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === 'https://cert.example.test/api/v1/new-watchlists/groups/simple?includeItemInfo=true') {
        expect(init?.method).toBe('GET');
        return jsonResponse({
          watchlists: [
            {
              id: 1001,
              name: '최근 본',
              type: 'RECENT_WATCH',
              items: [{ code: 'A035420' }],
            },
          ],
        });
      }

      if (String(url) === 'https://cert.example.test/api/v1/new-watchlists?includeItemInfo=true') {
        expect(init?.method).toBe('GET');
        return jsonResponse({
          watchlists: [
            {
              id: 1001,
              name: '최근 본',
              type: 'RECENT_WATCH',
              items: [{ code: 'A035420', itemType: 'STOCK' }],
            },
            {
              id: 2002,
              name: '기본',
              type: 'USER_MADE',
              items: [{ code: 'A035420', itemType: 'STOCK' }],
            },
          ],
        });
      }

      expect(String(url)).toBe('https://cert.example.test/api/v1/new-watchlists/items/remove');
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(JSON.stringify({
        watchlistId: 2002,
        items: [{ code: 'A035420', itemType: 'STOCK' }],
      }));
      return jsonResponse({ ok: true });
    });
    const client = createTossWatchlistClient({
      sessionStore: makeStore(session()),
      fetchImpl,
      certBaseUrl: 'https://cert.example.test',
      now: () => new Date('2026-05-17T13:00:00.000Z'),
    });

    const result = await client.removeProductFromWatchlist?.({ productCode: 'A035420' });

    expect(result).toEqual({
      provider: 'toss',
      productCode: 'A035420',
      mutatedAt: '2026-05-17T13:00:00.000Z',
      action: 'removed',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('maps watchlist groups when section type changed and groups are on section root', async () => {
    const iconCache = createTossProductIconCache();
    iconCache.set('005930', 'https://static.toss.im/png-icons/securities/icn-sec-fill-005930.png');
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === 'https://api.example.test/api/v1/account/list') {
        return jsonResponse({
          result: {
            primaryKey: 'raw-primary-account-key',
            accountList: [{ key: 'raw-primary-account-key', type: '위탁' }],
          },
        });
      }

      expect(String(url)).toBe('https://cert.example.test/api/v2/dashboard/asset/sections/all');
      return jsonResponse({
        result: {
          sections: [
            {
              type: 'WATCHLIST_SECTION',
              data: {
                ignored: true,
              },
              groups: [
                {
                  id: 46533678,
                  name: '관심 그룹',
                  ordering: -20099,
                  items: [
                    {
                      id: 561751794,
                      parentListId: 46533678,
                      assetType: 'STOCK',
                      stockCode: 'A005930',
                      stockName: '삼성전자',
                      prices: {
                        code: 'A005930',
                        base: 70000,
                        close: 71000,
                        currency: 'KRW',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      });
    });
    const client = createTossWatchlistClient({
      sessionStore: makeStore(session()),
      fetchImpl,
      iconCache,
      apiBaseUrl: 'https://api.example.test',
      certBaseUrl: 'https://cert.example.test',
      now: () => new Date('2026-05-11T06:45:00.000Z'),
    });

    const result = await client.listWatchlist();

    expect(result).toEqual({
      provider: 'toss',
      fetchedAt: '2026-05-11T06:45:00.000Z',
      groups: [
        {
          ref: 'watchlist-group-1',
          name: '관심 그룹',
          items: [
            {
              ref: 'watchlist-item-1',
              groupRef: 'watchlist-group-1',
              groupName: '관심 그룹',
              productCode: 'A005930',
              symbol: 'A005930',
              name: '삼성전자',
              iconUrl: 'https://static.toss.im/png-icons/securities/icn-sec-fill-005930.png',
              currency: 'KRW',
              base: 70000,
              last: 71000,
            },
          ],
        },
      ],
      items: [
        {
          ref: 'watchlist-item-1',
          groupRef: 'watchlist-group-1',
          groupName: '관심 그룹',
          productCode: 'A005930',
          symbol: 'A005930',
          name: '삼성전자',
          iconUrl: 'https://static.toss.im/png-icons/securities/icn-sec-fill-005930.png',
          currency: 'KRW',
          base: 70000,
          last: 71000,
        },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('falls back to /api/v1/new-watchlists when watchlist section has no parsed groups', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === 'https://api.example.test/api/v1/account/list') {
        return jsonResponse({
          result: {
            primaryKey: 'raw-primary-account-key',
            accountList: [{ key: 'raw-primary-account-key', type: '위탁' }],
          },
        });
      }

      if (String(url) === 'https://cert.example.test/api/v2/dashboard/asset/sections/all') {
        return jsonResponse({
          result: {
            sections: [
              {
                type: 'WATCHLIST',
                data: null,
              },
            ],
          },
        });
      }

      expect(String(url)).toBe('https://cert.example.test/api/v1/new-watchlists?includeItemInfo=true');
      return jsonResponse({
        watchlists: [
          {
            id: 111,
            type: 'RECENT_WATCH',
            name: '최근 1주',
          },
          {
            id: 222,
            type: 'USER_MADE',
            name: '내 감시',
            items: [
              {
                id: 1,
                watchlistId: 222,
                code: 'A005930',
                name: '삼성전자',
                stockCode: 'A005930',
                itemType: 'STOCK',
              },
              {
                id: 2,
                watchlistId: 222,
                code: 'US20170510003',
                itemType: 'STOCK',
              },
            ],
          },
        ],
      });
    });
    const client = createTossWatchlistClient({
      sessionStore: makeStore(session()),
      fetchImpl,
      apiBaseUrl: 'https://api.example.test',
      certBaseUrl: 'https://cert.example.test',
      now: () => new Date('2026-05-11T06:45:00.000Z'),
    });

    const result = await client.listWatchlist();

    expect(result).toEqual({
      provider: 'toss',
      fetchedAt: '2026-05-11T06:45:00.000Z',
      groups: [
        {
          ref: 'watchlist-group-1',
          name: '내 감시',
          items: [
            {
              ref: 'watchlist-item-1',
              groupRef: 'watchlist-group-1',
              groupName: '내 감시',
              productCode: 'A005930',
              symbol: 'A005930',
              name: '삼성전자',
              currency: 'KRW',
              base: 0,
              last: 0,
            },
            {
              ref: 'watchlist-item-2',
              groupRef: 'watchlist-group-1',
              groupName: '내 감시',
              productCode: 'US20170510003',
              symbol: 'US20170510003',
              name: '',
              currency: 'USD',
              base: 0,
              last: 0,
            },
          ],
        },
      ],
      items: [
        {
          ref: 'watchlist-item-1',
          groupRef: 'watchlist-group-1',
          groupName: '내 감시',
          productCode: 'A005930',
          symbol: 'A005930',
          name: '삼성전자',
          currency: 'KRW',
          base: 0,
          last: 0,
        },
        {
          ref: 'watchlist-item-2',
          groupRef: 'watchlist-group-1',
          groupName: '내 감시',
          productCode: 'US20170510003',
          symbol: 'US20170510003',
          name: '',
          currency: 'USD',
          base: 0,
          last: 0,
        },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does not call Toss mutation when no session is stored', async () => {
    const fetchImpl = vi.fn();
    const client = createTossWatchlistClient({
      sessionStore: makeStore(null),
      fetchImpl,
    });

    await expect(client.addProductToWatchlist?.({ productCode: 'A005930' }))
      .rejects.toThrow('Toss session is required');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
