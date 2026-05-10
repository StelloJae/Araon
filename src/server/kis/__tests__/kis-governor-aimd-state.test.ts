import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import {
  applyKisGovernorAimdDecisionToState,
  createFileKisGovernorAimdStateStore,
  defaultKisGovernorAimdState,
  type KisGovernorAimdStateSnapshot,
} from '../kis-governor-aimd-state.js';

describe('createFileKisGovernorAimdStateStore', () => {
  it('loads disabled observe-only defaults when the state file is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'araon-kis-governor-aimd-'));
    const store = createFileKisGovernorAimdStateStore({
      path: join(dir, 'aimd-state.json'),
    });

    await expect(store.load()).resolves.toEqual(defaultKisGovernorAimdState());
  });

  it('persists sanitized AIMD state only', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'araon-kis-governor-aimd-'));
    const path = join(dir, 'aimd-state.json');
    const store = createFileKisGovernorAimdStateStore({ path });

    await store.save({
      ...defaultKisGovernorAimdState(),
      enabled: true,
      mode: 'observe_only',
      currentPollingMinStartGapMs: 325,
      lastAdjustmentAtMs: 1_000,
      lastAdjustmentDirection: 'decrease_gap',
      lastAdjustmentReason: 'clean_regular_market_windows',
      nextEvaluationAtMs: 2_000,
      cleanRegularMarketWindowCount: 3,
      degradedWindowCount: 0,
      appKey: 'SHOULD_NOT_APPEAR',
      appSecret: 'SHOULD_NOT_APPEAR',
      token: 'SHOULD_NOT_APPEAR',
      account: 'SHOULD_NOT_APPEAR',
    } as unknown as KisGovernorAimdStateSnapshot);

    const reloaded = createFileKisGovernorAimdStateStore({ path });
    await reloaded.load();

    expect(reloaded.snapshot()).toEqual({
      ...defaultKisGovernorAimdState(),
      enabled: true,
      mode: 'observe_only',
      currentPollingMinStartGapMs: 325,
      lastAdjustmentAtMs: 1_000,
      lastAdjustmentDirection: 'decrease_gap',
      lastAdjustmentReason: 'clean_regular_market_windows',
      nextEvaluationAtMs: 2_000,
      cleanRegularMarketWindowCount: 3,
      degradedWindowCount: 0,
    });
    expect(await readFile(path, 'utf8')).not.toContain('SHOULD_NOT_APPEAR');
  });

  it('resets rollback state to the manual baseline', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'araon-kis-governor-aimd-'));
    const path = join(dir, 'aimd-state.json');
    const store = createFileKisGovernorAimdStateStore({ path });

    await store.save({
      ...defaultKisGovernorAimdState(),
      enabled: true,
      mode: 'observe_only',
      currentPollingMinStartGapMs: 325,
      lastAdjustmentDirection: 'decrease_gap',
      lastAdjustmentReason: 'clean_regular_market_windows',
    });
    await store.reset();

    expect(store.snapshot()).toEqual(defaultKisGovernorAimdState());
    await expect(readFile(path, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('applyKisGovernorAimdDecisionToState', () => {
  it('persists an active tighten decision as a gap-increase adjustment', () => {
    const next = applyKisGovernorAimdDecisionToState(
      {
        ...defaultKisGovernorAimdState(),
        enabled: true,
        mode: 'active',
        currentPollingMinStartGapMs: 350,
        cleanRegularMarketWindowCount: 2,
        degradedWindowCount: 0,
      },
      {
        mode: 'active',
        action: 'tighten',
        currentPollingMinStartGapMs: 350,
        proposedPollingMinStartGapMs: 438,
        applyRuntimeChange: true,
        reason: 'repeated_throttle',
      },
      { evaluatedAtMs: 1_700_000_000_000 },
    );

    expect(next).toEqual({
      ...defaultKisGovernorAimdState(),
      enabled: true,
      mode: 'active',
      currentPollingMinStartGapMs: 438,
      lastAdjustmentAtMs: 1_700_000_000_000,
      lastAdjustmentDirection: 'increase_gap',
      lastAdjustmentReason: 'repeated_throttle',
      nextEvaluationAtMs: 1_700_000_600_000,
      cleanRegularMarketWindowCount: 0,
      degradedWindowCount: 1,
    });
  });

  it('leaves state unchanged when the decision is observe-only', () => {
    const current = {
      ...defaultKisGovernorAimdState(),
      enabled: true,
      mode: 'observe_only' as const,
      currentPollingMinStartGapMs: 350,
    };

    expect(
      applyKisGovernorAimdDecisionToState(
        current,
        {
          mode: 'observe_only',
          action: 'tighten',
          currentPollingMinStartGapMs: 350,
          proposedPollingMinStartGapMs: 438,
          applyRuntimeChange: false,
          reason: 'repeated_throttle',
        },
        { evaluatedAtMs: 1_700_000_000_000 },
      ),
    ).toEqual(current);
  });
});
