interface LauncherStatusEnvelope {
  success: boolean;
  data?: {
    enabled?: boolean;
    heartbeatIntervalMs?: number;
  };
}

export interface LauncherHeartbeatDeps {
  fetch?: typeof fetch;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
  addEventListener?: typeof window.addEventListener;
  removeEventListener?: typeof window.removeEventListener;
  sendBeacon?: typeof navigator.sendBeacon;
  tabId?: string;
}

export async function startLauncherHeartbeat(deps: LauncherHeartbeatDeps = {}): Promise<() => void> {
  const fetchFn = deps.fetch ?? fetch;
  const statusRes = await fetchFn('/runtime/launcher/status');
  const status = await statusRes.json() as LauncherStatusEnvelope;
  if (status.success !== true || status.data?.enabled !== true) {
    return () => undefined;
  }

  const tabId = deps.tabId ?? createTabId();
  const intervalMs = status.data.heartbeatIntervalMs ?? 5000;
  const setIntervalFn = deps.setInterval ?? setInterval;
  const clearIntervalFn = deps.clearInterval ?? clearInterval;
  const addEventListener = deps.addEventListener ?? window.addEventListener.bind(window);
  const removeEventListener = deps.removeEventListener ?? window.removeEventListener.bind(window);
  const browserNavigator = typeof navigator === 'undefined' ? undefined : navigator;
  const sendBeacon = deps.sendBeacon ?? browserNavigator?.sendBeacon?.bind(browserNavigator);

  async function sendHeartbeat(closing = false): Promise<void> {
    const body = JSON.stringify({ tabId, closing });
    await fetchFn('/runtime/launcher/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
  }

  void sendHeartbeat();
  const interval = setIntervalFn(() => {
    void sendHeartbeat();
  }, intervalMs);

  const onPageHide = () => {
    const body = JSON.stringify({ tabId, closing: true });
    if (sendBeacon !== undefined) {
      sendBeacon('/runtime/launcher/heartbeat', new Blob([body], { type: 'application/json' }));
      return;
    }
    void sendHeartbeat(true);
  };

  addEventListener('pagehide', onPageHide);

  return () => {
    clearIntervalFn(interval);
    removeEventListener('pagehide', onPageHide);
  };
}

function createTabId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
