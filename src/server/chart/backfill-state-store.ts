import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { createChildLogger } from '@shared/logger.js';
import { resolveDataPath } from '../runtime-paths.js';
import type {
  BackgroundBackfillState,
  BackgroundBackfillStateStore,
} from './background-backfill-scheduler.js';

const log = createChildLogger('backfill-state-store');
const DEFAULT_BACKFILL_STATE_FILE = 'background-backfill-state.json';

const EMPTY_BACKFILL_STATE: BackgroundBackfillState = {
  budgetDateKey: null,
  dailyCallCount: 0,
  cooldownUntilMs: 0,
};

const backfillStateSchema = z.object({
  budgetDateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  dailyCallCount: z.number().int().min(0),
  cooldownUntilMs: z.number().int().min(0),
});

export interface FileBackfillStateStoreOptions {
  path?: string;
}

export function createFileBackfillStateStore(
  options: FileBackfillStateStoreOptions = {},
): BackgroundBackfillStateStore {
  const path = options.path ?? resolveDataPath(DEFAULT_BACKFILL_STATE_FILE);
  let current: BackgroundBackfillState = { ...EMPTY_BACKFILL_STATE };

  async function load(): Promise<BackgroundBackfillState> {
    let raw: string;
    try {
      raw = await fs.readFile(path, 'utf8');
    } catch (err: unknown) {
      if (isMissingFile(err)) {
        current = { ...EMPTY_BACKFILL_STATE };
        return { ...current };
      }
      log.warn(
        { path, err: err instanceof Error ? err.message : String(err) },
        'backfill state file unreadable — using empty state',
      );
      current = { ...EMPTY_BACKFILL_STATE };
      return { ...current };
    }

    try {
      const parsed = backfillStateSchema.parse(JSON.parse(raw));
      current = parsed;
      return { ...current };
    } catch (err: unknown) {
      log.warn(
        { path, err: err instanceof Error ? err.message : String(err) },
        'backfill state file malformed — using empty state',
      );
      current = { ...EMPTY_BACKFILL_STATE };
      return { ...current };
    }
  }

  async function save(state: BackgroundBackfillState): Promise<void> {
    const validated = backfillStateSchema.parse(state);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
    current = validated;
  }

  function snapshot(): BackgroundBackfillState {
    return { ...current };
  }

  return { load, save, snapshot };
}

function isMissingFile(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'ENOENT'
  );
}
