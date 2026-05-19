/**
 * Araon pre-release product 100 audit probe.
 *
 * Purpose:
 * - Read the 42-row criteria matrix from
 *   docs/research/araon-pre-release-product-100-progress-audit.md.
 * - Print only criterion numbers, states, and counts.
 * - Keep the persistent goal active unless all 42 criteria are PASS.
 *
 * Usage:
 *   npx tsx scripts/internal/probes/probe-pre-release-product-100-audit.mts
 *   npx tsx scripts/internal/probes/probe-pre-release-product-100-audit.mts --audit-path=docs/research/araon-pre-release-product-100-progress-audit.md
 *   npx tsx scripts/internal/probes/probe-pre-release-product-100-audit.mts --require-complete
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { buildPreReleaseProduct100AuditReport } from '../../../src/server/audit/pre-release-product-100-audit.js';

const DEFAULT_AUDIT_PATH = 'docs/research/araon-pre-release-product-100-progress-audit.md';

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const auditPath = resolve(process.cwd(), argValue('audit-path') ?? DEFAULT_AUDIT_PATH);
  const auditMarkdown = await readFile(auditPath, 'utf8');
  const report = buildPreReleaseProduct100AuditReport({ auditMarkdown });
  const outcome = report.goalComplete ? 'complete' : 'incomplete';

  console.log(JSON.stringify({
    ...report,
    outcome,
  }, null, 2));

  if (hasFlag('require-complete') && !report.goalComplete) {
    process.exitCode = 1;
  }
}

main().catch(() => {
  console.error(JSON.stringify({
    provider: 'araon-pre-release-product-100-audit',
    outcome: 'failed',
    errorCode: 'PRE_RELEASE_PRODUCT_100_AUDIT_FAILED',
    rawAuditProseExposed: false,
  }));
  process.exitCode = 1;
});
