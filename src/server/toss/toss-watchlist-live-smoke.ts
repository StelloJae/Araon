import type {
  TossWatchlistClient,
  TossWatchlistPayload,
} from './toss-watchlist-client.js';

export type TossWatchlistLiveSmokeOutcome =
  | 'ok'
  | 'approval_required'
  | 'unsupported_client'
  | 'session_required'
  | 'list_failed'
  | 'no_candidate'
  | 'add_failed'
  | 'remove_failed'
  | 'restore_failed'
  | 'not_proven';

export interface TossWatchlistLiveSmokeCandidate {
  readonly productCode: string;
  readonly kind: string;
}

export interface TossWatchlistLiveSmokeSnapshot {
  readonly itemCount: number | null;
  readonly containsCandidate: boolean | null;
  readonly errorCode: TossWatchlistLiveSmokeErrorCode | null;
}

export type TossWatchlistLiveSmokeErrorCode =
  | 'SESSION_REQUIRED'
  | 'CLIENT_UNSUPPORTED'
  | 'LIST_FAILED'
  | 'ADD_FAILED'
  | 'REMOVE_FAILED'
  | 'VERIFY_FAILED';

export interface TossWatchlistLiveSmokeReport {
  readonly ok: boolean;
  readonly outcome: TossWatchlistLiveSmokeOutcome;
  readonly provider: 'toss-watchlist-live-smoke';
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly approval: {
    readonly required: true;
    readonly provided: boolean;
    readonly scope: 'toss-watchlist-add-remove-smoke';
  };
  readonly candidate: {
    readonly selected: boolean;
    readonly kind: string | null;
    readonly redacted: true;
  };
  readonly before: TossWatchlistLiveSmokeSnapshot;
  readonly add: {
    readonly attempted: boolean;
    readonly action: 'added' | 'unchanged' | 'removed' | 'not_run' | null;
    readonly errorCode: TossWatchlistLiveSmokeErrorCode | null;
  };
  readonly afterAdd: TossWatchlistLiveSmokeSnapshot;
  readonly remove: {
    readonly attempted: boolean;
    readonly attempts: number;
    readonly action: 'added' | 'unchanged' | 'removed' | 'not_run' | null;
    readonly errorCode: TossWatchlistLiveSmokeErrorCode | null;
  };
  readonly afterRemove: TossWatchlistLiveSmokeSnapshot;
  readonly restored: boolean;
  readonly issues: readonly TossWatchlistLiveSmokeOutcome[];
}

export interface TossWatchlistLiveSmokeOptions {
  readonly client: TossWatchlistClient;
  readonly mutationApproved: boolean;
  readonly candidates?: readonly TossWatchlistLiveSmokeCandidate[];
  readonly now?: () => Date;
  readonly wait?: {
    readonly timeoutMs?: number;
    readonly intervalMs?: number;
    readonly removeAttempts?: number;
  };
}

const DEFAULT_CANDIDATES: readonly TossWatchlistLiveSmokeCandidate[] = [
  { productCode: 'A035420', kind: 'kr-equity-probe' },
  { productCode: 'A035720', kind: 'kr-equity-probe' },
  { productCode: 'A051910', kind: 'kr-equity-probe' },
  { productCode: 'A068270', kind: 'kr-equity-probe' },
  { productCode: 'A005380', kind: 'kr-equity-probe' },
  { productCode: 'A373220', kind: 'kr-equity-probe' },
];

const EMPTY_SNAPSHOT: TossWatchlistLiveSmokeSnapshot = {
  itemCount: null,
  containsCandidate: null,
  errorCode: null,
};

