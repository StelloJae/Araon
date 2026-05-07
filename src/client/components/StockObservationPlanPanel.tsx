import { useEffect, useState } from 'react';
import type { StockObservationPlan, StockObservationPlanStatus } from '@shared/types';
import {
  getStockObservationPlan,
  saveStockObservationPlan,
} from '../lib/api-client';

interface StockObservationPlanPanelProps {
  ticker: string;
}

type Draft = {
  thesis: string;
  trigger: string;
  invalidation: string;
  status: StockObservationPlanStatus;
};

const EMPTY_DRAFT: Draft = {
  thesis: '',
  trigger: '',
  invalidation: '',
  status: 'watching',
};

export function StockObservationPlanPanel({ ticker }: StockObservationPlanPanelProps) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage(null);
    void getStockObservationPlan(ticker)
      .then((plan) => {
        if (cancelled) return;
        setDraft(planToDraft(plan));
      })
      .catch(() => {
        if (!cancelled) setMessage('관찰 계획을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const canSave =
    draft.thesis.trim().length > 0 &&
    draft.trigger.trim().length > 0 &&
    draft.invalidation.trim().length > 0 &&
    !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveStockObservationPlan(ticker, {
        thesis: draft.thesis.trim(),
        trigger: draft.trigger.trim(),
        invalidation: draft.invalidation.trim(),
        status: draft.status,
      });
      setDraft(planToDraft(saved));
      setMessage('관찰 계획을 저장했습니다.');
    } catch {
      setMessage('관찰 계획을 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ObservationPlanEditorView
      draft={draft}
      loading={loading}
      saving={saving}
      message={message}
      canSave={canSave}
      onChange={setDraft}
      onSave={() => void save()}
    />
  );
}

export function ObservationPlanEditorView({
  draft,
  loading,
  saving,
  message,
  canSave,
  onChange,
  onSave,
}: {
  draft: Draft;
  loading: boolean;
  saving: boolean;
  message: string | null;
  canSave: boolean;
  onChange: (draft: Draft) => void;
  onSave: () => void;
}) {
  const missingFields = missingObservationFields(draft);
  return (
    <section style={{ marginTop: 18 }} aria-label="관찰 계획">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          관찰 계획
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          왜 보고 있는지, 어떤 조건이면 생각을 바꿀지 남깁니다.
        </span>
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-card)', padding: 12 }}>
        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>관찰 계획을 불러오는 중</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <PlanTextarea
              label="관찰 thesis"
              value={draft.thesis}
              placeholder="예: 일봉 추세가 살아 있고 거래대금이 붙는지 확인"
              onChange={(value) => onChange({ ...draft, thesis: value })}
            />
            <PlanTextarea
              label="확인 trigger"
              value={draft.trigger}
              placeholder="예: 전고점 돌파 + 거래량 기준선 회복"
              onChange={(value) => onChange({ ...draft, trigger: value })}
            />
            <PlanTextarea
              label="무효화 조건"
              value={draft.invalidation}
              placeholder="예: 직전 저점 이탈 또는 거래대금 급감"
              onChange={(value) => onChange({ ...draft, invalidation: value })}
            />
            <div
              style={{
                fontSize: 11,
                color: missingFields.length === 0 ? 'var(--kr-up)' : 'var(--text-muted)',
                fontWeight: 700,
              }}
            >
              {missingFields.length === 0
                ? '저장 준비 완료'
                : `저장하려면 ${missingFields.join(', ')}을 채워주세요`}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 800 }}>
                상태{' '}
                <select
                  value={draft.status}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      status: event.currentTarget.value as StockObservationPlanStatus,
                    })
                  }
                  style={{
                    height: 28,
                    marginLeft: 6,
                    border: '1px solid var(--border)',
                    borderRadius: 7,
                    background: 'var(--bg-tint)',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                  }}
                >
                  <option value="watching">관찰 중</option>
                  <option value="paused">보류</option>
                  <option value="archived">보관</option>
                </select>
              </label>
              <button
                type="button"
                onClick={onSave}
                disabled={!canSave}
                style={{
                  height: 30,
                  padding: '0 13px',
                  border: 'none',
                  borderRadius: 8,
                  background: canSave ? 'var(--gold)' : 'var(--bg-muted)',
                  color: canSave ? '#1E2026' : 'var(--text-muted)',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: canSave ? 'pointer' : 'not-allowed',
                }}
              >
                {saving ? '저장 중' : '계획 저장'}
              </button>
            </div>
          </div>
        )}
        {message !== null && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
            {message}
          </div>
        )}
      </div>
    </section>
  );
}

function missingObservationFields(draft: Draft): string[] {
  const fields: string[] = [];
  if (draft.thesis.trim().length === 0) fields.push('thesis');
  if (draft.trigger.trim().length === 0) fields.push('trigger');
  if (draft.invalidation.trim().length === 0) fields.push('무효화 조건');
  return fields;
}

function PlanTextarea({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--text-muted)', fontWeight: 800 }}>
      {label}
      <textarea
        value={value}
        placeholder={placeholder}
        rows={2}
        maxLength={2_000}
        onChange={(event) => onChange(event.currentTarget.value)}
        style={{
          width: '100%',
          resize: 'vertical',
          minHeight: 48,
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '8px 9px',
          background: 'var(--bg-tint)',
          color: 'var(--text-primary)',
          font: 'inherit',
          fontSize: 12,
          lineHeight: 1.5,
          boxSizing: 'border-box',
        }}
      />
    </label>
  );
}

function planToDraft(plan: StockObservationPlan | null): Draft {
  if (plan === null) return EMPTY_DRAFT;
  return {
    thesis: plan.thesis,
    trigger: plan.trigger,
    invalidation: plan.invalidation,
    status: plan.status,
  };
}
