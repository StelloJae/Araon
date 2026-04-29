import { homedir, platform as osPlatform } from 'node:os';
import { join } from 'node:path';

export type AraonLogLevel = 'debug' | 'info' | 'warn';

export interface AraonCliRunOptions {
  kind: 'run';
  host: string;
  port: number;
  openBrowser: boolean;
  exitWhenBrowserCloses: boolean;
  logLevel: AraonLogLevel | undefined;
  dataDir: string | undefined;
}

export interface AraonCliHelp {
  kind: 'help';
  text: string;
}

export interface AraonCliVersion {
  kind: 'version';
  version: string;
}

export type AraonCliOptions = AraonCliRunOptions | AraonCliHelp | AraonCliVersion;

interface ParseContext {
  version: string;
}

interface DataDirContext {
  platform: NodeJS.Platform;
  homeDir: string;
  appData?: string | undefined;
}

export function buildHelpText(version: string): string {
  return [
    `Araon ${version}`,
    '',
    'Usage:',
    '  araon [options]',
    '',
    'Options:',
    '  --no-open                         Start the server without opening a browser',
    '  --port <port>                     Bind to a specific localhost port',
    '  --host <host>                     Bind host, only 127.0.0.1 is allowed',
    '  --data-dir <path>                 Store settings, credentials, and SQLite data here',
    '  --exit-when-browser-closes        Stop the server when UI heartbeats disappear',
    '  --log-level <debug|info|warn>     Set log verbosity',
    '  --version                         Print version',
    '  --help                            Show this help',
  ].join('\n');
}

export function parseAraonCliArgs(args: string[], context: ParseContext): AraonCliOptions {
  const run: AraonCliRunOptions = {
    kind: 'run',
    host: '127.0.0.1',
    port: 0,
    openBrowser: true,
    exitWhenBrowserCloses: false,
    logLevel: undefined,
    dataDir: undefined,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      return { kind: 'help', text: buildHelpText(context.version) };
    }
    if (arg === '--version' || arg === '-v') {
      return { kind: 'version', version: context.version };
    }
    if (arg === '--no-open') {
      run.openBrowser = false;
      continue;
    }
    if (arg === '--exit-when-browser-closes') {
      run.exitWhenBrowserCloses = true;
      continue;
    }
    if (arg === '--port') {
      run.port = parsePort(readValue(args, i, arg));
      i += 1;
      continue;
    }
    if (arg === '--host') {
      run.host = readValue(args, i, arg);
      if (run.host !== '127.0.0.1') {
        throw new Error('Only 127.0.0.1 is allowed for --host');
      }
      i += 1;
      continue;
    }
    if (arg === '--data-dir') {
      run.dataDir = readValue(args, i, arg);
      i += 1;
      continue;
    }
    if (arg === '--log-level') {
      run.logLevel = parseLogLevel(readValue(args, i, arg));
      i += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg ?? ''}`);
  }

  if (!run.openBrowser && run.exitWhenBrowserCloses) {
    throw new Error('--no-open cannot be combined with --exit-when-browser-closes');
  }

  return run;
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('--port must be between 1 and 65535');
  }
  return port;
}

function parseLogLevel(value: string): AraonLogLevel {
  if (value === 'debug' || value === 'info' || value === 'warn') {
    return value;
  }
  throw new Error('--log-level must be one of debug, info, or warn');
}

export function resolveCliDataDir(
  flagDataDir: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  context: DataDirContext = {
    platform: osPlatform(),
    homeDir: homedir(),
    appData: process.env['APPDATA'],
  },
): string {
  return flagDataDir ?? env['ARAON_DATA_DIR'] ?? getDefaultCliDataDir(context);
}

export function getDefaultCliDataDir(context: DataDirContext): string {
  if (context.platform === 'darwin') {
    return join(context.homeDir, 'Library', 'Application Support', 'Araon');
  }
  if (context.platform === 'win32') {
    return join(context.appData ?? join(context.homeDir, 'AppData', 'Roaming'), 'Araon');
  }
  return join(context.homeDir, '.local', 'share', 'araon');
}
