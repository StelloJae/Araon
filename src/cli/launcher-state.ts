import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface AraonLauncherState {
  url: string;
  pid: number;
  startedAt: string;
  version: string;
}

export function launcherStatePath(dataDir: string): string {
  return join(dataDir, 'launcher-state.json');
}

export async function readLauncherState(dataDir: string): Promise<AraonLauncherState | null> {
  let raw: string;
  try {
    raw = await readFile(launcherStatePath(dataDir), 'utf8');
  } catch (err: unknown) {
    if (isNodeErrorCode(err, 'ENOENT')) return null;
    throw err;
  }

  const parsed = parseLauncherState(JSON.parse(raw));
  return parsed;
}

export async function writeLauncherState(dataDir: string, state: AraonLauncherState): Promise<void> {
  const parsed = parseLauncherState(state);
  if (parsed === null) throw new Error('launcher state must use a localhost URL');
  const path = launcherStatePath(dataDir);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmpPath = `${path}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
  await rename(tmpPath, path);
}

export async function clearLauncherState(dataDir: string): Promise<void> {
  await unlink(launcherStatePath(dataDir)).catch((err: unknown) => {
    if (isNodeErrorCode(err, 'ENOENT')) return;
    throw err;
  });
}

export function isLocalhostAraonUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && (
      url.hostname === '127.0.0.1' ||
      url.hostname === 'localhost' ||
      url.hostname === '[::1]'
    );
  } catch {
    return false;
  }
}

function parseLauncherState(value: unknown): AraonLauncherState | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Partial<AraonLauncherState>;
  if (typeof candidate.url !== 'string' || !isLocalhostAraonUrl(candidate.url)) return null;
  if (typeof candidate.pid !== 'number' || !Number.isInteger(candidate.pid) || candidate.pid <= 0) return null;
  if (typeof candidate.startedAt !== 'string' || Number.isNaN(Date.parse(candidate.startedAt))) return null;
  if (typeof candidate.version !== 'string' || candidate.version.trim().length === 0) return null;
  return {
    url: candidate.url,
    pid: candidate.pid,
    startedAt: candidate.startedAt,
    version: candidate.version,
  };
}

function isNodeErrorCode(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === code;
}
