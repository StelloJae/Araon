import { resolve } from 'node:path';

export const ARAON_DATA_DIR_ENV = 'ARAON_DATA_DIR';

let configuredDataDir: string | null = null;

export function configureDataDir(dataDir: string): string {
  const resolved = resolve(dataDir);
  configuredDataDir = resolved;
  process.env[ARAON_DATA_DIR_ENV] = resolved;
  return resolved;
}

export function clearConfiguredDataDirForTests(): void {
  configuredDataDir = null;
  delete process.env[ARAON_DATA_DIR_ENV];
}

export function getDataDir(): string {
  return configuredDataDir ?? process.env[ARAON_DATA_DIR_ENV] ?? resolve(process.cwd(), 'data');
}

export function resolveDataPath(...parts: string[]): string {
  return resolve(getDataDir(), ...parts);
}
