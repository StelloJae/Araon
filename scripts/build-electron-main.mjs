import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('dist/electron', { recursive: true });

await build({
  entryPoints: ['electron/main.ts'],
  outfile: 'dist/electron/main.cjs',
  bundle: true,
  platform: 'node',
  target: ['node20'],
  format: 'cjs',
  sourcemap: true,
  tsconfig: 'tsconfig.json',
  external: [
    'better-sqlite3',
    'electron',
  ],
  logLevel: 'info',
});
