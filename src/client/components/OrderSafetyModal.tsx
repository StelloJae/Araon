import { useState, type ReactNode } from 'react';
import type {
  OrderIntentApprovalChallengePayload,
  OrderIntentAuditEntryPayload,
  OrderIntentLivePolicyPayload,
  OrderIntentPreviewPayload,
} from '../lib/api-client';

interface OrderSafetyModalProps {
  previews: readonly OrderIntentPreviewPayload[];
  audit: readonly OrderIntentAuditEntryPayload[];
  approvalChallenges: readonly OrderIntentApprovalChallengePayload[];
  livePolicy: OrderIntentLivePolicyPayload | null;
  loading: boolean;
  onCreateApprovalChallenge: (intentId: string) => void;
  onConfirmApprovalChallenge: (challengeId: string, confirmationText: string) => void;
  onClose: () => void;
}

export function OrderSafetyModal({
  previews,
  audit,
  approvalChallenges,
  livePolicy,
  loading,
  onCreateApprovalChallenge,
  onConfirmApprovalChallenge,
  onClose,
}: OrderSafetyModalProps) {
  const preview = previews[0] ?? null;
  const challenge = approvalChallenges[0] ?? null;
  const [confirmationText, setConfirmationText] = useState('');
  const confirmationMatches =
    challenge !== null && confirmationText === challenge.confirmationText;
  const canCreateFreshChallenge =
    preview !== null &&
    (challenge === null ||
      challenge.status === 'expired' ||
      challenge.status === 'rejected' ||
      challenge.status === 'confirmed_live_locked');

  return (
    <div className="araon-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="araon-modal order-safety-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-safety-title"
        data-screen-label="03 Order Safety"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="araon-modal__head">
          <div>
            <div className="araon-modal__eyebrow">거래 안전장치</div>
            <h2 id="order-safety-title" className="araon-modal__title">
              주문 미리보기 · 승인 · 기록
            </h2>
            <p className="araon-modal__copy">
              미리보기는 실제 주문이 아닙니다. 실거래 실행은 별도 승인 정책이 준비될
              때까지 잠겨 있습니다.
            </p>
          </div>
          <button type="button" className="araon-icon-button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="order-safety-modal__lock">
          <span className="status-pill status-pill--danger">실거래 실행 잠금</span>
          <strong>{livePolicyLabel(livePolicy, loading)}</strong>
          <span>{livePolicyDetail(livePolicy)}</span>
        </div>

        <SafetySection
          title="자동거래 준비 상태"
          badge={automationReadinessBadge(livePolicy)}
        >
          {livePolicy === null || livePolicy.automationReadinessGaps.length === 0 ? (
            <div className="modal-empty-state">자동거래 준비 상태 확인 중</div>
          ) : (
            <div className="safety-fact-list">
              {livePolicy.automationReadinessGaps.slice(0, 6).map((gap) => (
                <Fact key={gap.code} label={gap.label} value={automationReadinessStatusLabel(gap.status)} />
              ))}
            </div>
          )}
        </SafetySection>

        <div className="order-safety-modal__grid">
          <SafetySection title="1. 주문 미리보기" badge="모의 / 기록용">
            {preview === null ? (
              <div className="modal-empty-state">미리보기 없음</div>
            ) : (
              <div className="safety-fact-list">
                <Fact label="종목" value={preview.ticker} />
                <Fact label="방향" value={preview.side === 'buy' ? '매수' : '매도'} />
                <Fact label="모드" value={modeLabel(preview.requestedMode)} />
                <Fact label="금액" value={previewAmount(preview)} />
                <Fact label="근거" value={humanOrderReason(preview.reason)} />
              </div>
            )}
          </SafetySection>

          <SafetySection title="2. 승인 확인" badge="실행 잠금 유지">
            {challenge !== null ? (
              <div className="safety-fact-list">
                <Fact label="종목" value={challenge.ticker} />
                <Fact label="상태" value={approvalStatusLabel(challenge.status)} />
                <Fact label="확인 문구" value={challenge.confirmationText} />
                <Fact label="실행" value={challenge.liveExecutionLocked ? '잠금 유지' : '상태 확인 필요'} />
                {canCreateFreshChallenge ? (
                  <div className="approval-flow approval-flow--compact">
                    <button
                      type="button"
                      className="araon-primary-action approval-flow__button"
                      disabled={loading}
                      onClick={() => {
                        if (preview !== null) onCreateApprovalChallenge(preview.id);
                      }}
                    >
                      새 승인 확인 만들기
                    </button>
                  </div>
                ) : null}
                {challenge.status === 'pending_confirmation' ? (
                  <div className="approval-confirm">
                    <label htmlFor="approval-confirm-text">확인 문구 입력</label>
                    <input
                      id="approval-confirm-text"
                      value={confirmationText}
                      onChange={(event) => setConfirmationText(event.target.value)}
                      placeholder={challenge.confirmationText}
                    />
                    <button
                      type="button"
                      disabled={loading || !confirmationMatches}
                      onClick={() =>
                        onConfirmApprovalChallenge(challenge.id, confirmationText)
                      }
                    >
                      확인 · 실행 잠금 유지
                    </button>
                  </div>
                ) : null}
              </div>
            ) : preview !== null ? (
              <div className="approval-flow">
                <div className="modal-empty-state">
                  승인 확인 없음. 미리보기에서 새 확인 절차를 만들 수 있습니다.
                </div>
                <button
                  type="button"
                  className="araon-primary-action approval-flow__button"
                  disabled={loading}
                  onClick={() => onCreateApprovalChallenge(preview.id)}
                >
                  승인 확인 만들기
                </button>
              </div>
            ) : (
              <div className="modal-empty-state">승인 확인 없음</div>
            )}
          </SafetySection>
        </div>

        <SafetySection title="판단 단계" badge="실행 전 검증">
          {preview === null ? (
            <div className="modal-empty-state">판단 단계 없음</div>
          ) : (
            <div className="order-lifecycle-list">
              {preview.lifecycle.map((step) => (
                <div key={step.code} className="order-lifecycle-row">
                  <strong>{step.label}</strong>
                  <span>{step.detail}</span>
                  <em className={lifecycleStatusClassName(step.status)}>
                    {lifecycleStatusLabel(step.status)}
                  </em>
                </div>
              ))}
            </div>
          )}
        </SafetySection>

        <SafetySection title="실행 기록" badge={`${audit.length.toLocaleString('ko-KR')}건`}>
          {audit.length === 0 ? (
            <div className="modal-empty-state">기록 없음</div>
          ) : (
            <div className="audit-list">
              {audit.map((entry) => (
                <div key={entry.id} className="audit-row">
                  <strong>{auditEventLabel(entry.event)}</strong>
                  <span>{entry.ticker}</span>
                  <em>{entry.reason}</em>
                  <b>{entry.decision === 'blocked' ? '차단' : '허용'}</b>
                </div>
              ))}
            </div>
          )}
        </SafetySection>
      </section>
    </div>
  );
}

