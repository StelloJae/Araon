import { createChildLogger } from '@shared/logger.js';

const log = createChildLogger('data-retention');

export const SIGNAL_RETENTION_DAYS = 90;
export const NEWS_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
export const NEWS_PRUNE_AFTER_DAYS = 7;
export const DATA_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface DataRetentionSnapshot {
  lastRunAt: string | null;
  candlePruneLastRunAt: string | null;
  candlePruneLastError: string | null;
}

export interface DataRetentionRunResult {
  candlePruned: number;
  signalPruned: number;
  newsPruned: number;
  error: string | null;
}

export interface DataRetentionScheduler {
  start(): void;
  stop(): void;
  runOnce(): Promise<DataRetentionRunResult>;
  snapshot(): DataRetentionSnapshot;
}

export interface CreateDataRetentionSchedulerOptions {
  candleRepo: { pruneOldCandles(now?: Date): number };
  signalEventRepo: { pruneOldSignalEvents(now?: Date, retentionDays?: number): number };
  newsRepo: { pruneOldNewsItems(now?: Date, retentionDays?: number): number };
  now?: () => Date;
  intervalMs?: number;
}

export function createDataRetentionScheduler(
  options: CreateDataRetentionSchedulerOptions,
): DataRetentionScheduler {
  const now = options.now ?? (() => new Date());
  const intervalMs = options.intervalMs ?? DATA_RETENTION_INTERVAL_MS;
  let timer: ReturnType<typeof setInterval> | null = null;
  let state: DataRetentionSnapshot = {
    lastRunAt: null,
    candlePruneLastRunAt: null,
    candlePruneLastError: null,
  };

  async function runOnce(): Promise<DataRetentionRunResult> {
    const runAt = now();
    const runAtIso = runAt.toISOString();
    let candlePruned = 0;
    let signalPruned = 0;
    let newsPruned = 0;
    let error: string | null = null;

    try {
      candlePruned = options.candleRepo.pruneOldCandles(runAt);
      state = {
        ...state,
        candlePruneLastRunAt: runAtIso,
        candlePruneLastError: null,
      };
      signalPruned = options.signalEventRepo.pruneOldSignalEvents(runAt, SIGNAL_RETENTION_DAYS);
      newsPruned = options.newsRepo.pruneOldNewsItems(runAt, NEWS_PRUNE_AFTER_DAYS);
    } catch (err: unknown) {
      error = sanitizeMaintenanceError(err);
      state = {
        ...state,
        candlePruneLastRunAt: runAtIso,
        candlePruneLastError: error,
      };
      log.warn({ err: error }, 'data retention maintenance failed');
    } finally {
      state = { ...state, lastRunAt: runAtIso };
    }

    return { candlePruned, signalPruned, newsPruned, error };
  }

  function start(): void {
    if (timer !== null) return;
    void runOnce();
    timer = setInterval(() => {
      void runOnce();
    }, intervalMs);
    timer.unref?.();
  }

  function stop(): void {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  }

  function snapshot(): DataRetentionSnapshot {
    return state;
  }

  return { start, stop, runOnce, snapshot };
}

function sanitizeMaintenanceError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/database locked|SQLITE_BUSY/i.test(message)) return 'database locked';
  return 'maintenance_failed';
}