export async function runTossWatchlistLiveSmoke(
  options: TossWatchlistLiveSmokeOptions,
): Promise<TossWatchlistLiveSmokeReport> {
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const waitTimeoutMs = Math.max(0, options.wait?.timeoutMs ?? 5_000);
  const waitIntervalMs = Math.max(0, options.wait?.intervalMs ?? 500);
  const removeAttempts = Math.max(1, options.wait?.removeAttempts ?? 2);

  if (!options.mutationApproved) {
    return buildReport({
      now,
      startedAt,
      approvalProvided: false,
      outcome: 'approval_required',
      before: EMPTY_SNAPSHOT,
    });
  }

  if (
    options.client.addProductToWatchlist === undefined ||
    options.client.removeProductFromWatchlist === undefined
  ) {
    return buildReport({
      now,
      startedAt,
      approvalProvided: true,
      outcome: 'unsupported_client',
      before: EMPTY_SNAPSHOT,
      addErrorCode: 'CLIENT_UNSUPPORTED',
    });
  }

  let beforePayload: TossWatchlistPayload;
  try {
    beforePayload = await options.client.listWatchlist();
  } catch (err: unknown) {
    const outcome: TossWatchlistLiveSmokeOutcome =
      classifyError(err, 'LIST_FAILED') === 'SESSION_REQUIRED'
        ? 'session_required'
        : 'list_failed';
    return buildReport({
      now,
      startedAt,
      approvalProvided: true,
      outcome,
      before: {
        itemCount: null,
        containsCandidate: null,
        errorCode: classifyError(err, 'LIST_FAILED'),
      },
    });
  }

  const candidate = selectCandidate(options.candidates ?? DEFAULT_CANDIDATES, beforePayload);
  if (candidate === null) {
    return buildReport({
      now,
      startedAt,
      approvalProvided: true,
      outcome: 'no_candidate',
      before: snapshot(beforePayload, null),
    });
  }

  const before = snapshot(beforePayload, candidate.productCode);
  let addAttempted = false;
  let addAction: TossWatchlistLiveSmokeReport['add']['action'] = 'not_run';
  let addErrorCode: TossWatchlistLiveSmokeErrorCode | null = null;
  let afterAdd = EMPTY_SNAPSHOT;
  let removeAttempted = false;
  let removeAction: TossWatchlistLiveSmokeReport['remove']['action'] = 'not_run';
  let removeErrorCode: TossWatchlistLiveSmokeErrorCode | null = null;
  let afterRemove = EMPTY_SNAPSHOT;
  let removeAttemptCount = 0;

  try {
    addAttempted = true;
    const addResult = await options.client.addProductToWatchlist({
      productCode: candidate.productCode,
    });
    addAction = addResult.action;
    afterAdd = await waitForPresence({
      client: options.client,
      productCode: candidate.productCode,
      expected: true,
      timeoutMs: waitTimeoutMs,
      intervalMs: waitIntervalMs,
    });
  } catch (err: unknown) {
    addErrorCode = classifyError(err, 'ADD_FAILED');
  } finally {
    if (addAttempted) {
      removeAttempted = true;
      for (let attempt = 1; attempt <= removeAttempts; attempt += 1) {
        removeAttemptCount = attempt;
        try {
          const removeResult = await options.client.removeProductFromWatchlist!({
            productCode: candidate.productCode,
          });
          removeAction = removeResult.action;
          afterRemove = await waitForPresence({
            client: options.client,
            productCode: candidate.productCode,
            expected: false,
            timeoutMs: waitTimeoutMs,
            intervalMs: waitIntervalMs,
          });
          if (afterRemove.containsCandidate === false) {
            removeErrorCode = null;
            break;
          }
          removeErrorCode = 'VERIFY_FAILED';
        } catch (err: unknown) {
          removeErrorCode = classifyError(err, 'REMOVE_FAILED');
          afterRemove = await safeSnapshot(options.client, candidate.productCode);
          if (afterRemove.containsCandidate === false) break;
        }
        if (attempt < removeAttempts) await sleep(waitIntervalMs);
      }
    }
  }

  const restored = afterRemove.containsCandidate === false;
  const addedObserved = afterAdd.containsCandidate === true;
  const outcome = classifyOutcome({
    addedObserved,
    restored,
    addErrorCode,
    removeErrorCode,
    afterRemove,
  });

  return buildReport({
    now,
    startedAt,
    approvalProvided: true,
    outcome,
    candidateKind: candidate.kind,
    before,
    addAttempted,
    addAction,
    addErrorCode,
    afterAdd,
    removeAttempted,
    removeAttemptCount,
    removeAction,
    removeErrorCode,
    afterRemove,
    restored,
  });
}

function selectCandidate(
  candidates: readonly TossWatchlistLiveSmokeCandidate[],
  payload: TossWatchlistPayload,
): TossWatchlistLiveSmokeCandidate | null {
  const existing = new Set(payload.items.map((item) => item.productCode));
  return candidates.find((candidate) => !existing.has(candidate.productCode)) ?? null;
}

