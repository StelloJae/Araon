import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  resetAraonData,
  resetTossSession,
} from '../reset.js';

describe('resetTossSession', () => {
  it('removes only the Toss session file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'araon-reset-session-'));
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'toss-session.enc'), 'secret-session');
      await writeFile(join(dir, 'settings.json'), '{"keep":true}');

      const result = await resetTossSession(dir);

      expect(result).toEqual({ removed: true });
      await expect(readFile(join(dir, 'toss-session.enc'))).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(join(dir, 'settings.json'), 'utf8')).resolves.toBe('{"keep":true}');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('resetAraonData', () => {
  it('refuses destructive data reset without explicit confirmation', async () => {
    await expect(resetAraonData('/tmp/araon-data', undefined)).rejects.toThrow(/DELETE_LOCAL_ARAON_DATA/);
    await expect(resetAraonData('/tmp/araon-data', 'wrong')).rejects.toThrow(/DELETE_LOCAL_ARAON_DATA/);
  });
});
