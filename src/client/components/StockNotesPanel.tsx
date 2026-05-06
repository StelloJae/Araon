import { useEffect, useMemo, useState } from 'react';
import type { StockNote } from '@shared/types';
import {
  createStockNote,
  deleteStockNote,
  getStockNotes,
} from '../lib/api-client';

interface StockNotesPanelProps {
  ticker: string;
}

const NOTE_LIMIT = 2_000;

export function StockNotesPanel({ ticker }: StockNotesPanelProps) {
  const [notes, setNotes] = useState<StockNote[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getStockNotes(ticker)
      .then((next) => {
        if (!cancelled) setNotes(next);
      })
      .catch(() => {
        if (!cancelled) setError('메모를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const trimmed = draft.trim();
  const canSubmit = trimmed.length > 0 && !submitting;
  const remaining = useMemo(() => NOTE_LIMIT - draft.length, [draft]);

  async function submitNote() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createStockNote(ticker, trimmed);
      setNotes((current) => [created, ...current]);
      setDraft('');
    } catch {
      setError('메모를 저장하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  async function removeNote(noteId: string) {
    setError(null);
    try {
      await deleteStockNote(ticker, noteId);
      setNotes((current) => current.filter((note) => note.id !== noteId));
    } catch {
      setError('메모를 삭제하지 못했습니다.');
    }
  }

  return (
    <section style={{ marginTop: 18 }} aria-label="관찰 메모">
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
          관찰 메모
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          매수/매도 판단이 아니라 관찰 기록으로 저장됩니다.
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
        <div style={{ padding: 12, borderBottom: '1px solid var(--border-soft)' }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, NOTE_LIMIT))}
            placeholder="관찰 포인트를 짧게 남겨두세요."
            rows={3}
            maxLength={NOTE_LIMIT}
            style={{
              width: '100%',
              resize: 'vertical',
              minHeight: 72,
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '9px 10px',
              background: 'var(--bg-tint)',
              color: 'var(--text-primary)',
              font: 'inherit',
              fontSize: 12,
              lineHeight: 1.5,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginTop: 8,
            }}
          >
            <span style={{ fontSize: 10, color: remaining < 0 ? 'var(--kr-down)' : 'var(--text-muted)' }}>
              {Math.max(0, remaining).toLocaleString('ko-KR')}자 남음
            </span>
            <button
              type="button"
              onClick={() => void submitNote()}
              disabled={!canSubmit}
              style={{
                height: 30,
                padding: '0 13px',
                borderRadius: 8,
                border: 'none',
                background: canSubmit ? 'var(--gold)' : 'var(--bg-muted)',
                color: canSubmit ? '#1E2026' : 'var(--text-muted)',
                fontSize: 12,
                fontWeight: 800,
                cursor: canSubmit ? 'pointer' : 'not-allowed',
              }}
            >
              {submitting ? '저장 중' : '메모 추가'}
            </button>
          </div>
        </div>

        {error !== null && (
          <div
            role="status"
            style={{
              padding: '9px 12px',
              borderBottom: '1px solid var(--border-soft)',
              color: 'var(--kr-down)',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <EmptyNoteState label="메모를 불러오는 중" />
        ) : notes.length === 0 ? (
          <EmptyNoteState label="아직 저장된 관찰 메모가 없습니다." />
        ) : (
          <div>
            {notes.map((note) => (
              <div
                key={note.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 10,
                  padding: '11px 12px',
                  borderTop: '1px solid var(--border-soft)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      whiteSpace: 'pre-wrap',
                      fontSize: 12,
                      lineHeight: 1.55,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {note.body}
                  </div>
                  <div style={{ marginTop: 5, fontSize: 10, color: 'var(--text-muted)' }}>
                    {formatNoteTime(note.createdAt)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void removeNote(note.id)}
                  style={{
                    alignSelf: 'start',
                    border: '1px solid var(--border)',
                    borderRadius: 7,
                    background: 'var(--bg-card)',
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    fontWeight: 700,
                    height: 26,
                    padding: '0 9px',
                    cursor: 'pointer',
                  }}
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyNoteState({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: '18px 12px',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: 12,
      }}
    >
      {label}
    </div>
  );
}

function formatNoteTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}
