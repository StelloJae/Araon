import type { CSSProperties } from 'react';

import type {
  OrderIntentAuditEntryPayload,
  OrderIntentApprovalChallengePayload,
  OrderIntentLivePolicyPayload,
  OrderIntentPreviewPayload,
} from '../lib/api-client';

interface OrderIntentSafetyRailProps {
  previews: readonly OrderIntentPreviewPayload[];
  audit: readonly OrderIntentAuditEntryPayload[];
  approvalChallenges?: readonly OrderIntentApprovalChallengePayload[];
  livePolicy?: OrderIntentLivePolicyPayload | null;
  loading: boolean;
  onOpenDetails?: () => void;
  compact?: boolean;
}

export function OrderIntentSafetyRail({
  previews,
  audit,
  approvalChallenges = [],
  livePolicy = null,
  loading,
  onOpenDetails,
  compact = false,
}: OrderIntentSafetyRailProps) {
  const preview = previews[0] ?? null;
  const latestAudit = audit[0] ?? null;
  const latestChallenge = approvalChallenges[0] ?? null;
  return (
    <div style={shellStyle} data-testid="order-intent-safety-rail">
      <div style={compact ? compactHeaderStyle : headerStyle}>
        <div style={titleStyle}>거래 안전장치</div>
        <span style={pillStyle}>{loading ? '수집 중' : '실거래 잠금'}</span>
        {onOpenDetails !== undefined ? (
          <button
            type="button"
            onClick={onOpenDetails}
            style={compact ? compactDetailButtonStyle : detailButtonStyle}
          >
            확장
          </button>
        ) : null}
      </div>
      <div style={compact ? compactSubtitleStyle : subtitleStyle}>
        {compact ? '모의만 가능 · 실주문 잠김' : '모의 미리보기만 가능 · 실제 주문은 잠김'}
      </div>
      <div style={compact ? compactBodyStyle : bodyStyle}>
        <div style={compact ? compactPipelineShellStyle : pipelineShellStyle} aria-label="에이전트 판단 흐름">
          <span style={compact ? compactPipelineTitleStyle : pipelineTitleStyle}>판단 흐름</span>
          <span style={compact ? compactPipelineStepsStyle : pipelineStepsStyle}>
            <span style={compact ? compactPipelineStepStyle : pipelineStepStyle}>감지</span>
            <span style={pipelineArrowStyle}>›</span>
            <span style={compact ? compactPipelineStepStyle : pipelineStepStyle}>후보</span>
            <span style={pipelineArrowStyle}>›</span>
            {!compact && (
              <>
                <span style={pipelineStepStyle}>근거</span>
                <span style={pipelineArrowStyle}>›</span>
              </>
            )}
            <span style={compact ? compactPipelineStepStyle : pipelineStepStyle}>모의</span>
            <span style={pipelineArrowStyle}>›</span>
            {!compact && (
              <>
                <span style={pipelineStepStyle}>리스크</span>
                <span style={pipelineArrowStyle}>›</span>
              </>
            )}
            <span style={compact ? compactPipelineStepStyle : pipelineStepStyle}>승인</span>
            <span style={pipelineArrowStyle}>›</span>
            <span style={compact ? compactPipelineLockedStepStyle : pipelineLockedStepStyle}>
              {compact ? '잠금' : '실행 잠금'}
            </span>
          </span>
        </div>
        <div style={dividerStyle} />
        {preview === null ? (
          <div style={emptyStyle}>주문 미리보기 없음</div>
        ) : (
          <div style={compact ? compactSummaryStyle : summaryStyle}>
            <span style={tickerStyle}>{preview.ticker}</span>
            <span style={compact ? compactMetaStyle : metaStyle}>
              {orderIntentPreviewMetaLabel(preview, compact)}
            </span>
            <span style={compact ? compactAmountStyle : amountStyle}>{orderIntentAmountLabel(preview)}</span>
          </div>
        )}
        <div style={dividerStyle} />
        {latestAudit === null ? (
          <div style={emptyStyle}>승인 기록 없음</div>
        ) : (
          <div style={compact ? compactAuditStyle : auditStyle}>
            <span style={auditBadgeStyle}>{auditDecisionLabel(latestAudit.decision)}</span>
            <span style={compact ? compactAuditTextStyle : auditTextStyle}>
              {latestAudit.ticker} · {modeLabel(latestAudit.requestedMode)} · 실행 없음
            </span>
          </div>
        )}
        <div style={dividerStyle} />
        <div style={compact ? compactPolicyStyle : policyStyle}>
          <span style={compact ? compactPolicyLabelStyle : policyLabelStyle}>
            {orderIntentLivePolicyLabel(livePolicy, compact)}
          </span>
          <span style={compact ? compactApprovalTextStyle : approvalTextStyle}>
            {orderIntentApprovalChallengeLabel(latestChallenge)}
          </span>
        </div>
        {latestChallenge !== null ? (
          <>
            <div style={compact ? compactChallengeReadinessStyle : challengeReadinessStyle}>
              {orderIntentApprovalReadinessLabel(latestChallenge, compact)}
            </div>
            <div style={dividerStyle} />
          </>
        ) : (
          <div style={dividerStyle} />
        )}
        <div style={compact ? compactReadinessStyle : readinessStyle}>
          <span style={compact ? compactReadinessLabelStyle : readinessLabelStyle}>자동거래 준비 안됨</span>
          <span style={compact ? compactReadinessTextStyle : readinessTextStyle}>
            {orderIntentReadinessSummary(livePolicy, compact)}
          </span>
        </div>
      </div>
    </div>
  );
}

