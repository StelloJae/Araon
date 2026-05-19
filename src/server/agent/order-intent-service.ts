import { createHash, randomUUID } from 'node:crypto';
import type { AgentEventQueue } from './agent-event-queue.js';

export type OrderIntentSide = 'buy' | 'sell';
export type OrderIntentMarket = 'KR' | 'US';
export type OrderIntentOrderType = 'market' | 'limit';
export type OrderIntentRequestedMode = 'simulated' | 'paper' | 'live';
export type OrderIntentLivePolicyMissingConstraint =
  | 'policy_approval'
  | 'allowed_tickers'
  | 'max_order_amount'
  | 'max_daily_loss'
  | 'trading_hours'
  | 'order_type'
  | 'cooldown'
  | 'kill_switch_release';

export type OrderIntentAutomationReadinessGapCode =
  | 'decision_engine'
  | 'strategy_policy'
  | 'risk_policy'
  | 'paper_trading_ledger'
  | 'simulation_result_view'
  | 'toss_order_execution'
  | 'live_approval_executor'
  | 'execution_reconciliation'
  | 'agent_performance_audit'
  | 'intent_explanation'
  | 'provider_freshness'
  | 'event_dedupe';

export type OrderIntentAutomationReadinessGapStatus =
  | 'locked'
  | 'not_ready'
  | 'partial';

export interface OrderIntentAutomationReadinessGap {
  readonly code: OrderIntentAutomationReadinessGapCode;
  readonly status: OrderIntentAutomationReadinessGapStatus;
  readonly severity: 'blocking' | 'warning';
  readonly label: string;
  readonly detail: string;
}

export interface OrderIntentLivePolicy {
  readonly liveExecutionEnabled: false;
  readonly policyApproved: false;
  readonly killSwitch: 'engaged';
  readonly allowedTickers: readonly string[];
  readonly maxOrderKrw: number | null;
  readonly maxDailyLossKrw: number | null;
  readonly tradingHours: null;
  readonly allowedOrderTypes: readonly OrderIntentOrderType[];
  readonly cooldownMs: number | null;
  readonly missingConstraints: readonly OrderIntentLivePolicyMissingConstraint[];
  readonly automationReadinessGaps: readonly OrderIntentAutomationReadinessGap[];
  readonly executionReadiness: OrderIntentExecutionReadiness;
  readonly generatedAt: string;
}

export interface OrderIntentExecutionReadiness {
  readonly orderAdapter: {
    readonly provider: 'toss';
    readonly mode: 'dry_run_locked';
    readonly status: 'contract_ready';
    readonly liveMutationEnabled: false;
    readonly supportedMarkets: readonly OrderIntentMarket[];
    readonly supportedSides: readonly OrderIntentSide[];
    readonly supportedOrderTypes: readonly OrderIntentOrderType[];
  };
  readonly lockedExecutor: {
    readonly status: 'ready_locked';
    readonly blockedBeforeNetwork: true;
    readonly liveMutationEnabled: false;
    readonly output: 'locked_execution_proof';
    readonly requires: readonly OrderIntentLockedExecutorRequirement[];
  };
  readonly liveApprovalExecutor: {
    readonly status: 'ready_locked';
    readonly blockedBeforeAdapter: true;
    readonly liveMutationEnabled: false;
    readonly input: 'confirmed_approval_challenge';
    readonly output: 'locked_execution_proof';
    readonly requires: readonly OrderIntentLiveApprovalExecutorRequirement[];
  };
  readonly approvalGate: {
    readonly status: 'locked';
    readonly requiresFreshApproval: true;
    readonly confirmationChallenge: true;
    readonly liveExecutionLocked: true;
  };
  readonly reconciliation: {
    readonly status: 'planned';
    readonly source: 'toss_account_readonly_snapshot';
    readonly requiredStates: readonly OrderIntentExecutionState[];
    readonly executor: {
      readonly status: 'read_only_ready';
      readonly requiredInputs: readonly OrderIntentReconciliationInput[];
      readonly matchKeys: readonly OrderIntentReconciliationMatchKey[];
      readonly liveMutationEnabled: false;
    };
    readonly liveMutationEnabled: false;
  };
  readonly dataFreshnessGate: {
    readonly status: 'ready_locked';
    readonly requiredSources: readonly OrderIntentDataFreshnessSource[];
    readonly maxAgeMs: {
      readonly quote: 1000;
      readonly chart: 60000;
      readonly newsOrDisclosure: 300000;
      readonly watchlistMembership: 300000;
    };
    readonly blocksLiveExecution: true;
    readonly liveMutationEnabled: false;
  };
}

export type OrderIntentDataFreshnessSource =
  | 'quote'
  | 'chart'
  | 'news_or_disclosure'
  | 'watchlist_membership';

export type OrderIntentLockedExecutorRequirement =
  | 'fresh_approval'
  | 'risk_policy'
  | 'kill_switch_release'
  | 'reconciliation_ready';

export type OrderIntentLiveApprovalExecutorRequirement =
  | 'confirmed_approval_challenge'
  | 'intent_hash_match'
  | 'kill_switch_release'
  | 'locked_order_adapter';

export type OrderIntentReconciliationInput =
  | 'intent_hash'
  | 'order_summary'
  | 'read_only_account_snapshot';

export type OrderIntentReconciliationMatchKey =
  | 'intent_hash'
  | 'ticker'
  | 'side';

export type OrderIntentExecutionState =
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'partial_fill'
  | 'filled'
  | 'canceled';

export interface OrderIntentInput {
  readonly ticker: string;
  readonly side: OrderIntentSide;
  readonly market?: OrderIntentMarket;
  readonly quantity?: number | null;
  readonly cashAmount?: number | null;
  readonly orderType?: OrderIntentOrderType;
  readonly limitPrice?: number | null;
  readonly triggerEventId?: string | null;
  readonly agentId?: string | null;
  readonly reason: string;
  readonly requestedMode?: OrderIntentRequestedMode;
}

export interface OrderIntentRiskCheck {
  readonly code: string;
  readonly status: 'pass' | 'warning' | 'blocked';
  readonly message: string;
}

export interface OrderIntentStrategyEvaluation {
  readonly strategyId: 'araon-deterministic-preview-v1';
  readonly status: 'evaluated';
  readonly decision: OrderIntentSide;
  readonly confidence: 'guarded';
  readonly rationale: string;
  readonly signals: readonly string[];
}

export interface OrderIntentRiskPolicyEvaluation {
  readonly policyId: 'araon-live-lock-risk-v1';
  readonly status: 'simulated_only';
  readonly liveBlocked: true;
  readonly maxOrderKrw: null;
  readonly maxDailyLossKrw: null;
  readonly checks: readonly OrderIntentRiskCheck[];
}

export interface OrderIntentPaperLedgerPreview {
  readonly ledgerId: string;
  readonly status: 'preview_only';
  readonly booked: false;
  readonly positionDelta: number | null;
  readonly cashDeltaKrw: number | null;
  readonly note: string;
}

