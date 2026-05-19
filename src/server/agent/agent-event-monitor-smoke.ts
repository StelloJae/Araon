import type {
  AgentEventMonitorProviderObservation,
  AgentEventMonitorProviderState,
  AgentEventMonitorRunResult,
  AgentEventMonitorStatus,
} from './agent-event-monitor.js';

export interface AgentEventMonitorSmokeOptions {
  readonly getStatus: () => Promise<AgentEventMonitorStatus>;
  readonly runTick?: (reason: string) => Promise<AgentEventMonitorRunResult>;
  readonly runTickEnabled?: boolean;
  readonly now?: () => Date;
}

export interface AgentEventMonitorSmokeReport {
  readonly provider: 'araon-agent-event-monitor';
  readonly generatedAt: string;
  readonly outcome: 'ok' | 'partial' | 'failed';
  readonly errorCode:
    | 'AGENT_EVENT_MONITOR_SMOKE_STATUS_FAILED'
    | 'AGENT_EVENT_MONITOR_SMOKE_TICK_FAILED'
    | null;
  readonly status: AgentEventMonitorSmokeStatus | null;
  readonly tick: AgentEventMonitorSmokeTick | null;
}

export interface AgentEventMonitorSmokeStatus {
  readonly enabled: boolean;
  readonly running: boolean;
  readonly intervalMs: number;
  readonly maxTickersPerCycle: number;
  readonly providerCooldownMs: number;
  readonly watchSources: readonly string[];
  readonly fullMarketPolling: false;
  readonly watchedTickerCount: number;
  readonly candidateCount: number;
  readonly lastCycleAt: string | null;
  readonly lastCycleDurationMs: number | null;
  readonly lastSkippedRefreshes: number;
  readonly lastErrorCode: string | null;
  readonly providers: AgentEventMonitorSmokeProviders;
  readonly tossSignal: {
    readonly endpointPath: string;
    readonly shapeProbeHosts: readonly string[];
    readonly bodyContract: 'capture_required' | 'configured';
    readonly captureRequired: boolean;
    readonly externalCallsEnabled: boolean;
    readonly rawTemplateExposed: false;
    readonly semanticPolicy: {
      readonly emptyResponse: 'supported_empty_not_actionable';
      readonly eventEmission: 'non_empty_items_only';
      readonly agentEventType: 'toss_signal_detected';
      readonly rawPayloadExposed: false;
    };
    readonly nextAction: 'user-assisted-capture-required' | 'configured';
  };
}

export interface AgentEventMonitorSmokeProviders {
  readonly news: AgentEventMonitorSmokeProvider;
  readonly tossNews: AgentEventMonitorSmokeProvider;
  readonly tossSignal: AgentEventMonitorSmokeProvider;
  readonly disclosure: AgentEventMonitorSmokeProvider;
}

export interface AgentEventMonitorSmokeProvider {
  readonly enabled: boolean;
  readonly reason: AgentEventMonitorProviderState['reason'];
  readonly lastAttemptedAt: string | null;
  readonly lastDurationMs: number | null;
  readonly lastOutcome: AgentEventMonitorProviderObservation['lastOutcome'];
  readonly lastInsertedEvents: number;
  readonly lastErrorCode: string | null;
}

export interface AgentEventMonitorSmokeTick {
  readonly requested: boolean;
  readonly externalCallsMayRun: boolean;
  readonly state: AgentEventMonitorRunResult['state'] | 'failed';
  readonly reason: string;
  readonly nextAction:
    | 'none'
    | 'set_env_and_restart'
    | 'inspect_tick_failure';
  readonly tickerCount: number;
  readonly refreshedNews: number;
  readonly refreshedTossNews: number;
  readonly refreshedTossSignals: number;
  readonly refreshedDisclosures: number;
  readonly skippedRefreshes: number;
  readonly insertedEvents: number;
  readonly errorCode: 'AGENT_EVENT_MONITOR_SMOKE_TICK_FAILED' | null;
}

export async function runAgentEventMonitorSmoke(
  options: AgentEventMonitorSmokeOptions,
): Promise<AgentEventMonitorSmokeReport> {
  const now = options.now ?? (() => new Date());
  const generatedAt = now().toISOString();
  let status: AgentEventMonitorStatus;

  try {
    status = await options.getStatus();
  } catch {
    return {
      provider: 'araon-agent-event-monitor',
      generatedAt,
      outcome: 'failed',
      errorCode: 'AGENT_EVENT_MONITOR_SMOKE_STATUS_FAILED',
      status: null,
      tick: null,
    };
  }

  const statusSummary = summarizeStatus(status);
  if (options.runTickEnabled !== true) {
    return {
      provider: 'araon-agent-event-monitor',
      generatedAt,
      outcome: 'ok',
      errorCode: null,
      status: statusSummary,
      tick: null,
    };
  }

  try {
    const result = await options.runTick?.('manual-smoke');
    if (result === undefined) {
      return tickFailureReport(generatedAt, statusSummary, status.enabled);
    }
    const latestStatus = await getLatestStatusAfterTick(options, status);
    return {
      provider: 'araon-agent-event-monitor',
      generatedAt,
      outcome: 'ok',
      errorCode: null,
      status: summarizeStatus(latestStatus),
      tick: summarizeTick(result, status.enabled),
    };
  } catch {
    return tickFailureReport(generatedAt, statusSummary, status.enabled);
  }
}

