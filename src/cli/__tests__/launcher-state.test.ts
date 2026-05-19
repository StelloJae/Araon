import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  isLocalhostAraonUrl,
  launcherStatePath,
  readLauncherState,
  writeLauncherState,
} from '../launcher-state.js';

describe('launcher state', () => {
  it('writes and reads sanitized localhost launcher state', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'araon-launcher-state-'));
    try {
      await writeLauncherState(dir, {
        url: 'http://127.0.0.1:3910',
        pid: 12345,
        startedAt: '2026-05-17T00:00:00.000Z',
        version: '1.2.3',
      });

      expect(launcherStatePath(dir)).toBe(join(dir, 'launcher-state.json'));
      expect(await readLauncherState(dir)).toEqual({
        url: 'http://127.0.0.1:3910',
        pid: 12345,
        startedAt: '2026-05-17T00:00:00.000Z',
        version: '1.2.3',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects non-localhost launcher URLs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'araon-launcher-state-'));
    try {
      await expect(writeLauncherState(dir, {
        url: 'https://example.com',
        pid: 12345,
        startedAt: '2026-05-17T00:00:00.000Z',
        version: '1.2.3',
      })).rejects.toThrow(/localhost/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('accepts only localhost URLs for open/status commands', () => {
    expect(isLocalhostAraonUrl('http://127.0.0.1:3000')).toBe(true);
    expect(isLocalhostAraonUrl('http://localhost:3000')).toBe(true);
    expect(isLocalhostAraonUrl('http://0.0.0.0:3000')).toBe(false);
    expect(isLocalhostAraonUrl('https://example.com')).toBe(false);
  });
});
