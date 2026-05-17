import { describe, expect, it, vi } from 'vitest';

import { runTossSignalCaptureSmoke } from '../toss-signal-capture-smoke.js';
import type { TossSessionSummary } from '../toss-session-store.js';

function sessionSummary(
  overrides: Partial<TossSessionSummary> = {},
): TossSessionSummary {
  return {
    configured: true,
    state: 'persistent',
    provider: 'toss',
    persistent: true,
    cookieCount: 6,
    localStorageKeyCount: 2,
    sessionStorageKeyCount: 0,
    retrievedAt: '2026-05-11T12:00:00.000Z',
    expiresAt: '2026-05-20T12:00:00.000Z',
    serverExpiresAt: null,
    effectiveExpiresAt: '2026-05-20T12:00:00.000Z',
    expiresInMs: 777_600_000,
    ...overrides,
  };
}

describe('Toss signal capture smoke', () => {
  it('requires a usable Toss session before browser-assisted capture', async () => {
    const captureRequestBody = vi.fn();

    const report = await runTossSignalCaptureSmoke({
      sessionStatus: async () => sessionSummary({
        configured: false,
        state: 'logged_out',
        provider: null,
        persistent: false,
        cookieCount: 0,
        localStorageKeyCount: 0,
        retrievedAt: null,
        expiresAt: null,
        effectiveExpiresAt: null,
        expiresInMs: null,
      }),
      captureRequestBody,
    });

    expect(report).toMatchObject({
      provider: 'toss',
      surface: 'overview-signals',
      outcome: 'session_required',
      nextAction: 'login_required',
      targetRouteTemplate: '/stocks/{{productCode}}',
      endpointPath: '/api/v2/dashboard/wts/overview/signals',
      directSignalRequestEnabled: false,
      rawCandidateExposed: false,
      rawTemplateExposed: false,
      templateWritten: false,
      rejectionReason: null,
      observedCandidateEndpointCount: 0,
      observedCandidateEndpoints: [],
    });
    expect(captureRequestBody).not.toHaveBeenCalled();
  });

  it('writes only a sanitized placeholder template after a request body is captured', async () => {
    const writeTemplate = vi.fn(async () => undefined);
    const captureRequestBody = vi.fn(async () =>
      JSON.stringify({
        productCode: 'A005930',
        ticker: '005930',
        stockName: '삼성전자',
        filter: 'RECENT',
      }));

    const report = await runTossSignalCaptureSmoke({
      sessionStatus: async () => sessionSummary(),
      captureRequestBody,
      writeTemplate,
      ticker: '005930',
      name: '삼성전자',
      now: () => new Date('2026-05-11T12:00:00.000Z'),
    });

    expect(report).toMatchObject({
      outcome: 'captured',
      nextAction: 'review_template_file_then_set_env',
      captureMode: 'headful',
      directSignalRequestEnabled: false,
      rawCandidateExposed: false,
      rawTemplateExposed: false,
      templateWritten: true,
      templateBytes: expect.any(Number),
      rejectionReason: null,
      observedCandidateEndpointCount: 0,
      observedCandidateEndpoints: [],
      placeholderCounts: {
        productCode: 1,
        ticker: 1,
        name: 1,
      },
    });
    expect(captureRequestBody).toHaveBeenCalledWith({
      ticker: '005930',
      productCode: 'A005930',
      name: '삼성전자',
      timeoutMs: 60_000,
      endpointPath: '/api/v2/dashboard/wts/overview/signals',
      blockedRoutePathPrefixes: ['/community'],
    });
    expect(writeTemplate).toHaveBeenCalledTimes(1);
    const written = writeTemplate.mock.calls[0]?.[0] ?? '';
    expect(written).toContain('{{productCode}}');
    expect(written).toContain('{{ticker}}');
    expect(written).toContain('{{name}}');
    expect(written).not.toContain('A005930');
    expect(written).not.toContain('SESSION');
    expect(JSON.stringify(report)).not.toContain('삼성전자');
  });

  it('rejects captured bodies that contain sensitive fields without echoing the body', async () => {
    const rawBrowserSessionId = `raw-browser-${'session-id'}`;
    const writeTemplate = vi.fn();
    const report = await runTossSignalCaptureSmoke({
      sessionStatus: async () => sessionSummary(),
      captureRequestBody: async () =>
        JSON.stringify({
          productCode: 'A005930',
          browserSessionId: rawBrowserSessionId,
        }),
      writeTemplate,
    });

    expect(report).toMatchObject({
      outcome: 'rejected',
      nextAction: 'discard_captured_body',
      errorCode: 'TOSS_SIGNAL_CAPTURE_REJECTED',
      rejectionReason: 'sensitive_fields',
      rawCandidateExposed: false,
      rawTemplateExposed: false,
      templateWritten: false,
      observedCandidateEndpointCount: 0,
      observedCandidateEndpoints: [],
    });
    expect(writeTemplate).not.toHaveBeenCalled();
    expect(JSON.stringify(report)).not.toContain(rawBrowserSessionId);
    expect(JSON.stringify(report)).not.toContain('browserSessionId');
  });

  it('reports a bounded timeout when no matching signals request is observed', async () => {
    const report = await runTossSignalCaptureSmoke({
      sessionStatus: async () => sessionSummary(),
      captureRequestBody: async () => null,
      timeoutMs: 45_000,
    });

    expect(report).toMatchObject({
      outcome: 'capture_not_observed',
      nextAction: 'manual_stock_page_interaction_required',
      captureMode: 'headful',
      timeoutMs: 45_000,
      rawCandidateExposed: false,
      rawTemplateExposed: false,
      templateWritten: false,
      rejectionReason: null,
      observedCandidateEndpointCount: 0,
      observedCandidateEndpoints: [],
    });
  });

  it('separates browser capture failure from sensitive-body rejection', async () => {
    const report = await runTossSignalCaptureSmoke({
      sessionStatus: async () => sessionSummary(),
      captureRequestBody: async () => {
        throw new Error('SESSION=raw-browser-state');
      },
    });

    expect(report).toMatchObject({
      outcome: 'failed',
      nextAction: 'inspect_browser_capture_failure',
      errorCode: 'TOSS_SIGNAL_CAPTURE_FAILED',
      rawCandidateExposed: false,
      rawTemplateExposed: false,
      templateWritten: false,
      rejectionReason: null,
      observedCandidateEndpointCount: 0,
      observedCandidateEndpoints: [],
    });
    expect(JSON.stringify(report)).not.toContain('SESSION');
    expect(JSON.stringify(report)).not.toContain('raw-browser-state');
  });

  it('reports template-write failures as capture failures, not body rejection', async () => {
    const report = await runTossSignalCaptureSmoke({
      sessionStatus: async () => sessionSummary(),
      captureRequestBody: async () =>
        JSON.stringify({
          productCode: 'A005930',
          ticker: '005930',
          stockName: '삼성전자',
        }),
      writeTemplate: async () => {
        throw new Error('SESSION=write-target-leak');
      },
    });

    expect(report).toMatchObject({
      outcome: 'failed',
      nextAction: 'inspect_browser_capture_failure',
      errorCode: 'TOSS_SIGNAL_CAPTURE_FAILED',
      rawCandidateExposed: false,
      rawTemplateExposed: false,
      templateWritten: false,
      rejectionReason: null,
      observedCandidateEndpointCount: 0,
      observedCandidateEndpoints: [],
    });
    expect(JSON.stringify(report)).not.toContain('SESSION');
    expect(JSON.stringify(report)).not.toContain('write-target-leak');
  });

  it('reports safe rejection reasons for non-sensitive malformed signal bodies', async () => {
    const noPlaceholders = await runTossSignalCaptureSmoke({
      sessionStatus: async () => sessionSummary(),
      captureRequestBody: async () =>
        JSON.stringify({
          dashboardContext: 'stock-detail',
        }),
    });

    expect(noPlaceholders).toMatchObject({
      outcome: 'rejected',
      errorCode: 'TOSS_SIGNAL_CAPTURE_REJECTED',
      rejectionReason: 'lacks_stock_placeholders',
      rawCandidateExposed: false,
      rawTemplateExposed: false,
    });

    const invalidJson = await runTossSignalCaptureSmoke({
      sessionStatus: async () => sessionSummary(),
      captureRequestBody: async () => '{not-json',
    });

    expect(invalidJson).toMatchObject({
      outcome: 'rejected',
      errorCode: 'TOSS_SIGNAL_CAPTURE_REJECTED',
      rejectionReason: 'invalid_json',
      rawCandidateExposed: false,
      rawTemplateExposed: false,
    });
  });

  it('reports sanitized candidate endpoints when the exact signal POST is not observed', async () => {
    const report = await runTossSignalCaptureSmoke({
      sessionStatus: async () => sessionSummary(),
      captureRequestBody: async () => ({
        rawBody: null,
        candidateEndpoints: [
          {
            method: 'GET',
            host: 'wts-info-api.tossinvest.com',
            path: '/api/v1/dashboard/intelligences/all',
            count: 2,
          },
          {
            method: 'POST',
            host: 'wts-info-api.tossinvest.com',
            path: '/api/v2/dashboard/wts/overview/signals',
            count: 1,
          },
          {
            method: 'GET',
            host: 'wts-info-api.tossinvest.com',
            path: '/api/v2/reasoning-contents/interest',
            count: 1,
          },
        ],
      }),
    });

    expect(report).toMatchObject({
      outcome: 'capture_not_observed',
      observedCandidateEndpointCount: 3,
      observedCandidateEndpoints: [
        {
          method: 'GET',
          host: 'wts-info-api.tossinvest.com',
          path: '/api/v1/dashboard/intelligences/all',
          count: 2,
        },
        {
          method: 'POST',
          host: 'wts-info-api.tossinvest.com',
          path: '/api/v2/dashboard/wts/overview/signals',
          count: 1,
        },
        {
          method: 'GET',
          host: 'wts-info-api.tossinvest.com',
          path: '/api/v2/reasoning-contents/interest',
          count: 1,
        },
      ],
    });
    expect(JSON.stringify(report)).not.toContain('?');
    expect(JSON.stringify(report)).not.toContain('SESSION');
    expect(JSON.stringify(report)).not.toContain('accountNo');
  });

  it('allows the observed Toss intelligences endpoint as a capture target', async () => {
    const captureRequestBody = vi.fn(async () =>
      JSON.stringify({
        productCode: 'A005930',
        stockName: '삼성전자',
        source: 'stock-detail',
      }));

    const report = await runTossSignalCaptureSmoke({
      sessionStatus: async () => sessionSummary(),
      captureRequestBody,
      endpointPath: '/api/v1/dashboard/intelligences/all',
      ticker: '005930',
      name: '삼성전자',
    });

    expect(report).toMatchObject({
      endpointPath: '/api/v1/dashboard/intelligences/all',
      outcome: 'captured',
      rawCandidateExposed: false,
      rawTemplateExposed: false,
    });
    expect(captureRequestBody).toHaveBeenCalledWith({
      ticker: '005930',
      productCode: 'A005930',
      name: '삼성전자',
      timeoutMs: 60_000,
      endpointPath: '/api/v1/dashboard/intelligences/all',
      blockedRoutePathPrefixes: ['/community'],
    });
  });

  it('keeps browser-assisted capture away from Toss community routes', async () => {
    const captureRequestBody = vi.fn(async () => null);

    const report = await runTossSignalCaptureSmoke({
      sessionStatus: async () => sessionSummary(),
      captureRequestBody,
    });

    expect(report).toMatchObject({
      outcome: 'capture_not_observed',
      blockedRoutePathPrefixes: ['/community'],
      rawCandidateExposed: false,
      rawTemplateExposed: false,
    });
    expect(captureRequestBody).toHaveBeenCalledWith(expect.objectContaining({
      blockedRoutePathPrefixes: ['/community'],
    }));
  });

  it('allows static request bodies for the Toss intelligences capture target only', async () => {
    const report = await runTossSignalCaptureSmoke({
      sessionStatus: async () => sessionSummary(),
      captureRequestBody: async () =>
        JSON.stringify({
          dashboardContext: 'stock-detail',
          limit: 20,
        }),
      endpointPath: '/api/v1/dashboard/intelligences/all',
      ticker: '005930',
      name: '삼성전자',
    });

    expect(report).toMatchObject({
      endpointPath: '/api/v1/dashboard/intelligences/all',
      outcome: 'captured',
      placeholderCounts: {
        productCode: 0,
        ticker: 0,
        name: 0,
      },
      rawCandidateExposed: false,
      rawTemplateExposed: false,
    });

    const oldEndpoint = await runTossSignalCaptureSmoke({
      sessionStatus: async () => sessionSummary(),
      captureRequestBody: async () =>
        JSON.stringify({
          dashboardContext: 'stock-detail',
          limit: 20,
        }),
      endpointPath: '/api/v2/dashboard/wts/overview/signals',
      ticker: '005930',
      name: '삼성전자',
    });

    expect(oldEndpoint).toMatchObject({
      endpointPath: '/api/v2/dashboard/wts/overview/signals',
      outcome: 'rejected',
      rejectionReason: 'lacks_stock_placeholders',
    });
  });
});
