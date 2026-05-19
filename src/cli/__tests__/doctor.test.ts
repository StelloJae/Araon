import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createDoctorReport, formatDoctorReport } from '../doctor.js';

describe('createDoctorReport', () => {
  it('runs no-live local checks without exposing raw Toss session content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'araon-doctor-root-'));
    const dataDir = await mkdtemp(join(tmpdir(), 'araon-doctor-data-'));
    try {
      await mkdir(join(root, 'dist', 'client'), { recursive: true });
      await mkdir(join(root, 'dist', 'cli'), { recursive: true });
      await mkdir(join(root, 'src', 'server', 'db', 'migrations'), { recursive: true });
      await writeFile(join(root, 'dist', 'client', 'index.html'), '<html></html>');
      await writeFile(join(root, 'dist', 'cli', 'araon.js'), '#!/usr/bin/env node\n');
      await writeFile(join(dataDir, 'toss-session.enc'), 'encrypted local test content');

      const report = await createDoctorReport({
        root,
        dataDir,
        version: '1.2.3',
        nodeVersion: 'v20.11.0',
      });

      expect(report.noLive).toBe(true);
      expect(report.summary.ok).toBe(true);
      expect(report.checks.map((check) => check.id)).toContain('toss-session');
      expect(JSON.stringify(report)).not.toContain('encrypted local test content');
      expect(formatDoctorReport(report)).not.toContain('encrypted local test content');
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
