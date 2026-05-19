import type { PreReleaseMarketEvidenceReport } from './pre-release-market-evidence.js';

export function parsePreReleaseMarketEvidenceReport(
  raw: string,
): PreReleaseMarketEvidenceReport {
  const json = extractJsonObject(raw);
  return JSON.parse(json) as PreReleaseMarketEvidenceReport;
}

export function renderPreReleaseMarketEvidenceSummary(
  inputPath: string,
  report: PreReleaseMarketEvidenceReport,
): string {
  const criteria = report.completionCriteria ?? [];
  const blockers = report.blockers ?? [];
  return [
    '# Pre-Release Market Evidence Summary',
    '',
    `Source: \`${escapeInline(inputPath)}\``,
    '',
    '## Readiness',
    '',
    `- ok: \`${String(report.ok === true)}\``,
    `- marketEvidenceReady: \`${String(report.marketEvidenceReady === true)}\``,
    `- completionReady: \`${String(report.completionReady === true)}\``,
    `- finalGoalCompletionReady: \`${String(report.finalGoalCompletionReady === true)}\``,
    `- finalGoalRemainingNeed: ${report.finalGoalRemainingNeed ?? 'n/a'}`,
    '',
    '## Window',
    '',
    `- startedAt: \`${report.startedAt ?? 'n/a'}\``,
    `- finishedAt: \`${report.finishedAt ?? 'n/a'}\``,
    `- kstStartedAt: \`${report.marketWindow?.kstStartedAt ?? 'n/a'}\``,
    `- kstFinishedAt: \`${report.marketWindow?.kstFinishedAt ?? 'n/a'}\``,
    `- integratedLiveWindowLikely: \`${String(report.marketWindow?.integratedLiveWindowLikely === true)}\``,
    `- regularMarketLikely: \`${String(report.marketWindow?.regularMarketLikely === true)}\``,
    `- note: ${report.marketWindow?.note ?? 'n/a'}`,
    '',
    '## Runtime Signals',
    '',
    `- targetUrl: \`${report.targetUrl ?? 'n/a'}\``,
    `- intervalMs: \`${report.intervalMs ?? 'n/a'}\``,
    `- sampleCount: \`${report.sampleCount ?? 'n/a'}\``,
    `- selectedTicker: \`${report.selectedTicker ?? 'n/a'}\``,
    `- quoteTickers: \`${(report.quoteTickers ?? []).join(',') || 'n/a'}\``,
    `- sampleCadence: \`ok=${String(report.sampleCadence?.ok === true)}, p95GapMs=${report.sampleCadence?.p95GapMs ?? 'n/a'}, maxGapMs=${report.sampleCadence?.maxGapMs ?? 'n/a'}\``,
    `- latency: \`ok=${String(report.latency?.ok === true)}, p95DurationMs=${report.latency?.p95DurationMs ?? 'n/a'}, maxDurationMs=${report.latency?.maxDurationMs ?? 'n/a'}\``,
    `- fastQuoteLane: \`ok=${String(report.fastQuoteLane?.ok === true)}, running=${String(report.fastQuoteLane?.running === true)}, intervalMs=${report.fastQuoteLane?.minIntervalMs ?? 'n/a'}-${report.fastQuoteLane?.maxIntervalMs ?? 'n/a'}, targetCap=${report.fastQuoteLane?.maxTargetCap ?? 'n/a'}, hardCap=${report.fastQuoteLane?.maxHardCap ?? 'n/a'}, accepted=${report.fastQuoteLane?.maxAcceptedCount ?? 'n/a'}\``,
    '',
    '## Criterion Mapping',
    '',
    '| # | Status | Evidence | Remaining need |',
    '|---:|---|---|---|',
    ...criteria.map(
      (item) =>
        `| ${item.criterion} | ${item.status} | ${escapeCell(item.evidence)} | ${escapeCell(item.remainingNeed ?? 'none')} |`,
    ),
    '',
    '## Blockers',
    '',
    ...(blockers.length > 0 ? blockers.map((item) => `- ${item}`) : ['- none']),
    '',
    '## Browser / Computer Use QA Still Required',
    '',
    '- [ ] 1600x1000 Home: TOP100 rank reorder, recent surge threshold behavior, bottom status bar alignment, no severe update lag.',
    '- [ ] 1440x900 Home: locked 50:50 layout, favorites/recent surge readability, selected chart, agent panel density.',
    '- [ ] Full Chart: expansion-style transition, no scroll regression, current candle/current price progression without refresh.',
    '- [ ] Agent Detail: understandable event/safety state and clearly locked live execution.',
    '- [ ] 900px responsive: account rail collapse/expand, chart, and status bar fit without overflow.',
    '',
  ].join('\n');
}

function extractJsonObject(raw: string): string {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error('Could not find a JSON object in the evidence file.');
  }
  return raw.slice(start, end + 1);
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function escapeInline(value: string): string {
  return value.replaceAll('`', '\\`');
}
