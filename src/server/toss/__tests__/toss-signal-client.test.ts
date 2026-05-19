import { describe, expect, it, vi } from 'vitest';

import {
  createTossSignalClient,
  createTossSignalRequestBodyTemplateFromCapturedBody,
  createTossSignalRequestBodyTemplate,
} from '../toss-signal-client.js';
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

describe('toss signal client', () => {
  it('creates a request body factory from a captured JSON template', () => {
    const requestBody = createTossSignalRequestBodyTemplate(JSON.stringify({
      productCode: '{{productCode}}',
      ticker: '{{ticker}}',
      context: {
        displayName: '{{name}}',
        fixed: 'stock-detail',
      },
    }));

    expect(requestBody?.({
      ticker: '005930',
      productCode: 'A005930',
      name: '삼성전자',
    })).toEqual({
      productCode: 'A005930',
      ticker: '005930',
      context: {
        displayName: '삼성전자',
        fixed: 'stock-detail',
      },
    });
    expect(createTossSignalRequestBodyTemplate(undefined)).toBeUndefined();
    expect(() => createTossSignalRequestBodyTemplate('not-json')).toThrow(
      'Invalid Toss signal request body template',
    );
  });

  it('rejects captured request body templates that contain sensitive Toss fields', () => {
    expect(() => createTossSignalRequestBodyTemplate(JSON.stringify({
      productCode: '{{productCode}}',
      browserSessionId: 'raw-browser-session-id',
    }))).toThrow('Toss signal request body template contains sensitive fields');

    expect(() => createTossSignalRequestBodyTemplate(JSON.stringify({
      productCode: '{{productCode}}',
      nested: {
        cookie: `${['SESSION', ['raw', 'session'].join('-')].join('=')}; ${['UTK', 'raw-utk'].join('=')}`,
      },
    }))).toThrow('Toss signal request body template contains sensitive fields');
  });

  it('converts a captured Toss signal request body into a placeholder template', () => {
    const result = createTossSignalRequestBodyTemplateFromCapturedBody({
      rawBody: JSON.stringify({
        productCode: 'A005930',
        ticker: '005930',
        context: {
          displayName: '삼성전자',
          landingPath: '/stocks/A005930',
        },
      }),
      ticker: '005930',
      name: '삼성전자',
    });

    expect(JSON.parse(result.templateJson)).toEqual({
      productCode: '{{productCode}}',
      ticker: '{{ticker}}',
      context: {
        displayName: '{{name}}',
        landingPath: '/stocks/{{productCode}}',
      },
    });
    expect(result.placeholderCounts).toEqual({
      productCode: 2,
      ticker: 1,
      name: 1,
    });

    const requestBody = createTossSignalRequestBodyTemplate(result.templateJson);
    expect(requestBody?.({
      ticker: '000660',
      productCode: 'A000660',
      name: 'SK하이닉스',
    })).toEqual({
      productCode: 'A000660',
      ticker: '000660',
      context: {
        displayName: 'SK하이닉스',
        landingPath: '/stocks/A000660',
      },
    });
  });

  it('rejects captured Toss signal request bodies that are unsafe or do not target the stock', () => {
    expect(() => createTossSignalRequestBodyTemplateFromCapturedBody({
      rawBody: '{not-json',
      ticker: '005930',
      name: '삼성전자',
    })).toThrow('Invalid Toss signal request body candidate');

    expect(() => createTossSignalRequestBodyTemplateFromCapturedBody({
      rawBody: JSON.stringify({
        productCode: 'A005930',
        cookie: `${['SESSION', 'raw-session'].join('=')}`,
      }),
      ticker: '005930',
      name: '삼성전자',
    })).toThrow('Toss signal request body template contains sensitive fields');

    expect(() => createTossSignalRequestBodyTemplateFromCapturedBody({
      rawBody: JSON.stringify({
        dashboardContext: 'stock-detail',
      }),
      ticker: '005930',
      name: '삼성전자',
    })).toThrow('Toss signal request body template lacks stock placeholders');
  });

  it('allows a sanitized static request body only when the caller opts in', () => {
    const result = createTossSignalRequestBodyTemplateFromCapturedBody({
      rawBody: JSON.stringify({
        dashboardContext: 'stock-detail',
        limit: 20,
      }),
      ticker: '005930',
      name: '삼성전자',
      allowStaticBody: true,
    });

    expect(JSON.parse(result.templateJson)).toEqual({
      dashboardContext: 'stock-detail',
      limit: 20,
    });
    expect(result.placeholderCounts).toEqual({
      productCode: 0,
      ticker: 0,
      name: 0,
    });

    const requestBody = createTossSignalRequestBodyTemplate(result.templateJson);
    expect(requestBody?.({
      ticker: '000660',
      productCode: 'A000660',
      name: 'SK하이닉스',
    })).toEqual({
      dashboardContext: 'stock-detail',
      limit: 20,
    });
  });

  it('keeps sensitive fields rejected even when static request bodies are allowed', () => {
    expect(() => createTossSignalRequestBodyTemplateFromCapturedBody({
      rawBody: JSON.stringify({
        dashboardContext: 'stock-detail',
        browserSessionId: 'raw-browser-session-id',
      }),
      ticker: '005930',
      name: '삼성전자',
      allowStaticBody: true,
    })).toThrow('Toss signal request body template contains sensitive fields');
  });

  it('posts a captured request body and normalizes signal cards without exposing raw provider ids', async () => {
    const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('https://wts-info-api.tossinvest.com/api/v2/dashboard/wts/overview/signals');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({
        productCode: 'A005930',
        dashboardContext: 'stock-detail',
      });

      return jsonResponse({
        result: {
          signals: [
            {
              id: 'raw-card-provider-id-1',
              productCode: 'A005930',
              title: '토스증권 AI가 찾은 반도체 수급 시그널',
              publishedAt: '2026-05-11T06:00:00.000Z',
              relevance: 0.84,
              confidence: 0.78,
            },
            {
              id: 'raw-card-provider-id-2',
              productCode: 'A000660',
              title: '다른 종목 시그널',
            },
            {
              id: 'raw-card-provider-id-3',
              productCode: 'A005930',
            },
          ],
        },
      });
    });
    const client = createTossSignalClient({
      fetchFn,
      now: () => new Date('2026-05-11T06:00:15.000Z'),
      requestBody: ({ productCode }) => ({
        productCode,
        dashboardContext: 'stock-detail',
      }),
    });

    const result = await client.refresh({
      ticker: '005930',
      name: '삼성전자',
      now: new Date('2026-05-11T06:00:15.000Z'),
    });

    expect(result).toEqual([
      {
        id: expect.stringMatching(/^toss-signal:[a-f0-9]{16}$/),
        ticker: '005930',
        source: 'toss-overview-signals',
        title: '토스증권 AI가 찾은 반도체 수급 시그널',
        publishedAt: '2026-05-11T06:00:00.000Z',
        firstSeenAt: '2026-05-11T06:00:15.000Z',
        relevance: 0.84,
        confidence: 0.78,
        isNew: true,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('raw-card-provider-id');
  });

  it('posts the observed intelligences endpoint with a Toss session cookie', async () => {
    const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('https://wts-info-api.tossinvest.com/api/v1/dashboard/intelligences/all');
      expect(init?.method).toBe('POST');
      const headers = init?.headers as Headers;
      expect(headers.get('Cookie')).toContain('SESSION=redacted-session');
      expect(headers.get('Cookie')).toContain('UTK=redacted-utk');
      expect(JSON.parse(String(init?.body))).toEqual({
        dashboardContext: 'stock-detail',
        limit: 20,
      });

      return jsonResponse({
        result: {
          intelligences: [
            {
              type: 'stock',
              data: {
                intelligence: {
                  intelligenceId: 'raw-intelligence-id-1',
                  productCode: 'A005930',
                  title: '토스 AI가 찾은 반도체 수급 변화',
                  issuedAt: '2026-05-11T06:00:00.000Z',
                },
                position: 'top',
              },
            },
            {
              type: 'stock',
              data: {
                intelligence: null,
                position: 'bottom',
              },
            },
          ],
        },
      });
    });
    const client = createTossSignalClient({
      fetchFn,
      sessionStore: makeStore(session()),
      endpointPath: '/api/v1/dashboard/intelligences/all',
      requestBody: () => ({
        dashboardContext: 'stock-detail',
        limit: 20,
      }),
    });

    const result = await client.refresh({
      ticker: '005930',
      name: '삼성전자',
      now: new Date('2026-05-11T06:00:15.000Z'),
    });

    expect(result).toEqual([
      {
        id: expect.stringMatching(/^toss-signal:[a-f0-9]{16}$/),
        ticker: '005930',
        source: 'toss-dashboard-intelligences',
        title: '토스 AI가 찾은 반도체 수급 변화',
        publishedAt: '2026-05-11T06:00:00.000Z',
        firstSeenAt: '2026-05-11T06:00:15.000Z',
        relevance: null,
        confidence: 0.65,
        isNew: true,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('raw-intelligence-id');
  });

  it('normalizes nested Toss intelligence containers without exposing raw ids', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({
      result: {
        data: {
          intelligences: [
            {
              data: {
                intelligence: {
                  intelligenceId: 'raw-nested-intelligence-id',
                  productCode: 'A005930',
                  summary: '토스 AI가 찾은 공급망 변화',
                  basedAt: '2026-05-11T06:03:00.000Z',
                  confidenceScore: '0.72',
                },
              },
            },
          ],
        },
      },
    }));
    const client = createTossSignalClient({
      fetchFn,
      sessionStore: makeStore(session()),
      endpointPath: '/api/v1/dashboard/intelligences/all',
      requestBody: () => ({
        dashboardContext: 'stock-detail',
        limit: 20,
      }),
    });

    const result = await client.refresh({
      ticker: '005930',
      name: '삼성전자',
      now: new Date('2026-05-11T06:03:15.000Z'),
    });

    expect(result).toEqual([
      {
        id: expect.stringMatching(/^toss-signal:[a-f0-9]{16}$/),
        ticker: '005930',
        source: 'toss-dashboard-intelligences',
        title: '토스 AI가 찾은 공급망 변화',
        publishedAt: '2026-05-11T06:03:00.000Z',
        firstSeenAt: '2026-05-11T06:03:15.000Z',
        relevance: null,
        confidence: 0.72,
        isNew: true,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('raw-nested-intelligence-id');
  });

  it('normalizes section card containers from dashboard signal responses', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({
      result: {
        sections: [
          {
            title: 'ignored section title',
            cards: [
              {
                cardId: 'raw-section-card-id',
                stockCode: 'A005930',
                message: '토스가 감지한 수급 급변',
                updatedAt: '2026-05-11T06:04:00.000Z',
                weight: '0.88',
              },
            ],
          },
        ],
      },
    }));
    const client = createTossSignalClient({
      fetchFn,
      requestBody: ({ productCode }) => ({
        productCode,
        dashboardContext: 'stock-detail',
      }),
    });

    const result = await client.refresh({
      ticker: '005930',
      name: '삼성전자',
      now: new Date('2026-05-11T06:04:15.000Z'),
    });

    expect(result).toEqual([
      {
        id: expect.stringMatching(/^toss-signal:[a-f0-9]{16}$/),
        ticker: '005930',
        source: 'toss-overview-signals',
        title: '토스가 감지한 수급 급변',
        publishedAt: '2026-05-11T06:04:00.000Z',
        firstSeenAt: '2026-05-11T06:04:15.000Z',
        relevance: 0.88,
        confidence: 0.65,
        isNew: true,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('raw-section-card-id');
  });

  it('fails closed on the intelligences endpoint without a Toss session', async () => {
    const fetchFn = vi.fn();
    const client = createTossSignalClient({
      fetchFn,
      sessionStore: makeStore(null),
      endpointPath: '/api/v1/dashboard/intelligences/all',
      requestBody: () => ({ dashboardContext: 'stock-detail' }),
    });

    await expect(client.refresh({
      ticker: '005930',
      name: '삼성전자',
      now: new Date('2026-05-11T06:00:15.000Z'),
    })).rejects.toThrow('Toss signal session is required');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fails closed until the Toss signal request body contract is provided', async () => {
    const fetchFn = vi.fn();
    const client = createTossSignalClient({ fetchFn });

    await expect(client.refresh({
      ticker: '005930',
      name: '삼성전자',
      now: new Date('2026-05-11T06:00:15.000Z'),
    })).rejects.toThrow('Toss signal request body contract is not configured');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
