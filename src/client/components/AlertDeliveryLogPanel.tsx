import type { AlertDeliveryEntry } from '../stores/alert-delivery-store';

interface AlertDeliveryLogPanelProps {
  entries: ReadonlyArray<AlertDeliveryEntry>;
  onClear: () => void;
}

const CHANNEL_LABEL: Record<AlertDeliveryEntry['channel'], string> = {
  toast: '토스트',
  sound: '사운드',
  desktop: '데스크톱',
  phone: '폰',
};

const STATUS_LABEL: Record<AlertDeliveryEntry['status'], string> = {
  sent: '전송',
  skipped: '건너뜀',
  failed: '실패',
};

export function AlertDeliveryLogPanel({
  entries,
  onClear,
}: AlertDeliveryLogPanelProps) {
  const latest = entries.slice(0, 5);
  return (
    <div
      style={{
        marginTop: 18,
        padding: '12px 14px',
        background: 'var(--bg-tint)',
        border: '1px solid var(--border-soft)',
        borderRadius: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
          최근 알림 전송 기록
        </div>
        <div style={{ flex: 1 }} />
        {entries.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text-muted)',
              fontFamily: 'inherit',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            비우기
          </button>
        )}
      </div>
      {latest.length === 0 ? (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: 'var(--text-muted)',
            lineHeight: 1.6,
          }}
        >
          아직 전송된 알림이 없습니다. 장중 crossing 알림이 발생하면 최근 기록만
          이 브라우저에 남습니다.
        </div>
      ) : (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {latest.map((entry) => (
            <div
              key={entry.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto',
                gap: 10,
                alignItems: 'center',
                padding: '8px 10px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-soft)',
                borderRadius: 7,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color:
                    entry.status === 'failed'
                      ? 'var(--kr-down)'
                      : 'var(--text-secondary)',
                }}
              >
                {CHANNEL_LABEL[entry.channel]} · {STATUS_LABEL[entry.status]}
              </span>
              <span
                style={{
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                }}
                title={entry.detail}
              >
                {entry.name} · {entry.title}
                {entry.reason !== undefined ? ` · ${entry.reason}` : ''}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatEntryTime(entry.ts)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatEntryTime(ts: number): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
