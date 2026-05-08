import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileCredentialStore } from '../credential-store.js';

describe('credentialStore.clearCredentials', () => {
  let tmpPath: string;

  beforeEach(async () => {
    tmpPath = join(tmpdir(), `cred-test-${Date.now()}-${Math.random()}.enc`);
    process.env['KIS_CRED_KEY'] = 'test-key-for-clear-test-1234567890';
  });

  afterEach(async () => {
    await fs.rm(tmpPath, { force: true });
    delete process.env['KIS_CRED_KEY'];
  });

  it('removes the credentials file after saveCredentials', async () => {
    const store = createFileCredentialStore({ path: tmpPath });
    await store.saveCredentials({ appKey: 'k'.repeat(36), appSecret: 's'.repeat(180), isPaper: true });
    await expect(fs.access(tmpPath)).resolves.toBeUndefined();
    await store.clearCredentials();
    await expect(fs.access(tmpPath)).rejects.toThrow(/ENOENT/);
    expect(await store.load()).toBeNull();
  });

  it('is a no-op when the file does not exist', async () => {
    const store = createFileCredentialStore({ path: tmpPath });
    await expect(store.clearCredentials()).resolves.toBeUndefined();
  });

  it('stores additional credential profiles without exposing secret material in summaries', async () => {
    const store = createFileCredentialStore({ path: tmpPath });
    await store.saveCredentials({
      appKey: 'primary-key'.repeat(4),
      appSecret: 'primary-secret'.repeat(12),
      isPaper: false,
    });
    const added = await store.addCredentialProfile?.({
      label: '  second   key  ',
      appKey: 'secondary-key'.repeat(4),
      appSecret: 'secondary-secret'.repeat(12),
    });
    expect(added).toMatchObject({
      label: 'second key',
      isPaper: false,
      enabled: true,
    });
    const summaries = await store.listCredentialProfiles?.();
    expect(summaries).toHaveLength(2);
    expect(JSON.stringify(summaries)).not.toContain('secondary-key');
    expect(JSON.stringify(summaries)).not.toContain('secondary-secret');
  });
});
