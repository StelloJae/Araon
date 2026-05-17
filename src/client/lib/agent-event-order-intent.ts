import type {
  AgentEventPayload,
  CreateOrderIntentPreviewInput,
} from './api-client';

const MAX_REASON_LENGTH = 300;

export function buildSimulatedBuyPreviewInputFromAgentEvent(
  event: AgentEventPayload,
): CreateOrderIntentPreviewInput {
  return {
    ticker: event.ticker,
    side: 'buy',
    market: inferMarket(event.ticker),
    requestedMode: 'simulated',
    triggerEventId: event.id,
    reason: truncateReason([
      'agent_event_preview',
      event.type,
      event.source,
      event.reason,
    ]),
  };
}

function inferMarket(
  ticker: string,
): NonNullable<CreateOrderIntentPreviewInput['market']> {
  return /^\d{6}$/.test(ticker.trim()) ? 'KR' : 'US';
}

function truncateReason(parts: readonly string[]): string {
  const normalized = parts
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .filter((part) => part.length > 0)
    .join(' / ');
  return normalized.slice(0, MAX_REASON_LENGTH);
}
