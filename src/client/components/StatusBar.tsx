/**
 * StatusBar — sticky 40px footer summarising tracking counts and last update.
 *
 *   KST + market tape | 즐겨찾기 NN | 빠른 가격 상태 ─► 업데이트 HH:MM:SS ⚙
 */

import { useEffect, useState } from 'react';
import type { MarketTapeSummary as SharedMarketTapeSummary } from '@shared/types';
import { getRuntimeDataHealth, type RuntimeDataHealthPayload } from '../lib/api-client';
import { SettingsIcon } from '../lib/icons';

export type MarketTapeSummary = Pick<SharedMarketTapeSummary, 'indicators'>;
export type KisBudgetSummary = RuntimeDataHealthPayload['kisOutboundLimiter']['budget'];
export type TossQuotePollingSummary = RuntimeDataHealthPayload['tossQuotePolling'];
export type TossFastQuoteLaneSummary = RuntimeDataHealthPayload['tossFastQuoteLane'];

interface StatusBarProps {
  totalCount: number;
  favCount: number;
  pollingCount: number;
  /** Pre-formatted `HH:MM:SS` string (use `fmtClock` from lib/format). */
  lastUpdate: string;
  kstTime: string;
  marketSummary: MarketTapeSummary | null;
  onOpenSettings: () => void;
  fastQuoteLaneOverride?: TossFastQuoteLaneSummary | null;
}

