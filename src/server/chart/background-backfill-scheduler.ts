import type { Favorite, Stock } from '@shared/types.js';
import { createChildLogger } from '@shared/logger.js';
import type { SettingsStore } from '../settings-store.js';
import type { BackfillMarketPhase } from './backfill-policy.js';
import { isBackfillAllowed } from './backfill-policy.js';
import type {
  DailyBackfillRange,
  DailyBackfillResult,
  DailyBackfillService,
} from './daily-backfill-service.js';

const log = createChildLogger('background-backfill');

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_TICKERS_PER_RUN = 5;

export type BackgroundBackfillSkippedReason =
  | 'disabled'
  | 'market_not_allowed'
  | 'no_tickers'
  | 'already_running'
  | null;

export interface BackgroundBackfillRunResult {
  attempted: number;
  succeeded: number;
  failed: number;
  skippedReason: BackgroundBackfillSkippedReason;
  results: DailyBackfillResult[];
}

export interface BackgroundDailyBackfillScheduler {
  start(): void;
  stop(): void;
  runOnce(nowOverride?: Date): Promise<BackgroundBackfillRunResult>;
}

export interface CreateBackgroundDailyBackfillSchedulerOptions {
  settingsStore: Pick<SettingsStore, 'snapshot'> & Partial<Pick<SettingsStore, 'subscribe'>>;
  stockRepo: { findAll(): Stock[] };
  favoriteRepo: { findAll(): Favorite[] };
  dailyBackfillService: DailyBackfillService;
  marketPhase: () => BackfillMarketPhase;
  now?: () => Date;
  intervalMs?: number;
  maxTickersPerRun?: number;
}

export function createBackgroundDailyBackfillScheduler(
  options: CreateBackgroundDailyBackfillSchedulerOptions,
): BackgroundDailyBackfillScheduler {
  const now = options.now ?? (() => new Date());
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const maxTickersPerRun = options.maxTickersPerRun ?? DEFAULT_MAX_TICKERS_PER_RUN;

  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight: Promise<BackgroundBackfillRunResult> | null = null;
  let unsubscribe: (() => void) | null = null;

  async function runOnce(nowOverride?: Date): Promise<BackgroundBackfillRunResult> {
    if (inFlight !== null) {
      return {
        attempted: 0,
        succeeded: 0,
        failed: 0,
        skippedReason: 'already_running',
        results: [],
      };
    }

    const started = runOnceInner(nowOverride ?? now());
    inFlight = started;
    try {
      return await started;
    } finally {
      if (inFlight === started) inFlight = null;
    }
  }

  async function runOnceInner(runAt: Date): Promise<BackgroundBackfillRunResult> {
    const settings = options.settingsStore.snapshot();
    if (!settings.backgroundDailyBackfillEnabled) {
      return emptyResult('disabled');
    }

    if (!isBackfillAllowed(runAt, options.marketPhase())) {
      return emptyResult('market_not_allowed');
    }

    const tickers = backgroundTickerOrder(
      options.favoriteRepo.findAll(),
      options.stockRepo.findAll(),
    ).slice(0, maxTickersPerRun);
    if (tickers.length === 0) return emptyResult('no_tickers');

    const results: DailyBackfillResult[] = [];
    let failed = 0;
    for (const ticker of tickers) {
      try {
        results.push(
          await options.dailyBackfillService.backfillDailyCandles({
            ticker,
            range: settings.backgroundDailyBackfillRange as DailyBackfillRange,
            now: runAt,
          }),
        );
      } catch (err: unknown) {
        failed += 1;
        log.warn(
          { ticker, err: err instanceof Error ? err.message : String(err) },
          'background daily backfill failed for ticker',
        );
      }
    }

    return {
      attempted: tickers.length,
      succeeded: results.length,
      failed,
      skippedReason: null,
      results,
    };
  }

  function start(): void {
    if (timer !== null) return;
    void runOnce().catch((err: unknown) => {
      log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'initial background daily backfill run failed',
      );
    });
    unsubscribe = options.settingsStore.subscribe?.((settings) => {
      if (!settings.backgroundDailyBackfillEnabled) return;
      void runOnce().catch((err: unknown) => {
        log.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'settings-triggered background daily backfill run failed',
        );
      });
    }) ?? null;
    timer = setInterval(() => {
      void runOnce().catch((err: unknown) => {
        log.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'background daily backfill run failed',
        );
      });
    }, intervalMs);
  }

  function stop(): void {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
    if (unsubscribe !== null) {
      unsubscribe();
      unsubscribe = null;
    }
  }

  return { start, stop, runOnce };
}

function emptyResult(
  skippedReason: Exclude<BackgroundBackfillSkippedReason, null>,
): BackgroundBackfillRunResult {
  return {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    skippedReason,
    results: [],
  };
}

function backgroundTickerOrder(
  favorites: readonly Favorite[],
  stocks: readonly Stock[],
): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const fav of favorites) {
    if (seen.has(fav.ticker)) continue;
    seen.add(fav.ticker);
    ordered.push(fav.ticker);
  }
  for (const stock of stocks) {
    if (seen.has(stock.ticker)) continue;
    seen.add(stock.ticker);
    ordered.push(stock.ticker);
  }
  return ordered;
}
