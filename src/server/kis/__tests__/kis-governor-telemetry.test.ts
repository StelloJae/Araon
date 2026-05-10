import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import {
  createFileKisGovernorTelemetryStore,
  type KisGovernorTelemetrySnapshot,
} from '../kis-governor-telemetry.js';

describe('createFileKisGovernorTelemetryStore', () => {
  it('persists a bounded sanitized telemetry snapshot', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'araon-kis-governor-telemetry-'));
    const path = join(dir, 'telemetry.json');
    const store = createFileKisGovernorTelemetryStore({ path, capacity: 2 });
    await store.load();

    await store.save({
      capacity: 2,
      eventCount: 3,
      recent: [
        event(1_000, 'throttle'),
        event(2_000, 'recovered'),
        {
          ...event(3_000, 'normal'),
          appKey: 'SHOULD_NOT_APPEAR',
          appSecret: 'SHOULD_NOT_APPEAR',
          rawBody: { token: 'SHOULD_NOT_APPEAR' },
        },
      ],
    } as unknown as KisGovernorTelemetrySnapshot);

    const reloaded = createFileKisGovernorTelemetryStore({ path, capacity: 2 });
    await reloaded.load();

    expect(reloaded.snapshot()).toEqual({
      capacity: 2,
      eventCount: 2,
      recent: [
        event(2_000, 'recovered'),
        event(3_000, 'normal'),
      ],
    });
    expect(await readFile(path, 'utf8')).not.toContain('SHOULD_NOT_APPEAR');
  });
});

function event(
  atMs: number,
  type: KisGovernorTelemetrySnapshot['recent'][number]['event'],
): KisGovernorTelemetrySnapshot['recent'][number] {
  return {
    atMs,
    event: type,
    profileId: 'primary',
    endpointClass: 'polling',
    priorityClass: 'polling',
    state: type === 'normal' ? 'normal' : type === 'throttle' ? 'throttled' : 'recovering',
    throttleCode: 'EGW00201',
    recoveryAttemptCount: 0,
    observedRecoveryMs: type === 'throttle' ? null : 150,
    currentAllowedRps: type === 'normal' ? 10 : 4,
    minStartGapMs: type === 'normal' ? 120 : 250,
    maxInFlight: 2,
  };
}
