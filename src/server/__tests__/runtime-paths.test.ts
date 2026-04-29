import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import { getDb, getDbPath, closeDb } from '../db/database.js';
import { createFileCredentialStore } from '../credential-store.js';
import { DEFAULT_SETTINGS, createSettingsStore } from '../settings-store.js';
import { clearConfiguredDataDirForTests, configureDataDir, resolveDataPath } from '../runtime-paths.js';

const tmpRoots: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'araon-data-dir-'));
  tmpRoots.push(dir);
  return dir;
}

afterEach(async () => {
  closeDb();
  clearConfiguredDataDirForTests();
  delete process.env['KIS_CRED_KEY'];
  await Promise.all(tmpRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('runtime data directory', () => {
  it('routes settings, credentials, and SQLite files under the configured data dir', async () => {
    const dataDir = await makeTempDir();
    process.env['KIS_CRED_KEY'] = 'runtime-paths-test-key-1234567890';
    configureDataDir(dataDir);

    const settingsStore = createSettingsStore();
    await settingsStore.save(DEFAULT_SETTINGS);

    const credentialStore = createFileCredentialStore();
    await credentialStore.saveCredentials({
      appKey: 'test-app-key',
      appSecret: 'test-app-secret',
      isPaper: true,
    });

    const db = getDb();
    db.prepare('SELECT 1').get();

    expect(resolveDataPath('settings.json')).toBe(join(dataDir, 'settings.json'));
    expect(getDbPath()).toBe(join(dataDir, 'watchlist.db'));
    expect(existsSync(join(dataDir, 'settings.json'))).toBe(true);
    expect(existsSync(join(dataDir, 'credentials.enc'))).toBe(true);
    expect(existsSync(join(dataDir, 'watchlist.db'))).toBe(true);
  });
});
