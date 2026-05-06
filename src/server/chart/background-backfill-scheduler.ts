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
const DEFAULT_REQUEST_GAP_MS = 2_500;
export const DEFAULT_DAILY_CALL_BUDGET = 300;
const DEFAULT_5XX_COOLDOWN_MS = 5 * 60 * 1000;
const DEFAULT_429_COOLDOWN_MS = 10 * 60 * 1000;

export type BackgroundBackfillSkippedReason =
  | 'disabled'
  | 'market_not_allowed'
  | 'no_tickers'
  | 'no_stale_tickers'
  | 'already_running'
  | 'budget_exhausted'
  | 'cooldown'
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
  snapshot(): BackgroundBackfillSchedulerSnapshot;
}

export interface BackgroundBackfillSchedulerSnapshot {
  running: boolean;
  lastRunAt: string | null;
  lastFinishedAt: string | null;
  lastAttempted: number;
  lastSucceeded: number;
  lastFailed: number;
  lastSkippedReason: BackgroundBackfillSkippedReason;
}

export interface BackgroundBackfillState {
  budgetDateKey: string | null;
  dailyCallCount: number;
  cooldownUntilMs: number;
}

export interface BackgroundBackfillStateStore {
  load(): Promise<BackgroundBackfillState>;
  save(state: BackgroundBackfillState): Promise<void>;
  snapshot(): BackgroundBackfillState;
}

export interface CreateBackgroundDailyBackfillSchedulerOptions {
  settingsStore: Pick<SettingsStore, 'snapshot'> & Partial<Pick<SettingsStore, 'subscribe'>>;
  stockRepo: { findAll(): Stock[] };
  favoriteRepo: { findAll(): Favorite[] };
  dailyBackfillService: DailyBackfillService;
  marketPhase: () => BackfillMarketPhase;
  shouldBackfillTicker?: (input: {
    ticker: string;
    range: DailyBackfillRange;
    now: Date;
  }) => boolean | Promise<boolean>;
  now?: () => Date;
  intervalMs?: number;
  maxTickersPerRun?: number;
  requestGapMs?: number;
  dailyCallBudget?: number;
  stateStore?: BackgroundBackfillStateStore;
}

export function createBackgroundDailyBackfillScheduler(
  options: CreateBackgroundDailyBackfillSchedulerOptions,
): BackgroundDailyBackfillScheduler {
  const now = options.now ?? (() => new Date());
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const maxTickersPerRun = options.maxTickersPerRun ?? DEFAULT_MAX_TICKERS_PER_RUN;
  const requestGapMs = options.requestGapMs ?? DEFAULT_REQUEST_GAP_MS;
  const dailyCallBudget = options.dailyCallBudget ?? DEFAULT_DAILY_CALL_BUDGET;

  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight: Promise<BackgroundBackfillRunResult> | null = null;
  let unsubscribe: (() => void) | null = null;
  let budgetDateKey: string | null = null;
  let dailyCallCount = 0;
  let cooldownUntilMs = 0;
  let stateLoaded = options.stateStore === undefined;
  let lastRunAt: string | null = null;
  let lastFinishedAt: string | null = null;
  let lastAttempted = 0;
  let lastSucceeded = 0;
  let lastFailed = 0;
  let lastSkippedReason: BackgroundBackfillSkippedReason = null;

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
    lastRunAt = runAt.toISOString();
    await loadStateIfNeeded();
    const budgetReset = resetBudgetIfNeeded(runAt);
    if (budgetReset) await persistState();

    const settings = options.settingsStore.snapshot();
    const range = settings.backgroundDailyBackfillRange as DailyBackfillRange;
    if (!settings.backgroundDailyBackfillEnabled) {
      return finish(emptyResult('disabled'));
    }

    if (runAt.getTime() < cooldownUntilMs) {
      return finish(emptyResult('cooldown'));
    }

    if (!isBackfillAllowed(runAt, options.marketPhase())) {
      return finish(emptyResult('market_not_allowed'));
    }

    const candidates = backgroundTickerOrder(
      options.favoriteRepo.findAll(),
      options.stockRepo.findAll(),
    );
    const tickers = await selectBackfillTickers(candidates, range, runAt);
    if (tickers.length === 0) {
      return finish(emptyResult(candidates.length === 0 ? 'no_tickers' : 'no_stale_tickers'));
    }

    const results: DailyBackfillResult[] = [];
    let failed = 0;
    let attempted = 0;
    let skippedReason: BackgroundBackfillSkippedReason = null;
    for (const ticker of tickers) {
      if (dailyCallCount >= dailyCallBudget) {
        skippedReason = 'budget_exhausted';
        break;
      }
      dailyCallCount += 1;
      await persistState();
      attempted += 1;
      try {
        results.push(
          await options.dailyBackfillService.backfillDailyCandles({
            ticker,
            range,
            now: runAt,
          }),
        );
      } catch (err: unknown) {
        failed += 1;
        cooldownUntilMs = runAt.getTime() + cooldownMsForError(err);
        await persistState();
        log.warn(
          { ticker, err: err instanceof Error ? err.message : String(err) },
          'background daily backfill failed for ticker',
        );
        break;
      }
      if (requestGapMs > 0 && attempted < tickers.length) {
        await sleep(requestGapMs);
      }
    }

    return finish({
      attempted,
      succeeded: results.length,
      failed,
      skippedReason,
      results,
    });
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

  function snapshot(): BackgroundBackfillSchedulerSnapshot {
    return {
      running: inFlight !== null,
      lastRunAt,
      lastFinishedAt,
      lastAttempted,
      lastSucceeded,
      lastFailed,
      lastSkippedReason,
    };
  }

  return { start, stop, runOnce, snapshot };

  async function selectBackfillTickers(
    candidates: readonly string[],
    range: DailyBackfillRange,
    runAt: Date,
  ): Promise<string[]> {
    const selected: string[] = [];
    for (const ticker of candidates) {
      if (selected.length >= maxTickersPerRun) break;
      const shouldBackfill =
        options.shouldBackfillTicker === undefined
          ? true
          : await options.shouldBackfillTicker({ ticker, range, now: runAt });
      if (shouldBackfill) selected.push(ticker);
    }
    return selected;
  }

  function finish(result: BackgroundBackfillRunResult): BackgroundBackfillRunResult {
    lastFinishedAt = new Date().toISOString();
    lastAttempted = result.attempted;
    lastSucceeded = result.succeeded;
    lastFailed = result.failed;
    lastSkippedReason = result.skippedReason;
    return result;
  }

  async function loadStateIfNeeded(): Promise<void> {
    if (stateLoaded || options.stateStore === undefined) return;
    const state = await options.stateStore.load();
    budgetDateKey = state.budgetDateKey;
    dailyCallCount = state.dailyCallCount;
    cooldownUntilMs = state.cooldownUntilMs;
    stateLoaded = true;
  }

  async function persistState(): Promise<void> {
    if (options.stateStore === undefined) return;
    await options.stateStore.save({
      budgetDateKey,
      dailyCallCount,
      cooldownUntilMs,
    });
  }

  function resetBudgetIfNeeded(runAt: Date): boolean {
    const key = kstDateKey(runAt);
    if (budgetDateKey === key) return false;
    budgetDateKey = key;
    dailyCallCount = 0;
    cooldownUntilMs = 0;
    return true;
  }
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

function cooldownMsForError(err: unknown): number {
  const message = err instanceof Error ? err.message : String(err);
  return /429|rate.?limit|throttle/i.test(message)
    ? DEFAULT_429_COOLDOWN_MS
    : DEFAULT_5XX_COOLDOWN_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function kstDateKey(date: Date): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}
