import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

import { createChildLogger } from '@shared/logger.js';
import { resolveDataPath } from '../runtime-paths.js';
import type {
  KisGovernorAimdDecision,
  KisGovernorAimdMode,
} from './kis-governor-aimd.js';

const log = createChildLogger('kis-governor-aimd-state');
const DEFAULT_AIMD_STATE_FILE = 'kis-governor-aimd-state.json';
const DEFAULT_POLLING_MIN_START_GAP_MS = 350;
const DEFAULT_POLLING_RECOVERY_RATE_PER_SEC = 3;
const DEFAULT_EVALUATION_INTERVAL_MS = 10 * 60 * 1_000;

export type KisGovernorAimdAdjustmentDirection =
  | 'increase_gap'
  | 'decrease_gap'
  | 'none';

export interface KisGovernorAimdStateSnapshot {
  enabled: boolean;
  mode: KisGovernorAimdMode;
  currentPollingMinStartGapMs: number;
  currentPollingRecoveryRatePerSec: number;
  baselinePollingMinStartGapMs: number;
  lastAdjustmentAtMs: number | null;
  lastAdjustmentDirection: KisGovernorAimdAdjustmentDirection;
  lastAdjustmentReason: string | null;
  nextEvaluationAtMs: number | null;
  cleanRegularMarketWindowCount: number;
  degradedWindowCount: number;
  rollbackBaseline: {
    pollingMinStartGapMs: number;
    pollingRecoveryRatePerSec: number;
  };
}

export interface KisGovernorAimdStateStore {
  load(): Promise<KisGovernorAimdStateSnapshot>;
  save(snapshot: KisGovernorAimdStateSnapshot): Promise<void>;
  reset(): Promise<void>;
  snapshot(): KisGovernorAimdStateSnapshot;
}

export interface FileKisGovernorAimdStateStoreOptions {
  path?: string;
}

export interface ApplyKisGovernorAimdDecisionOptions {
  evaluatedAtMs: number;
  nextEvaluationDelayMs?: number;
}

const stateSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['observe_only', 'active']),
  currentPollingMinStartGapMs: z.number().int().min(0),
  currentPollingRecoveryRatePerSec: z.number().min(0.1).default(DEFAULT_POLLING_RECOVERY_RATE_PER_SEC),
  baselinePollingMinStartGapMs: z.number().int().min(0),
  lastAdjustmentAtMs: z.number().int().min(0).nullable(),
  lastAdjustmentDirection: z.enum(['increase_gap', 'decrease_gap', 'none']),
  lastAdjustmentReason: z.string().max(120).nullable(),
  nextEvaluationAtMs: z.number().int().min(0).nullable(),
  cleanRegularMarketWindowCount: z.number().int().min(0),
  degradedWindowCount: z.number().int().min(0),
  rollbackBaseline: z.object({
    pollingMinStartGapMs: z.number().int().min(0),
    pollingRecoveryRatePerSec: z.number().min(0),
  }),
});

const fileSchema = z.object({
  version: z.literal(1),
  state: stateSchema,
});

export function defaultKisGovernorAimdState(): KisGovernorAimdStateSnapshot {
  return {
    enabled: false,
    mode: 'observe_only',
    currentPollingMinStartGapMs: DEFAULT_POLLING_MIN_START_GAP_MS,
    currentPollingRecoveryRatePerSec: DEFAULT_POLLING_RECOVERY_RATE_PER_SEC,
    baselinePollingMinStartGapMs: DEFAULT_POLLING_MIN_START_GAP_MS,
    lastAdjustmentAtMs: null,
    lastAdjustmentDirection: 'none',
    lastAdjustmentReason: null,
    nextEvaluationAtMs: null,
    cleanRegularMarketWindowCount: 0,
    degradedWindowCount: 0,
    rollbackBaseline: {
      pollingMinStartGapMs: DEFAULT_POLLING_MIN_START_GAP_MS,
      pollingRecoveryRatePerSec: DEFAULT_POLLING_RECOVERY_RATE_PER_SEC,
    },
  };
}

