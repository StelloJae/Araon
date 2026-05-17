import type {
  AgentEventFreshness,
  AgentEventNotificationPayload,
} from '@shared/types.js';
import type { AgentEvent } from './agent-event-queue.js';

export function agentEventToPublicPayload(
  event: AgentEvent,
): AgentEventNotificationPayload {
  return {
    id: event.id,
    type: event.type,
    ticker: event.ticker,
    product: {
      productCode: event.productCode,
      krTicker: event.krTicker,
      market: event.market,
      displayName: event.displayName,
    },
    source: event.source,
    publishedAt: event.publishedAt,
    firstSeenAt: event.firstSeenAt,
    freshnessMs: event.freshnessMs,
    freshness: agentEventFreshness(event.freshnessMs),
    relevance: event.relevance,
    confidence: event.confidence,
    reason: event.reason,
    payloadRef: event.payloadRef,
    rawPayloadRedacted: event.rawPayloadRedacted,
    relatedIds: event.relatedIds,
    skipReason: event.skipReason,
    createdAt: event.createdAt,
  };
}

export function agentEventFreshness(
  freshnessMs: number | null,
): AgentEventFreshness {
  if (freshnessMs === null || !Number.isFinite(freshnessMs)) return 'unknown';
  if (freshnessMs <= 30_000) return 'near_realtime';
  if (freshnessMs <= 300_000) return 'recent';
  return 'stale';
}
