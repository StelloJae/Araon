import { describe, expect, it, vi } from 'vitest';

import { createLauncherHeartbeatController } from '../launcher-heartbeat.js';

describe('createLauncherHeartbeatController', () => {
  it('is disabled by default and does not schedule shutdown', () => {
    const onInactive = vi.fn();
    const controller = createLauncherHeartbeatController({ enabled: false, onInactive });

    expect(controller.status()).toEqual({
      enabled: false,
      exitWhenBrowserCloses: false,
      heartbeatIntervalMs: 5000,
      heartbeatTimeoutMs: 20000,
      activeTabCount: 0,
    });
    controller.checkInactive();
    expect(onInactive).not.toHaveBeenCalled();
  });

  it('tracks tab heartbeats and triggers inactivity after timeout', () => {
    const onInactive = vi.fn();
    let now = 1000;
    const controller = createLauncherHeartbeatController({
      enabled: true,
      heartbeatTimeoutMs: 15000,
      initialGraceMs: 30000,
      onInactive,
      now: () => now,
    });

    controller.heartbeat('tab-a');
    expect(controller.status().activeTabCount).toBe(1);

    now += 14000;
    controller.checkInactive();
    expect(onInactive).not.toHaveBeenCalled();

    now += 2000;
    controller.checkInactive();
    expect(onInactive).toHaveBeenCalledTimes(1);
  });

  it('uses an initial grace period before the first heartbeat arrives', () => {
    const onInactive = vi.fn();
    let now = 5000;
    const controller = createLauncherHeartbeatController({
      enabled: true,
      heartbeatTimeoutMs: 15000,
      initialGraceMs: 30000,
      onInactive,
      now: () => now,
    });

    now += 29000;
    controller.checkInactive();
    expect(onInactive).not.toHaveBeenCalled();

    now += 1001;
    controller.checkInactive();
    expect(onInactive).toHaveBeenCalledTimes(1);
  });

  it('removes a tab when the browser sends a closing heartbeat', () => {
    const controller = createLauncherHeartbeatController({ enabled: true, onInactive: vi.fn() });

    controller.heartbeat('tab-a');
    controller.closeTab('tab-a');

    expect(controller.status().activeTabCount).toBe(0);
  });
});