export interface OrderIntentPreviewImpact {
  readonly status: 'estimated' | 'incomplete';
  readonly estimatedNotionalKrw: number | null;
  readonly positionImpact: string;
  readonly cashImpact: string;
  readonly pnlImpact: string;
  readonly liveExecutionImpact: string;
}

export interface OrderIntentPaperLedgerEntry {
  readonly id: string;
  readonly intentId: string;
  readonly ticker: string;
  readonly side: OrderIntentSide;
  readonly market: OrderIntentMarket;
  readonly status: 'preview_only';
  readonly booked: false;
  readonly positionDelta: number | null;
  readonly cashDeltaKrw: number | null;
  readonly note: string;
  readonly createdAt: string;
}

export interface OrderIntentPaperLedgerTickerSummary {
  readonly ticker: string;
  readonly previewCount: number;
  readonly positionDelta: number;
  readonly cashDeltaKrw: number;
  readonly lastPreviewAt: string;
}

export interface OrderIntentPaperLedgerSummary {
  readonly entryCount: number;
  readonly bookedCount: 0;
  readonly previewOnlyCount: number;
  readonly cashDeltaKrw: number;
  readonly byTicker: readonly OrderIntentPaperLedgerTickerSummary[];
}

export interface OrderIntentPaperLedgerSnapshot {
  readonly items: readonly OrderIntentPaperLedgerEntry[];
  readonly returnedCount: number;
  readonly summary: OrderIntentPaperLedgerSummary;
}

export interface OrderIntentPerformanceReviewItem {
  readonly id: string;
  readonly intentId: string;
  readonly ticker: string;
  readonly side: OrderIntentSide;
  readonly market: OrderIntentMarket;
  readonly outcomeStatus: 'pending_market_result';
  readonly booked: false;
  readonly liveMutationEnabled: false;
  readonly reviewLabel: string;
  readonly reason: string;
  readonly createdAt: string;
  readonly reviewedAt: string;
}

export interface OrderIntentPerformanceReviewSummary {
  readonly previewOnlyCount: number;
  readonly bookedCount: 0;
  readonly pendingReviewCount: number;
  readonly buyPreviewCount: number;
  readonly sellPreviewCount: number;
  readonly liveSubmittedCount: 0;
  readonly reviewedTickerCount: number;
  readonly latestPreviewAt: string | null;
  readonly reviewStatus: 'empty' | 'needs_market_result';
}

export interface OrderIntentPerformanceReviewSnapshot {
  readonly items: readonly OrderIntentPerformanceReviewItem[];
  readonly returnedCount: number;
  readonly liveMutationEnabled: false;
  readonly source: 'paper_ledger_preview_only';
  readonly generatedAt: string;
  readonly summary: OrderIntentPerformanceReviewSummary;
}

export interface OrderIntentReconciliationItem {
  readonly id: string;
  readonly intentId: string;
  readonly challengeId: string;
  readonly ticker: string;
  readonly side: OrderIntentSide;
  readonly status: 'not_submitted_live_locked';
  readonly reason: 'live_execution_locked';
  readonly liveMutationEnabled: false;
  readonly execution: null;
  readonly intentHash: string;
  readonly orderSummary: OrderIntentApprovalOrderSummary;
  readonly checkedAt: string;
}

export interface OrderIntentReconciliationSummary {
  readonly checkedCount: number;
  readonly liveSubmittedCount: 0;
  readonly blockedCount: number;
  readonly pendingAccountSnapshotCount: 0;
}

export interface OrderIntentReconciliationSnapshot {
  readonly items: readonly OrderIntentReconciliationItem[];
  readonly returnedCount: number;
  readonly liveMutationEnabled: false;
  readonly source: 'local_locked_execution_proof';
  readonly generatedAt: string;
  readonly summary: OrderIntentReconciliationSummary;
}

export type OrderIntentLifecycleStepCode =
  | 'candidate_observed'
  | 'evidence_collected'
  | 'strategy_evaluated'
  | 'risk_checked'
  | 'preview_created'
  | 'approval_required'
  | 'execution_locked';

export type OrderIntentLifecycleStepStatus =
  | 'complete'
  | 'pending'
  | 'blocked'
  | 'not_ready';

export interface OrderIntentLifecycleStep {
  readonly code: OrderIntentLifecycleStepCode;
  readonly status: OrderIntentLifecycleStepStatus;
  readonly label: string;
  readonly detail: string;
}

export interface OrderIntentPreview {
  readonly id: string;
  readonly ticker: string;
  readonly side: OrderIntentSide;
  readonly market: OrderIntentMarket;
  readonly requestedMode: Exclude<OrderIntentRequestedMode, 'live'>;
  readonly executionMode: Exclude<OrderIntentRequestedMode, 'live'>;
  readonly status: 'preview_ready';
  readonly liveExecutionLocked: true;
  readonly quantity: number | null;
  readonly cashAmount: number | null;
  readonly orderType: OrderIntentOrderType;
  readonly limitPrice: number | null;
  readonly triggerEventId: string | null;
  readonly agentId: string | null;
  readonly reason: string;
  readonly riskChecks: OrderIntentRiskCheck[];
  readonly strategyEvaluation?: OrderIntentStrategyEvaluation;
  readonly riskPolicy?: OrderIntentRiskPolicyEvaluation;
  readonly paperLedgerPreview?: OrderIntentPaperLedgerPreview;
  readonly previewImpact: OrderIntentPreviewImpact;
  readonly lifecycle: readonly OrderIntentLifecycleStep[];
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly auditRef: string;
}

export interface OrderIntentRejection {
  readonly code: 'live_execution_locked';
  readonly message: string;
  readonly auditRef: string;
}

export interface OrderIntentPreviewResult {
  readonly preview: OrderIntentPreview | null;
  readonly rejection: OrderIntentRejection | null;
}

export type OrderIntentAuditEvent =
  | 'preview_created'
  | 'live_execution_blocked'
  | 'confirm_challenge_created'
  | 'confirm_token_verified_live_locked'
  | 'confirm_token_rejected'
  | 'confirm_token_expired';
export type OrderIntentAuditDecision = 'allowed' | 'blocked';

export type OrderIntentApprovalChallengeStatus =
  | 'pending_confirmation'
  | 'confirmed_live_locked'
  | 'rejected'
  | 'expired';

export interface OrderIntentApprovalOrderSummary {
  readonly ticker: string;
  readonly side: OrderIntentSide;
  readonly market: OrderIntentMarket;
  readonly orderType: OrderIntentOrderType;
  readonly quantity: number | null;
  readonly cashAmount: number | null;
  readonly limitPrice: number | null;
  readonly liveExecutionLocked: true;
}

export interface OrderIntentApprovalChallenge {
  readonly id: string;
  readonly intentId: string;
  readonly ticker: string;
  readonly side: OrderIntentSide;
  readonly requestedMode: 'live';
  readonly status: OrderIntentApprovalChallengeStatus;
  readonly confirmationText: string;
  readonly intentHash: string;
  readonly orderSummary: OrderIntentApprovalOrderSummary;
  readonly killSwitch: 'engaged';
  readonly liveExecutionLocked: true;
  readonly operatorId: string | null;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly confirmedAt: string | null;
  readonly auditRef: string;
}

