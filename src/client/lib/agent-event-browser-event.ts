import type { AgentEventNotificationPayload } from '@shared/types';
import type { AgentEventPayload } from './api-client';

export const ARAON_AGENT_EVENT_EVENT = 'araon:agent-event';

export function agentNotificationToRailEvent(
  event: AgentEventNotificationPayload,
): AgentEventPayload {
  return event;
}

export function mergeAgentEventRailSnapshot(
  current: readonly AgentEventPayload[],
  event: AgentEventNotificationPayload,
  limit = 10,
): AgentEventPayload[] {
  const next = agentNotificationToRailEvent(event);
  return [
    next,
    ...current.filter((item) => item.id !== next.id),
  ].slice(0, limit);
}

export function dispatchAgentEventBrowserEvent(
  event: AgentEventNotificationPayload,
  target: EventTarget = window,
): void {
  target.dispatchEvent(
    new CustomEvent<AgentEventNotificationPayload>(ARAON_AGENT_EVENT_EVENT, {
      detail: event,
    }),
  );
}
