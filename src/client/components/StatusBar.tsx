/**
 * StatusBar — sticky 40px footer summarising tracking counts and last update.
 *
 *   KST + market tape | 총 종목 NN | 즐겨찾기 NN | 폴링 NN ─► 업데이트 HH:MM:SS ⚙
 */

import { useEffect, useState } from 'react';
import type { MarketTapeSummary as SharedMarketTapeSummary } from '@shared/types';
import { getRuntimeDataHealth, type RuntimeDataHealthPayload } from '../lib/api-client';
import { SettingsIcon } from '../lib/icons';

export type MarketTapeSummary = Pick<SharedMarketTapeSummary, 'indicators'>;
export type KisBudgetSummary = RuntimeDataHealthPayload['kisOutboundLimiter']['budget'];
export type TossQuotePollingSummary = RuntimeDataHealthPayload['tossQuotePolling'];

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
  const [kisBudget, setKisBudget] = useState<KisBudgetSummary | null>(null);
  const [tossQuotePolling, setTossQuotePolling] = useState<TossQuotePollingSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    async function refresh() {
      try {
        const health = await getRuntimeDataHealth();
        if (!cancelled) {
          setKisBudget(health.kisOutboundLimiter.budget);
          setTossQuotePolling(health.tossQuotePolling);
        }
      } catch {
        if (!cancelled) {
          setKisBudget(null);
          setTossQuotePolling(null);
        }
      }
    }
    void refresh();
    timer = window.setInterval(() => {
      void refresh();
    }, 10_000);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }, []);

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
      {kisBudget !== null && (
        <>
          <Sep />
          <KisBudgetPill budget={kisBudget} />
        </>
      )}
      {tossQuotePolling !== null && (
        <>
          <Sep />
          <TossQuotePollingPill polling={tossQuotePolling} />
        </>
      )}
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

export function TossQuotePollingPill({ polling }: { polling: TossQuotePollingSummary }) {
  const label = tossQuotePollingLabel(polling);
  const color = tossQuotePollingColor(polling);
  return (
    <span
      title={tossQuotePollingTitle(polling)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        minWidth: 0,
        maxWidth: 170,
        height: 22,
        padding: '0 8px',
        borderRadius: 999,
        border: `1px solid ${color}`,
        color,
        background: 'rgba(255,255,255,0.03)',
        fontWeight: 800,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {label}
    </span>
  );
}

export function KisBudgetPill({ budget }: { budget: KisBudgetSummary }) {
  const rate = budget.windows.sixtySec.callPerSec;
  const queue = Math.max(
    0,
    ...budget.windows.sixtySec.byClass.map((item) => item.queueDepth),
  );
  const label = budget.riskReason !== null && budget.riskState !== 'safe'
    ? `${budget.riskLabel} · ${budget.riskReason}`
    : `${budget.riskLabel} · ${rate.toFixed(1)}/s`;
  return (
    <span
      title={kisBudgetTitle(budget, queue)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        minWidth: 0,
        maxWidth: 180,
        height: 22,
        padding: '0 8px',
        borderRadius: 999,
        border: `1px solid ${kisBudgetColor(budget.riskState)}`,
        color: kisBudgetColor(budget.riskState),
        background: 'rgba(255,255,255,0.03)',
        fontWeight: 800,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {label}
    </span>
  );
}

function tossQuotePollingLabel(polling: TossQuotePollingSummary): string {
  if (!polling.configured) return 'Toss 미구성';
  if (!polling.enabled) return 'Toss 꺼짐';
  if (polling.consecutiveFailureCount >= 2) return 'Toss 실패 · KIS fallback';
  if (polling.lastErrorCode !== null) return 'Toss 복구 대기';
  if (polling.cycleCount === 0) return 'Toss 시작 대기';
  if (polling.missingCount > 0) return `Toss 부분 · ${polling.returnedCount}/${polling.tickersInCycle}`;
  return `Toss 가격 · ${polling.returnedCount}/${polling.tickersInCycle}`;
}

function tossQuotePollingColor(polling: TossQuotePollingSummary): string {
  if (!polling.configured || !polling.enabled || polling.cycleCount === 0) {
    return 'var(--text-muted)';
  }
  if (polling.consecutiveFailureCount >= 2 || polling.lastErrorCode !== null || polling.missingCount > 0) {
    return 'var(--gold-text)';
  }
  return 'var(--kr-up)';
}

function tossQuotePollingTitle(polling: TossQuotePollingSummary): string {
  if (!polling.configured) return 'Toss 가격 갱신 미구성';
  const interval = polling.intervalMs !== null
    ? `${(polling.intervalMs / 1000).toFixed(1)}s`
    : 'unknown';
  const fallback = polling.suppressingKisPolling ? 'KIS polling 억제' : 'KIS fallback 허용';
  return [
    `Toss 가격 갱신 ${polling.running ? '실행 중' : '대기'}`,
    `${polling.returnedCount}/${polling.tickersInCycle} 수신`,
    `누락 ${polling.missingCount}`,
    `실패 ${polling.errorCount}`,
    `간격 ${interval}`,
    fallback,
  ].join(' · ');
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

function kisBudgetColor(riskState: KisBudgetSummary['riskState']): string {
  switch (riskState) {
    case 'safe':
      return 'var(--kr-up)';
    case 'busy':
    case 'recovering':
      return 'var(--gold-text)';
    case 'risky':
    case 'throttled':
      return 'var(--kr-down)';
    case 'idle':
      return 'var(--text-muted)';
  }
}

function kisBudgetTitle(budget: KisBudgetSummary, queue: number): string {
  const window = budget.windows.sixtySec;
  const classes = window.byClass
    .filter((item) => item.callPerSec > 0 || item.throttleCount > 0 || item.queueDepth > 0)
    .map((item) => `${item.priorityClass} ${item.callPerSec.toFixed(2)}/s`)
    .join(' · ');
  const base = `KIS REST ${window.callPerSec.toFixed(2)}/s · throttle ${window.throttlePerMin.toFixed(1)}/min · queue ${queue}`;
  return classes.length > 0 ? `${base} · ${classes}` : base;
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
