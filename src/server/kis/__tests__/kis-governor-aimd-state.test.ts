import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import {
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
