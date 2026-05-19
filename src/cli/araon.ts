import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AraonStartedServer } from '../server/app.js';
import { openBrowser } from './browser-open.js';
import { createDoctorReport, formatDoctorReport } from './doctor.js';
import { createCliShutdownManager, type CliShutdownManager } from './lifecycle.js';
import { clearLauncherState, writeLauncherState } from './launcher-state.js';
import { parseAraonCliArgs, resolveCliDataDir } from './options.js';
import { resetAraonData, resetTossSession } from './reset.js';
import { createStatusReport, formatStatusReport } from './status.js';

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

  const dataDir = resolveCliDataDir(parsed.dataDir);

  if (parsed.kind === 'doctor') {
    const report = await createDoctorReport({ root, dataDir, version });
    process.stdout.write(parsed.json ? `${JSON.stringify(report, null, 2)}\n` : formatDoctorReport(report));
    if (!report.summary.ok) process.exitCode = 1;
    return;
  }

  if (parsed.kind === 'status') {
    const report = await createStatusReport({ dataDir });
    process.stdout.write(parsed.json ? `${JSON.stringify(report, null, 2)}\n` : formatStatusReport(report));
    if (report.url !== undefined && !report.running) process.exitCode = 1;
    return;
  }

  if (parsed.kind === 'open') {
    await openRunningAraon(dataDir);
    return;
  }

  if (parsed.kind === 'reset') {
    if (parsed.target === 'session') {
      await resetTossSession(dataDir);
      process.stdout.write(`Toss session reset. Other Araon data kept.\n`);
      return;
    }
    await resetAraonData(dataDir, parsed.confirm);
    process.stdout.write(`Araon local data reset: ${dataDir}\n`);
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
      await clearLauncherState(dataDir);
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

  await writeLauncherState(dataDir, {
    url: started.url,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    version,
  });

  if (parsed.openBrowser) {
    const result = await openBrowser(started.url);
    if (!result.opened) {
      process.stderr.write(`Could not open a browser automatically. Open this URL manually: ${started.url}\n`);
    }
  }
}

async function openRunningAraon(dataDir: string): Promise<void> {
  const report = await createStatusReport({ dataDir });
  if (report.url === undefined) {
    throw new Error('Araon is not running. Start it with `araon` first.');
  }
  if (!report.processAlive) {
    throw new Error('Araon launcher state is stale. Start it again with `araon`.');
  }

  const result = await openBrowser(report.url);
  if (!result.opened) {
    throw new Error(`Could not open a browser automatically. Open this URL manually: ${report.url}`);
  }
  process.stdout.write(`Opened Araon: ${report.url}\n`);
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
