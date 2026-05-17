import { randomUUID } from 'node:crypto';

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
  readonly generatedAt: string;
}

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

export interface OrderIntentApprovalChallenge {
  readonly id: string;
  readonly intentId: string;
  readonly ticker: string;
  readonly side: OrderIntentSide;
  readonly requestedMode: 'live';
  readonly status: OrderIntentApprovalChallengeStatus;
  readonly confirmationText: string;
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
}

export interface OrderIntentStore {
  getPreview(id: string): OrderIntentPreview | null;
  appendPreview(preview: OrderIntentPreview): void;
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
    status: 'not_ready',
    severity: 'blocking',
    label: '의사결정 엔진',
    detail: '자동 매매 판단 엔진은 아직 준비되지 않았습니다.',
  },
  {
    code: 'strategy_policy',
    status: 'not_ready',
    severity: 'blocking',
    label: '전략 정책',
    detail: '전략 선택, 버전, 적용 범위 정책이 아직 준비되지 않았습니다.',
  },
  {
    code: 'risk_policy',
    status: 'not_ready',
    severity: 'blocking',
    label: '리스크 정책',
    detail: '종목, 금액, 손실한도, 시간대, 주문유형, 쿨다운 정책이 아직 준비되지 않았습니다.',
  },
  {
    code: 'paper_trading_ledger',
    status: 'not_ready',
    severity: 'blocking',
    label: '페이퍼 거래 원장',
    detail: '모의 체결과 잔고 변화를 추적하는 원장이 아직 준비되지 않았습니다.',
  },
  {
    code: 'simulation_result_view',
    status: 'not_ready',
    severity: 'blocking',
    label: '시뮬레이션 결과',
    detail: '전략 결과와 실패 사유를 검토하는 화면이 아직 준비되지 않았습니다.',
  },
  {
    code: 'toss_order_execution',
    status: 'locked',
    severity: 'blocking',
    label: 'Toss 주문 실행',
    detail: '실제 Toss 주문 실행은 fresh 승인 전까지 잠겨 있습니다.',
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
    status: 'not_ready',
    severity: 'blocking',
    label: '체결/잔고 대조',
    detail: '주문 결과와 Toss 계좌 상태를 대조하는 흐름이 아직 준비되지 않았습니다.',
  },
  {
    code: 'agent_performance_audit',
    status: 'not_ready',
    severity: 'blocking',
    label: '에이전트 성과 감사',
    detail: '에이전트 판단, 미실행, 결과를 장기 추적하는 상세 감사 화면이 아직 준비되지 않았습니다.',
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
    status: 'not_ready',
    severity: 'blocking',
    label: '데이터 신선도 보장',
    detail: '뉴스, 시그널, 가격 provider별 freshness 보장이 아직 완성되지 않았습니다.',
  },
  {
    code: 'event_dedupe',
    status: 'not_ready',
    severity: 'blocking',
    label: '이벤트 중복 제거',
    detail: '모든 source를 아우르는 안정적인 dedupe 계약이 아직 완성되지 않았습니다.',
  },
];

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
    const preview: OrderIntentPreview = {
      id: intentId,
      ticker,
      side,
      market: normalizeMarket(input.market ?? inferMarket(ticker)),
      requestedMode,
      executionMode: requestedMode,
      status: 'preview_ready',
      liveExecutionLocked: true,
      quantity: normalizeOptionalPositiveNumber(input.quantity ?? null, 'quantity'),
      cashAmount: normalizeOptionalPositiveNumber(input.cashAmount ?? null, 'cashAmount'),
      orderType: normalizeOrderType(input.orderType ?? 'market'),
      limitPrice: normalizeOptionalPositiveNumber(input.limitPrice ?? null, 'limitPrice'),
      triggerEventId,
      agentId,
      reason,
      riskChecks: [
        {
          code: 'live_execution_locked',
          status: 'blocked',
          message: 'Live execution requires a fresh explicit user approval gate.',
        },
      ],
      lifecycle: buildOrderIntentLifecycle({ triggerEventId }),
      createdAt,
      expiresAt: new Date(Date.parse(createdAt) + 5 * 60_000).toISOString(),
      auditRef,
    };

    store.appendPreview(preview);
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
      generatedAt: normalizeTimestamp(now(), 'now'),
    };
  }

  function snapshotAudit(limit = maxAuditEntries): OrderIntentAuditEntry[] {
    return store.snapshotAudit(limit);
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
  };
}

function createMemoryOrderIntentStore(input: {
  maxAuditEntries: number;
  maxPreviewEntries: number;
}): OrderIntentStore {
  const previews: OrderIntentPreview[] = [];
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
      status: 'not_ready',
      label: '전략 평가',
      detail: '실제 전략 엔진은 아직 준비되지 않았습니다.',
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

function confirmationTextFor(preview: OrderIntentPreview): string {
  return `CONFIRM ${preview.ticker} ${preview.side.toUpperCase()} LIVE`;
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
