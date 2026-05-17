import type { AgentEventNotificationEvent, AgentEventNotificationType } from '@shared/types';
import type { ToastSpec } from './alert-evaluator';

const DETAIL_MAX_LENGTH = 120;

interface AgentEventToastOptions {
  notificationsEnabled: boolean;
  marketMovementThresholdPct?: number;
}

export function agentEventToToastSpec(
  event: AgentEventNotificationEvent,
  displayName?: string,
  now: number = Date.now(),
): ToastSpec {
  const payload = event.event;
  const name = displayName ?? payload.ticker;
  const movementPct = marketMovementPct(payload.reason);
  return {
    id: `agent-event-${payload.id}`,
    cooldownKey: `agent-event:${payload.id}`,
    ticker: payload.ticker,
    name,
    kind: 'rule',
    direction: movementPct !== null && movementPct < 0 ? 'down' : 'up',
    changePct: movementPct ?? 0,
    title: `${titlePrefix(payload.type)}: ${name}`,
    detail: clipDetail(`${agentEventSourceLabel(payload.source)} · ${agentEventReasonLabel(payload.reason)}`),
    ts: now,
  };
}

export function maybeAgentEventToToastSpec(
  event: AgentEventNotificationEvent,
  displayName: string | undefined,
  optionsOrNotificationsEnabled: AgentEventToastOptions | boolean,
  now: number = Date.now(),
): ToastSpec | null {
  const options =
    typeof optionsOrNotificationsEnabled === 'boolean'
      ? { notificationsEnabled: optionsOrNotificationsEnabled }
      : optionsOrNotificationsEnabled;
  if (!options.notificationsEnabled) return null;
  if (
    event.event.type === 'market_movement_detected' &&
    !shouldToastMarketMovementEvent(
      event.event.source,
      event.event.reason,
      options.marketMovementThresholdPct,
    )
  ) {
    return null;
  }
  return agentEventToToastSpec(event, displayName, now);
}

function titlePrefix(type: AgentEventNotificationType): string {
  switch (type) {
    case 'news_detected':
      return '뉴스 감지';
    case 'disclosure_detected':
      return '공시 감지';
    case 'toss_signal_detected':
      return 'Toss 시그널';
    case 'market_movement_detected':
      return '시장 움직임';
    case 'watchlist_changed':
      return '관심 변경';
    case 'position_changed':
      return '보유 변경';
    case 'order_intent_created':
      return '후보 생성';
    case 'order_intent_skipped':
      return '후보 제외';
    case 'approval_requested':
      return '승인 요청';
    case 'approval_granted':
      return '승인 기록';
    case 'approval_denied':
      return '승인 거절';
    case 'execution_locked':
      return '실행 잠금';
  }
}

function agentEventSourceLabel(source: string): string {
  switch (source) {
    case 'kis-ws-tick':
    case 'kis-ws':
      return '실시간 추적';
    case 'toss-quote-refresh':
      return 'Toss 가격 갱신';
    case 'toss-top100-rotation':
      return 'Toss TOP100 변화';
    case 'realtime-momentum':
      return '급상승 신호';
    default:
      return source;
  }
}

function agentEventReasonLabel(reason: string): string {
  return reason
    .replace(/KIS WS tick\s*/g, '')
    .replace(/KIS WS 보조\s*/g, '')
    .replace(/^실시간 추적\s*/g, '')
    .replace(/가격 업데이트 감지/g, '가격 업데이트')
    .replace(/Toss TOP100 rotation\s*·\s*/g, '')
    .replace(/Toss quote refresh\s*/g, '')
    .trim();
}

function clipDetail(value: string): string {
  if (value.length <= DETAIL_MAX_LENGTH) return value;
  return `${value.slice(0, DETAIL_MAX_LENGTH)}...`;
}

function shouldToastMarketMovementEvent(
  source: string,
  reason: string,
  thresholdPct: number | undefined,
): boolean {
  if (source !== 'realtime-momentum') return false;
  if (thresholdPct === undefined) return true;
  const pct = marketMovementPct(reason);
  if (pct === null) return false;
  return Math.abs(pct) >= thresholdPct;
}

function marketMovementPct(reason: string): number | null {
  const match =
    reason.match(/등락률\s*([+-]?\d+(?:\.\d+)?)%/) ??
    reason.match(/([+-]\d+(?:\.\d+)?)%/);
  if (match === null) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}