function sideLabel(side: OrderIntentPreviewPayload['side']): string {
  return side === 'buy' ? '매수' : '매도';
}

function auditDecisionLabel(
  decision: OrderIntentAuditEntryPayload['decision'],
): string {
  return decision === 'blocked' ? '차단' : '허용';
}

function orderIntentAmountLabel(preview: OrderIntentPreviewPayload): string {
  if (preview.cashAmount !== null) return `${preview.cashAmount.toLocaleString('ko-KR')}원`;
  if (preview.quantity !== null) return `${preview.quantity.toLocaleString('ko-KR')}주`;
  return '수량 미정';
}

function orderIntentPreviewMetaLabel(
  preview: OrderIntentPreviewPayload,
  compact: boolean,
): string {
  const decision = preview.strategyEvaluation?.decision ?? preview.side;
  const decisionLabel = decision === 'buy' ? '매수 검토' : '매도 검토';
  const paperDelta = orderIntentPaperDeltaLabel(preview);
  if (compact) return `${decisionLabel} · ${modeLabel(preview.requestedMode)}`;
  return paperDelta === null
    ? `${decisionLabel} · ${modeLabel(preview.requestedMode)}`
    : `${decisionLabel} · ${modeLabel(preview.requestedMode)} · ${paperDelta}`;
}

function orderIntentPaperDeltaLabel(preview: OrderIntentPreviewPayload): string | null {
  const ledger = preview.paperLedgerPreview;
  if (ledger === undefined) return null;
  if (ledger.positionDelta !== null) return `${signedNumber(ledger.positionDelta)}주`;
  if (ledger.cashDeltaKrw !== null) return `${signedNumber(ledger.cashDeltaKrw)}원`;
  return null;
}

function orderIntentLivePolicyLabel(policy: OrderIntentLivePolicyPayload | null, compact = false): string {
  if (policy === null) return '정책 확인 중';
  const missingCount = policy.missingConstraints.length;
  const killSwitch = policy.killSwitch === 'engaged'
    ? compact ? '긴급 정지' : '긴급 정지 켜짐'
    : compact ? '정지 꺼짐' : '긴급 정지 꺼짐';
  return `${killSwitch} · 미승인 ${missingCount}개`;
}

function orderIntentApprovalChallengeLabel(
  challenge: OrderIntentApprovalChallengePayload | null,
): string {
  if (challenge === null) return '신규 승인 없음';
  switch (challenge.status) {
    case 'confirmed_live_locked':
      return '승인 확인 · 실행 잠금';
    case 'pending_confirmation':
      return '승인 대기';
    case 'rejected':
      return '승인 거절';
    case 'expired':
      return '승인 만료';
  }
}

