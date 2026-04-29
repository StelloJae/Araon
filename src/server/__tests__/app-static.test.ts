import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import { createAraonServer, type AraonServer } from '../app.js';
import { closeDb } from '../db/database.js';
import { clearConfiguredDataDirForTests } from '../runtime-paths.js';

const tmpRoots: string[] = [];
let server: AraonServer | null = null;

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tmpRoots.push(dir);
  return dir;
}

async function makeStaticDir(): Promise<string> {
  const dir = await makeTempDir('araon-static-');
  await mkdir(join(dir, 'assets'));
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>Araon Static Test</title>', 'utf8');
  await writeFile(join(dir, 'assets', 'app.js'), 'window.__ARAON_STATIC_TEST__ = true;', 'utf8');
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

describe('createAraonServer static client serving', () => {
  it('serves built client files without hijacking API routes', async () => {
    const dataDir = await makeTempDir('araon-app-data-');
    const staticDir = await makeStaticDir();

    server = await createAraonServer({
      dataDir,
      serveStaticClient: true,
      staticDir,
    });

    const root = await server.app.inject({ method: 'GET', url: '/' });
    expect(root.statusCode).toBe(200);
    expect(root.headers['content-type']).toContain('text/html');
    expect(root.body).toContain('Araon Static Test');

    const spaRoute = await server.app.inject({ method: 'GET', url: '/watchlist/005930' });
    expect(spaRoute.statusCode).toBe(200);
    expect(spaRoute.headers['content-type']).toContain('text/html');

    const asset = await server.app.inject({ method: 'GET', url: '/assets/app.js' });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['content-type']).toContain('javascript');

    const api = await server.app.inject({ method: 'GET', url: '/stocks' });
    expect(api.statusCode).toBe(200);
    expect(api.headers['content-type']).toContain('application/json');
    expect(api.body).not.toContain('Araon Static Test');
  });
});
