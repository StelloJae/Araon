import type { AgentEventPayload } from './api-client';
import { resolveProductDisplayName } from './product-display-name';

export type AgentCandidateStage =
  | 'candidate'
  | 'preview_ready'
  | 'approval_pending'
  | 'locked'
  | 'excluded';

export type AgentCandidateDecision =
  | 'buy'
  | 'sell'
  | 'observe'
  | 'ignore';

export interface AgentCandidateViewModel {
  id: string;
  ticker: string;
  productKey: string;
  displayName: string;
  showTicker: boolean;
  typeLabel: string;
  sourceLabel: string;
  reasonLabel: string;
  freshnessLabel: string;
  confidenceLabel: string;
  scoreLabel: string;
  score: number;
  stage: AgentCandidateStage;
  stageLabel: string;
  decision: AgentCandidateDecision;
  decisionLabel: string;
  decisionReasonLabel: string;
  policyVersion: string | null;
  strategyLabel: string;
  riskLabel: string;
  evaluationLabels: string[];
  readinessLabels: string[];
  explanationLabels: string[];
  canCreatePreview: boolean;
}

export function buildAgentCandidateViewModel(
  event: AgentEventPayload,
  displayNames: Readonly<Record<string, string>> = {},
): AgentCandidateViewModel {
  const product = event.product as AgentEventPayload['product'] | undefined;
  const ticker = product?.krTicker ?? event.ticker;
  const productKey = agentEventProductKey(event);
  const displayName =
    resolveProductDisplayName(ticker, product?.displayName, displayNames) ??
    event.ticker;
  const score = event.decisionSupport?.score ?? agentCandidateScore(event);
  const stage = agentCandidateStage(event);
  const decision = event.decisionSupport?.decision ?? agentCandidateDecision(event, score, stage);

  return {
    id: event.id,
    ticker,
    productKey,
    displayName,
    showTicker: displayName !== event.ticker,
    typeLabel: agentEventTypeLabel(event.type),
    sourceLabel: agentEventSourceLabel(event),
    reasonLabel: agentEventUserSummary(event),
    freshnessLabel: agentEventFreshnessLabel(event.freshnessMs),
    confidenceLabel: agentEventConfidenceLabel(event.confidence),
    scoreLabel: `점수 ${score}`,
    score,
    stage,
    stageLabel: agentCandidateStageLabel(stage),
    decision,
    decisionLabel: agentCandidateDecisionLabel(decision),
    decisionReasonLabel: agentCandidateDecisionReasonLabel(event, decision, score),
    policyVersion: event.decisionSupport?.policyVersion ?? null,
    strategyLabel:
      event.decisionSupport?.strategyLabel ?? agentCandidateStrategyLabel(event, decision),
    riskLabel: event.decisionSupport?.riskLabel ?? agentCandidateRiskLabel(event, decision),
    evaluationLabels:
      event.decisionSupport?.evaluationLabels ?? agentCandidateEvaluationLabels(event, score),
    readinessLabels:
      event.decisionSupport?.readinessLabels ?? agentCandidateReadinessLabels(decision),
    explanationLabels:
      event.decisionSupport?.explanationLabels ?? agentCandidateExplanationLabels(event, decision),
    canCreatePreview: canCreateSimulatedPreview(event),
  };
}