async function waitForPresence(input: {
  readonly client: TossWatchlistClient;
  readonly productCode: string;
  readonly expected: boolean;
  readonly timeoutMs: number;
  readonly intervalMs: number;
}): Promise<TossWatchlistLiveSmokeSnapshot> {
  const deadline = Date.now() + input.timeoutMs;
  let latest = await safeSnapshot(input.client, input.productCode);
  while (
    latest.containsCandidate !== input.expected &&
    latest.errorCode === null &&
    Date.now() < deadline
  ) {
    await sleep(input.intervalMs);
    latest = await safeSnapshot(input.client, input.productCode);
  }
  if (latest.errorCode !== null) return latest;
  return latest.containsCandidate === input.expected
    ? latest
    : { ...latest, errorCode: 'VERIFY_FAILED' };
}

async function safeSnapshot(
  client: TossWatchlistClient,
  productCode: string,
): Promise<TossWatchlistLiveSmokeSnapshot> {
  try {
    return snapshot(await client.listWatchlist(), productCode);
  } catch (err: unknown) {
    return {
      itemCount: null,
      containsCandidate: null,
      errorCode: classifyError(err, 'LIST_FAILED'),
    };
  }
}

function snapshot(
  payload: TossWatchlistPayload,
  productCode: string | null,
): TossWatchlistLiveSmokeSnapshot {
  return {
    itemCount: payload.items.length,
    containsCandidate: productCode === null
      ? null
      : payload.items.some((item) => item.productCode === productCode),
    errorCode: null,
  };
}

function classifyOutcome(input: {
  readonly addedObserved: boolean;
  readonly restored: boolean;
  readonly addErrorCode: TossWatchlistLiveSmokeErrorCode | null;
  readonly removeErrorCode: TossWatchlistLiveSmokeErrorCode | null;
  readonly afterRemove: TossWatchlistLiveSmokeSnapshot;
}): TossWatchlistLiveSmokeOutcome {
  if (!input.restored) return 'restore_failed';
  if (input.addErrorCode !== null) return 'add_failed';
  if (input.removeErrorCode !== null && input.afterRemove.containsCandidate !== false) {
    return 'remove_failed';
  }
  if (!input.addedObserved) return 'not_proven';
  return 'ok';
}

function classifyError(
  err: unknown,
  fallback: TossWatchlistLiveSmokeErrorCode,
): TossWatchlistLiveSmokeErrorCode {
  if (err instanceof Error && err.message === 'Toss session is required') {
    return 'SESSION_REQUIRED';
  }
  return fallback;
}

function buildReport(input: {
  readonly now: () => Date;
  readonly startedAt: string;
  readonly approvalProvided: boolean;
  readonly outcome: TossWatchlistLiveSmokeOutcome;
  readonly candidateKind?: string;
  readonly before: TossWatchlistLiveSmokeSnapshot;
  readonly addAttempted?: boolean;
  readonly addAction?: TossWatchlistLiveSmokeReport['add']['action'];
  readonly addErrorCode?: TossWatchlistLiveSmokeErrorCode | null;
  readonly afterAdd?: TossWatchlistLiveSmokeSnapshot;
  readonly removeAttempted?: boolean;
  readonly removeAttemptCount?: number;
  readonly removeAction?: TossWatchlistLiveSmokeReport['remove']['action'];
  readonly removeErrorCode?: TossWatchlistLiveSmokeErrorCode | null;
  readonly afterRemove?: TossWatchlistLiveSmokeSnapshot;
  readonly restored?: boolean;
}): TossWatchlistLiveSmokeReport {
  const issues = input.outcome === 'ok' ? [] : [input.outcome];
  return {
    ok: input.outcome === 'ok',
    outcome: input.outcome,
    provider: 'toss-watchlist-live-smoke',
    startedAt: input.startedAt,
    finishedAt: input.now().toISOString(),
    approval: {
      required: true,
      provided: input.approvalProvided,
      scope: 'toss-watchlist-add-remove-smoke',
    },
    candidate: {
      selected: input.candidateKind !== undefined,
      kind: input.candidateKind ?? null,
      redacted: true,
    },
    before: input.before,
    add: {
      attempted: input.addAttempted ?? false,
      action: input.addAction ?? 'not_run',
      errorCode: input.addErrorCode ?? null,
    },
    afterAdd: input.afterAdd ?? EMPTY_SNAPSHOT,
    remove: {
      attempted: input.removeAttempted ?? false,
      attempts: input.removeAttemptCount ?? 0,
      action: input.removeAction ?? 'not_run',
      errorCode: input.removeErrorCode ?? null,
    },
    afterRemove: input.afterRemove ?? EMPTY_SNAPSHOT,
    restored: input.restored ?? false,
    issues,
  };
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