export function applyKisGovernorAimdDecisionToState(
  state: KisGovernorAimdStateSnapshot,
  decision: KisGovernorAimdDecision,
  options: ApplyKisGovernorAimdDecisionOptions,
): KisGovernorAimdStateSnapshot {
  if (!decision.applyRuntimeChange || decision.mode !== 'active') {
    return cloneState(state);
  }

  const proposedGap = Math.max(0, Math.trunc(decision.proposedPollingMinStartGapMs));
  const currentGap = Math.max(0, Math.trunc(state.currentPollingMinStartGapMs));
  if (proposedGap === currentGap) {
    return cloneState(state);
  }

  const direction: KisGovernorAimdAdjustmentDirection =
    proposedGap > currentGap ? 'increase_gap' : 'decrease_gap';
  const evaluatedAtMs = Math.max(0, Math.trunc(options.evaluatedAtMs));
  const delayMs = Math.max(
    0,
    Math.trunc(options.nextEvaluationDelayMs ?? DEFAULT_EVALUATION_INTERVAL_MS),
  );

  return {
    ...state,
    enabled: true,
    mode: 'active',
    currentPollingMinStartGapMs: proposedGap,
    lastAdjustmentAtMs: evaluatedAtMs,
    lastAdjustmentDirection: direction,
    lastAdjustmentReason: decision.reason,
    nextEvaluationAtMs: evaluatedAtMs + delayMs,
    cleanRegularMarketWindowCount: direction === 'increase_gap'
      ? 0
      : state.cleanRegularMarketWindowCount,
    degradedWindowCount: direction === 'increase_gap'
      ? state.degradedWindowCount + 1
      : 0,
    rollbackBaseline: { ...state.rollbackBaseline },
  };
}

export function createFileKisGovernorAimdStateStore(
  options: FileKisGovernorAimdStateStoreOptions = {},
): KisGovernorAimdStateStore {
  const path = options.path ?? resolveDataPath(DEFAULT_AIMD_STATE_FILE);
  let current = defaultKisGovernorAimdState();

  async function load(): Promise<KisGovernorAimdStateSnapshot> {
    let raw: string;
    try {
      raw = await fs.readFile(path, 'utf8');
    } catch (err: unknown) {
      if (isMissingFile(err)) {
        current = defaultKisGovernorAimdState();
        return snapshot();
      }
      log.warn(
        { path, err: err instanceof Error ? err.message : String(err) },
        'KIS governor AIMD state file unreadable - using disabled defaults',
      );
      current = defaultKisGovernorAimdState();
      return snapshot();
    }

    try {
      current = normalizeState(fileSchema.parse(JSON.parse(raw)).state);
      return snapshot();
    } catch (err: unknown) {
      log.warn(
        { path, err: err instanceof Error ? err.message : String(err) },
        'KIS governor AIMD state file malformed - using disabled defaults',
      );
      current = defaultKisGovernorAimdState();
      return snapshot();
    }
  }

  async function save(snapshotInput: KisGovernorAimdStateSnapshot): Promise<void> {
    current = normalizeState(stateSchema.parse(snapshotInput));
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(
      path,
      `${JSON.stringify({ version: 1, state: current }, null, 2)}\n`,
      'utf8',
    );
  }

  async function reset(): Promise<void> {
    current = defaultKisGovernorAimdState();
    await fs.rm(path, { force: true });
  }

  function snapshot(): KisGovernorAimdStateSnapshot {
    return {
      ...current,
      rollbackBaseline: { ...current.rollbackBaseline },
    };
  }

  return { load, save, reset, snapshot };
}

function normalizeState(input: KisGovernorAimdStateSnapshot): KisGovernorAimdStateSnapshot {
  const baseline = Math.trunc(input.baselinePollingMinStartGapMs);
  const rollbackRecoveryRate = Math.max(
    0.1,
    input.rollbackBaseline.pollingRecoveryRatePerSec,
  );
  const enabled = input.enabled;
  return {
    enabled,
    mode: enabled ? input.mode : 'observe_only',
    currentPollingMinStartGapMs: enabled
      ? Math.trunc(input.currentPollingMinStartGapMs)
      : baseline,
    currentPollingRecoveryRatePerSec: enabled
      ? Math.max(0.1, input.currentPollingRecoveryRatePerSec)
      : rollbackRecoveryRate,
    baselinePollingMinStartGapMs: baseline,
    lastAdjustmentAtMs: input.lastAdjustmentAtMs,
    lastAdjustmentDirection: input.lastAdjustmentDirection,
    lastAdjustmentReason: input.lastAdjustmentReason,
    nextEvaluationAtMs: input.nextEvaluationAtMs,
    cleanRegularMarketWindowCount: Math.trunc(input.cleanRegularMarketWindowCount),
    degradedWindowCount: Math.trunc(input.degradedWindowCount),
    rollbackBaseline: {
      pollingMinStartGapMs: Math.trunc(input.rollbackBaseline.pollingMinStartGapMs),
      pollingRecoveryRatePerSec: rollbackRecoveryRate,
    },
  } satisfies KisGovernorAimdStateSnapshot;
}

function cloneState(state: KisGovernorAimdStateSnapshot): KisGovernorAimdStateSnapshot {
  return {
    ...state,
    rollbackBaseline: { ...state.rollbackBaseline },
  };
}

function isMissingFile(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'ENOENT'
  );
}