export interface OrderIntentApprovalChallengeRejection {
  readonly code:
    | 'intent_not_found'
    | 'challenge_not_found'
    | 'confirm_token_rejected'
    | 'confirm_token_expired';
  readonly message: string;
  readonly auditRef: string | null;
}

export interface OrderIntentApprovalChallengeResult {
  readonly challenge: OrderIntentApprovalChallenge | null;
  readonly rejection: OrderIntentApprovalChallengeRejection | null;
}

export interface OrderIntentConfirmApprovalResult {
  readonly challenge: OrderIntentApprovalChallenge | null;
  readonly rejection: OrderIntentApprovalChallengeRejection | null;
  readonly liveExecutionLocked: true;
  readonly execution: null;
  readonly lockedExecutionProof: OrderIntentLockedExecutionProof | null;
}

export interface OrderIntentLockedExecutionProof {
  readonly provider: 'toss';
  readonly mode: 'dry_run_locked';
  readonly status: 'blocked';
  readonly reason: 'live_execution_locked';
  readonly liveMutationEnabled: false;
  readonly challengeId: string;
  readonly intentId: string;
  readonly intentHash: string;
  readonly orderSummary: OrderIntentApprovalOrderSummary;
  readonly killSwitch: 'engaged';
  readonly checkedAt: string;
}

export interface OrderIntentApprovalChallengeInput {
  readonly intentId: string;
  readonly operatorId?: string | null;
  readonly expiresInMs?: number;
}

export interface OrderIntentConfirmApprovalInput {
  readonly challengeId: string;
  readonly confirmationText: string;
}

export interface OrderIntentAuditEntry {
  readonly id: string;
  readonly intentId: string | null;
  readonly event: OrderIntentAuditEvent;
  readonly decision: OrderIntentAuditDecision;
  readonly ticker: string;
  readonly side: OrderIntentSide;
  readonly requestedMode: OrderIntentRequestedMode;
  readonly agentId: string | null;
  readonly triggerEventId: string | null;
  readonly reason: string;
  readonly createdAt: string;
}

export interface OrderIntentService {
  createPreview(input: OrderIntentInput): OrderIntentPreviewResult;
  createApprovalChallenge(input: OrderIntentApprovalChallengeInput): OrderIntentApprovalChallengeResult;
  confirmApprovalChallenge(input: OrderIntentConfirmApprovalInput): OrderIntentConfirmApprovalResult;
  snapshotLivePolicy(): OrderIntentLivePolicy;
  snapshotPreviews(limit?: number): OrderIntentPreview[];
  snapshotApprovalChallenges(limit?: number): OrderIntentApprovalChallenge[];
  snapshotAudit(limit?: number): OrderIntentAuditEntry[];
  snapshotPaperLedger(limit?: number): OrderIntentPaperLedgerSnapshot;
  snapshotPerformanceReview(limit?: number): OrderIntentPerformanceReviewSnapshot;
  snapshotReconciliation(limit?: number): OrderIntentReconciliationSnapshot;
}

export interface OrderIntentStore {
  getPreview(id: string): OrderIntentPreview | null;
  appendPreview(preview: OrderIntentPreview): void;
  appendPaperLedgerEntry(entry: OrderIntentPaperLedgerEntry): void;
  snapshotPaperLedger(limit: number): OrderIntentPaperLedgerEntry[];
  appendApprovalChallenge(challenge: OrderIntentApprovalChallenge): void;
  updateApprovalChallenge(challenge: OrderIntentApprovalChallenge): void;
  getApprovalChallenge(id: string): OrderIntentApprovalChallenge | null;
  snapshotApprovalChallenges(limit: number): OrderIntentApprovalChallenge[];
  appendAudit(entry: OrderIntentAuditEntry): void;
  snapshotPreviews(limit: number): OrderIntentPreview[];
  snapshotAudit(limit: number): OrderIntentAuditEntry[];
}

export interface OrderIntentServiceOptions {
  readonly maxAuditEntries?: number;
  readonly maxPreviewEntries?: number;
  readonly idFactory?: () => string;
  readonly auditIdFactory?: () => string;
  readonly approvalChallengeIdFactory?: () => string;
  readonly now?: () => string;
  readonly store?: OrderIntentStore;
  readonly agentEventQueue?: Pick<AgentEventQueue, 'enqueue'>;
}

const DEFAULT_MAX_AUDIT_ENTRIES = 500;
const DEFAULT_MAX_PREVIEW_ENTRIES = 200;
const DEFAULT_CONFIRM_EXPIRES_IN_MS = 60_000;
const LIVE_LOCKED_MESSAGE = 'Live order execution is disabled until a fresh explicit approval policy is present.';
const LIVE_POLICY_MISSING_CONSTRAINTS: readonly OrderIntentLivePolicyMissingConstraint[] = [
  'policy_approval',
  'allowed_tickers',
  'max_order_amount',
  'max_daily_loss',
  'trading_hours',
  'order_type',
  'cooldown',
  'kill_switch_release',
];
const AUTOMATION_READINESS_GAPS: readonly OrderIntentAutomationReadinessGap[] = [
  {
    code: 'decision_engine',
    status: 'partial',
    severity: 'blocking',
    label: '의사결정 엔진',
    detail: '모의 미리보기용 deterministic 판단은 가능하지만 자동 매매 엔진은 아직 준비되지 않았습니다.',
  },
  {
    code: 'strategy_policy',
    status: 'partial',
    severity: 'blocking',
    label: '전략 정책',
    detail: '기본 모의 전략 정책은 평가하지만 live 전략 선택, 버전, 적용 범위 정책은 아직 준비되지 않았습니다.',
  },
  {
    code: 'risk_policy',
    status: 'partial',
    severity: 'blocking',
    label: '리스크 정책',
    detail: '모의 리스크 차단은 동작하지만 live 종목, 금액, 손실한도, 시간대, 주문유형, 쿨다운 정책은 아직 준비되지 않았습니다.',
  },
  {
    code: 'paper_trading_ledger',
    status: 'partial',
    severity: 'blocking',
    label: '페이퍼 거래 원장',
    detail: '미체결 preview delta는 계산하지만 지속 원장과 성과 추적은 아직 준비되지 않았습니다.',
  },
  {
    code: 'simulation_result_view',
    status: 'partial',
    severity: 'blocking',
    label: '시뮬레이션 결과',
    detail: '모의 주문 결과 요약은 가능하지만 전략 성과와 실패 사유를 검토하는 상세 화면은 아직 제한적입니다.',
  },
  {
    code: 'toss_order_execution',
    status: 'locked',
    severity: 'blocking',
    label: 'Toss 주문 실행',
    detail: 'dry-run adapter 계약은 정의되어 있지만 실제 Toss 주문 실행은 fresh 승인 전까지 잠겨 있습니다.',
  },
  {
    code: 'live_approval_executor',
    status: 'locked',
    severity: 'blocking',
    label: '실거래 승인 실행기',
    detail: '승인 확인 후에도 실제 주문 실행기는 연결되어 있지 않습니다.',
  },
  {
    code: 'execution_reconciliation',
    status: 'partial',
    severity: 'blocking',
    label: '체결/잔고 대조',
    detail: '대조 대상 상태와 read-only 계좌 snapshot source는 정의됐지만 live 결과 대조는 아직 잠겨 있습니다.',
  },
  {
    code: 'agent_performance_audit',
    status: 'partial',
    severity: 'blocking',
    label: '에이전트 성과 감사',
    detail: '모의 미리보기 성과 리뷰는 가능하지만 실제 체결 결과와 장기 성과 감사는 아직 잠겨 있습니다.',
  },
  {
    code: 'intent_explanation',
    status: 'partial',
    severity: 'warning',
    label: '판단 사유 설명',
    detail: '기본 미리보기 사유는 표시하지만 전략별 설명 품질은 아직 제한적입니다.',
  },
  {
    code: 'provider_freshness',
    status: 'partial',
    severity: 'blocking',
    label: '데이터 신선도 보장',
    detail: '가격, 차트, 뉴스/공시, watchlist freshness gate 계약은 있지만 live 검증은 아직 잠겨 있습니다.',
  },
  {
    code: 'event_dedupe',
    status: 'partial',
    severity: 'blocking',
    label: '이벤트 중복 제거',
    detail: '주문 미리보기 이벤트 dedupe는 있으나 모든 source를 아우르는 안정적인 dedupe 계약은 아직 완성되지 않았습니다.',
  },
];

