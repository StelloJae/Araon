export interface AgentEventAlertDeliverySnapshot {
  readonly returnedCount: number;
  readonly items: readonly AgentEventAlertDeliverySnapshotItem[];
  readonly summary: AgentEventAlertDeliverySnapshotSummary;
}

export interface AgentEventAlertDeliverySnapshotItem {
  readonly status: 'dispatched' | 'skipped_no_client' | string;
  readonly clientCount: number;
  readonly dispatchLatencyMs: number;
}

export interface AgentEventAlertDeliverySnapshotSummary {
  readonly targetFirstSeenToDispatchMs: number;
  readonly totalCount: number;
  readonly dispatchedCount: number;
  readonly skippedNoClientCount: number;
  readonly dispatchedWithinTargetCount: number;
  readonly dispatchedLateCount: number;
  readonly lastDispatchLatencyMs: number | null;
  readonly maxDispatchLatencyMs: number | null;
}

export interface AgentEventAlertDeliveryEventSnapshot {
  readonly returnedCount: number;
}

export interface AgentEventAlertDeliverySmokeOptions {
  readonly addTrackedStock: () => Promise<void>;
  readonly createLocalSignal: () => Promise<void>;
  readonly getAgentEvents: () => Promise<AgentEventAlertDeliveryEventSnapshot>;
  readonly getDeliveries: () => Promise<AgentEventAlertDeliverySnapshot>;
  readonly wait: (ms: number) => Promise<void>;
  readonly waitMs?: number;
  readonly now?: () => Date;
}

export interface AgentEventAlertDeliverySmokeReport {
  readonly provider: 'araon-agent-event-alert-delivery';
  readonly generatedAt: string;
  readonly outcome: 'ok' | 'partial' | 'failed';
  readonly errorCode:
    | 'AGENT_EVENT_ALERT_DELIVERY_SMOKE_FAILED'
    | 'AGENT_EVENT_ALERT_DELIVERY_NOT_OBSERVED'
    | null;
  readonly externalCallsEnabled: false;
  readonly setup: {
    readonly stockRegistered: boolean;
    readonly localSignalCreated: boolean;
    readonly agentEventCount: number | null;
  };
  readonly early: {
    readonly returnedCount: number | null;
  };
  readonly final: {
    readonly returnedCount: number | null;
    readonly status: string | null;
    readonly clientCount: number | null;
    readonly dispatchLatencyMs: number | null;
    readonly withinTarget: boolean | null;
    readonly targetFirstSeenToDispatchMs: number | null;
  };
}

const DEFAULT_WAIT_MS = 10_500;

export async function runAgentEventAlertDeliverySmoke(
  options: AgentEventAlertDeliverySmokeOptions,
): Promise<AgentEventAlertDeliverySmokeReport> {
  const now = options.now ?? (() => new Date());
  const generatedAt = now().toISOString();
  const waitMs = normalizeWaitMs(options.waitMs);

  try {
    await options.addTrackedStock();
    await options.createLocalSignal();

    const early = await options.getDeliveries();
    const events = await options.getAgentEvents();
    await options.wait(waitMs);
    const finalSnapshot = await options.getDeliveries();
    const latest = finalSnapshot.items[0] ?? null;
    const withinTarget = latest === null
      ? null
      : latest.dispatchLatencyMs <= finalSnapshot.summary.targetFirstSeenToDispatchMs;

    const observed = events.returnedCount > 0 && latest !== null && withinTarget === true;
    return {
      provider: 'araon-agent-event-alert-delivery',
      generatedAt,
      outcome: observed ? 'ok' : 'partial',
      errorCode: observed ? null : 'AGENT_EVENT_ALERT_DELIVERY_NOT_OBSERVED',
      externalCallsEnabled: false,
      setup: {
        stockRegistered: true,
        localSignalCreated: true,
        agentEventCount: events.returnedCount,
      },
      early: {
        returnedCount: early.returnedCount,
      },
      final: {
        returnedCount: finalSnapshot.returnedCount,
        status: latest?.status ?? null,
        clientCount: latest?.clientCount ?? null,
        dispatchLatencyMs: latest?.dispatchLatencyMs ?? null,
        withinTarget,
        targetFirstSeenToDispatchMs: finalSnapshot.summary.targetFirstSeenToDispatchMs,
      },
    };
  } catch {
    return {
      provider: 'araon-agent-event-alert-delivery',
      generatedAt,
      outcome: 'failed',
      errorCode: 'AGENT_EVENT_ALERT_DELIVERY_SMOKE_FAILED',
      externalCallsEnabled: false,
      setup: {
        stockRegistered: false,
        localSignalCreated: false,
        agentEventCount: null,
      },
      early: {
        returnedCount: null,
      },
      final: {
        returnedCount: null,
        status: null,
        clientCount: null,
        dispatchLatencyMs: null,
        withinTarget: null,
        targetFirstSeenToDispatchMs: null,
      },
    };
  }
}

function normalizeWaitMs(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_WAIT_MS;
  return Math.max(0, Math.trunc(value));
}
