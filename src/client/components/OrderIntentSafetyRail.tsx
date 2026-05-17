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
}

export function OrderIntentSafetyRail({
  previews,
  audit,
  approvalChallenges = [],
  livePolicy = null,
  loading,
  onOpenDetails,
}: OrderIntentSafetyRailProps) {
  const preview = previews[0] ?? null;
  const latestAudit = audit[0] ?? null;
  const latestChallenge = approvalChallenges[0] ?? null;
  return (
    <div style={shellStyle} data-testid="order-intent-safety-rail">
      <div style={headerStyle}>
        <div style={titleStyle}>거래 안전장치</div>
        <span style={pillStyle}>{loading ? '수집 중' : '실거래 잠금'}</span>
        {onOpenDetails !== undefined ? (
          <button type="button" onClick={onOpenDetails} style={detailButtonStyle}>
            확장
          </button>
        ) : null}
      </div>
      <div style={subtitleStyle}>모의 미리보기만 가능 · 실제 주문은 잠김</div>
      <div style={bodyStyle}>
        <div style={pipelineShellStyle} aria-label="에이전트 판단 흐름">
          <span style={pipelineTitleStyle}>판단 흐름</span>
          <span style={pipelineStepsStyle}>
            <span style={pipelineStepStyle}>감지</span>
            <span style={pipelineArrowStyle}>›</span>
            <span style={pipelineStepStyle}>후보</span>
            <span style={pipelineArrowStyle}>›</span>
            <span style={pipelineStepStyle}>승인</span>
            <span style={pipelineArrowStyle}>›</span>
            <span style={pipelineLockedStepStyle}>실행 잠금</span>
          </span>
        </div>
        <div style={dividerStyle} />
        {preview === null ? (
          <div style={emptyStyle}>주문 미리보기 없음</div>
        ) : (
          <div style={summaryStyle}>
            <span style={tickerStyle}>{preview.ticker}</span>
            <span style={metaStyle}>
              {sideLabel(preview.side)} · {modeLabel(preview.requestedMode)}
            </span>
            <span style={amountStyle}>{orderIntentAmountLabel(preview)}</span>
          </div>
        )}
        <div style={dividerStyle} />
        {latestAudit === null ? (
          <div style={emptyStyle}>승인 기록 없음</div>
        ) : (
          <div style={auditStyle}>
            <span style={auditBadgeStyle}>{auditDecisionLabel(latestAudit.decision)}</span>
            <span style={auditTextStyle}>
              {latestAudit.ticker} · {modeLabel(latestAudit.requestedMode)} · 실행 없음
            </span>
          </div>
        )}
        <div style={dividerStyle} />
        <div style={policyStyle}>
          <span style={policyLabelStyle}>{orderIntentLivePolicyLabel(livePolicy)}</span>
          <span style={approvalTextStyle}>
            {orderIntentApprovalChallengeLabel(latestChallenge)}
          </span>
        </div>
        <div style={dividerStyle} />
        <div style={readinessStyle}>
          <span style={readinessLabelStyle}>자동거래 준비 안됨</span>
          <span style={readinessTextStyle}>{orderIntentReadinessSummary(livePolicy)}</span>
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

function orderIntentLivePolicyLabel(policy: OrderIntentLivePolicyPayload | null): string {
  if (policy === null) return '정책 확인 중';
  const missingCount = policy.missingConstraints.length;
  const killSwitch = policy.killSwitch === 'engaged' ? '긴급 정지 켜짐' : '긴급 정지 꺼짐';
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

function orderIntentReadinessSummary(policy: OrderIntentLivePolicyPayload | null): string {
  if (policy === null || policy.automationReadinessGaps.length === 0) {
    return '전략·리스크·Toss 주문·정산 잠금';
  }
  const visible = policy.automationReadinessGaps.slice(0, 4);
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

const titleStyle: CSSProperties = {
  fontSize: 13,
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

const subtitleStyle: CSSProperties = {
  padding: '0 14px 9px',
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border-soft)',
};

const bodyStyle: CSSProperties = {
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 9,
};

const pipelineShellStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
  fontSize: 10,
  color: 'var(--text-muted)',
};

const pipelineTitleStyle: CSSProperties = {
  fontWeight: 900,
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
};

const pipelineStepsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  minWidth: 0,
  overflow: 'hidden',
};

const pipelineStepStyle: CSSProperties = {
  fontWeight: 800,
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
};

const pipelineLockedStepStyle: CSSProperties = {
  fontWeight: 900,
  color: 'var(--gold-text)',
  whiteSpace: 'nowrap',
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
  fontSize: 11,
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

const amountStyle: CSSProperties = {
  color: 'var(--text-primary)',
  fontWeight: 900,
  whiteSpace: 'nowrap',
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
  fontSize: 11,
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

const policyStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: 8,
  alignItems: 'center',
  fontSize: 11,
};

const policyLabelStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--gold-text)',
  fontWeight: 900,
};

const approvalTextStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontWeight: 800,
  whiteSpace: 'nowrap',
};

const readinessStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: 3,
  fontSize: 11,
};

const readinessLabelStyle: CSSProperties = {
  color: 'var(--gold-text)',
  fontWeight: 900,
  whiteSpace: 'nowrap',
};

const readinessTextStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--text-muted)',
  fontWeight: 700,
};

const emptyStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  fontWeight: 700,
};