const LIVE_EXECUTION_READINESS: OrderIntentExecutionReadiness = {
  orderAdapter: {
    provider: 'toss',
    mode: 'dry_run_locked',
    status: 'contract_ready',
    liveMutationEnabled: false,
    supportedMarkets: ['KR'],
    supportedSides: ['buy', 'sell'],
    supportedOrderTypes: ['market', 'limit'],
  },
  lockedExecutor: {
    status: 'ready_locked',
    blockedBeforeNetwork: true,
    liveMutationEnabled: false,
    output: 'locked_execution_proof',
    requires: ['fresh_approval', 'risk_policy', 'kill_switch_release', 'reconciliation_ready'],
  },
  liveApprovalExecutor: {
    status: 'ready_locked',
    blockedBeforeAdapter: true,
    liveMutationEnabled: false,
    input: 'confirmed_approval_challenge',
    output: 'locked_execution_proof',
    requires: ['confirmed_approval_challenge', 'intent_hash_match', 'kill_switch_release', 'locked_order_adapter'],
  },
  approvalGate: {
    status: 'locked',
    requiresFreshApproval: true,
    confirmationChallenge: true,
    liveExecutionLocked: true,
  },
  reconciliation: {
    status: 'planned',
    source: 'toss_account_readonly_snapshot',
    requiredStates: ['submitted', 'accepted', 'rejected', 'partial_fill', 'filled', 'canceled'],
    executor: {
      status: 'read_only_ready',
      requiredInputs: ['intent_hash', 'order_summary', 'read_only_account_snapshot'],
      matchKeys: ['intent_hash', 'ticker', 'side'],
      liveMutationEnabled: false,
    },
    liveMutationEnabled: false,
  },
  dataFreshnessGate: {
    status: 'ready_locked',
    requiredSources: ['quote', 'chart', 'news_or_disclosure', 'watchlist_membership'],
    maxAgeMs: {
      quote: 1000,
      chart: 60000,
      newsOrDisclosure: 300000,
      watchlistMembership: 300000,
    },
    blocksLiveExecution: true,
    liveMutationEnabled: false,
  },
};

