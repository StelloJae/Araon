/**
 * StatusBar — sticky 40px footer summarising tracking counts and last update.
 *
 *   KST + market tape | 총 종목 NN | 즐겨찾기 NN | 폴링 NN ─► 업데이트 HH:MM:SS ⚙
 */

import type { MarketTapeSummary as SharedMarketTapeSummary } from '@shared/types';
import { SettingsIcon } from '../lib/icons';

export type MarketTapeSummary = Pick<SharedMarketTapeSummary, 'indicators'>;

interface StatusBarProps {
  totalCount: number;
  favCount: number;
  pollingCount: number;
  /** Pre-formatted `HH:MM:SS` string (use `fmtClock` from lib/format). */
  lastUpdate: string;
  kstTime: string;
  marketSummary: MarketTapeSummary | null;
  onOpenSettings: () => void;
}

export function StatusBar({
  totalCount,
  favCount,
  pollingCount,
  lastUpdate,
  kstTime,
  marketSummary,
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
        gap: 14,
        fontSize: 12,
        fontWeight: 500,
        color: 'var(--text-muted)',
      }}
    >
      <MarketTape kstTime={kstTime} summary={marketSummary} />
      <Sep />
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

export function MarketTape({
  kstTime,
  summary,
}: {
  kstTime: string;
  summary: MarketTapeSummary | null;
}) {
  const indicators = summary?.indicators ?? [];
  return (
    <div
      data-testid="market-tape"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minWidth: 0,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
    >
      <span style={{ color: 'var(--text-secondary)', fontWeight: 800 }}>
        {kstTime}
      </span>
      {indicators.map((item) => (
        <span
          key={item.id}
          title={item.status === 'ready' ? item.label : `${item.label} 수집 중`}
          style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}
        >
          <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>
            {item.label}
          </span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 800 }}>
            {formatMarketValue(item.value, item.unit)}
          </span>
          {item.change !== null && (
            <span
              style={{
                color:
                  item.change > 0
                    ? 'var(--kr-up)'
                    : item.change < 0
                      ? 'var(--kr-down)'
                      : 'var(--text-muted)',
                fontWeight: 700,
              }}
            >
              {item.change > 0 ? '+' : item.change < 0 ? '-' : ''}
              {formatMarketChange(item.change, item.changePct)}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

function formatMarketValue(value: number | null, unit: string): string {
  if (value === null) return '수집 중';
  const digits = unit === '원' || unit === '$' ? 2 : 2;
  return value.toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatMarketChange(change: number, changePct: number | null): string {
  const value = Math.abs(change).toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (changePct === null) return value;
  return `${value}/${changePct > 0 ? '+' : ''}${changePct.toFixed(2)}%`;
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
