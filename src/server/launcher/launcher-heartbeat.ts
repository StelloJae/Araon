export interface LauncherHeartbeatStatus {
  enabled: boolean;
  exitWhenBrowserCloses: boolean;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  activeTabCount: number;
}

export interface LauncherHeartbeatControllerOptions {
  enabled: boolean;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  initialGraceMs?: number;
  onInactive: () => void | Promise<void>;
  now?: () => number;
}

export interface LauncherHeartbeatController {
  status(): LauncherHeartbeatStatus;
  heartbeat(tabId: string): void;
  closeTab(tabId: string): void;
  checkInactive(): void;
}

export function createLauncherHeartbeatController(
  options: LauncherHeartbeatControllerOptions,
): LauncherHeartbeatController {
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5000;
  const heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 20000;
  const initialGraceMs = options.initialGraceMs ?? 30000;
  const now = options.now ?? (() => Date.now());
  const enabledAt = now();
  const tabs = new Map<string, number>();
  let lastAnyHeartbeatAt: number | null = null;
  let inactiveTriggered = false;

  function triggerInactive(): void {
    if (inactiveTriggered) return;
    inactiveTriggered = true;
    void options.onInactive();
  }

  return {
    status(): LauncherHeartbeatStatus {
      return {
        enabled: options.enabled,
        exitWhenBrowserCloses: options.enabled,
        heartbeatIntervalMs,
        heartbeatTimeoutMs,
        activeTabCount: tabs.size,
      };
    },
    heartbeat(tabId: string): void {
      if (!options.enabled) return;
      const at = now();
      tabs.set(tabId, at);
      lastAnyHeartbeatAt = at;
    },
    closeTab(tabId: string): void {
      tabs.delete(tabId);
    },
    checkInactive(): void {
      if (!options.enabled || inactiveTriggered) return;
      const at = now();
      for (const [tabId, lastSeen] of tabs) {
        if (at - lastSeen > heartbeatTimeoutMs) {
          tabs.delete(tabId);
        }
      }
      if (lastAnyHeartbeatAt === null) {
        if (at - enabledAt > initialGraceMs) triggerInactive();
        return;
      }
      if (tabs.size === 0 || at - lastAnyHeartbeatAt > heartbeatTimeoutMs) {
        triggerInactive();
      }
    },
  };
}
