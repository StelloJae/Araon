import { useEffect, useState } from 'react';
import type { StockTimelineItem, StockSignalOutcome } from '@shared/types';
import { getStockTimeline } from '../lib/api-client';

interface StockObservationTimelineProps {
  ticker: string;
}

export function StockObservationTimeline({ ticker }: StockObservationTimelineProps) {
  const [items, setItems] = useState<StockTimelineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getStockTimeline(ticker)
      .then((next) => {
        if (!cancelled) setItems(next);
      })
      .catch(() => {
        if (!cancelled) setError('관찰 타임라인을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  return (
    <section style={{ marginTop: 18 }} aria-label="관찰 타임라인">
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          marginBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          관찰 타임라인
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          실시간 신호와 직접 남긴 메모를 시간순으로 모읍니다.
        </span>
      </div>

      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 10,
          overflow: 'hidden',
          background: 'var(--bg-card)',
        }}
      >
        {error !== null ? (
          <TimelineEmpty label={error} tone="danger" />
        ) : loading ? (
          <TimelineEmpty label="관찰 타임라인을 불러오는 중" />
        ) : items.length === 0 ? (
          <TimelineEmpty label="아직 저장된 신호나 메모가 없습니다." />
        ) : (
          items.map((item, idx) => (
            <div
              key={`${item.kind}-${item.id}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '84px 1fr',
                gap: 12,
                padding: '12px 13px',
                borderTop: idx === 0 ? 'none' : '1px solid var(--border-soft)',
              }}
            >
              <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                {formatTime(item.occurredAt)}
              </div>
              {item.kind === 'note' ? (
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: 'var(--text-muted)',
                      marginBottom: 4,
                    }}
                  >
                    메모
                  </div>
                  <div
                    style={{
                      whiteSpace: 'pre-wrap',
                      fontSize: 12,
                      lineHeight: 1.55,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {item.note.body}
                  </div>
                </div>
              ) : (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
                      {signalLabel(item.signal.signalType)} · {fmtPct(item.signal.momentumPct)}
                    </span>
                    <span
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 999,
                        padding: '2px 7px',
                        fontSize: 10,
                        fontWeight: 800,
                        color: 'var(--text-muted)',
                      }}
                    >
                      {item.signal.momentumWindow}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                    신호가 {item.signal.signalPrice.toLocaleString('ko-KR')}원에서 기록됨
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {item.outcomes.map((outcome) => (
                      <OutcomePill key={outcome.horizon} outcome={outcome} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function OutcomePill({ outcome }: { outcome: StockSignalOutcome }) {
  const ready = outcome.state === 'ready';
  const value = outcome.changePct ?? 0;
  const positive = value >= 0;
  return (
    <span
      style={{
        border: '1px solid var(--border)',
        borderRadius: 999,
        padding: '4px 8px',
        fontSize: 10,
        fontWeight: 800,
        color: ready ? (positive ? 'var(--kr-up)' : 'var(--kr-down)') : 'var(--text-muted)',
        background: 'var(--bg-tint)',
      }}
    >
      {outcome.horizon} {ready ? fmtPct(value) : '수집 중'}
    </span>
  );
}

function TimelineEmpty({
  label,
  tone = 'muted',
}: {
  label: string;
  tone?: 'muted' | 'danger';
}) {
  return (
    <div
      style={{
        padding: '18px 12px',
        textAlign: 'center',
        color: tone === 'danger' ? 'var(--kr-down)' : 'var(--text-muted)',
        fontSize: 12,
        fontWeight: tone === 'danger' ? 700 : 500,
      }}
    >
      {label}
    </div>
  );
}

function signalLabel(type: string): string {
  switch (type) {
    case 'overheat':
      return '과열 신호';
    case 'strong_scalp':
      return '강한 단기 신호';
    case 'scalp':
      return '단기 신호';
    case 'trend':
      return '추세 신호';
    default:
      return '신호';
  }
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function fmtPct(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}
