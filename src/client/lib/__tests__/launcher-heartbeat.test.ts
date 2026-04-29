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
});