function SafetySection({
  title,
  badge,
  children,
}: {
  title: string;
  badge: string;
  children: ReactNode;
}) {
  return (
    <div className="safety-section">
      <div className="safety-section__head">
        <span>{title}</span>
        <span className="status-pill status-pill--warn">{badge}</span>
      </div>
      {children}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="safety-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function livePolicyLabel(policy: OrderIntentLivePolicyPayload | null, loading: boolean): string {
  if (loading || policy === null) return '정책 확인 중';
  return policy.killSwitch === 'engaged' ? '긴급 정지 켜짐' : '정책 확인 필요';
}

function livePolicyDetail(policy: OrderIntentLivePolicyPayload | null): string {
  if (policy === null) return '실거래 정책 미수집';
  return `미승인 조건 ${policy.missingConstraints.length.toLocaleString('ko-KR')}개 · 허용 종목 ${policy.allowedTickers.length.toLocaleString('ko-KR')}개`;
}

function automationReadinessBadge(policy: OrderIntentLivePolicyPayload | null): string {
  if (policy === null) return '확인 중';
  return `자동거래 준비 ${policy.automationReadinessGaps.length.toLocaleString('ko-KR')}개 필요`;
}

function automationReadinessStatusLabel(
  status: OrderIntentLivePolicyPayload['automationReadinessGaps'][number]['status'],
): string {
  switch (status) {
    case 'locked':
      return '잠금';
    case 'not_ready':
      return '준비 안됨';
    case 'partial':
      return '부분 준비';
  }
}

function previewAmount(preview: OrderIntentPreviewPayload): string {
  if (preview.cashAmount !== null) return `${preview.cashAmount.toLocaleString('ko-KR')}원`;
  if (preview.quantity !== null) return `${preview.quantity.toLocaleString('ko-KR')}주`;
  return '수량 미정';
}

function approvalStatusLabel(status: OrderIntentApprovalChallengePayload['status']): string {
  switch (status) {
    case 'pending_confirmation':
      return '승인 대기';
    case 'confirmed_live_locked':
      return '승인 확인 · 실행 잠금';
    case 'rejected':
      return '거절';
    case 'expired':
      return '만료';
  }
}

function auditEventLabel(event: OrderIntentAuditEntryPayload['event']): string {
  switch (event) {
    case 'preview_created':
      return '미리보기 생성';
    case 'live_execution_blocked':
      return '실거래 차단';
    case 'confirm_challenge_created':
      return '승인 요청';
    case 'confirm_token_verified_live_locked':
      return '승인 확인';
    case 'confirm_token_rejected':
      return '승인 거절';
    case 'confirm_token_expired':
      return '승인 만료';
  }
}

function lifecycleStatusLabel(status: OrderIntentPreviewPayload['lifecycle'][number]['status']): string {
  switch (status) {
    case 'complete':
      return '완료';
    case 'pending':
      return '대기';
    case 'blocked':
      return '차단';
    case 'not_ready':
      return '준비 안됨';
  }
}

function lifecycleStatusClassName(status: OrderIntentPreviewPayload['lifecycle'][number]['status']): string {
  if (status === 'blocked') return 'status-pill status-pill--danger';
  if (status === 'pending' || status === 'not_ready') return 'status-pill status-pill--warn';
  return 'status-pill';
}

function modeLabel(mode: string): string {
  if (mode === 'simulated') return '모의';
  if (mode === 'paper') return '페이퍼';
  if (mode === 'live') return '실거래';
  return mode;
}

function humanOrderReason(reason: string): string {
  return reason
    .replace(/news_detected/g, '뉴스 감지')
    .replace(/disclosure_detected/g, '공시 감지')
    .replace(/toss_signal_detected/g, '토스 신호')
    .replace(/market_movement_detected/g, '시장 움직임')
    .replace(/candidate/gi, '후보')
    .replace(/Live order execution is disabled\./gi, '실거래 실행은 잠겨 있습니다.')
    .trim();
}
