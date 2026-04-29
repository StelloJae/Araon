import { chmod } from 'node:fs/promises';
import { build } from 'esbuild';

const outfile = 'dist/cli/araon.js';

await build({
  entryPoints: ['src/cli/araon.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  sourcemap: true,
  banner: {
    js: [
      '#!/usr/bin/env node',
      'import { createRequire as __araonCreateRequire } from "node:module";',
      'const require = __araonCreateRequire(import.meta.url);',
    ].join('\n'),
  },
  external: [
    'better-sqlite3',
  ],
});

await chmod(outfile, 0o755);
