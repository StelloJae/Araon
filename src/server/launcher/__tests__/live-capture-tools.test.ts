import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveExecutable } from '../../../../scripts/live-capture-tools.mjs';

describe('live capture tools', () => {
  it('resolves a fallback executable when launchd PATH cannot see Homebrew tools', () => {
    const dir = mkdtempSync(join(tmpdir(), 'araon-capture-tools-'));
    const ffmpeg = join(dir, 'ffmpeg');
    writeFileSync(ffmpeg, '#!/bin/sh\nexit 0\n');
    chmodSync(ffmpeg, 0o755);

    expect(resolveExecutable('ffmpeg', {
      envPath: '/usr/bin:/bin:/usr/sbin:/sbin',
      candidates: [ffmpeg],
    })).toBe(ffmpeg);
  });
});
