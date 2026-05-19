import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import {
  parsePreReleaseMarketEvidenceReport,
  renderPreReleaseMarketEvidenceSummary,
} from '../../../src/server/soak/pre-release-market-evidence-summary.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    input: { type: 'string' },
    out: { type: 'string' },
  },
});

const inputPath = values.input ?? positionals[0];
if (typeof inputPath !== 'string' || inputPath.length === 0) {
  console.error(
    'Usage: npm run soak:pre-release-market:summary -- <evidence.json> [--out <summary.md>]',
  );
  process.exit(2);
}

const raw = await readFile(inputPath, 'utf8');
const report = parsePreReleaseMarketEvidenceReport(raw);
const markdown = renderPreReleaseMarketEvidenceSummary(inputPath, report);

if (typeof values.out === 'string' && values.out.length > 0) {
  await mkdir(dirname(values.out), { recursive: true });
  await writeFile(values.out, markdown, 'utf8');
}

console.log(markdown);
