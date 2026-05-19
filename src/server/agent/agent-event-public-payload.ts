import type {
  AgentEventDecision,
  AgentEventDecisionSupportPayload,
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
    decisionSupport: agentEventDecisionSupport(event),
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

function agentEventDecisionSupport(
  event: AgentEvent,
): AgentEventDecisionSupportPayload {
  const score = agentEventDecisionScore(event);
  const decision = agentEventDecision(event, score);
  return {
    decision,
    policyVersion: 'araon-agent-decision-v1',
    score,
    strategyLabel: agentEventStrategyLabel(event, decision),
    riskLabel: agentEventRiskLabel(event, decision),
    evaluationLabels: agentEventEvaluationLabels(event, score),
    readinessLabels: agentEventReadinessLabels(decision),
    explanationLabels: agentEventExplanationLabels(event, decision),
    liveExecutionLocked: true,
  };
}

function agentEventDecisionScore(event: AgentEvent): number {
  let score = 30;
  score += Math.round(clamp01(event.confidence) * 20);
  score += Math.round(clamp01(event.relevance ?? 0) * 15);
  score += freshnessScore(event.freshnessMs);
  score += typeScore(event.type);
  if (event.skipReason !== null) score -= 12;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function agentEventDecision(
  event: AgentEvent,
  score: number,
): AgentEventDecision {
  if (event.skipReason !== null || event.type === 'order_intent_skipped') {
    return 'ignore';
  }
  if (!agentEventIsCandidate(event)) return 'observe';

  if (event.type === 'market_movement_detected') {
    const reason = sanitizeAgentEventReason(event.reason);
    const pct = marketMovementPct(reason);
    if (isDownwardMovement(reason, pct)) return score >= 65 ? 'sell' : 'observe';
    return score >= 65 ? 'buy' : 'observe';
  }

  if (
    event.type === 'news_detected' ||
    event.type === 'disclosure_detected' ||
    event.type === 'toss_signal_detected'
  ) {
    return score >= 75 ? 'buy' : 'observe';
  }

  return 'observe';
}

function agentEventIsCandidate(event: AgentEvent): boolean {
  switch (event.type) {
    case 'news_detected':
    case 'disclosure_detected':
    case 'toss_signal_detected':
    case 'market_movement_detected':
    case 'watchlist_changed':
    case 'position_changed':
      return true;
    default:
      return false;
  }
}

function agentEventStrategyLabel(
  event: AgentEvent,
  decision: AgentEventDecision,
): string {
  if (decision === 'ignore') return '제외';
  if (event.type === 'market_movement_detected') {
    const reason = sanitizeAgentEventReason(event.reason);
    const pct = marketMovementPct(reason);
    return isDownwardMovement(reason, pct) ? '하락 방어' : '단기 모멘텀';
  }
  if (
    event.type === 'news_detected' ||
    event.type === 'disclosure_detected' ||
    event.type === 'toss_signal_detected'
  ) {
    return '정보 관찰';
  }
  if (
    event.type === 'order_intent_created' ||
    event.type === 'preview_created' ||
    event.type === 'risk_check_completed' ||
    event.type === 'approval_requested' ||
    event.type === 'approval_granted' ||
    event.type === 'execution_locked'
  ) {
    return '실거래 잠금';
  }
  return '상태 관찰';
}

function agentEventRiskLabel(
  event: AgentEvent,
  decision: AgentEventDecision,
): string {
  if (decision === 'ignore') {
    const skipReason = sanitizeAgentEventReason(event.skipReason ?? '');
    return skipReason.length > 0 ? `제외 · ${skipReason}` : '제외';
  }
  if (decision === 'observe') return '근거 부족 · 관찰';
  return '모의만 · 실거래 잠금';
}

function agentEventExplanationLabels(
  event: AgentEvent,
  decision: AgentEventDecision,
): string[] {
  const labels: string[] = [];
  if (decision === 'ignore') {
    const skipReason = sanitizeAgentEventReason(event.skipReason ?? '');
    labels.push(skipReason.length > 0 ? skipReason : '정책상 제외');
    return labels;
  }

  if (event.type === 'market_movement_detected') {
    const reason = sanitizeAgentEventReason(event.reason);
    const pct = marketMovementPct(reason);
    if (isDownwardMovement(reason, pct)) {
      labels.push('하락/급락 리스크', '보유 리스크 먼저 확인');
    } else {
      labels.push('0~30초 가격 움직임');
    }
  } else if (
    event.type === 'news_detected' ||
    event.type === 'disclosure_detected' ||
    event.type === 'toss_signal_detected'
  ) {
    labels.push('뉴스·공시·신호 근거');
  } else {
    labels.push(agentEventStrategyLabel(event, decision));
  }

  labels.push(confidenceLabel(event.confidence));
  if (decision === 'buy' || decision === 'sell') {
    labels.push('실거래 전 리스크 확인 필요');
  } else {
    labels.push('추가 근거 필요');
  }
  return labels;
}

function agentEventEvaluationLabels(event: AgentEvent, score: number): string[] {
  const labels: string[] = [`점수 ${score}`];
  if (event.type === 'market_movement_detected') {
    labels.push('시장 움직임 후보');
  } else if (
    event.type === 'news_detected' ||
    event.type === 'disclosure_detected' ||
    event.type === 'toss_signal_detected'
  ) {
    labels.push('정보 이벤트 후보');
  } else if (event.type === 'position_changed' || event.type === 'watchlist_changed') {
    labels.push('관심/보유 변화');
  } else {
    labels.push('상태 이벤트');
  }

  if (event.freshnessMs !== null && event.freshnessMs <= 30_000) {
    labels.push('신선도 높음');
  } else if (event.freshnessMs !== null && event.freshnessMs <= 300_000) {
    labels.push('최근 이벤트');
  } else {
    labels.push('신선도 확인 필요');
  }

  labels.push(confidenceLabel(event.confidence));
  return labels;
}

function agentEventReadinessLabels(decision: AgentEventDecision): string[] {
  if (decision === 'ignore') return ['후보 제외', '실거래 잠금'];
  if (decision === 'observe') return ['추가 근거 필요', '실거래 잠금'];
  return ['모의 미리보기만 가능', '리스크 확인 필요', '실거래 잠금'];
}

function freshnessScore(freshnessMs: number | null): number {
  if (freshnessMs !== null) {
    if (freshnessMs < 60_000) return 20;
    if (freshnessMs < 5 * 60_000) return 14;
    if (freshnessMs < 60 * 60_000) return 8;
    return 0;
  }
  return 8;
}

function typeScore(type: AgentEvent['type']): number {
  switch (type) {
    case 'market_movement_detected':
      return 14;
    case 'news_detected':
    case 'disclosure_detected':
    case 'toss_signal_detected':
      return 10;
    case 'position_changed':
    case 'watchlist_changed':
      return 6;
    default:
      return 0;
  }
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.75) return '신뢰 높음';
  if (confidence >= 0.5) return '신뢰 중간';
  if (confidence > 0) return '신뢰 낮음';
  return '신뢰 미제공';
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

function sanitizeAgentEventReason(reason: string): string {
  return reason
    .replace(/^New stock news detected:\s*/g, '')
    .replace(/^New stock disclosure detected:\s*/g, '')
    .replace(/KIS WS tick\s*/g, '')
    .replace(/KIS WS 보조\s*/g, '')
    .replace(/^실시간 추적\s*/g, '')
    .replace(/가격 업데이트 감지/g, '가격 업데이트')
    .replace(/Toss TOP100 rotation\s*·\s*/g, '')
    .replace(/Toss quote refresh\s*/g, '')
    .replace(/realtime-momentum\s*·\s*/g, '')
    .replace(/kis-ws-tick\s*·\s*/g, '')
    .replace(/dedupe(?:Key)?[:=][^\s·]+/gi, '')
    .replace(/payload(?:Ref)?[:=][^\s·]+/gi, '')
    .replace(/Risk check completed; live execution remains locked\./g, '리스크 확인 완료 · 실거래 잠금')
    .replace(/Local simulated order preview created; live execution remains locked\./g, '모의 미리보기 생성 · 실거래 잠금')
    .replace(/Fresh confirmation challenge created; live execution remains locked\./g, '승인 확인 생성 · 실거래 잠금')
    .replace(/Confirmation token verified; live execution remains locked\./g, '승인 토큰 확인 · 실거래 잠금')
    .replace(/^live execution locked$/g, '실거래 잠금')
    .replace(/\s+·\s+·\s+/g, ' · ')
    .trim();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
