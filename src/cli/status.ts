import { readLauncherState } from './launcher-state.js';

export interface AraonRuntimeLauncherProbe {
  reachable: boolean;
  exitWhenBrowserCloses: boolean | undefined;
  activeTabCount: number | undefined;
  message: string;
}

export interface AraonStatusReport {
  provider: 'araon-cli-status';
  dataDir: string;
  running: boolean;
  processAlive: boolean;
  url: string | undefined;
  pid: number | undefined;
  startedAt: string | undefined;
  version: string | undefined;
  launcher: AraonRuntimeLauncherProbe | undefined;
}

export interface AraonStatusOptions {
  dataDir: string;
  fetch?: typeof globalThis.fetch;
}

export async function createStatusReport(options: AraonStatusOptions): Promise<AraonStatusReport> {
  const state = await readLauncherState(options.dataDir);
  if (state === null) {
    return {
      provider: 'araon-cli-status',
      dataDir: options.dataDir,
      running: false,
      processAlive: false,
      url: undefined,
      pid: undefined,
      startedAt: undefined,
      version: undefined,
      launcher: undefined,
    };
  }

  const processAlive = isProcessAlive(state.pid);
  const launcher = processAlive ? await probeLauncherStatus(state.url, options.fetch ?? fetch) : undefined;

  return {
    provider: 'araon-cli-status',
    dataDir: options.dataDir,
    running: processAlive && (launcher?.reachable ?? false),
    processAlive,
    url: state.url,
    pid: state.pid,
    startedAt: state.startedAt,
    version: state.version,
    launcher,
  };
}

export function formatStatusReport(report: AraonStatusReport): string {
  if (report.url === undefined) {
    return [
      'Araon status',
      `Data directory: ${report.dataDir}`,
      'State: not running',
      'Start with: araon',
      '',
    ].join('\n');
  }

  const launcher = report.launcher;
  const lines = [
    'Araon status',
    `URL: ${report.url}`,
    `Data directory: ${report.dataDir}`,
    `Process: ${report.processAlive ? 'running' : 'not running'}${report.pid !== undefined ? ` (pid ${report.pid})` : ''}`,
    `Started at: ${report.startedAt ?? 'unknown'}`,
    `Version: ${report.version ?? 'unknown'}`,
  ];

  if (launcher !== undefined) {
    lines.push(`Launcher: ${launcher.message}`);
    if (launcher.exitWhenBrowserCloses !== undefined) {
      lines.push(`Exit when browser closes: ${launcher.exitWhenBrowserCloses ? 'on' : 'off'}`);
    }
    if (launcher.activeTabCount !== undefined) {
      lines.push(`Active UI tabs: ${launcher.activeTabCount}`);
    }
  } else {
    lines.push('Launcher: unavailable');
  }

  lines.push('');
  return lines.join('\n');
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    return isNodeError(err) && err.code === 'EPERM';
  }
}

async function probeLauncherStatus(url: string, fetchImpl: typeof globalThis.fetch): Promise<AraonRuntimeLauncherProbe> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);
  try {
    const res = await fetchImpl(`${url}/runtime/launcher/status`, { signal: controller.signal });
    if (!res.ok) {
      return { reachable: false, exitWhenBrowserCloses: undefined, activeTabCount: undefined, message: 'not reachable' };
    }
    const payload = await res.json() as unknown;
    const data = parseLauncherPayload(payload);
    if (data === null) {
      return { reachable: false, exitWhenBrowserCloses: undefined, activeTabCount: undefined, message: 'unexpected response' };
    }
    return {
      reachable: true,
      exitWhenBrowserCloses: data.exitWhenBrowserCloses,
      activeTabCount: data.activeTabCount,
      message: 'reachable',
    };
  } catch {
    return { reachable: false, exitWhenBrowserCloses: undefined, activeTabCount: undefined, message: 'not reachable' };
  } finally {
    clearTimeout(timeout);
  }
}

function parseLauncherPayload(payload: unknown): { exitWhenBrowserCloses: boolean | undefined; activeTabCount: number | undefined } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const root = payload as { success?: unknown; data?: unknown };
  if (root.success !== true || typeof root.data !== 'object' || root.data === null) return null;
  const data = root.data as { exitWhenBrowserCloses?: unknown; activeTabCount?: unknown };
  return {
    exitWhenBrowserCloses: typeof data.exitWhenBrowserCloses === 'boolean' ? data.exitWhenBrowserCloses : undefined,
    activeTabCount: typeof data.activeTabCount === 'number' ? data.activeTabCount : undefined,
  };
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === 'object' && err !== null && 'code' in err;
}
