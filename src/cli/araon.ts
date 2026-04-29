import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AraonStartedServer } from '../server/app.js';
import { openBrowser } from './browser-open.js';
import { createCliShutdownManager, type CliShutdownManager } from './lifecycle.js';
import { parseAraonCliArgs, resolveCliDataDir } from './options.js';

interface PackageJson {
  version?: string;
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const root = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
  const version = readPackageVersion(root);
  const parsed = parseAraonCliArgs(argv, { version });

  if (parsed.kind === 'help') {
    process.stdout.write(`${parsed.text}\n`);
    return;
  }
  if (parsed.kind === 'version') {
    process.stdout.write(`${parsed.version}\n`);
    return;
  }

  if (parsed.logLevel !== undefined) {
    process.env['LOG_LEVEL'] = parsed.logLevel;
  }
  process.env['NODE_ENV'] = process.env['NODE_ENV'] ?? 'production';
  process.env['ARAON_CLI'] = '1';
  process.env['ARAON_MIGRATIONS_DIR'] = resolve(root, 'src', 'server', 'db', 'migrations');

  const staticDir = resolve(root, 'dist', 'client');
  if (!existsSync(resolve(staticDir, 'index.html'))) {
    throw new Error(`Built client not found at ${staticDir}. Run npm run build before starting araon.`);
  }

  const dataDir = resolveCliDataDir(parsed.dataDir);
  let started: AraonStartedServer | null = null;
  let shutdownManager: CliShutdownManager | null = null;
  const { startAraonServer } = await import('../server/app.js');

  started = await startAraonServer({
    host: parsed.host,
    port: parsed.port,
    dataDir,
    serveStaticClient: true,
    staticDir,
    launcher: {
      enabled: parsed.exitWhenBrowserCloses,
      onInactive: () => {
        void shutdownManager?.shutdown(0);
      },
    },
  });

  shutdownManager = createCliShutdownManager({
    close: async () => {
      if (started !== null) {
        const current = started;
        started = null;
        await current.close();
      }
    },
  });

  process.stdout.write(`Araon is running at ${started.url}\n`);
  process.stdout.write(`Data directory: ${dataDir}\n`);
  process.stdout.write('Press Ctrl+C to stop.\n');

  if (parsed.openBrowser) {
    const result = await openBrowser(started.url);
    if (!result.opened) {
      process.stderr.write(`Could not open a browser automatically. Open this URL manually: ${started.url}\n`);
    }
  }
}

function readPackageVersion(root: string): string {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as PackageJson;
  return pkg.version ?? '0.0.0';
}

function findPackageRoot(startDir: string): string {
  let current = startDir;
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(resolve(current, 'package.json'))) {
      return current;
    }
    current = dirname(current);
  }
  return process.cwd();
}

void main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
