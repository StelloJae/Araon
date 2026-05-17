import { describe, expect, it, vi } from 'vitest';

import { runTossSignalSmoke } from '../toss-signal-smoke.js';

describe('toss signal smoke', () => {
  it('fails closed without a vetted request body template', async () => {
    const refresh = vi.fn();

    const report = await runTossSignalSmoke({
      requestBodyConfigured: false,
      client: { refresh },
      probe: { ticker: '005930', name: '삼성전자' },
      now: () => new Date('2026-05-12T12:00:00.000Z'),
    });

    expect(report).toEqual({
      provider: 'toss',
      generatedAt: '2026-05-12T12:00:00.000Z',
      outcome: 'template_required',
      contract: {
        bodyContract: 'capture_required',
        externalCallsEnabled: false,
        rawTemplateExposed: false,
      },
      probe: {
        ticker: '005930',
        name: '삼성전자',
      },
      surface: {
        id: 'toss-overview-signals',
        endpointPath: '/api/v2/dashboard/wts/overview/signals',
        status: 'skipped',
        errorCode: 'TOSS_SIGNAL_TEMPLATE_REQUIRED',
      },
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('reports only signal counts when the configured provider succeeds', async () => {
    const refresh = vi.fn(async () => [
      {
        id: 'raw-card-id-1',
        ticker: '005930',
        source: 'toss-overview-signals',
        title: '삼성전자 시그널',
        publishedAt: null,
        firstSeenAt: '2026-05-12T12:00:00.000Z',
        relevance: 0.8,
        confidence: 0.77,
        isNew: true,
      },
    ]);

    const report = await runTossSignalSmoke({
      requestBodyConfigured: true,
      client: { refresh },
      probe: { ticker: '005930', name: '삼성전자' },
      now: () => new Date('2026-05-12T12:00:00.000Z'),
    });

    expect(report).toMatchObject({
      provider: 'toss',
      outcome: 'ok',
      contract: {
        bodyContract: 'configured',
        externalCallsEnabled: true,
        rawTemplateExposed: false,
      },
      surface: {
        id: 'toss-overview-signals',
        endpointPath: '/api/v2/dashboard/wts/overview/signals',
        status: 'ok',
        semanticState: 'non_empty',
        counts: {
          items: 1,
        },
      },
    });
    expect(refresh).toHaveBeenCalledWith({
      ticker: '005930',
      name: '삼성전자',
      now: new Date('2026-05-12T12:00:00.000Z'),
    });
    expect(JSON.stringify(report)).not.toContain('raw-card-id');
    expect(JSON.stringify(report)).not.toContain('삼성전자 시그널');
  });

  it('sanitizes provider failures from the smoke report', async () => {
    const refresh = vi.fn(async () => {
      throw new Error('raw Toss response SESSION=[test-session] accountNo=[test-account]');
    });

    const report = await runTossSignalSmoke({
      requestBodyConfigured: true,
      client: { refresh },
      probe: { ticker: '005930', name: '삼성전자' },
      now: () => new Date('2026-05-12T12:00:00.000Z'),
    });

    expect(report).toMatchObject({
      outcome: 'failed',
      surface: {
        status: 'failed',
        endpointPath: '/api/v2/dashboard/wts/overview/signals',
        errorCode: 'TOSS_SIGNAL_SMOKE_FAILED',
      },
    });
    expect(JSON.stringify(report)).not.toContain('SESSION');
    expect(JSON.stringify(report)).not.toContain('[test-session]');
    expect(JSON.stringify(report)).not.toContain('accountNo');
    expect(JSON.stringify(report)).not.toContain('[test-account]');
  });

  it('reports the configured Toss signal endpoint path', async () => {
    const report = await runTossSignalSmoke({
      requestBodyConfigured: true,
      client: { refresh: async () => [] },
      probe: { ticker: '005930', name: '삼성전자' },
      endpointPath: '/api/v1/dashboard/intelligences/all',
      now: () => new Date('2026-05-12T12:00:00.000Z'),
    });

    expect(report).toMatchObject({
      outcome: 'ok',
      surface: {
        id: 'toss-dashboard-intelligences',
        endpointPath: '/api/v1/dashboard/intelligences/all',
        semanticState: 'supported_empty',
        counts: {
          items: 0,
        },
      },
    });
  });
});