export function createOrderIntentService(
  options: OrderIntentServiceOptions = {},
): OrderIntentService {
  const maxAuditEntries = Math.max(1, Math.trunc(options.maxAuditEntries ?? DEFAULT_MAX_AUDIT_ENTRIES));
  const maxPreviewEntries = Math.max(1, Math.trunc(options.maxPreviewEntries ?? DEFAULT_MAX_PREVIEW_ENTRIES));
  const idFactory = options.idFactory ?? randomUUID;
  const auditIdFactory = options.auditIdFactory ?? randomUUID;
  const approvalChallengeIdFactory = options.approvalChallengeIdFactory ?? randomUUID;
  const now = options.now ?? (() => new Date().toISOString());
  const store = options.store ?? createMemoryOrderIntentStore({
    maxAuditEntries,
    maxPreviewEntries,
  });
  const agentEventQueue = options.agentEventQueue;

  function createPreview(input: OrderIntentInput): OrderIntentPreviewResult {
    const createdAt = normalizeTimestamp(now(), 'now');
    const ticker = normalizeTicker(input.ticker);
    const side = normalizeSide(input.side);
    const requestedMode = normalizeRequestedMode(input.requestedMode ?? 'simulated');
    const agentId = normalizeOptionalText(input.agentId ?? null, 'agentId', 80);
    const triggerEventId = normalizeOptionalText(input.triggerEventId ?? null, 'triggerEventId', 128);
    const reason = sanitizePublicText(normalizeRequiredText(input.reason, 'reason', 500));

    if (requestedMode === 'live') {
      const auditRef = appendAudit({
        intentId: null,
        event: 'live_execution_blocked',
        decision: 'blocked',
        ticker,
        side,
        requestedMode,
        agentId,
        triggerEventId,
        reason: LIVE_LOCKED_MESSAGE,
        createdAt,
      });
      return {
        preview: null,
        rejection: {
          code: 'live_execution_locked',
          message: LIVE_LOCKED_MESSAGE,
          auditRef,
        },
      };
    }

    const intentId = normalizeRequiredText(idFactory(), 'id', 128);
    const auditRef = appendAudit({
      intentId,
      event: 'preview_created',
      decision: 'allowed',
      ticker,
      side,
      requestedMode,
      agentId,
      triggerEventId,
      reason: 'Local simulated order preview created; live execution remains locked.',
      createdAt,
    });
    const market = normalizeMarket(input.market ?? inferMarket(ticker));
    const quantity = normalizeOptionalPositiveNumber(input.quantity ?? null, 'quantity');
    const cashAmount = normalizeOptionalPositiveNumber(input.cashAmount ?? null, 'cashAmount');
    const orderType = normalizeOrderType(input.orderType ?? 'market');
    const limitPrice = normalizeOptionalPositiveNumber(input.limitPrice ?? null, 'limitPrice');
    const riskChecks = buildOrderIntentRiskChecks();
    const preview: OrderIntentPreview = {
      id: intentId,
      ticker,
      side,
      market,
      requestedMode,
      executionMode: requestedMode,
      status: 'preview_ready',
      liveExecutionLocked: true,
      quantity,
      cashAmount,
      orderType,
      limitPrice,
      triggerEventId,
      agentId,
      reason,
      riskChecks,
      strategyEvaluation: buildOrderIntentStrategyEvaluation({
        side,
        requestedMode,
        triggerEventId,
        orderType,
        market,
      }),
      riskPolicy: buildOrderIntentRiskPolicyEvaluation(riskChecks),
      paperLedgerPreview: buildOrderIntentPaperLedgerPreview({
        intentId,
        side,
        market,
        quantity,
        cashAmount,
      }),
      previewImpact: buildOrderIntentPreviewImpact({
        side,
        market,
        quantity,
        cashAmount,
        limitPrice,
      }),
      lifecycle: buildOrderIntentLifecycle({ triggerEventId }),
      createdAt,
      expiresAt: new Date(Date.parse(createdAt) + 5 * 60_000).toISOString(),
      auditRef,
    };

    store.appendPreview(preview);
    const paperLedgerEntry = buildOrderIntentPaperLedgerEntry(preview);
    if (paperLedgerEntry !== null) store.appendPaperLedgerEntry(paperLedgerEntry);
    enqueueOrderIntentAgentEvents(agentEventQueue, preview);
    return { preview, rejection: null };
  }

  function snapshotPreviews(limit = maxPreviewEntries): OrderIntentPreview[] {
    return store.snapshotPreviews(limit);
  }

  function createApprovalChallenge(
    input: OrderIntentApprovalChallengeInput,
  ): OrderIntentApprovalChallengeResult {
    const createdAt = normalizeTimestamp(now(), 'now');
    const intentId = normalizeRequiredText(input.intentId, 'intentId', 128);
    const preview = store.getPreview(intentId);
    if (preview === null) {
      return {
        challenge: null,
        rejection: {
          code: 'intent_not_found',
          message: 'Order intent preview was not found.',
          auditRef: null,
        },
      };
    }

    const operatorId = normalizeOptionalText(input.operatorId ?? null, 'operatorId', 80);
    const expiresInMs = normalizeApprovalExpiresInMs(input.expiresInMs);
    const auditRef = appendAudit({
      intentId: preview.id,
      event: 'confirm_challenge_created',
      decision: 'allowed',
      ticker: preview.ticker,
      side: preview.side,
      requestedMode: 'live',
      agentId: preview.agentId,
      triggerEventId: preview.triggerEventId,
      reason: 'Fresh confirmation challenge created; live execution remains locked.',
      createdAt,
    });
    const challenge: OrderIntentApprovalChallenge = {
      id: normalizeRequiredText(approvalChallengeIdFactory(), 'approvalChallengeId', 128),
      intentId: preview.id,
      ticker: preview.ticker,
      side: preview.side,
      requestedMode: 'live',
      status: 'pending_confirmation',
      confirmationText: confirmationTextFor(preview),
      intentHash: buildOrderIntentApprovalHash(preview),
      orderSummary: buildOrderIntentApprovalOrderSummary(preview),
      killSwitch: 'engaged',
      liveExecutionLocked: true,
      operatorId,
      createdAt,
      expiresAt: new Date(Date.parse(createdAt) + expiresInMs).toISOString(),
      confirmedAt: null,
      auditRef,
    };
    store.appendApprovalChallenge(challenge);
    return { challenge, rejection: null };
  }

  function confirmApprovalChallenge(
    input: OrderIntentConfirmApprovalInput,
  ): OrderIntentConfirmApprovalResult {
    const confirmedAt = normalizeTimestamp(now(), 'now');
    const challengeId = normalizeRequiredText(input.challengeId, 'challengeId', 128);
    const confirmationText = normalizeRequiredText(input.confirmationText, 'confirmationText', 128);
    const challenge = store.getApprovalChallenge(challengeId);
    if (challenge === null) {
      return {
        challenge: null,
        rejection: {
          code: 'challenge_not_found',
          message: 'Approval challenge was not found.',
          auditRef: null,
        },
        liveExecutionLocked: true,
        execution: null,
        lockedExecutionProof: null,
      };
    }

    if (Date.parse(confirmedAt) > Date.parse(challenge.expiresAt)) {
      const next: OrderIntentApprovalChallenge = {
        ...challenge,
        status: 'expired',
      };
      store.updateApprovalChallenge(next);
      const auditRef = appendChallengeAudit(next, 'confirm_token_expired', 'Confirmation token expired before verification.', confirmedAt);
      return {
        challenge: next,
        rejection: {
          code: 'confirm_token_expired',
          message: 'Confirmation token expired before verification.',
          auditRef,
        },
        liveExecutionLocked: true,
        execution: null,
        lockedExecutionProof: null,
      };
    }

    if (confirmationText !== challenge.confirmationText) {
      const next: OrderIntentApprovalChallenge = {
        ...challenge,
        status: 'rejected',
      };
      store.updateApprovalChallenge(next);
      const auditRef = appendChallengeAudit(next, 'confirm_token_rejected', 'Confirmation token did not match.', confirmedAt);
      return {
        challenge: next,
        rejection: {
          code: 'confirm_token_rejected',
          message: 'Confirmation token did not match.',
          auditRef,
        },
        liveExecutionLocked: true,
        execution: null,
        lockedExecutionProof: null,
      };
    }

    const next: OrderIntentApprovalChallenge = {
      ...challenge,
      status: 'confirmed_live_locked',
      confirmedAt,
    };
    store.updateApprovalChallenge(next);
    appendChallengeAudit(next, 'confirm_token_verified_live_locked', 'Confirmation token verified; live execution remains locked.', confirmedAt);
    return {
      challenge: next,
      rejection: null,
      liveExecutionLocked: true,
      execution: null,
      lockedExecutionProof: buildLockedExecutionProof(next, confirmedAt),
    };
  }

  function snapshotApprovalChallenges(limit = maxPreviewEntries): OrderIntentApprovalChallenge[] {
    return store.snapshotApprovalChallenges(limit);
  }

  function snapshotLivePolicy(): OrderIntentLivePolicy {
    return {
      liveExecutionEnabled: false,
      policyApproved: false,
      killSwitch: 'engaged',
      allowedTickers: [],
      maxOrderKrw: null,
      maxDailyLossKrw: null,
      tradingHours: null,
      allowedOrderTypes: [],
      cooldownMs: null,
      missingConstraints: LIVE_POLICY_MISSING_CONSTRAINTS,
      automationReadinessGaps: AUTOMATION_READINESS_GAPS,
      executionReadiness: LIVE_EXECUTION_READINESS,
      generatedAt: normalizeTimestamp(now(), 'now'),
    };
  }

  function snapshotAudit(limit = maxAuditEntries): OrderIntentAuditEntry[] {
    return store.snapshotAudit(limit);
  }

  function snapshotPaperLedger(limit = maxPreviewEntries): OrderIntentPaperLedgerSnapshot {
    const items = store.snapshotPaperLedger(limit);
    return {
      items,
      returnedCount: items.length,
      summary: summarizePaperLedger(items),
    };
  }

  function snapshotPerformanceReview(limit = maxPreviewEntries): OrderIntentPerformanceReviewSnapshot {
    const generatedAt = normalizeTimestamp(now(), 'now');
    const ledgerItems = store.snapshotPaperLedger(limit);
    const items = ledgerItems.map((entry) => buildOrderIntentPerformanceReviewItem(entry, generatedAt));
    return {
      items,
      returnedCount: items.length,
      liveMutationEnabled: false,
      source: 'paper_ledger_preview_only',
      generatedAt,
      summary: summarizePerformanceReview(items),
    };
  }

  function snapshotReconciliation(limit = maxPreviewEntries): OrderIntentReconciliationSnapshot {
    const generatedAt = normalizeTimestamp(now(), 'now');
    const items = store
      .snapshotApprovalChallenges(limit)
      .filter((challenge) => challenge.status === 'confirmed_live_locked')
      .map((challenge) => buildOrderIntentReconciliationItem(challenge, generatedAt));
    return {
      items,
      returnedCount: items.length,
      liveMutationEnabled: false,
      source: 'local_locked_execution_proof',
      generatedAt,
      summary: {
        checkedCount: items.length,
        liveSubmittedCount: 0,
        blockedCount: items.length,
        pendingAccountSnapshotCount: 0,
      },
    };
  }

  function appendAudit(input: Omit<OrderIntentAuditEntry, 'id'>): string {
    const id = normalizeRequiredText(auditIdFactory(), 'auditId', 128);
    store.appendAudit({ id, ...input });
    return id;
  }

  function appendChallengeAudit(
    challenge: OrderIntentApprovalChallenge,
    event: OrderIntentAuditEvent,
    reason: string,
    createdAt: string,
  ): string {
    return appendAudit({
      intentId: challenge.intentId,
      event,
      decision: 'blocked',
      ticker: challenge.ticker,
      side: challenge.side,
      requestedMode: 'live',
      agentId: null,
      triggerEventId: null,
      reason,
      createdAt,
    });
  }

  return {
    createPreview,
    createApprovalChallenge,
    confirmApprovalChallenge,
    snapshotLivePolicy,
    snapshotPreviews,
    snapshotApprovalChallenges,
    snapshotAudit,
    snapshotPaperLedger,
    snapshotPerformanceReview,
    snapshotReconciliation,
  };
}

