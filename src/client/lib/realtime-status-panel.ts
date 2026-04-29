export interface RealtimeStatusPollingHandle {
  readonly intervalMs: number;
  stop(): void;
}

export interface RealtimeStatusPanelPollingOptions<TStatus> {
  readonly open: boolean;
  readonly current: RealtimeStatusPollingHandle | null;
  readonly fetchStatus: () => Promise<TStatus>;
  readonly onStatus: (status: TStatus) => void;
  readonly onError: (error: unknown) => void;
  readonly intervalMs?: number;
  readonly setIntervalFn?: (handler: () => void, timeout: number) => unknown;
  readonly clearIntervalFn?: (handle: unknown) => void;
}

const DEFAULT_REALTIME_STATUS_POLL_MS = 15_000;
const ACTIVE_REALTIME_STATUS_POLL_MS = 5_000;

export function realtimeStatusPollIntervalMs(
  status: { readonly sessionRealtimeEnabled: boolean } | null,
): number {
  return status?.sessionRealtimeEnabled === true
    ? ACTIVE_REALTIME_STATUS_POLL_MS
    : DEFAULT_REALTIME_STATUS_POLL_MS;
}

export function syncRealtimeStatusPanelPolling<TStatus>(
  options: RealtimeStatusPanelPollingOptions<TStatus>,
): RealtimeStatusPollingHandle | null {
  const intervalMs = options.intervalMs ?? DEFAULT_REALTIME_STATUS_POLL_MS;
  if (!options.open) {
    options.current?.stop();
    return null;
  }
  if (options.current !== null) {
    if (options.current.intervalMs === intervalMs) {
      return options.current;
    }
    options.current.stop();
  }
  return startRealtimeStatusPolling(options, intervalMs);
}

function startRealtimeStatusPolling<TStatus>(
  options: RealtimeStatusPanelPollingOptions<TStatus>,
  intervalMs: number,
): RealtimeStatusPollingHandle {
  const setIntervalFn =
    options.setIntervalFn ??
    ((handler: () => void, timeout: number): unknown =>
      window.setInterval(handler, timeout));
  const clearIntervalFn =
    options.clearIntervalFn ??
    ((handle: unknown): void => {
      window.clearInterval(handle as number);
    });

  function refresh(): void {
    void options.fetchStatus()
      .then(options.onStatus)
      .catch(options.onError);
  }

  refresh();
  const timer = setIntervalFn(
    refresh,
    intervalMs,
  );

  return {
    intervalMs,
    stop(): void {
      clearIntervalFn(timer);
    },
  };
}
