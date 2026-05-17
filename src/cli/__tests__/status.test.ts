import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { writeLauncherState } from '../launcher-state.js';
import { createStatusReport, formatStatusReport } from '../status.js';

describe('cli status', () => {
  it('reports not running when launcher state is absent', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'araon-status-'));

    const report = await createStatusReport({ dataDir: dir });

    expect(report.running).toBe(false);
    expect(report.processAlive).toBe(false);
    expect(formatStatusReport(report)).toContain('not running');
  });

  it('reads launcher state and probes localhost launcher endpoint only', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'araon-status-'));
    await writeLauncherState(dir, {
      url: 'http://127.0.0.1:3000',
      pid: process.pid,
      startedAt: '2026-05-17T00:00:00.000Z',
      version: '1.2.3',
    });
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          exitWhenBrowserCloses: true,
          activeTabCount: 2,
        },
      }),
    })) as unknown as typeof globalThis.fetch;

    const report = await createStatusReport({ dataDir: dir, fetch });

    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:3000/runtime/launcher/status', expect.any(Object));
    expect(report.running).toBe(true);
    expect(report.processAlive).toBe(true);
    expect(report.url).toBe('http://127.0.0.1:3000');
    expect(report.launcher?.reachable).toBe(true);
    expect(formatStatusReport(report)).not.toContain('SESSION');
  });
});