function enqueueOrderIntentAgentEvents(
  queue: Pick<AgentEventQueue, 'enqueue'> | undefined,
  preview: OrderIntentPreview,
): void {
  if (queue === undefined) return;
  queue.enqueue({
    type: 'risk_check_completed',
    ticker: preview.ticker,
    source: 'order-intent',
    publishedAt: preview.createdAt,
    firstSeenAt: preview.createdAt,
    relevance: 0.8,
    confidence: 1,
    reason: 'Risk check completed; live execution remains locked.',
    dedupeKey: `order-intent-risk:${preview.id}`,
    payloadRef: null,
    relatedIds: {
      orderIntentId: preview.id,
    },
    skipReason: 'live execution locked',
  });
  queue.enqueue({
    type: 'preview_created',
    ticker: preview.ticker,
    source: 'order-intent',
    publishedAt: preview.createdAt,
    firstSeenAt: preview.createdAt,
    relevance: 0.85,
    confidence: 1,
    reason: 'Local simulated order preview created; live execution remains locked.',
    dedupeKey: `order-intent-preview:${preview.id}`,
    payloadRef: null,
    relatedIds: {
      orderIntentId: preview.id,
    },
    skipReason: 'live execution locked',
  });
}

function createMemoryOrderIntentStore(input: {
  maxAuditEntries: number;
  maxPreviewEntries: number;
}): OrderIntentStore {
  const previews: OrderIntentPreview[] = [];
  const paperLedgerEntries: OrderIntentPaperLedgerEntry[] = [];
  const challenges: OrderIntentApprovalChallenge[] = [];
  const auditEntries: OrderIntentAuditEntry[] = [];
  return {
    getPreview(id) {
      return previews.find((preview) => preview.id === id) ?? null;
    },
    appendPreview(preview) {
      previews.unshift(preview);
      while (previews.length > input.maxPreviewEntries) previews.pop();
    },
    appendPaperLedgerEntry(entry) {
      paperLedgerEntries.unshift(entry);
      while (paperLedgerEntries.length > input.maxPreviewEntries) paperLedgerEntries.pop();
    },
    snapshotPaperLedger(limit) {
      return paperLedgerEntries.slice(0, Math.max(0, Math.trunc(limit)));
    },
    appendApprovalChallenge(challenge) {
      challenges.unshift(challenge);
      while (challenges.length > input.maxPreviewEntries) challenges.pop();
    },
    updateApprovalChallenge(challenge) {
      const index = challenges.findIndex((entry) => entry.id === challenge.id);
      if (index === -1) {
        challenges.unshift(challenge);
      } else {
        challenges[index] = challenge;
      }
    },
    getApprovalChallenge(id) {
      return challenges.find((challenge) => challenge.id === id) ?? null;
    },
    snapshotApprovalChallenges(limit) {
      return challenges.slice(0, Math.max(0, Math.trunc(limit)));
    },
    appendAudit(entry) {
      auditEntries.unshift(entry);
      while (auditEntries.length > input.maxAuditEntries) auditEntries.pop();
    },
    snapshotPreviews(limit) {
      return previews.slice(0, Math.max(0, Math.trunc(limit)));
    },
    snapshotAudit(limit) {
      return auditEntries.slice(0, Math.max(0, Math.trunc(limit)));
    },
  };
}

export function buildOrderIntentLifecycle(input: {
  readonly triggerEventId: string | null;
}): readonly OrderIntentLifecycleStep[] {
  const evidenceReady = input.triggerEventId !== null;
  return [
    {
      code: 'candidate_observed',
      status: 'complete',
      label: '후보 감지',
      detail: '에이전트 후보가 생성됐습니다.',
    },
    {
      code: 'evidence_collected',
      status: evidenceReady ? 'complete' : 'pending',
      label: '근거 수집',
      detail: evidenceReady ? '연결된 이벤트 근거가 있습니다.' : '연결된 이벤트 근거 대기 중입니다.',
    },
    {
      code: 'strategy_evaluated',
      status: 'complete',
      label: '전략 평가',
      detail: '모의 미리보기용 기본 전략 정책을 평가했습니다.',
    },
    {
      code: 'risk_checked',
      status: 'blocked',
      label: '리스크 확인',
      detail: '실거래 리스크 정책이 준비되지 않아 차단됩니다.',
    },
    {
      code: 'preview_created',
      status: 'complete',
      label: '미리보기 생성',
      detail: '모의 주문 미리보기만 생성됐습니다.',
    },
    {
      code: 'approval_required',
      status: 'pending',
      label: '승인 필요',
      detail: '실거래에는 별도 승인 정책이 필요합니다.',
    },
    {
      code: 'execution_locked',
      status: 'blocked',
      label: '실행 잠금',
      detail: 'Toss 주문 실행은 잠겨 있습니다.',
    },
  ];
}

