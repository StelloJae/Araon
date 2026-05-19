import { access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';

import { launcherStatePath } from './launcher-state.js';

export type DoctorCheckStatus = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
  id: string;
  label: string;
  status: DoctorCheckStatus;
  message: string;
}

export interface DoctorReport {
  provider: 'araon-cli-doctor';
  noLive: true;
  version: string;
  dataDir: string;
  summary: {
    ok: boolean;
    pass: number;
    warn: number;
    fail: number;
  };
  checks: DoctorCheck[];
}

export interface DoctorReportOptions {
  root: string;
  dataDir: string;
  version: string;
  nodeVersion?: string;
}

export async function createDoctorReport(options: DoctorReportOptions): Promise<DoctorReport> {
  const nodeVersion = options.nodeVersion ?? process.version;
  const checks: DoctorCheck[] = [];

  checks.push(checkNodeVersion(nodeVersion));
  checks.push(await checkPath('static-client', 'Built frontend', join(options.root, 'dist', 'client', 'index.html')));
  checks.push(await checkPath('cli-bin', 'CLI bundle', join(options.root, 'dist', 'cli', 'araon.js')));
  checks.push(await checkPath('migrations', 'DB migrations', join(options.root, 'src', 'server', 'db', 'migrations')));
  checks.push(await checkDataDir(options.dataDir));
  checks.push(await checkOptionalPath('toss-session', 'Toss session', join(options.dataDir, 'toss-session.enc')));
  checks.push(await checkOptionalPath('launcher-state', 'Launcher state', launcherStatePath(options.dataDir)));

  const summary = summarizeChecks(checks);
  return {
    provider: 'araon-cli-doctor',
    noLive: true,
    version: options.version,
    dataDir: options.dataDir,
    summary,
    checks,
  };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = [
    `Araon doctor ${report.version}`,
    `Mode: no-live`,
    `Data directory: ${report.dataDir}`,
    `Summary: ${report.summary.fail === 0 ? 'OK' : 'FAILED'} (${report.summary.pass} pass, ${report.summary.warn} warn, ${report.summary.fail} fail)`,
    '',
  ];

  for (const check of report.checks) {
    lines.push(`${statusIcon(check.status)} ${check.label}: ${check.message}`);
  }
  return `${lines.join('\n')}\n`;
}

function checkNodeVersion(nodeVersion: string): DoctorCheck {
  const major = Number(nodeVersion.replace(/^v/, '').split('.')[0]);
  if (Number.isInteger(major) && major >= 20) {
    return { id: 'node-version', label: 'Node.js', status: 'pass', message: nodeVersion };
  }
  return { id: 'node-version', label: 'Node.js', status: 'fail', message: 'Node.js 20 or newer required' };
}

async function checkPath(id: string, label: string, path: string): Promise<DoctorCheck> {
  try {
    await access(path, constants.R_OK);
    return { id, label, status: 'pass', message: 'found' };
  } catch {
    return { id, label, status: 'fail', message: 'missing' };
  }
}

async function checkOptionalPath(id: string, label: string, path: string): Promise<DoctorCheck> {
  try {
    await access(path, constants.R_OK);
    return { id, label, status: 'pass', message: 'present' };
  } catch {
    return { id, label, status: 'warn', message: 'not present' };
  }
}

async function checkDataDir(dataDir: string): Promise<DoctorCheck> {
  try {
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    await access(dataDir, constants.R_OK | constants.W_OK);
    return { id: 'data-dir', label: 'Data directory', status: 'pass', message: 'read/write ok' };
  } catch {
    return { id: 'data-dir', label: 'Data directory', status: 'fail', message: 'not writable' };
  }
}

function summarizeChecks(checks: readonly DoctorCheck[]): DoctorReport['summary'] {
  const pass = checks.filter((check) => check.status === 'pass').length;
  const warn = checks.filter((check) => check.status === 'warn').length;
  const fail = checks.filter((check) => check.status === 'fail').length;
  return { ok: fail === 0, pass, warn, fail };
}

function statusIcon(status: DoctorCheckStatus): string {
  if (status === 'pass') return 'PASS';
  if (status === 'warn') return 'WARN';
  return 'FAIL';
}
