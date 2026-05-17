/**
 * Toss trading-analysis candidate smoke.
 *
 * Purpose:
 * - Validate the DevTools-observed trading analysis candidate endpoint shape.
 * - Use the persisted Toss session, like the browser path.
 * - Print only HTTP status and structural metadata. No raw payload/session data.
 *
 * Usage:
 *   npx tsx scripts/internal/probes/probe-toss-analysis-candidate-smoke.mts
 *   npx tsx scripts/internal/probes/probe-toss-analysis-candidate-smoke.mts --tickers=005930,000660,254120
 *   npx tsx scripts/internal/probes/probe-toss-analysis-candidate-smoke.mts --hosts=info,cert
 */

import { createFileTossSessionStore } from '../../../src/server/toss/toss-session-store.js';
import {
  formatTossAnalysisCandidateSmokeReport,
  runTossAnalysisCandidateSmoke,
  tossAnalysisHostTargetsForArg,
  tossAnalysisTickersForArg,
} from '../../../src/server/toss/toss-analysis-candidate-smoke.js';

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

function booleanArg(name: string): boolean {
  if (process.argv.includes(`--${name}`)) return true;
  const raw = argValue(name);
  return raw === 'true' || raw === '1';
}

async function main(): Promise<void> {
  const session = await createFileTossSessionStore().load();
  if (session === null) {
    console.log(JSON.stringify({
      provider: 'toss',
      surface: 'trading-analysis-product-code',
      outcome: 'session_required',
      externalCallsEnabled: false,
      rawPayloadExposed: false,
      rawSessionExposed: false,
      samples: [],
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  const report = await runTossAnalysisCandidateSmoke({
    sessionCookies: session.cookies,
    tickers: tossAnalysisTickersForArg(argValue('tickers')),
    hosts: tossAnalysisHostTargetsForArg(argValue('hosts')),
  });
  console.log(JSON.stringify(
    formatTossAnalysisCandidateSmokeReport(report, {
      summaryOnly: booleanArg('summary-only'),
    }),
    null,
    2,
  ));
  if (report.outcome !== 'ok') process.exitCode = 1;
}

main().catch(() => {
  console.error(JSON.stringify({
    provider: 'toss',
    surface: 'trading-analysis-product-code',
    outcome: 'failed',
    errorCode: 'TOSS_ANALYSIS_CANDIDATE_SMOKE_FAILED',
    externalCallsEnabled: true,
    rawPayloadExposed: false,
    rawSessionExposed: false,
  }));
  process.exitCode = 1;
});
