/**
 * StatusBar — sticky 40px footer summarising tracking counts and last update.
 *
 *   총 종목 NN | 즐겨찾기 (WS) NN | 폴링 NN  ─►  마지막 업데이트 HH:MM:SS  ⚙
 */

import { SettingsIcon } from '../lib/icons';

interface StatusBarProps {
  totalCount: number;
  favCount: number;
  pollingCount: number;
  /** Pre-formatted `HH:MM:SS` string (use `fmtClock` from lib/format). */
  lastUpdate: string;
  onOpenSettings: () => void;
}

export function StatusBar({
  totalCount,
  favCount,
  pollingCount,
  lastUpdate,
  onOpenSettings,
}: StatusBarProps) {
  return (
    <footer
      style={{
        position: 'sticky',
        bottom: 0,
        zIndex: 30,
        background: 'var(--bg-card)',
        borderTop: '1px solid var(--border)',
        height: 40,
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: 20,
        fontSize: 12,
        fontWeight: 500,
        color: 'var(--text-muted)',
      }}
    >
      <Stat label="총 종목" value={totalCount} />
      <Sep />
      <Stat label="즐겨찾기 (WS)" value={favCount} highlight />
      <Sep />
      <Stat label="폴링" value={pollingCount} />
      <div style={{ flex: 1 }} />
      <span>
        마지막 업데이트{' '}
        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{lastUpdate}</span>
      </span>
      <button
        type="button"
        onClick={onOpenSettings}
        data-testid="statusbar-settings-button"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          padding: 4,
          lineHeight: 0,
          cursor: 'pointer',
        }}
        aria-label="설정 열기"
      >
        <SettingsIcon size={16} />
      </button>
    </footer>
  );
}

interface StatProps {
  label: string;
  value: number;
  highlight?: boolean;
}

function Stat({ label, value, highlight = false }: StatProps) {
  return (
    <span>
      {label}{' '}
      <span
        style={{
          color: highlight ? 'var(--gold)' : 'var(--text-primary)',
          fontWeight: 700,
        }}
      >
        {value}
      </span>
    </span>
  );
}

function Sep() {
  return <span style={{ width: 1, height: 14, background: 'var(--border)' }} />;
}
