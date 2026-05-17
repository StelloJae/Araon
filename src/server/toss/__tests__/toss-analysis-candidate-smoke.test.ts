import { describe, expect, it, vi } from 'vitest';

import {
  formatTossAnalysisCandidateSmokeReport,
  runTossAnalysisCandidateSmoke,
  tossAnalysisHostTargetsForArg,
} from '../toss-analysis-candidate-smoke.js';

describe('toss analysis candidate smoke', () => {
  it('queries both known Toss hosts and succeeds when one host works per ticker', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('https://wts-cert-api.tossinvest.com/')) {
        return Response.json({
          result: {
            cards: [{ data: { intelligence: { title: 'raw title must not leak' } } }],
          },
        });
      }
      return Response.json({ raw: 'raw failure payload must not leak' }, { status: 404 });
    });

    const report = await runTossAnalysisCandidateSmoke({
      fetcher,
      sessionCookies: { SESSION: 'raw-session-must-not-leak' },
      tickers: ['005930', '000660'],
    });

    expect(report).toMatchObject({
      provider: 'toss',
      surface: 'trading-analysis-product-code',
      outcome: 'ok',
      externalCallsEnabled: true,
      rawPayloadExposed: false,
      rawSessionExposed: false,
      summary: {
        hostCount: 2,
        sampleCount: 4,
        okSampleCount: 2,
        tickerWithOkCount: 2,
        nonNullResultSampleCount: 2,
        tickerWithNonNullResultCount: 2,
        resultTypeCounts: {
          missing: 2,
          object: 2,
        },
      },
    });
    expect(report.samples.map((sample) => `${sample.ticker}:${sample.host}`)).toEqual([
      '005930:info',
      '005930:cert',
      '000660:info',
      '000660:cert',
    ]);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(report)).not.toContain('raw title');
    expect(JSON.stringify(report)).not.toContain('raw failure payload');
    expect(JSON.stringify(report)).not.toContain('raw-session');
  });

  it('fails when no host succeeds for a ticker', async () => {
    const report = await runTossAnalysisCandidateSmoke({
      fetcher: vi.fn(async () => Response.json({}, { status: 404 })),
      sessionCookies: { SESSION: 'raw-session-must-not-leak' },
      tickers: ['005930'],
    });

    expect(report).toMatchObject({
      outcome: 'failed',
      summary: {
        tickerWithOkCount: 0,
        nonNullResultSampleCount: 0,
        tickerWithNonNullResultCount: 0,
        resultTypeCounts: {
          missing: 2,
        },
      },
    });
  });

  it('parses a host subset without allowing unknown host labels', () => {
    expect(tossAnalysisHostTargetsForArg('cert')).toEqual([
      {
        id: 'cert',
        baseUrl: 'https://wts-cert-api.tossinvest.com',
        hostname: 'wts-cert-api.tossinvest.com',
      },
    ]);
    expect(tossAnalysisHostTargetsForArg('unknown')).toHaveLength(2);
  });

  it('can format aggregate-only output for wider sweeps without ticker samples', async () => {
    const report = await runTossAnalysisCandidateSmoke({
      fetcher: vi.fn(async () => Response.json({ result: null })),
      sessionCookies: { SESSION: 'raw-session-must-not-leak' },
      tickers: ['005930'],
    });

    expect(formatTossAnalysisCandidateSmokeReport(report, { summaryOnly: true })).toEqual({
      ...report,
      samples: [],
    });
    expect(formatTossAnalysisCandidateSmokeReport(report, { summaryOnly: false })).toBe(report);
  });
});