function orderIntentApprovalReadinessLabel(
  challenge: OrderIntentApprovalChallengePayload,
  compact: boolean,
): string {
  const summary = challenge.orderSummary ?? {
    ticker: challenge.ticker,
    side: challenge.side,
    market: 'KR' as const,
    orderType: 'market' as const,
    quantity: null,
    cashAmount: null,
    limitPrice: null,
    liveExecutionLocked: true as const,
  };
  const side = sideLabel(summary.side);
  const amount = summary.cashAmount !== null
    ? `${summary.cashAmount.toLocaleString('ko-KR')}원`
    : summary.quantity !== null
      ? `${summary.quantity.toLocaleString('ko-KR')}주`
      : '수량 미정';
  const hash = challenge.intentHash?.slice(0, 8) ?? '대기';
  if (compact) return `${summary.ticker} ${side} · 지문 ${hash}`;
  return `${summary.ticker} ${side} · ${amount} · 지문 ${hash} · 긴급 정지`;
}

function orderIntentReadinessSummary(policy: OrderIntentLivePolicyPayload | null, compact = false): string {
  if (policy === null || policy.automationReadinessGaps.length === 0) {
    return '전략·리스크·Toss 주문·정산 잠금';
  }
  const visible = policy.automationReadinessGaps.slice(0, compact ? 2 : 4);
  const suffix = policy.automationReadinessGaps.length > visible.length
    ? ` 외 ${policy.automationReadinessGaps.length - visible.length}개`
    : '';
  return `${visible.map((gap) => gap.label).join(' · ')}${suffix}`;
}

function modeLabel(mode: string): string {
  if (mode === 'simulated') return '모의 주문';
  if (mode === 'live') return '실거래';
  return mode;
}

function signedNumber(value: number): string {
  const abs = Math.abs(value).toLocaleString('ko-KR');
  return value > 0 ? `+${abs}` : value < 0 ? `-${abs}` : '0';
}

const shellStyle: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  overflow: 'hidden',
  minHeight: 0,
  flexShrink: 0,
};

const headerStyle: CSSProperties = {
  padding: '10px 14px 4px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const compactHeaderStyle: CSSProperties = {
  ...headerStyle,
  padding: '8px 10px 3px',
  gap: 6,
};

const titleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: 'var(--text-primary)',
};

const pillStyle: CSSProperties = {
  marginLeft: 'auto',
  fontSize: 10,
  fontWeight: 800,
  color: 'var(--gold-text)',
  background: 'var(--gold-soft)',
  border: '1px solid var(--gold)',
  borderRadius: 50,
  padding: '2px 7px',
  whiteSpace: 'nowrap',
};

const detailButtonStyle: CSSProperties = {
  height: 22,
  border: '1px solid var(--gold)',
  borderRadius: 50,
  background: 'var(--gold-soft)',
  color: 'var(--gold-text)',
  padding: '0 8px',
  fontSize: 10,
  fontWeight: 900,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const compactDetailButtonStyle: CSSProperties = {
  ...detailButtonStyle,
  height: 20,
  padding: '0 7px',
  fontSize: 9,
};

const subtitleStyle: CSSProperties = {
  padding: '0 14px 9px',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border-soft)',
};

const compactSubtitleStyle: CSSProperties = {
  ...subtitleStyle,
  padding: '0 10px 7px',
  fontSize: 10,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const bodyStyle: CSSProperties = {
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 9,
};

const compactBodyStyle: CSSProperties = {
  ...bodyStyle,
  padding: '8px 10px',
  gap: 6,
};

const pipelineShellStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
  fontSize: 11,
  color: 'var(--text-muted)',
};

const compactPipelineShellStyle: CSSProperties = {
  ...pipelineShellStyle,
  gap: 2,
  fontSize: 10,
};

const pipelineTitleStyle: CSSProperties = {
  fontWeight: 900,
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
};

const compactPipelineTitleStyle: CSSProperties = {
  ...pipelineTitleStyle,
  fontSize: 10,
};

const pipelineStepsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  minWidth: 0,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
};

const compactPipelineStepsStyle: CSSProperties = {
  ...pipelineStepsStyle,
  gap: 3,
  fontSize: 10,
};

const pipelineStepStyle: CSSProperties = {
  fontWeight: 800,
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
};

const compactPipelineStepStyle: CSSProperties = {
  ...pipelineStepStyle,
  fontWeight: 750,
};

const pipelineLockedStepStyle: CSSProperties = {
  fontWeight: 900,
  color: 'var(--gold-text)',
  whiteSpace: 'nowrap',
};

const compactPipelineLockedStepStyle: CSSProperties = {
  ...pipelineLockedStepStyle,
  fontWeight: 850,
};

const pipelineArrowStyle: CSSProperties = {
  color: 'var(--text-faint)',
  fontWeight: 800,
};

const summaryStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '58px minmax(0, 1fr) auto',
  gap: 8,
  alignItems: 'center',
  fontSize: 12,
};

const compactSummaryStyle: CSSProperties = {
  ...summaryStyle,
  gridTemplateColumns: '44px minmax(0, 1fr) auto',
  gap: 6,
  fontSize: 10,
};

const tickerStyle: CSSProperties = {
  fontWeight: 900,
  color: 'var(--text-primary)',
};

const metaStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--text-secondary)',
  fontWeight: 700,
};

const compactMetaStyle: CSSProperties = {
  ...metaStyle,
  fontWeight: 650,
};

const amountStyle: CSSProperties = {
  color: 'var(--text-primary)',
  fontWeight: 900,
  whiteSpace: 'nowrap',
};

const compactAmountStyle: CSSProperties = {
  ...amountStyle,
  fontWeight: 800,
};

const dividerStyle: CSSProperties = {
  height: 1,
  background: 'var(--border-soft)',
};

const auditStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '34px minmax(0, 1fr)',
  gap: 8,
  alignItems: 'center',
  fontSize: 12,
};

const compactAuditStyle: CSSProperties = {
  ...auditStyle,
  gridTemplateColumns: '28px minmax(0, 1fr)',
  gap: 6,
  fontSize: 10,
};

const auditBadgeStyle: CSSProperties = {
  color: 'var(--kr-up)',
  fontWeight: 900,
};

const auditTextStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--text-secondary)',
  fontWeight: 700,
};

const compactAuditTextStyle: CSSProperties = {
  ...auditTextStyle,
  fontWeight: 650,
};

const policyStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: 8,
  alignItems: 'center',
  fontSize: 12,
};

const compactPolicyStyle: CSSProperties = {
  ...policyStyle,
  gap: 6,
  fontSize: 10,
};

const policyLabelStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--gold-text)',
  fontWeight: 900,
};

const compactPolicyLabelStyle: CSSProperties = {
  ...policyLabelStyle,
  fontWeight: 800,
};

const approvalTextStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontWeight: 800,
  whiteSpace: 'nowrap',
};

const compactApprovalTextStyle: CSSProperties = {
  ...approvalTextStyle,
  fontWeight: 700,
};

const challengeReadinessStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--text-muted)',
  fontSize: 11,
  fontWeight: 750,
};

const compactChallengeReadinessStyle: CSSProperties = {
  ...challengeReadinessStyle,
  fontSize: 10,
  fontWeight: 650,
};

const readinessStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: 3,
  fontSize: 12,
};

const compactReadinessStyle: CSSProperties = {
  ...readinessStyle,
  gap: 2,
  fontSize: 10,
};

const readinessLabelStyle: CSSProperties = {
  color: 'var(--gold-text)',
  fontWeight: 900,
  whiteSpace: 'nowrap',
};

const compactReadinessLabelStyle: CSSProperties = {
  ...readinessLabelStyle,
  fontWeight: 800,
};

const readinessTextStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--text-muted)',
  fontWeight: 700,
};

const compactReadinessTextStyle: CSSProperties = {
  ...readinessTextStyle,
  fontWeight: 650,
};

const emptyStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  fontWeight: 700,
};