export function buildOrderIntentRiskChecks(): OrderIntentRiskCheck[] {
  return [
    {
      code: 'policy_approval_missing',
      status: 'blocked',
      message: 'Fresh explicit live approval policy is missing.',
    },
    {
      code: 'allowed_universe_missing',
      status: 'blocked',
      message: 'Live allowed ticker universe is not configured.',
    },
    {
      code: 'max_order_amount_missing',
      status: 'blocked',
      message: 'Live maximum order amount is not configured.',
    },
    {
      code: 'max_daily_loss_missing',
      status: 'blocked',
      message: 'Live maximum daily loss is not configured.',
    },
    {
      code: 'trading_hours_missing',
      status: 'blocked',
      message: 'Live trading-hours guard is not configured.',
    },
    {
      code: 'order_type_policy_missing',
      status: 'blocked',
      message: 'Live allowed order types are not configured.',
    },
    {
      code: 'cooldown_missing',
      status: 'warning',
      message: 'Live order cooldown is not configured.',
    },
    {
      code: 'live_execution_locked',
      status: 'blocked',
      message: 'Live execution requires kill-switch release before any network order.',
    },
  ];
}

export function buildOrderIntentStrategyEvaluation(input: {
  readonly side: OrderIntentSide;
  readonly requestedMode: Exclude<OrderIntentRequestedMode, 'live'>;
  readonly triggerEventId: string | null;
  readonly orderType: OrderIntentOrderType;
  readonly market: OrderIntentMarket;
}): OrderIntentStrategyEvaluation {
  return {
    strategyId: 'araon-deterministic-preview-v1',
    status: 'evaluated',
    decision: input.side,
    confidence: 'guarded',
    rationale: `${sideActionLabel(input.side)} 후보를 모의 미리보기로만 평가했습니다. 실거래 실행은 잠겨 있습니다.`,
    signals: [
      input.triggerEventId === null ? 'operator-context-only' : 'event-linked',
      `${input.requestedMode}-mode`,
      `${input.market}-market`,
      `${input.orderType}-order`,
      'live-execution-locked',
    ],
  };
}

export function buildOrderIntentRiskPolicyEvaluation(
  riskChecks: readonly OrderIntentRiskCheck[],
): OrderIntentRiskPolicyEvaluation {
  return {
    policyId: 'araon-live-lock-risk-v1',
    status: 'simulated_only',
    liveBlocked: true,
    maxOrderKrw: null,
    maxDailyLossKrw: null,
    checks: riskChecks,
  };
}

export function buildOrderIntentPaperLedgerPreview(input: {
  readonly intentId: string;
  readonly side: OrderIntentSide;
  readonly market: OrderIntentMarket;
  readonly quantity: number | null;
  readonly cashAmount: number | null;
}): OrderIntentPaperLedgerPreview {
  const signedQuantity = input.quantity === null
    ? null
    : input.side === 'buy' ? input.quantity : -input.quantity;
  const signedCashKrw = input.market !== 'KR' || input.cashAmount === null
    ? null
    : input.side === 'buy' ? -input.cashAmount : input.cashAmount;
  return {
    ledgerId: `paper-preview:${input.intentId}`,
    status: 'preview_only',
    booked: false,
    positionDelta: signedQuantity,
    cashDeltaKrw: signedCashKrw,
    note: '실제 원장에 기록하지 않는 모의 변화량입니다.',
  };
}

export function buildOrderIntentPaperLedgerEntry(
  preview: OrderIntentPreview,
): OrderIntentPaperLedgerEntry | null {
  const ledger = preview.paperLedgerPreview;
  if (ledger === undefined) return null;
  return {
    id: ledger.ledgerId,
    intentId: preview.id,
    ticker: preview.ticker,
    side: preview.side,
    market: preview.market,
    status: 'preview_only',
    booked: false,
    positionDelta: ledger.positionDelta,
    cashDeltaKrw: ledger.cashDeltaKrw,
    note: ledger.note,
    createdAt: preview.createdAt,
  };
}

export function buildOrderIntentPreviewImpact(input: {
  readonly side: OrderIntentSide;
  readonly market: OrderIntentMarket;
  readonly quantity: number | null;
  readonly cashAmount: number | null;
  readonly limitPrice: number | null;
}): OrderIntentPreviewImpact {
  const estimatedNotionalKrw = input.market === 'KR'
    ? input.cashAmount ?? (
      input.quantity !== null && input.limitPrice !== null
        ? input.quantity * input.limitPrice
        : null
    )
    : null;
  const status: OrderIntentPreviewImpact['status'] =
    input.quantity !== null || estimatedNotionalKrw !== null ? 'estimated' : 'incomplete';
  const sideVerb = input.side === 'buy' ? '매수' : '매도';
  const positionImpact = input.quantity === null
    ? '수량 미정'
    : `${input.side === 'buy' ? '+' : '-'}${formatNumber(input.quantity)}주 ${sideVerb} 예정`;
  const cashSign = input.side === 'buy' ? '-' : '+';
  const cashImpact = estimatedNotionalKrw === null
    ? '현금 영향 추정 대기'
    : `${cashSign}${formatKrw(estimatedNotionalKrw)} ${input.side === 'buy' ? '사용 예상' : '확보 예상'}`;
  const pnlImpact = input.side === 'sell'
    ? '보유 평균단가와 실제 체결가 대조 전이라 손익은 계산하지 않습니다.'
    : '체결 전 포지션이라 손익은 계산하지 않습니다.';
  return {
    status,
    estimatedNotionalKrw,
    positionImpact,
    cashImpact,
    pnlImpact,
    liveExecutionImpact: '실제 주문은 생성하지 않습니다. 승인 게이트와 긴급 정지에서 실행이 잠겨 있습니다.',
  };
}

export function summarizePaperLedger(
  entries: readonly OrderIntentPaperLedgerEntry[],
): OrderIntentPaperLedgerSummary {
  const byTicker = new Map<string, {
    previewCount: number;
    positionDelta: number;
    cashDeltaKrw: number;
    lastPreviewAt: string;
  }>();
  let cashDeltaKrw = 0;
  for (const entry of entries) {
    if (entry.cashDeltaKrw !== null) cashDeltaKrw += entry.cashDeltaKrw;
    const summary = byTicker.get(entry.ticker) ?? {
      previewCount: 0,
      positionDelta: 0,
      cashDeltaKrw: 0,
      lastPreviewAt: entry.createdAt,
    };
    summary.previewCount += 1;
    if (entry.positionDelta !== null) summary.positionDelta += entry.positionDelta;
    if (entry.cashDeltaKrw !== null) summary.cashDeltaKrw += entry.cashDeltaKrw;
    if (entry.createdAt > summary.lastPreviewAt) summary.lastPreviewAt = entry.createdAt;
    byTicker.set(entry.ticker, summary);
  }
  return {
    entryCount: entries.length,
    bookedCount: 0,
    previewOnlyCount: entries.length,
    cashDeltaKrw,
    byTicker: Array.from(byTicker.entries()).map(([ticker, summary]) => ({
      ticker,
      ...summary,
    })),
  };
}

