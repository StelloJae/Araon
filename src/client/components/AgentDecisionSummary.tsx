import type { CSSProperties } from 'react';

import type {
  AgentEventPayload,
  OrderIntentApprovalChallengePayload,
  OrderIntentLivePolicyPayload,
  OrderIntentPaperLedgerSnapshotPayload,
  OrderIntentPerformanceReviewSnapshotPayload,
  OrderIntentPreviewPayload,
} from '../lib/api-client';
import { useProductDisplayNames } from '../hooks/useProductDisplayNames';
import {
  buildAgentCandidateViewModel,
  dedupeAgentCandidateEvents,
} from '../lib/agent-candidate-view-model';

interface AgentDecisionSummaryProps {
  events: readonly AgentEventPayload[];
  previews: readonly OrderIntentPreviewPayload[];
  approvalChallenges: readonly OrderIntentApprovalChallengePayload[];
  livePolicy: OrderIntentLivePolicyPayload | null;
  paperLedger?: OrderIntentPaperLedgerSnapshotPayload | null;
  performanceReview?: OrderIntentPerformanceReviewSnapshotPayload | null;
  loading: boolean;
}

export function AgentDecisionSummary({
  events,
  previews,
  approvalChallenges,
  livePolicy,
  paperLedger = null,
  performanceReview = null,
  loading,
}: AgentDecisionSummaryProps) {
  const displayNames = useProductDisplayNames();
  const candidates = dedupeAgentCandidateEvents(events).map((event) =>
    buildAgentCandidateViewModel(event, displayNames),
  );
  const latestCandidate = candidates[0] ?? null;
  const pendingApprovals = approvalChallenges.filter(
    (challenge) => challenge.status === 'pending_confirmation',
  ).length;
  const buyCount = candidates.filter((candidate) => candidate.decision === 'buy').length;
  const sellCount = candidates.filter((candidate) => candidate.decision === 'sell').length;
  const observeCount = candidates.filter((candidate) => candidate.decision === 'observe').length;
  const gapCount = livePolicy?.automationReadinessGaps.length ?? 0;
  const readinessGaps = livePolicy?.automationReadinessGaps.slice(0, 4) ?? [];
  const paperLedgerSummary = paperLedger?.summary ?? null;
  const performanceReviewSummary = performanceReview?.summary ?? null;

  return (
    <section style={summaryShellStyle} aria-label="에이전트 상태 요약">
      <div style={summaryHeaderStyle}>
        <div>
          <div style={eyebrowStyle}>판단 보조</div>
          <h3 style={titleStyle}>감지 → 후보 → 근거 → 모의 → 리스크 → 승인 → 잠금</h3>
        </div>
        <span style={lockPillStyle}>{loading ? '확인 중' : '실거래 잠금'}</span>
      </div>
      <div style={metricGridStyle}>
        <SummaryMetric label="매수 검토" value={`${buyCount} 후보`} />
        <SummaryMetric label="매도 검토" value={`${sellCount} 후보`} />
        <SummaryMetric label="관찰" value={`${observeCount} 후보`} />
        <SummaryMetric label="모의 가능" value={`${previews.length} 미리보기`} />
        <SummaryMetric
          label="페이퍼 원장"
          value={paperLedgerSummary === null ? '확인 중' : `${paperLedgerSummary.previewOnlyCount}건`}
        />
        <SummaryMetric
          label="성과 리뷰"
          value={performanceReviewSummary === null ? '확인 중' : `${performanceReviewSummary.pendingReviewCount}건`}
        />
        <SummaryMetric label="승인 대기" value={`${pendingApprovals}건`} />
        <SummaryMetric
          label="준비 부족"
          value={gapCount === 0 ? '확인 중' : `${gapCount}개`}
        />
      </div>
      <div style={bodyGridStyle}>
        <div style={sectionStyle}>
          <div style={sectionLabelStyle}>최신 후보</div>
          {latestCandidate === null ? (
            <div style={emptyStyle}>아직 감지된 후보가 없습니다.</div>
          ) : (
            <div style={candidateStackStyle}>
              <div style={candidateLineStyle}>
                <strong style={candidateNameStyle}>{latestCandidate.displayName}</strong>
                <span style={candidateMetaStyle}>
                  {latestCandidate.decisionLabel} · {latestCandidate.reasonLabel} · {latestCandidate.freshnessLabel}
                </span>
              </div>
              <div style={candidatePolicyLineStyle}>
                <span>{latestCandidate.strategyLabel}</span>
                <span>{latestCandidate.riskLabel}</span>
                <span>{latestCandidate.evaluationLabels.slice(0, 2).join(' · ')}</span>
                <span>{latestCandidate.explanationLabels.slice(0, 2).join(' · ')}</span>
              </div>
            </div>
          )}
        </div>
        <div style={sectionStyle}>
          <div style={sectionLabelStyle}>모의 원장</div>
          {paperLedgerSummary === null ? (
            <div style={emptyStyle}>원장 상태 확인 중</div>
          ) : (
            <div style={ledgerLineStyle}>
              <strong style={ledgerValueStyle}>모의 {paperLedgerSummary.previewOnlyCount}건</strong>
              <span style={candidateMetaStyle}>
                실제 {paperLedgerSummary.bookedCount}건 · {signedKrw(paperLedgerSummary.cashDeltaKrw)}
              </span>
            </div>
          )}
        </div>
        <div style={sectionStyle}>
          <div style={sectionLabelStyle}>성과 리뷰</div>
          {performanceReviewSummary === null ? (
            <div style={emptyStyle}>리뷰 상태 확인 중</div>
          ) : (
            <div style={ledgerLineStyle}>
              <strong style={ledgerValueStyle}>리뷰 {performanceReviewSummary.pendingReviewCount}건</strong>
              <span style={candidateMetaStyle}>
                {performanceReviewSummary.reviewStatus === 'empty'
                  ? '모의 미리보기 없음'
                  : '시장 결과 대기'}
              </span>
            </div>
          )}
        </div>
        <div style={sectionStyle}>
          <div style={sectionLabelStyle}>실거래 전 필요</div>
          {readinessGaps.length === 0 ? (
            <div style={emptyStyle}>전략·리스크·주문·정산 상태 확인 필요</div>
          ) : (
            <div style={gapListStyle}>
              {readinessGaps.map((gap) => (
                <span key={gap.code} style={gapPillStyle}>
                  {gap.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function signedKrw(value: number): string {
  if (value === 0) return '0원';
  const abs = Math.abs(value).toLocaleString('ko-KR');
  return value > 0 ? `+${abs}원` : `-${abs}원`;
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={metricStyle}>
      <span style={metricLabelStyle}>{label}</span>
      <strong style={metricValueStyle}>{value}</strong>
    </div>
  );
}

const summaryShellStyle: CSSProperties = {
  flexShrink: 0,
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const summaryHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
};

const eyebrowStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};

const titleStyle: CSSProperties = {
  margin: '2px 0 0',
  fontSize: 15,
  lineHeight: 1.2,
  fontWeight: 900,
  color: 'var(--text-primary)',
};

const lockPillStyle: CSSProperties = {
  marginLeft: 'auto',
  border: '1px solid var(--accent)',
  borderRadius: 50,
  background: 'var(--danger-soft)',
  color: 'var(--accent)',
  padding: '4px 9px',
  fontSize: 11,
  fontWeight: 900,
  whiteSpace: 'nowrap',
};

const metricGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
  gap: 8,
};

const metricStyle: CSSProperties = {
  minWidth: 0,
  background: 'var(--bg-tint)',
  border: '1px solid var(--border-soft)',
  borderRadius: 10,
  padding: '7px 9px',
};

const metricLabelStyle: CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 800,
  color: 'var(--text-muted)',
};

const metricValueStyle: CSSProperties = {
  display: 'block',
  marginTop: 2,
  fontSize: 14,
  fontWeight: 900,
  color: 'var(--text-primary)',
};

const bodyGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 8,
};

const sectionStyle: CSSProperties = {
  minWidth: 0,
  borderTop: '1px solid var(--border-soft)',
  paddingTop: 8,
};

const sectionLabelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  color: 'var(--text-muted)',
  marginBottom: 4,
};

const candidateLineStyle: CSSProperties = {
  minWidth: 0,
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
};

const candidateStackStyle: CSSProperties = {
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
};

const candidateNameStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
};

const candidateMetaStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-secondary)',
};

const candidatePolicyLineStyle: CSSProperties = {
  minWidth: 0,
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px 7px',
  fontSize: 10,
  lineHeight: 1.25,
  fontWeight: 800,
  color: 'var(--text-muted)',
};

const ledgerLineStyle: CSSProperties = {
  minWidth: 0,
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
};

const ledgerValueStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
};

const gapListStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};

const gapPillStyle: CSSProperties = {
  border: '1px solid var(--border-soft)',
  borderRadius: 50,
  background: 'var(--bg-tint)',
  color: 'var(--text-secondary)',
  padding: '3px 7px',
  fontSize: 10,
  fontWeight: 800,
};

const emptyStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-muted)',
};
