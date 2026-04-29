/**
 * ErrorBanner — fixed-position toast stack below the header.
 *
 * Width clamped to `min(620px, calc(100vw - 48px))` and centered. Multiple
 * banners stack vertically with 8px gap. `slideDown 200ms ease` on mount.
 */

import { AlertCircleIcon, CloseIcon } from '../lib/icons';

export interface BannerError {
  id: string;
  title: string;
  detail?: string;
}

interface ErrorBannerProps {
  errors: ReadonlyArray<BannerError>;
  onDismiss: (id: string) => void;
}

export function ErrorBanner({ errors, onDismiss }: ErrorBannerProps) {
  if (errors.length === 0) return null;
  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        top: 72,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: 'min(620px, calc(100vw - 48px))',
      }}
    >
      {errors.map((e) => (
        <div
          key={e.id}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid rgba(246,70,93,0.3)',
            borderLeft: '3px solid var(--kr-up)',
            borderRadius: 8,
            padding: '12px 14px',
            boxShadow: 'var(--shadow) 0px 8px 24px -4px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            animation: 'slideDown 200ms ease',
          }}
        >
          <div
            style={{
              color: 'var(--kr-up)',
              flexShrink: 0,
              lineHeight: 0,
              marginTop: 1,
            }}
          >
            <AlertCircleIcon size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              {e.title}
            </div>
            {e.detail !== undefined && (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                  marginTop: 2,
                }}
              >
                {e.detail}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onDismiss(e.id)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              padding: 2,
              lineHeight: 0,
              cursor: 'pointer',
            }}
            aria-label="알림 닫기"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
