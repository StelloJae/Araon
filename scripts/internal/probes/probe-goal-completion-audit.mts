/**
 * Goal completion audit probe.
 *
 * Purpose:
 * - Read the machine-checkable gate table from the Araon goal completion audit.
 * - Print only gate ids, states, and counts. Never echo audit prose, provider
 *   payloads, session data, account/order ids, or raw secrets.
 * - Keep the persistent goal active unless every parsed gate is pass.
 *
 * Usage:
 *   npx tsx scripts/internal/probes/probe-goal-completion-audit.mts
 *   npx tsx scripts/internal/probes/probe-goal-completion-audit.mts --audit-path=docs/research/toss-primary-agent-platform-completion-audit.md
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { buildGoalCompletionAuditReport } from '../../../src/server/audit/goal-completion-audit.js';

const DEFAULT_AUDIT_PATH = 'docs/research/toss-primary-agent-platform-completion-audit.md';

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

async function main(): Promise<void> {
  const auditPath = resolve(process.cwd(), argValue('audit-path') ?? DEFAULT_AUDIT_PATH);
  const auditMarkdown = await readFile(auditPath, 'utf8');
  const report = buildGoalCompletionAuditReport({ auditMarkdown });

  console.log(JSON.stringify({
    ...report,
    outcome: report.goalComplete ? 'complete' : 'incomplete',
  }, null, 2));
}

main().catch(() => {
  console.error(JSON.stringify({
    provider: 'araon-goal-completion-audit',
    outcome: 'failed',
    errorCode: 'GOAL_COMPLETION_AUDIT_FAILED',
    rawAuditProseExposed: false,
  }));
  process.exitCode = 1;
});