export function dedupeAgentCandidateEvents(
  events: readonly AgentEventPayload[],
): AgentEventPayload[] {
  const seen = new Set<string>();
  const out: AgentEventPayload[] = [];
  for (const event of events) {
    const key = `${event.type}:${agentEventProductKey(event)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  return out;
}

export function agentEventProductKey(event: AgentEventPayload): string {
  const product = event.product as AgentEventPayload['product'] | undefined;
  return product?.krTicker ?? product?.productCode ?? event.ticker;
}

export function agentCandidateScore(event: AgentEventPayload): number {
  let score = 30;
  score += Math.round(clamp01(event.confidence) * 20);
  score += Math.round(clamp01(event.relevance ?? 0) * 15);
  score += freshnessScore(event.freshnessMs, event.freshness);
  score += typeScore(event.type);
  if (event.skipReason !== null && event.skipReason !== undefined) score -= 12;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function agentEventUserSummary(event: AgentEventPayload): string {
  const reason = sanitizeAgentEventReason(event.reason);
  switch (event.type) {
    case 'news_detected':
      return reason.length > 0 ? `신규 뉴스 · ${reason}` : '신규 뉴스';
    case 'disclosure_detected':
      return reason.length > 0 ? `공시 감지 · ${reason}` : '공시 감지';
    case 'toss_signal_detected':
      return reason.length > 0 ? `Toss 신호 · ${reason}` : 'Toss 신호';
    case 'market_movement_detected':
      return movementLabelForReason(reason);
    case 'watchlist_changed':
      return '관심종목 변화';
    case 'position_changed':
      return '보유종목 변화';
    case 'order_intent_created':
      return '모의 주문 후보 생성';
    case 'order_intent_skipped':
      return reason.length > 0 ? `후보 제외 · ${reason}` : '후보 제외';
    case 'approval_requested':
      return '승인 확인 필요';
    case 'approval_granted':
      return '승인 기록됨 · 실거래 잠금';
    case 'approval_denied':
      return '승인 거절됨';
    case 'execution_locked':
      return '실거래 실행 잠김';
    case 'risk_check_completed':
      return '리스크 확인 완료 · 실거래 잠금';
    case 'preview_created':
      return '모의 미리보기 생성';
  }
}

function movementLabelForReason(reason: string): string {
  const pct = marketMovementPct(reason);
  const label = isDownwardMovement(reason, pct) ? '급락 신호' : '급상승 신호';
  return reason.length > 0 ? `${label} · ${reason}` : label;
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

export function sanitizeAgentEventReason(reason: string): string {
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
    .replace(/\s+·\s+·\s+/g, ' · ')
    .trim();
}

export function agentEventFreshnessLabel(freshnessMs: number | null): string {
  if (freshnessMs === null) return '처음 감지';
  const normalizedMs = Math.max(0, Math.round(freshnessMs));
  if (normalizedMs < 1_000) return '방금';

  const seconds = normalizedMs / 1_000;
  if (seconds < 60) return `${seconds.toFixed(1)}초`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간`;

  return `${Math.floor(hours / 24)}일`;
}

function agentEventTypeLabel(type: AgentEventPayload['type']): string {
  switch (type) {
    case 'news_detected':
      return '뉴스 감지';
    case 'disclosure_detected':
      return '공시 감지';
    case 'toss_signal_detected':
      return 'Toss 신호';
    case 'market_movement_detected':
      return '시장 급변';
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

function agentEventSourceLabel(event: AgentEventPayload): string {
  switch (event.type) {
    case 'news_detected':
      return '뉴스';
    case 'disclosure_detected':
      return '공시';
    case 'toss_signal_detected':
      return 'Toss 신호';
    case 'market_movement_detected':
      return '가격 움직임';
    case 'watchlist_changed':
      return '관심';
    case 'position_changed':
      return '보유';
    case 'order_intent_created':
    case 'preview_created':
      return '모의 미리보기';
    case 'risk_check_completed':
      return '리스크';
    case 'approval_requested':
    case 'approval_granted':
    case 'approval_denied':
      return '승인';
    case 'execution_locked':
      return '실거래 잠금';
    case 'order_intent_skipped':
      return '후보 제외';
  }
}

function agentCandidateStage(event: AgentEventPayload): AgentCandidateStage {
  switch (event.type) {
    case 'order_intent_created':
    case 'preview_created':
      return 'preview_ready';
    case 'approval_requested':
      return 'approval_pending';
    case 'approval_granted':
    case 'execution_locked':
    case 'risk_check_completed':
      return 'locked';
    case 'approval_denied':
    case 'order_intent_skipped':
      return 'excluded';
    case 'news_detected':
    case 'disclosure_detected':
    case 'toss_signal_detected':
    case 'market_movement_detected':
    case 'watchlist_changed':
    case 'position_changed':
      return 'candidate';
  }
}

function agentCandidateStageLabel(stage: AgentCandidateStage): string {
  switch (stage) {
    case 'candidate':
      return '후보';
    case 'preview_ready':
      return '모의 가능';
    case 'approval_pending':
      return '승인 대기';
    case 'locked':
      return '실거래 잠금';
    case 'excluded':
      return '제외';
  }
}

function agentCandidateDecision(
  event: AgentEventPayload,
  score: number,
  stage: AgentCandidateStage,
): AgentCandidateDecision {
  if (stage === 'excluded') return 'ignore';
  if (event.skipReason !== null && event.skipReason !== undefined) return 'ignore';
  if (stage !== 'candidate') return 'observe';

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

function agentCandidateDecisionLabel(decision: AgentCandidateDecision): string {
  switch (decision) {
    case 'buy':
      return '매수 검토';
    case 'sell':
      return '매도 검토';
    case 'observe':
      return '관찰';
    case 'ignore':
      return '제외';
  }
}

function agentCandidateDecisionReasonLabel(
  event: AgentEventPayload,
  decision: AgentCandidateDecision,
  score: number,
): string {
  switch (decision) {
    case 'buy':
      return `강한 상승/호재 신호 · 점수 ${score}`;
    case 'sell':
      return `하락/위험 신호 · 점수 ${score}`;
    case 'ignore':
      return event.skipReason ?? '후보 제외';
    case 'observe':
      return `추가 근거 필요 · 점수 ${score}`;
  }
}

function agentCandidateStrategyLabel(
  event: AgentEventPayload,
  decision: AgentCandidateDecision,
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

function agentCandidateRiskLabel(
  event: AgentEventPayload,
  decision: AgentCandidateDecision,
): string {
  if (decision === 'ignore') {
    const skipReason = sanitizeAgentEventReason(event.skipReason ?? '');
    return skipReason.length > 0 ? `제외 · ${skipReason}` : '제외';
  }
  if (decision === 'observe') return '근거 부족 · 관찰';
  return '모의만 · 실거래 잠금';
}

function agentCandidateExplanationLabels(
  event: AgentEventPayload,
  decision: AgentCandidateDecision,
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
    labels.push(agentCandidateStrategyLabel(event, decision));
  }

  labels.push(agentEventConfidenceLabel(event.confidence));
  if (decision === 'buy' || decision === 'sell') {
    labels.push('실거래 전 리스크 확인 필요');
  } else {
    labels.push('추가 근거 필요');
  }
  return labels;
}

function agentCandidateEvaluationLabels(event: AgentEventPayload, score: number): string[] {
  const labels = [`점수 ${score}`];
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
  labels.push(agentEventConfidenceLabel(event.confidence));
  return labels;
}

function agentCandidateReadinessLabels(decision: AgentCandidateDecision): string[] {
  if (decision === 'ignore') return ['후보 제외', '실거래 잠금'];
  if (decision === 'observe') return ['추가 근거 필요', '실거래 잠금'];
  return ['모의 미리보기만 가능', '리스크 확인 필요', '실거래 잠금'];
}

function canCreateSimulatedPreview(event: AgentEventPayload): boolean {
  return agentCandidateStage(event) === 'candidate';
}

function agentEventConfidenceLabel(confidence: number): string {
  if (confidence >= 0.75) return '신뢰 높음';
  if (confidence >= 0.5) return '신뢰 중간';
  if (confidence > 0) return '신뢰 낮음';
  return '신뢰 미제공';
}

function freshnessScore(
  freshnessMs: number | null,
  freshness: AgentEventPayload['freshness'],
): number {
  if (freshnessMs !== null) {
    if (freshnessMs < 60_000) return 20;
    if (freshnessMs < 5 * 60_000) return 14;
    if (freshnessMs < 60 * 60_000) return 8;
    return 0;
  }
  if (freshness === 'near_realtime') return 16;
  if (freshness === 'recent') return 10;
  return 0;
}

function typeScore(type: AgentEventPayload['type']): number {
  switch (type) {
    case 'market_movement_detected':
      return 15;
    case 'news_detected':
    case 'disclosure_detected':
      return 10;
    case 'toss_signal_detected':
      return 8;
    case 'watchlist_changed':
    case 'position_changed':
      return 6;
    case 'order_intent_created':
    case 'preview_created':
    case 'risk_check_completed':
    case 'approval_requested':
    case 'approval_granted':
    case 'execution_locked':
      return 4;
    case 'approval_denied':
    case 'order_intent_skipped':
      return 0;
  }
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
