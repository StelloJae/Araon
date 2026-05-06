import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileBackfillStateStore } from '../backfill-state-store.js';

describe('createFileBackfillStateStore', () => {
  let path: string;

  beforeEach(() => {
    path = join(tmpdir(), `araon-backfill-state-${Date.now()}-${Math.random()}.json`);
  });

  afterEach(async () => {
    await fs.rm(path, { force: true });
  });

  it('uses an empty budget state when the file is missing', async () => {
    const store = createFileBackfillStateStore({ path });

    await expect(store.load()).resolves.toEqual({
      budgetDateKey: null,
      dailyCallCount: 0,
      cooldownUntilMs: 0,
    });
  });

  it('saves and reloads the daily budget and cooldown state', async () => {
    const store = createFileBackfillStateStore({ path });
    await store.save({
      budgetDateKey: '2026-05-06',
      dailyCallCount: 12,
      cooldownUntilMs: 1_777_777_777_000,
    });

    const reloaded = createFileBackfillStateStore({ path });
    await expect(reloaded.load()).resolves.toEqual({
      budgetDateKey: '2026-05-06',
      dailyCallCount: 12,
      cooldownUntilMs: 1_777_777_777_000,
    });
  });

  it('falls back to an empty budget state when the file is malformed', async () => {
    await fs.writeFile(path, '{not json', 'utf8');
    const store = createFileBackfillStateStore({ path });

    await expect(store.load()).resolves.toEqual({
      budgetDateKey: null,
      dailyCallCount: 0,
      cooldownUntilMs: 0,
    });
  });
});
