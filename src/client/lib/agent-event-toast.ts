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
  const name = displayName ?? payload.product?.displayName ?? payload.ticker;
  const movementPct = marketMovementPct(payload.reason);
  const cooldownKey =
    payload.type === 'market_movement_detected'
      ? marketMovementCooldownKey(payload.ticker, payload.source, payload.reason)
      : `agent-event:${payload.id}`;
  return {
    id: `agent-event-${payload.id}`,
    cooldownKey,
    ticker: payload.ticker,
    name,
    kind: 'rule',
    direction: isDownwardMovement(payload.reason, movementPct) ? 'down' : 'up',
    changePct: movementPct ?? 0,
    title: `${titlePrefix(payload.type)}: ${name}`,
    detail: clipDetail(`${agentEventSourceLabel(payload.source, payload.reason, movementPct)} · ${agentEventReasonLabel(payload.reason)}`),
    ts: now,
  };
}

function marketMovementCooldownKey(
  ticker: string,
  source: string,
  reason: string,
): string {
  const sourceClass = source === 'realtime-momentum'
    ? 'realtime-momentum'
    : source === 'toss-quote-refresh'
      ? 'toss-quote'
      : source === 'toss-top100-rotation'
        ? 'toss-top100'
        : source === 'kis-ws-tick' || source === 'kis-ws'
          ? 'realtime-tracking'
          : 'other';
  const windowLabel = marketMovementWindow(reason);
  const pct = marketMovementPct(reason);
  const direction = isDownwardMovement(reason, pct) ? 'down' : 'up';
  return `agent-event:market:${ticker}:${sourceClass}:${windowLabel}:${direction}`;
}

function marketMovementWindow(reason: string): string {
  const rangeMatch =
    reason.match(/0\s*(?:~|-|–|—)\s*30\s*초/) ??
    reason.match(/0\s*(?:~|-|–|—)\s*30\s*s/i);
  if (rangeMatch !== null) return '0-30s';
  const match =
    reason.match(/(10|20|30)\s*초/) ??
    reason.match(/(10|20|30)\s*s/i);
  if (match === null) return 'unknown-window';
  return `${match[1]}s`;
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
    case 'risk_check_completed':
      return '리스크 확인';
    case 'preview_created':
      return '미리보기 생성';
  }
}

function agentEventSourceLabel(source: string, reason: string, movementPct: number | null): string {
  switch (source) {
    case 'kis-ws-tick':
    case 'kis-ws':
      return '실시간 추적';
    case 'toss-quote-refresh':
      return 'Toss 가격 갱신';
    case 'toss-top100-rotation':
      return 'Toss TOP100 변화';
    case 'realtime-momentum':
      return isDownwardMovement(reason, movementPct) ? '급락 신호' : '급상승 신호';
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
    .replace(/Risk check completed; live execution remains locked\./g, '리스크 확인 완료 · 실거래 잠금')
    .replace(/Local simulated order preview created; live execution remains locked\./g, '모의 미리보기 생성 · 실거래 잠금')
    .replace(/Fresh confirmation challenge created; live execution remains locked\./g, '승인 확인 생성 · 실거래 잠금')
    .replace(/Confirmation token verified; live execution remains locked\./g, '승인 토큰 확인 · 실거래 잠금')
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

function isDownwardMovement(reason: string, pct: number | null): boolean {
  if (pct !== null) return pct < 0;
  return /급락|하락|약세|TOP100\s*하락/.test(reason);
}
