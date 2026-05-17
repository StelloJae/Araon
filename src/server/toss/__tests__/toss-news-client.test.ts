import { describe, expect, it, vi } from 'vitest';

import {
  createSessionGatedTossNewsService,
  createTossNewsClient,
  parseTossAssetNewsItems,
} from '../toss-news-client.js';
import {
  summarizeTossSession,
  type TossSession,
  type TossSessionStore,
} from '../toss-session-store.js';

function session(): TossSession {
  return {
    provider: 'toss',
    cookies: {
      SESSION: 'redacted-session',
      UTK: 'redacted-utk',
    },
    localStorage: {},
    sessionStorage: {},
    retrievedAt: '2026-05-11T00:00:00.000Z',
    expiresAt: null,
    serverExpiresAt: null,
    persistent: true,
  };
}

function makeStore(value: TossSession | null): TossSessionStore {
  return {
    async load() {
      return value;
    },
    async save() {},
    async clear() {},
    async status() {
      return summarizeTossSession(value, new Date('2026-05-11T06:00:20.000Z'));
    },
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('toss news client', () => {
  it('parses matching Toss asset news cards without exposing raw provider identifiers', () => {
    const items = parseTossAssetNewsItems({
      raw: {
        result: {
          sections: [
            {
              type: 'HEADLINE_NEWS',
              data: {
                totalNews: [
                  {
                    newsId: 'raw-provider-news-id-1',
                    title: '삼성전자 AI 반도체 수급 개선 기대',
                    agencyName: '테스트경제',
                    newsType: 'hot_news',
                    createdAt: '2026-05-11T06:00:00Z',
                    imageUrl: 'https://static.tossinvestcdn.com/raw-image.png',
                    relatedStocks: [],
                  },
                  {
                    newsId: 'raw-provider-news-id-2',
                    title: '다른 종목의 배터리 뉴스',
                    agencyName: '테스트경제',
                    newsType: 'cluster_popular',
                    createdAt: '2026-05-11T06:01:00Z',
                    relatedStocks: [],
                  },
                ],
              },
            },
          ],
        },
      },
      ticker: '005930',
      name: '삼성전자',
      firstSeenAt: '2026-05-11T06:00:20.000Z',
    });

    expect(items).toEqual([
      {
        id: expect.stringMatching(/^toss-news:[a-f0-9]{16}$/),
        ticker: '005930',
        source: 'toss-asset-news',
        sectionType: 'HEADLINE_NEWS',
        title: '삼성전자 AI 반도체 수급 개선 기대',
        agencyName: '테스트경제',
        newsType: 'hot_news',
        publishedAt: '2026-05-11T06:00:00.000Z',
        firstSeenAt: '2026-05-11T06:00:20.000Z',
        relevance: 0.72,
        confidence: 0.7,
        isNew: true,
      },
    ]);
    expect(JSON.stringify(items)).not.toContain('raw-provider-news-id');
    expect(JSON.stringify(items)).not.toContain('raw-image.png');
  });

  it('matches related stocks and dedupes repeated cards across Toss news arrays', () => {
    const items = parseTossAssetNewsItems({
      raw: {
        result: {
          sections: [
            {
              type: 'PERSONAL_NEWS',
              data: {
                news: [
                  {
                    newsId: 'raw-provider-news-id-3',
                    title: 'AI 서버 투자 확대',
                    agencyName: '테스트뉴스',
                    newsType: 'company_ctr',
                    createdAt: '2026-05-11T06:00:00Z',
                    relatedStocks: [
                      {
                        stockCode: 'A000660',
                        name: 'SK하이닉스',
                        fluctuation: 1.2,
                      },
                    ],
                  },
                ],
                totalNews: [
                  {
                    newsId: 'raw-provider-news-id-3',
                    title: 'AI 서버 투자 확대',
                    agencyName: '테스트뉴스',
                    newsType: 'company_ctr',
                    createdAt: '2026-05-11T06:00:00Z',
                    relatedStocks: [
                      {
                        stockCode: 'A000660',
                        name: 'SK하이닉스',
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },
      ticker: '000660',
      name: 'SK하이닉스',
      firstSeenAt: '2026-05-11T06:00:20.000Z',
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      ticker: '000660',
      sectionType: 'PERSONAL_NEWS',
      title: 'AI 서버 투자 확대',
      agencyName: '테스트뉴스',
      newsType: 'company_ctr',
      relevance: 0.82,
      confidence: 0.78,
    });
    expect(JSON.stringify(items)).not.toContain('raw-provider-news-id');
    expect(JSON.stringify(items)).not.toContain('fluctuation');
  });

  it('fetches authenticated asset sections and returns sanitized relevant Toss news', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://cert.example.test/api/v2/dashboard/asset/sections/all');
      expect(init?.method).toBe('POST');
      expect(String(init?.body)).toBe('{}');
      const cookie = new Headers(init?.headers).get('Cookie') ?? '';
      expect(cookie).toContain(`${'SESSION'}=redacted-session`);

      return jsonResponse({
        result: {
          sections: [
            {
              type: 'NEWS',
              data: {
                news: [
                  {
                    newsId: 'raw-provider-news-id-4',
                    title: '삼성전자 신규 HBM 투자',
                    agencyName: '테스트신문',
                    newsType: 'company_ctr',
                    createdAt: '2026-05-11T06:00:00Z',
                    imageUrl: 'https://static.tossinvestcdn.com/raw-image.png',
                    relatedStocks: [],
                  },
                ],
              },
            },
          ],
        },
      });
    });
    const client = createTossNewsClient({
      sessionStore: makeStore(session()),
      fetchImpl,
      certBaseUrl: 'https://cert.example.test',
    });

    const items = await client.refresh({
      ticker: '005930',
      name: '삼성전자',
      now: new Date('2026-05-11T06:00:20.000Z'),
    });

    expect(items).toEqual([
      expect.objectContaining({
        ticker: '005930',
        source: 'toss-asset-news',
        title: '삼성전자 신규 HBM 투자',
        firstSeenAt: '2026-05-11T06:00:20.000Z',
      }),
    ]);
    expect(JSON.stringify(items)).not.toContain('raw-provider-news-id');
    expect(JSON.stringify(items)).not.toContain('redacted-session');
  });

  it('fails closed without a Toss session', async () => {
    const fetchImpl = vi.fn();
    const client = createTossNewsClient({
      sessionStore: makeStore(null),
      fetchImpl,
    });

    await expect(client.refresh({
      ticker: '005930',
      name: '삼성전자',
      now: new Date('2026-05-11T06:00:20.000Z'),
    })).rejects.toThrow('Toss session is required');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('wraps Toss asset news behind the session gate for no-login monitor runs', async () => {
    const client = { refresh: vi.fn(async () => []) };
    const service = createSessionGatedTossNewsService({
      sessionStore: makeStore(null),
      client,
    });

    await expect(service.refresh({
      ticker: '005930',
      name: '삼성전자',
      now: new Date('2026-05-11T06:00:20.000Z'),
    })).resolves.toEqual([]);
    expect(client.refresh).not.toHaveBeenCalled();
  });

  it('does not call Toss asset news when the stored session is expired', async () => {
    const expiredSession = {
      ...session(),
      serverExpiresAt: '2026-05-10T00:00:00.000Z',
    };
    const client = { refresh: vi.fn(async () => []) };
    const service = createSessionGatedTossNewsService({
      sessionStore: makeStore(expiredSession),
      client,
    });

    await expect(service.refresh({
      ticker: '005930',
      name: '삼성전자',
      now: new Date('2026-05-11T06:00:20.000Z'),
    })).resolves.toEqual([]);
    expect(client.refresh).not.toHaveBeenCalled();
  });

  it('delegates Toss asset news refresh after a session is configured', async () => {
    const items = [
      {
        id: 'toss-news:local-hashed-id',
        ticker: '005930',
        source: 'toss-asset-news' as const,
        sectionType: 'NEWS',
        title: '삼성전자 신규 HBM 투자',
        agencyName: '테스트신문',
        newsType: 'company_ctr',
        publishedAt: '2026-05-11T06:00:00.000Z',
        firstSeenAt: '2026-05-11T06:00:20.000Z',
        relevance: 0.82,
        confidence: 0.78,
        isNew: true as const,
      },
    ];
    const input = {
      ticker: '005930',
      name: '삼성전자',
      now: new Date('2026-05-11T06:00:20.000Z'),
    };
    const client = { refresh: vi.fn(async () => items) };
    const service = createSessionGatedTossNewsService({
      sessionStore: makeStore(session()),
      client,
    });

    await expect(service.refresh(input)).resolves.toEqual(items);
    expect(client.refresh).toHaveBeenCalledWith(input);
  });
});