export function StatusBar({
  favCount,
  lastUpdate,
  kstTime,
  marketSummary,
  onOpenSettings,
  fastQuoteLaneOverride,
}: StatusBarProps) {
  const [kisBudget, setKisBudget] = useState<KisBudgetSummary | null>(null);
  const [tossFastQuoteLane, setTossFastQuoteLane] = useState<TossFastQuoteLaneSummary | null>(
    fastQuoteLaneOverride ?? null,
  );

  useEffect(() => {
    if (fastQuoteLaneOverride !== undefined) {
      setTossFastQuoteLane(fastQuoteLaneOverride);
      return;
    }
    let cancelled = false;
    let timer: number | null = null;
    async function refresh() {
      try {
        const health = await getRuntimeDataHealth();
        if (!cancelled) {
          setKisBudget(health.kisOutboundLimiter.budget);
          setTossFastQuoteLane(health.tossFastQuoteLane);
        }
      } catch {
        if (!cancelled) {
          setKisBudget(null);
          setTossFastQuoteLane(null);
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
  }, [fastQuoteLaneOverride]);

  return (
    <footer
      className="status-bar"
      aria-label="시장 상태 바"
    >
      <div className="status-bar__viewport">
        <div className="status-bar__track">
      <StatusTapeSegment
        kstTime={kstTime}
        marketSummary={marketSummary}
        favCount={favCount}
        lastUpdate={lastUpdate}
        tossFastQuoteLane={tossFastQuoteLane}
        kisBudget={kisBudget}
      />
      <StatusTapeSegment
        kstTime={kstTime}
        marketSummary={marketSummary}
        favCount={favCount}
        lastUpdate={lastUpdate}
        tossFastQuoteLane={tossFastQuoteLane}
        kisBudget={kisBudget}
        ariaHidden
          />
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenSettings}
        data-testid="statusbar-settings-button"
        className="status-bar__settings"
        aria-label="설정 열기"
      >
        <SettingsIcon size={16} />
      </button>
    </footer>
  );
}

function StatusTapeSegment({
  kstTime,
  marketSummary,
  favCount,
  lastUpdate,
  tossFastQuoteLane,
  kisBudget,
  ariaHidden = false,
}: {
  kstTime: string;
  marketSummary: MarketTapeSummary | null;
  favCount: number;
  lastUpdate: string;
  tossFastQuoteLane: TossFastQuoteLaneSummary | null;
  kisBudget: KisBudgetSummary | null;
  ariaHidden?: boolean;
}) {
  return (
    <div className="status-bar__segment" aria-hidden={ariaHidden || undefined}>
      <MarketTape kstTime={kstTime} summary={marketSummary} />
      <Sep />
      <Stat label="즐겨찾기" value={favCount} highlight />
      {tossFastQuoteLane !== null && (
        <>
          <Sep />
          <FastQuoteLaneText lane={tossFastQuoteLane} />
        </>
      )}
      {kisBudget !== null && shouldShowKisBudgetPill(kisBudget, null) && (
        <>
          <Sep />
          <KisBudgetPill budget={kisBudget} />
        </>
      )}
      <Sep />
      <span>
        마지막 업데이트{' '}
        <span style={{ color: 'var(--text-secondary)', fontWeight: 800 }}>{lastUpdate}</span>
      </span>
    </div>
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

export function TossFastQuoteLanePill({ lane }: { lane: TossFastQuoteLaneSummary }) {
  const label = tossFastQuoteLaneLabel(lane);
  const color = tossFastQuoteLaneColor(lane);
  return (
    <span
      title={tossFastQuoteLaneTitle(lane)}
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

function FastQuoteLaneText({ lane }: { lane: TossFastQuoteLaneSummary }) {
  return (
    <span title={tossFastQuoteLaneTitle(lane)}>
      빠른 가격{' '}
      <span
        style={{
          color: tossFastQuoteLaneColor(lane),
          fontWeight: 800,
        }}
      >
        {tossFastQuoteLaneStatus(lane)}
      </span>
    </span>
  );
}

export function KisBudgetPill({ budget }: { budget: KisBudgetSummary }) {
  const rate = budget.windows.sixtySec.callPerSec;
  const queue = Math.max(
    0,
    ...budget.windows.sixtySec.byClass.map((item) => item.queueDepth),
  );
  const label = realtimeTrackingBudgetLabel(budget, rate);
  const color = kisBudgetColor(budget.riskState);
  const title = realtimeTrackingBudgetTitle(budget, queue);
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        minWidth: 0,
        maxWidth: 180,
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

function realtimeTrackingBudgetLabel(
  budget: KisBudgetSummary,
  rate: number,
): string {
  const publicLabel = publicTrackingLabel(budget.riskLabel);
  if (budget.riskReason !== null && budget.riskState !== 'safe') {
    return `${publicLabel} · ${publicTrackingReason(budget.riskReason)}`;
  }
  return `${publicLabel} · ${rate.toFixed(1)}/s`;
}

function publicTrackingLabel(label: string): string {
  return label
    .replace(/KIS\s*/gi, '실시간 추적 ')
    .replace(/REST\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function publicTrackingReason(reason: string): string {
  if (/EGW00201|초당 거래건수 초과/i.test(reason)) return '요청 제한';
  if (/throttle|rate/i.test(reason)) return '요청 제한';
  return reason.replace(/KIS|REST|polling|ranking|foreground|background/gi, '').trim() || '확인 필요';
}

function realtimeTrackingBudgetTitle(budget: KisBudgetSummary, queue: number): string {
  const window = budget.windows.sixtySec;
  const activeClasses = window.byClass.filter(
    (item) => item.callPerSec > 0 || item.throttleCount > 0 || item.queueDepth > 0,
  ).length;
  return [
    `실시간 추적 ${window.callPerSec.toFixed(2)}/s`,
    `요청 제한 ${window.throttlePerMin.toFixed(1)}/min`,
    `대기 ${queue}`,
    activeClasses > 0 ? `활성 경로 ${activeClasses}개` : '활성 경로 없음',
  ].join(' · ');
}

export function shouldShowKisBudgetPill(
  budget: KisBudgetSummary,
  polling: TossQuotePollingSummary | null,
): boolean {
  void polling;
  if (budget.riskState === 'idle' || budget.riskState === 'safe') {
    return false;
  }
  return true;
}

/*
 * Legacy diagnostics components remain exported for focused tests and internal
 * diagnostics, but normal footer copy must stay product-facing.
 */
export function LegacyKisBudgetPill({ budget }: { budget: KisBudgetSummary }) {
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
  if (polling.consecutiveFailureCount >= 2) {
    return polling.suppressingKisPolling
      ? 'Toss 실패 · 추적 잠금'
      : 'Toss 실패 · 실시간 추적';
  }
  if (polling.lastErrorCode !== null) return 'Toss 복구 대기';
  if (polling.cycleCount === 0) return '가격 확인 중';
  if (polling.missingCount > 0) return '가격 일부 지연';
  return '가격 정상';
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

function tossFastQuoteLaneLabel(lane: TossFastQuoteLaneSummary): string {
  if (!lane.configured) return '빠른 가격 미구성';
  if (!lane.enabled) return '빠른 가격 꺼짐';
  if (lane.consecutiveFailureCount >= 2 || lane.lastErrorCode !== null) return '빠른 가격 대기';
  if (lane.candidateCount === 0) return '빠른 가격 후보 없음';
  if (lane.returnedCount < lane.requestedCount) return '빠른 가격 일부 지연';
  return '빠른 가격 정상';
}

function tossFastQuoteLaneStatus(lane: TossFastQuoteLaneSummary): string {
  return tossFastQuoteLaneLabel(lane).replace(/^빠른 가격\s*/, '');
}

function tossFastQuoteLaneColor(lane: TossFastQuoteLaneSummary): string {
  if (!lane.configured || !lane.enabled || lane.candidateCount === 0) {
    return 'var(--text-muted)';
  }
  if (lane.consecutiveFailureCount >= 2 || lane.lastErrorCode !== null || lane.returnedCount < lane.requestedCount) {
    return 'var(--gold-text)';
  }
  return 'var(--kr-up)';
}

function tossFastQuoteLaneTitle(lane: TossFastQuoteLaneSummary): string {
  if (!lane.configured) return '빠른 가격 준비 전';
  const status = tossFastQuoteLaneStatus(lane);
  const scope = lane.candidateCount > 0
    ? `관심 종목 ${lane.returnedCount}/${lane.candidateCount} 갱신`
    : '관심 종목 대기';
  return [
    `빠른 가격 ${status}`,
    scope,
    lane.running ? '자동 갱신 중' : '대기 중',
  ].join(' · ');
}

function tossQuotePollingTitle(polling: TossQuotePollingSummary): string {
  if (!polling.configured) return 'Toss 가격 갱신 미구성';
  const interval = polling.intervalMs !== null
    ? `${(polling.intervalMs / 1000).toFixed(1)}s`
    : 'unknown';
  const fallback = polling.suppressingKisPolling
    ? polling.consecutiveFailureCount >= 2
      ? '실시간 추적 비활성'
      : '실시간 추적 억제'
    : '실시간 추적 허용';
  return [
    `Toss 가격 갱신 ${polling.running ? '실행 중' : '대기'}`,
    '실시간 추적과 별개',
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
      className="status-bar__market-tape"
    >
      <span style={{ color: 'var(--text-secondary)', fontWeight: 800 }}>
        {kstTime}
      </span>
      {indicators.map((item) => (
        <span
          key={item.id}
          title={item.status === 'ready' ? item.label : `${item.label} 수집 중`}
          className="status-bar__item"
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
    .map((item) => `${classLabel(item.priorityClass)} ${item.callPerSec.toFixed(2)}/s`)
    .join(' · ');
  const base = `KIS REST ${window.callPerSec.toFixed(2)}/s · throttle ${window.throttlePerMin.toFixed(1)}/min · queue ${queue}`;
  return classes.length > 0 ? `${base} · ${classes}` : base;
}

function classLabel(priorityClass: string): string {
  if (priorityClass === 'polling') return 'REST';
  if (priorityClass === 'ranking') return 'ranking';
  if (priorityClass === 'foreground') return 'foreground';
  if (priorityClass === 'background') return 'background';
  return priorityClass;
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
  return <span className="status-bar__sep" />;
}