async function getLatestStatusAfterTick(
  options: AgentEventMonitorSmokeOptions,
  fallback: AgentEventMonitorStatus,
): Promise<AgentEventMonitorStatus> {
  try {
    return await options.getStatus();
  } catch {
    return fallback;
  }
}

function summarizeStatus(status: AgentEventMonitorStatus): AgentEventMonitorSmokeStatus {
  return {
    enabled: status.enabled,
    running: status.running,
    intervalMs: status.intervalMs,
    maxTickersPerCycle: status.maxTickersPerCycle,
    providerCooldownMs: status.providerCooldownMs,
    watchSources: status.watchPolicy.sources,
    fullMarketPolling: status.dispatchPolicy.fullMarketPolling,
    watchedTickerCount: status.watchedTickers.length,
    candidateCount: status.watchedCandidates.length,
    lastCycleAt: status.lastCycleAt,
    lastCycleDurationMs: status.lastCycleDurationMs,
    lastSkippedRefreshes: status.lastSkippedRefreshes,
    lastErrorCode: safeCode(status.lastErrorCode),
    providers: {
      news: summarizeProvider(status.providerStates.news, status.providerObservations.news),
      tossNews: summarizeProvider(status.providerStates.tossNews, status.providerObservations.tossNews),
      tossSignal: summarizeProvider(status.providerStates.tossSignal, status.providerObservations.tossSignal),
      disclosure: summarizeProvider(status.providerStates.disclosure, status.providerObservations.disclosure),
    },
    tossSignal: {
      endpointPath: status.tossSignalContract.endpoint.path,
      shapeProbeHosts: status.tossSignalContract.shapeProbeCandidates
        .map((candidate) => candidate.host),
      bodyContract: status.tossSignalContract.bodyContract,
      captureRequired: status.tossSignalContract.captureRequired,
      externalCallsEnabled: status.tossSignalContract.externalCallsEnabled,
      rawTemplateExposed: status.tossSignalContract.rawTemplateExposed,
      semanticPolicy: status.tossSignalContract.semanticPolicy,
      nextAction: status.tossSignalContract.captureGuidance.nextAction,
    },
  };
}

function summarizeProvider(
  state: AgentEventMonitorProviderState,
  observation: AgentEventMonitorProviderObservation,
): AgentEventMonitorSmokeProvider {
  return {
    enabled: state.enabled,
    reason: state.reason,
    lastAttemptedAt: observation.lastAttemptedAt,
    lastDurationMs: observation.lastDurationMs,
    lastOutcome: observation.lastOutcome,
    lastInsertedEvents: observation.lastInsertedEvents,
    lastErrorCode: safeCode(observation.lastErrorCode),
  };
}

function summarizeTick(
  result: AgentEventMonitorRunResult | undefined,
  monitorEnabled: boolean,
): AgentEventMonitorSmokeTick {
  if (result === undefined) return failedTick(monitorEnabled);
  const state = result.state;
  return {
    requested: true,
    externalCallsMayRun: monitorEnabled,
    state,
    reason: result.reason,
    nextAction: state === 'disabled' ? 'set_env_and_restart' : 'none',
    tickerCount: result.tickers.length,
    refreshedNews: result.refreshedNews,
    refreshedTossNews: result.refreshedTossNews,
    refreshedTossSignals: result.refreshedTossSignals,
    refreshedDisclosures: result.refreshedDisclosures,
    skippedRefreshes: result.skippedRefreshes,
    insertedEvents: result.insertedEvents,
    errorCode: null,
  };
}

function failedTick(monitorEnabled: boolean): AgentEventMonitorSmokeTick {
  return {
    requested: true,
    externalCallsMayRun: monitorEnabled,
    state: 'failed',
    reason: 'manual-smoke',
    nextAction: 'inspect_tick_failure',
    tickerCount: 0,
    refreshedNews: 0,
    refreshedTossNews: 0,
    refreshedTossSignals: 0,
    refreshedDisclosures: 0,
    skippedRefreshes: 0,
    insertedEvents: 0,
    errorCode: 'AGENT_EVENT_MONITOR_SMOKE_TICK_FAILED',
  };
}

function tickFailureReport(
  generatedAt: string,
  status: AgentEventMonitorSmokeStatus,
  monitorEnabled: boolean,
): AgentEventMonitorSmokeReport {
  return {
    provider: 'araon-agent-event-monitor',
    generatedAt,
    outcome: 'partial',
    errorCode: 'AGENT_EVENT_MONITOR_SMOKE_TICK_FAILED',
    status,
    tick: failedTick(monitorEnabled),
  };
}

function safeCode(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,79}$/.test(normalized)) return 'AGENT_EVENT_MONITOR_ERROR';
  if (
    normalized.includes('ACCOUNT') ||
    normalized.includes('COOKIE') ||
    normalized.includes('RAW') ||
    normalized.includes('SECRET') ||
    normalized.includes('SESSION') ||
    normalized.includes('TOKEN')
  ) {
    return 'AGENT_EVENT_MONITOR_ERROR';
  }
  return normalized;
}
