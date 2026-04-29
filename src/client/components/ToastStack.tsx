/**
 * ToastStack — fixed top-right column of alert toasts.
 *
 * Each toast manages its own auto-dismiss timer (so a settings change
 * doesn't restart in-flight timers). Click anywhere on a toast (except the
 * close button) opens the stock detail modal and dismisses.
 */

import { useEffect } from 'react';
import { CloseIcon } from '../lib/icons';
import { useSettingsStore } from '../stores/settings-store';
import {
  useToastStore,
  type ToastEntry,
} from '../stores/toast-store';

interface ToastStackProps {
  onPickStock: (ticker: string) => void;
}

export function ToastStack({ onPickStock }: ToastStackProps) {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const durationMs = useSettingsStore((s) => s.settings.toastDurationMs);

  return (
    <div
      style={{
        position: 'fixed',
        top: 80,
        right: 20,
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        pointerEvents: 'none',
      }}
      aria-live="polite"
    >
      {toasts.map((t) => (
        <Toast
          key={t.id}
          toast={t}
          durationMs={durationMs}
          onDismiss={dismiss}
          onPick={onPickStock}
        />
      ))}
    </div>
  );
}

interface ToastProps {
  toast: ToastEntry;
  durationMs: number;
  onDismiss: (id: string) => void;
  onPick: (ticker: string) => void;
}

function Toast({ toast, durationMs, onDismiss, onPick }: ToastProps) {
  // Snapshot duration once per toast id — slider changes mid-life don't
  // restart timers (which would be confusing).
  useEffect(() => {
    const id = window.setTimeout(() => onDismiss(toast.id), durationMs);
    return () => window.clearTimeout(id);
    // durationMs intentionally NOT in deps; toast.id is the lifecycle key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id, onDismiss]);

  const accent =
    toast.direction === 'up' ? 'var(--kr-up)' : 'var(--kr-down)';
  const bg = toast.direction === 'up' ? 'var(--up-tint-1)' : 'var(--down-tint-1)';
  const arrow = toast.direction === 'up' ? '▲' : '▼';

  return (
    <div
      onClick={() => {
        onPick(toast.ticker);
        onDismiss(toast.id);
      }}
      role="status"
      style={{
        width: 340,
        padding: '12px 14px',
        borderRadius: 10,
        background: 'var(--bg-card)',
        border: `1px solid ${accent}`,
        borderLeft: `4px solid ${accent}`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        pointerEvents: 'auto',
        cursor: 'pointer',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 7,
          background: bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: accent,
          fontSize: 14,
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        {arrow}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1.3,
          }}
        >
          {toast.title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-secondary)',
            marginTop: 2,
            lineHeight: 1.4,
          }}
        >
          {toast.detail}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(toast.id);
        }}
        aria-label="알림 닫기"
        style={{
          width: 22,
          height: 22,
          padding: 0,
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          lineHeight: 0,
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CloseIcon size={12} />
      </button>
    </div>
  );
}
