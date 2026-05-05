/**
 * File-backed runtime settings store.
 *
 * Persists a small JSON snapshot at `data/settings.json` so Task Scheduler
 * restarts don't lose user-tuned values. Tolerates missing files (first boot)
 * and corrupt files (log + fall back to defaults). Subscribers receive a fresh
 * snapshot on every successful `save()` — used by the polling scheduler to
 * pick up the new `pollingCycleDelayMs` without a restart.
 *
 * The numbers in `DEFAULT_SETTINGS` are project-level ergonomics, NOT KIS
 * protocol constants — they do not belong in `kis-constraints.ts`.
 */

import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { createChildLogger } from '@shared/logger.js';
import { resolveDataPath } from './runtime-paths.js';

const log = createChildLogger('settings-store');

const DEFAULT_SETTINGS_FILE = 'settings.json';

export const settingsSchema = z.object({
  pollingCycleDelayMs: z.number().int().min(100),
  /**
   * Max concurrent in-flight KIS price requests during a polling cycle.
   * Bounded-concurrency worker pool depth. Rate limiter still gates total
   * throughput; this controls burst/parallelism shape.
   */
  pollingMaxInFlight: z.number().int().min(1).max(50),
  /**
   * Minimum gap between the START of one request and the START of the next.
   * Combined with pollingMaxInFlight, this smooths instantaneous burst rate
   * so KIS's sliding-window throttle doesn't reject bursts even when
   * steady-state is within the per-second limit.
   * At 125ms: ≤ 8 req/s of request starts regardless of concurrency.
   */
  pollingMinStartGapMs: z.number().int().min(0).max(1000),
  /** Random jitter added to start gap to avoid lock-step bursts. */
  pollingStartJitterMs: z.number().int().min(0).max(500),
  rateLimiterMode: z.enum(['live', 'paper']),
  websocketEnabled: z.boolean().default(false),
  applyTicksToPriceStore: z.boolean().default(false),
  backgroundDailyBackfillEnabled: z.boolean().default(false),
  backgroundDailyBackfillRange: z.enum(['1m', '3m', '6m', '1y']).default('3m'),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  pollingCycleDelayMs: 1000,
  pollingMaxInFlight: 5,
  pollingMinStartGapMs: 125,
  pollingStartJitterMs: 20,
  rateLimiterMode: 'paper',
  websocketEnabled: false,
  applyTicksToPriceStore: false,
  backgroundDailyBackfillEnabled: false,
  backgroundDailyBackfillRange: '3m',
};

export type SettingsListener = (settings: Settings) => void;

export interface SettingsStore {
  load(): Promise<Settings>;
  save(settings: Settings): Promise<void>;
  subscribe(listener: SettingsListener): () => void;
  /** Current in-memory snapshot (reflects last successful load/save). */
  snapshot(): Settings;
}

export interface SettingsStoreOptions {
  /** File path (relative or absolute). Defaults to configured data dir. */
  path?: string;
  /** Override defaults (used by tests — no KIS magic numbers). */
  defaults?: Settings;
}

export function createSettingsStore(
  options: SettingsStoreOptions = {},
): SettingsStore {
  const path = options.path ?? resolveDataPath(DEFAULT_SETTINGS_FILE);
  const defaults = options.defaults ?? DEFAULT_SETTINGS;

  let current: Settings = { ...defaults };
  const listeners = new Set<SettingsListener>();

  async function readFromDisk(): Promise<Settings> {
    let raw: string;
    try {
      raw = await fs.readFile(path, 'utf8');
    } catch (err: unknown) {
      const isMissing =
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === 'ENOENT';
      if (isMissing) {
        log.info({ path }, 'settings file missing — using defaults');
        return { ...defaults };
      }
      log.warn(
        { path, err: err instanceof Error ? err.message : String(err) },
        'settings file unreadable — using defaults',
      );
      return { ...defaults };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err: unknown) {
      log.warn(
        { path, err: err instanceof Error ? err.message : String(err) },
        'settings file is not valid JSON — using defaults',
      );
      return { ...defaults };
    }

    const result = settingsSchema.safeParse(parsed);
    if (!result.success) {
      log.warn(
        { path, issues: result.error.issues },
        'settings file failed schema validation — using defaults',
      );
      return { ...defaults };
    }
    return result.data;
  }

  async function writeToDisk(settings: Settings): Promise<void> {
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  }

  async function load(): Promise<Settings> {
    const loaded = await readFromDisk();
    current = loaded;
    return current;
  }

  async function save(settings: Settings): Promise<void> {
    const validated = settingsSchema.parse(settings);
    await writeToDisk(validated);
    current = validated;
    for (const listener of listeners) {
      try {
        listener(current);
      } catch (err: unknown) {
        log.error(
          { err: err instanceof Error ? err.message : String(err) },
          'settings listener threw',
        );
      }
    }
  }

  function subscribe(listener: SettingsListener): () => void {
    listeners.add(listener);
    return (): void => {
      listeners.delete(listener);
    };
  }

  function snapshot(): Settings {
    return { ...current };
  }

  return { load, save, subscribe, snapshot };
}
