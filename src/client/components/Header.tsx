/**
 * Header — sticky top chrome.
 *
 *   [logo · 아라온]  [MarketBadge]  [GlobalSearch]
 *     [ThemeToggle] [SettingsBtn] | [SSEIndicator]
 *
 * 64px tall, sticky z-40. Uses theme tokens so light/dark flips smoothly.
 * The settings button shows a small red dot when notifications are globally
 * disabled (driven by `notifEnabled` from `useSettingsStore`).
 */

import type { MarketStatus } from '@shared/types';
import { LogoMark, SettingsIcon } from '../lib/icons';
import type { StockViewModel } from '../lib/view-models';
import { GlobalSearch } from './GlobalSearch';
import { MarketBadge } from './MarketBadge';
import { SSEIndicator, type SseStatus } from './SSEIndicator';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  marketStatus: MarketStatus;
  onHome: () => void;
  sseStatus: SseStatus;
  lastUpdate: Date | null;
  allStocks: ReadonlyArray<StockViewModel>;
  onPickStock: (stock: StockViewModel) => void;
  onPickMasterTicker?: (ticker: string) => void;
  onOpenSettings: () => void;
  notifEnabled: boolean;
  realtimeCount: number;
  pollingCount: number;
}

function Wordmark() {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, lineHeight: 1 }}>
      <span
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: 'var(--text-strong)',
          letterSpacing: -0.4,
          fontFamily:
            "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
        }}
      >
        아라온
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-muted)',
          letterSpacing: 1.4,
          textTransform: 'uppercase',
        }}
      >
        · Araon
      </span>
    </div>
  );
}

export function Header({
  marketStatus,
  onHome,
  sseStatus,
  lastUpdate,
  allStocks,
  onPickStock,
  onPickMasterTicker,
  onOpenSettings,
  notifEnabled,
  realtimeCount,
  pollingCount,
}: HeaderProps) {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: 20,
      }}
    >
      <button
        type="button"
        onClick={onHome}
        aria-label="운영 홈으로 이동"
        title="운영 홈"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          border: 'none',
          background: 'transparent',
          padding: 0,
          font: 'inherit',
          cursor: 'pointer',
        }}
      >
        <LogoMark size={26} />
        <Wordmark />
      </button>
      <MarketBadge status={marketStatus} />
      <div
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
        }}
      >
        <GlobalSearch
          allStocks={allStocks}
          onPickStock={onPickStock}
          {...(onPickMasterTicker !== undefined ? { onPickMasterTicker } : {})}
        />
      </div>
      <ThemeToggle />
      <button
        type="button"
        onClick={onOpenSettings}
        title="설정"
        aria-label="설정 열기"
        data-testid="settings-button"
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: 'var(--bg-tint)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <SettingsIcon size={16} />
        {!notifEnabled && (
          <span
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--kr-down)',
              border: '1.5px solid var(--bg-card)',
            }}
          />
        )}
      </button>
      <div style={{ width: 1, height: 22, background: 'var(--border)' }} />
      <SSEIndicator
        status={sseStatus}
        lastUpdate={lastUpdate}
        realtimeCount={realtimeCount}
        pollingCount={pollingCount}
      />
    </header>
  );
}
