import { describe, expect, it, vi } from 'vitest';

import { startLauncherHeartbeat } from '../launcher-heartbeat.js';

describe('startLauncherHeartbeat', () => {
  it('does nothing when launcher heartbeat is disabled', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: { enabled: false },
    })));
    const setInterval = vi.fn();

    const stop = await startLauncherHeartbeat({ fetch, setInterval });

    expect(setInterval).not.toHaveBeenCalled();
    stop();
  });

  it('sends heartbeat only when launcher heartbeat is enabled', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: { enabled: true, heartbeatIntervalMs: 5000 },
    })));
    const setInterval = vi.fn((_cb: () => void) => 123);
    const clearInterval = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();

    const stop = await startLauncherHeartbeat({
      fetch,
      setInterval,
      clearInterval,
      addEventListener,
      removeEventListener,
      tabId: 'tab-a',
    });

    expect(fetch).toHaveBeenCalledWith('/runtime/launcher/status');
    expect(fetch).toHaveBeenCalledWith('/runtime/launcher/heartbeat', expect.objectContaining({
      method: 'POST',
    }));
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 5000);

    stop();
    expect(clearInterval).toHaveBeenCalledWith(123);
    expect(removeEventListener).toHaveBeenCalledWith('pagehide', expect.any(Function));
  });

  it('falls back to fetch on pagehide when navigator is unavailable', async () => {
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: undefined,
    });

    try {
      const fetch = vi.fn(async () => new Response(JSON.stringify({
        success: true,
        data: { enabled: true, heartbeatIntervalMs: 5000 },
      })));
      const setInterval = vi.fn((_cb: () => void) => 123);
      const clearInterval = vi.fn();
      const listeners = new Map<string, () => void>();
      const addEventListener = vi.fn((event: string, listener: () => void) => {
        listeners.set(event, listener);
      });
      const removeEventListener = vi.fn();

      const stop = await startLauncherHeartbeat({
        fetch,
        setInterval,
        clearInterval,
        addEventListener,
        removeEventListener,
        tabId: 'tab-a',
      });

      listeners.get('pagehide')?.();

      expect(fetch).toHaveBeenCalledWith('/runtime/launcher/heartbeat', expect.objectContaining({
        method: 'POST',
        keepalive: true,
        body: JSON.stringify({ tabId: 'tab-a', closing: true }),
      }));

      stop();
    } finally {
      if (originalNavigator !== undefined) {
        Object.defineProperty(globalThis, 'navigator', originalNavigator);
      } else {
        delete (globalThis as { navigator?: Navigator }).navigator;
      }
    }
  });
});
