import { describe, expect, it } from 'vitest';

import type { PreReleaseMarketEvidenceReport } from '../pre-release-market-evidence.js';
import {
  parsePreReleaseMarketEvidenceReport,
  renderPreReleaseMarketEvidenceSummary,
} from '../pre-release-market-evidence-summary.js';

describe('pre-release market evidence summary', () => {
  it('parses a saved JSON report', () => {
    const report = parsePreReleaseMarketEvidenceReport(JSON.stringify(baseReport()));

    expect(report.marketEvidenceReady).toBe(false);
    expect(report.finalGoalCompletionReady).toBe(false);
    expect(report.selectedTicker).toBe('005930');
  });

  it('parses npm script output that wraps the JSON report', () => {
    const raw = [
      '> @stellojae/araon@1.1.0 soak:pre-release-market',
      '',
      JSON.stringify(baseReport()),
      '',
    ].join('\n');

    const report = parsePreReleaseMarketEvidenceReport(raw);

    expect(report.marketWindow.kstStartedAt).toBe('2026-05-18 01:00 KST');
  });

  it('renders final goal blockers and Browser QA checklist', () => {
    const markdown = renderPreReleaseMarketEvidenceSummary(
      'docs/archive/evidence.json',
      baseReport({
        completionCriteria: [
          {
            criterion: 12,
            label: 'TOP100',
            status: 'blocked',
            evidence: 'rank|changed',
            remainingNeed: 'market|hours',
          },
        ],
        blockers: ['Evidence window was outside Araon integrated Korean-market live hours.'],
      }),
    );

    expect(markdown).toContain('- marketEvidenceReady: `false`');
    expect(markdown).toContain('- finalGoalCompletionReady: `false`');
    expect(markdown).toContain('browser/Computer Use visual QA');
    expect(markdown).toContain('| 12 | blocked | rank\\|changed | market\\|hours |');
    expect(markdown).toContain('1600x1000 Home');
    expect(markdown).toContain('Evidence window was outside Araon integrated Korean-market live hours.');
  });

  it('throws when no JSON object exists', () => {
    expect(() => parsePreReleaseMarketEvidenceReport('not json')).toThrow(
      'Could not find a JSON object',
    );
  });
});

function baseReport(
  overrides: Partial<PreReleaseMarketEvidenceReport> = {},
): PreReleaseMarketEvidenceReport {
  return {
    ok: true,
    marketEvidenceReady: false,
    completionReady: false,
    finalGoalCompletionReady: false,
    finalGoalRemainingNeed:
      'This report only proves read-only market data evidence. Final Araon goal completion still requires browser/Computer Use visual QA and the written completion audit.',
    evidenceScope: 'read-only-market-data',
    targetUrl: 'http://127.0.0.1:3000',
    startedAt: '2026-05-17T16:00:00.000Z',
    finishedAt: '2026-05-17T16:00:02.000Z',
    durationMs: 2_000,
    intervalMs: 500,
    selectedTicker: '005930',
    quoteTickers: ['005930', '000660'],
    sampleCount: 10,
    endpointSummaries: [],
    top100Cadence: movement(false),
    realtimeRankingCadence: movement(false),
    quoteSampleCadence: movement(false),
    chartProgression: {
      observed: false,
      distinctLastCandles: 1,
      goodSamples: 2,
      newestBucketAt: null,
      latestSampleCount: null,
    },
    sampleCadence: {
      ok: true,
      requestedIntervalMs: 500,
      p95AllowedGapMs: 1_500,
      maxAllowedGapMs: 2_000,
      p95GapMs: 650,
      maxGapMs: 671,
      gapCount: 1,
    },
    fastQuoteLane: {
      ok: true,
      observed: true,
      configured: true,
      running: true,
      sourceOk: true,
      intervalOk: true,
      capOk: true,
      minIntervalMs: 500,
      maxIntervalMs: 500,
      maxTargetCap: 40,
      maxHardCap: 60,
      maxCandidateCount: 20,
      maxRequestedCount: 20,
      maxAcceptedCount: 20,
      goodSamples: 2,
    },
    marketWindow: {
      kstStartedAt: '2026-05-18 01:00 KST',
      kstFinishedAt: '2026-05-18 01:00 KST',
      kstWeekday: true,
      regularMarketLikely: false,
      integratedLiveWindowLikely: false,
      note: 'Outside Araon integrated Korean-market live window by KST weekday/time heuristic.',
    },
    latency: {
      ok: true,
      p95DurationMs: 30,
      maxDurationMs: 40,
    },
    marketHoursUseful: false,
    completionCriteria: [],
    issues: [],
    blockers: [],
    ...overrides,
  };
}

function movement(observed: boolean) {
  return {
    observed,
    rankOrderObserved: observed,
    valueMovementObserved: observed,
    distinctRankOrders: observed ? 2 : 1,
    distinctValueStates: observed ? 2 : 1,
    goodSamples: 2,
  };
}
