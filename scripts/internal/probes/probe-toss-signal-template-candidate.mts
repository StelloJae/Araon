/**
 * Toss signal request-body template candidate validator.
 *
 * Purpose:
 * - Validate a DevTools-captured POST body candidate for the Toss overview
 *   signals endpoint.
 * - Replace the selected stock values with placeholders.
 * - Reject candidates containing session, cookie, storage, account, or order
 *   fields.
 * - Print only status/count metadata. The sanitized template is written only
 *   when --write-template-file is provided.
 *
 * Usage:
 *   ARAON_TOSS_SIGNAL_REQUEST_BODY_CANDIDATE='{"productCode":"A005930"}' \
 *     npx tsx scripts/internal/probes/probe-toss-signal-template-candidate.mts \
 *       --ticker=005930 --name=삼성전자 --write-template-file=/tmp/araon-toss-signal-template.json
 *
 * No external Toss request is made by this probe.
 */

import { writeFile } from 'node:fs/promises';

import { createTossSignalRequestBodyTemplateFromCapturedBody } from '../../../src/server/toss/toss-signal-client.js';

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

async function main(): Promise<void> {
  const ticker = argValue('ticker') ?? '005930';
  const name = argValue('name') ?? '삼성전자';
  const writeTemplateFile = argValue('write-template-file');
  const candidate = process.env['ARAON_TOSS_SIGNAL_REQUEST_BODY_CANDIDATE'];

  if (candidate === undefined || candidate.trim().length === 0) {
    console.log(JSON.stringify({
      provider: 'toss',
      surface: 'overview-signals',
      outcome: 'candidate_required',
      externalCallsEnabled: false,
      rawCandidateExposed: false,
      templateWritten: false,
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  try {
    const template = createTossSignalRequestBodyTemplateFromCapturedBody({
      rawBody: candidate,
      ticker,
      name,
    });
    if (writeTemplateFile !== undefined && writeTemplateFile.trim().length > 0) {
      await writeFile(writeTemplateFile, `${template.templateJson}\n`, { mode: 0o600 });
    }

    console.log(JSON.stringify({
      provider: 'toss',
      surface: 'overview-signals',
      outcome: 'ok',
      externalCallsEnabled: false,
      rawCandidateExposed: false,
      rawTemplateExposed: false,
      templateWritten: writeTemplateFile !== undefined,
      templateBytes: template.templateJson.length,
      placeholderCounts: template.placeholderCounts,
    }, null, 2));
  } catch {
    console.log(JSON.stringify({
      provider: 'toss',
      surface: 'overview-signals',
      outcome: 'rejected',
      errorCode: 'TOSS_SIGNAL_TEMPLATE_REJECTED',
      externalCallsEnabled: false,
      rawCandidateExposed: false,
      rawTemplateExposed: false,
      templateWritten: false,
    }, null, 2));
    process.exitCode = 1;
  }
}

main().catch(() => {
  console.error(JSON.stringify({
    provider: 'toss',
    surface: 'overview-signals',
    outcome: 'failed',
    errorCode: 'TOSS_SIGNAL_TEMPLATE_CANDIDATE_PROBE_FAILED',
    externalCallsEnabled: false,
    rawCandidateExposed: false,
    rawTemplateExposed: false,
    templateWritten: false,
  }));
  process.exitCode = 1;
});