export function buildOrderIntentPerformanceReviewItem(
  entry: OrderIntentPaperLedgerEntry,
  reviewedAt: string,
): OrderIntentPerformanceReviewItem {
  return {
    id: `performance-review:${entry.id}`,
    intentId: entry.intentId,
    ticker: entry.ticker,
    side: entry.side,
    market: entry.market,
    outcomeStatus: 'pending_market_result',
    booked: false,
    liveMutationEnabled: false,
    reviewLabel: '시장 결과 대기',
    reason: '실제 체결 없이 모의 미리보기만 기록했습니다.',
    createdAt: entry.createdAt,
    reviewedAt,
  };
}

export function summarizePerformanceReview(
  items: readonly OrderIntentPerformanceReviewItem[],
): OrderIntentPerformanceReviewSummary {
  const tickers = new Set<string>();
  let buyPreviewCount = 0;
  let sellPreviewCount = 0;
  let latestPreviewAt: string | null = null;
  for (const item of items) {
    tickers.add(item.ticker);
    if (item.side === 'buy') buyPreviewCount += 1;
    if (item.side === 'sell') sellPreviewCount += 1;
    if (latestPreviewAt === null || item.createdAt > latestPreviewAt) {
      latestPreviewAt = item.createdAt;
    }
  }
  return {
    previewOnlyCount: items.length,
    bookedCount: 0,
    pendingReviewCount: items.length,
    buyPreviewCount,
    sellPreviewCount,
    liveSubmittedCount: 0,
    reviewedTickerCount: tickers.size,
    latestPreviewAt,
    reviewStatus: items.length === 0 ? 'empty' : 'needs_market_result',
  };
}

function sideActionLabel(side: OrderIntentSide): string {
  return side === 'buy' ? '매수' : '매도';
}

function formatNumber(value: number): string {
  return value.toLocaleString('ko-KR');
}

function formatKrw(value: number): string {
  return `${formatNumber(value)}원`;
}

function confirmationTextFor(preview: OrderIntentPreview): string {
  return `CONFIRM ${preview.ticker} ${preview.side.toUpperCase()} LIVE`;
}

export function buildOrderIntentApprovalOrderSummary(
  preview: OrderIntentPreview,
): OrderIntentApprovalOrderSummary {
  return {
    ticker: preview.ticker,
    side: preview.side,
    market: preview.market,
    orderType: preview.orderType,
    quantity: preview.quantity,
    cashAmount: preview.cashAmount,
    limitPrice: preview.limitPrice,
    liveExecutionLocked: true,
  };
}

export function buildOrderIntentApprovalHash(preview: OrderIntentPreview): string {
  return hashOrderIntentApprovalSummary(buildOrderIntentApprovalOrderSummary(preview));
}

export function hashOrderIntentApprovalSummary(summary: OrderIntentApprovalOrderSummary): string {
  return createHash('sha256')
    .update(JSON.stringify(summary))
    .digest('hex')
    .slice(0, 16);
}

export function buildLockedExecutionProof(
  challenge: OrderIntentApprovalChallenge,
  checkedAt: string,
): OrderIntentLockedExecutionProof {
  return {
    provider: 'toss',
    mode: 'dry_run_locked',
    status: 'blocked',
    reason: 'live_execution_locked',
    liveMutationEnabled: false,
    challengeId: challenge.id,
    intentId: challenge.intentId,
    intentHash: challenge.intentHash,
    orderSummary: challenge.orderSummary,
    killSwitch: 'engaged',
    checkedAt,
  };
}

export function buildOrderIntentReconciliationItem(
  challenge: OrderIntentApprovalChallenge,
  checkedAt: string,
): OrderIntentReconciliationItem {
  return {
    id: `reconcile:${challenge.id}`,
    intentId: challenge.intentId,
    challengeId: challenge.id,
    ticker: challenge.ticker,
    side: challenge.side,
    status: 'not_submitted_live_locked',
    reason: 'live_execution_locked',
    liveMutationEnabled: false,
    execution: null,
    intentHash: challenge.intentHash,
    orderSummary: challenge.orderSummary,
    checkedAt,
  };
}

function normalizeTicker(value: string): string {
  const trimmed = value.trim().toUpperCase();
  const withoutKrPrefix = trimmed.startsWith('A') ? trimmed.slice(1) : trimmed;
  if (/^\d{6}$/.test(withoutKrPrefix)) return withoutKrPrefix;
  if (/^[A-Z][A-Z0-9.-]{0,15}$/.test(trimmed)) return trimmed;
  throw new Error('Invalid order intent ticker');
}

function normalizeSide(value: string): OrderIntentSide {
  if (value === 'buy' || value === 'sell') return value;
  throw new Error('Invalid order intent side');
}

function normalizeMarket(value: string): OrderIntentMarket {
  if (value === 'KR' || value === 'US') return value;
  throw new Error('Invalid order intent market');
}

function normalizeRequestedMode(value: string): OrderIntentRequestedMode {
  if (value === 'simulated' || value === 'paper' || value === 'live') return value;
  throw new Error('Invalid order intent mode');
}

function normalizeOrderType(value: string): OrderIntentOrderType {
  if (value === 'market' || value === 'limit') return value;
  throw new Error('Invalid order intent orderType');
}

function normalizeRequiredText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) throw new Error(`Invalid order intent ${field}`);
  return normalized.slice(0, maxLength);
}

function normalizeOptionalText(value: string | null, field: string, maxLength: number): string | null {
  if (value === null) return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) return null;
  if (containsSensitiveText(normalized)) {
    throw new Error(`Invalid order intent ${field}`);
  }
  return normalized.slice(0, maxLength);
}

function sanitizePublicText(value: string): string {
  return value
    .replace(/\b(SESSION|UTK|LTK|FTK)\s*[=:]\s*[^\s&"',}]+/gi, (_match, key: string) => `${key}=[REDACTED]`)
    .replace(/\b(browserSessionId|deviceId|accountNo|orderNo|referenceId)\s*[=:]\s*[^\s&"',}]+/gi, (_match, key: string) => `${key}=[REDACTED]`)
    .replace(/\b(approval[_-]?key|appkey|appsecret|secretkey|access[_-]?token)\s*[=:]\s*[^\s&"',}]+/gi, (_match, key: string) => `${key}=[REDACTED]`)
    .replace(/\bbearer\s+[^\s"']+/gi, 'Bearer [REDACTED]');
}

function containsSensitiveText(value: string): boolean {
  return /\b(?:SESSION|UTK|LTK|FTK|browserSessionId|deviceId|accountNo|orderNo|referenceId|approval[_-]?key|appkey|appsecret|secretkey|access[_-]?token|bearer)\b/i.test(value);
}

function normalizeOptionalPositiveNumber(value: number | null, field: string): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid order intent ${field}`);
  return value;
}

function normalizeApprovalExpiresInMs(value: number | undefined): number {
  if (value === undefined) return DEFAULT_CONFIRM_EXPIRES_IN_MS;
  if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid order intent expiresInMs');
  return Math.min(5 * 60_000, Math.max(30_000, Math.trunc(value)));
}

function normalizeTimestamp(value: string, field: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`Invalid order intent ${field}`);
  return new Date(ms).toISOString();
}

function inferMarket(ticker: string): OrderIntentMarket {
  return /^\d{6}$/.test(ticker) ? 'KR' : 'US';
}
