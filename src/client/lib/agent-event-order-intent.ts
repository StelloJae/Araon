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
    side: simulatedSideFromAgentEvent(event),
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

function simulatedSideFromAgentEvent(
  event: AgentEventPayload,
): NonNullable<CreateOrderIntentPreviewInput['side']> {
  if (event.type !== 'market_movement_detected') return 'buy';
  const reason = event.reason;
  const pct = marketMovementPct(reason);
  if (pct !== null) return pct < 0 ? 'sell' : 'buy';
  return /급락|하락|약세|TOP100\s*하락/.test(reason) ? 'sell' : 'buy';
}

function marketMovementPct(reason: string): number | null {
  const match =
    reason.match(/등락률\s*([+-]?\d+(?:\.\d+)?)%/) ??
    reason.match(/([+-]\d+(?:\.\d+)?)%/);
  if (match === null) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
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
