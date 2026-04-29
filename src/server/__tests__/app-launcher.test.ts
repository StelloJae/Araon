import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAraonServer, type AraonServer } from '../app.js';
import { closeDb } from '../db/database.js';
import { clearConfiguredDataDirForTests } from '../runtime-paths.js';

const tmpRoots: string[] = [];
let server: AraonServer | null = null;

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'araon-launcher-'));
  tmpRoots.push(dir);
  return dir;
}

afterEach(async () => {
  if (server !== null) {
    await server.close();
    server = null;
  } else {
    closeDb();
  }
  clearConfiguredDataDirForTests();
  await Promise.all(tmpRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('launcher routes', () => {
  it('keeps launcher heartbeat disabled by default and exposes no credential material', async () => {
    server = await createAraonServer({ dataDir: await makeTempDir() });

    const res = await server.app.inject({ method: 'GET', url: '/runtime/launcher/status' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: {
        enabled: false,
        exitWhenBrowserCloses: false,
        heartbeatIntervalMs: 5000,
        heartbeatTimeoutMs: 20000,
        activeTabCount: 0,
      },
    });
    expect(res.body).not.toContain('appKey');
    expect(res.body).not.toContain('appSecret');
    expect(res.body).not.toContain('accessToken');
    expect(res.body).not.toContain('approvalKey');
  });

  it('accepts launcher heartbeats only when enabled', async () => {
    const setInterval = vi.fn(() => 1 as unknown as ReturnType<typeof globalThis.setInterval>);
    const clearInterval = vi.fn();
    server = await createAraonServer({
      dataDir: await makeTempDir(),
      launcher: {
        enabled: true,
        setInterval,
        clearInterval,
      },
    });

    const heartbeat = await server.app.inject({
      method: 'POST',
      url: '/runtime/launcher/heartbeat',
      payload: { tabId: 'tab-a' },
    });
    expect(heartbeat.statusCode).toBe(200);
    expect(heartbeat.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        enabled: true,
        activeTabCount: 1,
      }),
    });

    const closing = await server.app.inject({
      method: 'POST',
      url: '/runtime/launcher/heartbeat',
      payload: { tabId: 'tab-a', closing: true },
    });
    expect(closing.json().data.activeTabCount).toBe(0);
  });
});
