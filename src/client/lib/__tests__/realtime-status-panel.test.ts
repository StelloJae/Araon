import { describe, expect, it, vi } from 'vitest';

import {
  realtimeStatusPollIntervalMs,
  syncRealtimeStatusPanelPolling,
  type RealtimeStatusPollingHandle,
} from '../realtime-status-panel';

describe('realtime status panel polling', () => {
  it('does not poll while the panel is closed', () => {
    const fetchStatus = vi.fn(async () => ({ state: 'disabled' }));
    const setIntervalFn = vi.fn();

    const handle = syncRealtimeStatusPanelPolling({
      open: false,
      current: null,
      fetchStatus,
      onStatus: vi.fn(),
      onError: vi.fn(),
      setIntervalFn,
      clearIntervalFn: vi.fn(),
    });

    expect(handle).toBeNull();
    expect(fetchStatus).not.toHaveBeenCalled();
    expect(setIntervalFn).not.toHaveBeenCalled();
  });

  it('fetches immediately and starts one low-frequency poller when open', async () => {
    const fetchStatus = vi.fn(async () => ({ state: 'disabled' }));
    const onStatus = vi.fn();
    const setIntervalFn = vi.fn(() => 7);

    const handle = syncRealtimeStatusPanelPolling({
      open: true,
      current: null,
      fetchStatus,
      onStatus,
      onError: vi.fn(),
      setIntervalFn,
      clearIntervalFn: vi.fn(),
      intervalMs: 15_000,
    });

    await Promise.resolve();

    expect(handle).not.toBeNull();
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith({ state: 'disabled' });
    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 15_000);
  });

  it('clears the active timer when the panel closes', () => {
    const current: RealtimeStatusPollingHandle = {
      intervalMs: 15_000,
      stop: vi.fn(),
    };

    const handle = syncRealtimeStatusPanelPolling({
      open: false,
      current,
      fetchStatus: vi.fn(),
      onStatus: vi.fn(),
      onError: vi.fn(),
      setIntervalFn: vi.fn(),
      clearIntervalFn: vi.fn(),
    });

    expect(handle).toBeNull();
    expect(current.stop).toHaveBeenCalledTimes(1);
  });

  it('does not create an EventSource connection', () => {
    const EventSourceSpy = vi.fn();
    vi.stubGlobal('EventSource', EventSourceSpy);

    syncRealtimeStatusPanelPolling({
      open: true,
      current: null,
      fetchStatus: vi.fn(async () => ({ state: 'idle' })),
      onStatus: vi.fn(),
      onError: vi.fn(),
      setIntervalFn: vi.fn(() => 1),
      clearIntervalFn: vi.fn(),
    });

    expect(EventSourceSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('uses faster polling while a realtime session is active', () => {
    expect(realtimeStatusPollIntervalMs({ sessionRealtimeEnabled: true })).toBe(5_000);
    expect(realtimeStatusPollIntervalMs({ sessionRealtimeEnabled: false })).toBe(15_000);
    expect(realtimeStatusPollIntervalMs(null)).toBe(15_000);
  });

  it('restarts the timer when the requested interval changes', () => {
    const current: RealtimeStatusPollingHandle = {
      intervalMs: 15_000,
      stop: vi.fn(),
    };
    const setIntervalFn = vi.fn(() => 9);

    const handle = syncRealtimeStatusPanelPolling({
      open: true,
      current,
      fetchStatus: vi.fn(async () => ({ state: 'connected' })),
      onStatus: vi.fn(),
      onError: vi.fn(),
      setIntervalFn,
      clearIntervalFn: vi.fn(),
      intervalMs: 5_000,
    });

    expect(current.stop).toHaveBeenCalledTimes(1);
    expect(handle?.intervalMs).toBe(5_000);
    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 5_000);
  });
});
