/**
 * StockDetailModal — shell for the detail view.
 *
 * Honest-data policy:
 *   - Real values shown: 종목명, 코드, 시장, 즐겨찾기, 현재가, 등락률,
 *     전일대비, 거래량, 업데이트 시각, 스냅샷 여부, REST quote detail
 *     fields when present.
 *   - Unsupported values are shown as "미제공" or "기준선 수집 중", not
 *     fabricated. 뉴스/공시는 still explicitly 연동 예정.
 *   - Chart: rendered from `usePriceHistoryStore` only — no synthetic
 *     intraday. With <2 points, shows a "데이터 수집 중" placeholder.
 *
 * Keyboard:
 *   - ESC closes
 *   - ←/→ navigates within `allStocks`
 *   - Listeners are registered in a single useEffect and torn down on close.
 *
 * Click rules (handled by parents): row click opens the modal, star click
 * stops propagation and only toggles favorite.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  fmtAbs,
  fmtClock,
  fmtPct,
  fmtPrice,
  fmtVolMan,
  krColor,
} from '../lib/format';
import { CloseIcon, StarIcon } from '../lib/icons';
import {
  buildSignalExplanation,
  type SignalSurgeInput,
} from '../lib/signal-explainer';
import { buildSparklineGeometry } from '../lib/sparkline';
import {
  MIN_POINTS_FOR_SPARKLINE,
  selectHistory,
  usePriceHistoryStore,
} from '../stores/price-history-store';
import type { StockViewModel } from '../lib/view-models';
import {
  describeSectorSource,
  type EffectiveSector,
} from '../lib/effective-sector';
import type { MarketStatus } from '@shared/types';
import { useSurgeStore } from '../stores/surge-store';
import { SignalReasonList } from './SignalReasonList';
import { StockCandleChart } from './StockCandleChart';

const PENDING_LABEL = '연동 예정';
const UNAVAILABLE_LABEL = '미제공';
const COLLECTING_LABEL = '기준선 수집 중';

interface StockDetailModalProps {
  stock: StockViewModel;
  allStocks: ReadonlyArray<StockViewModel>;
  isFavorite: boolean;
  marketStatus: MarketStatus;
  onClose: () => void;
  onNavigate: (code: string) => void;
  onToggleFav: (code: string) => void;
  onUntrack: (code: string) => void;
}

export function StockDetailModal({
  stock,
  allStocks,
  isFavorite,
  marketStatus,
  onClose,
  onNavigate,
  onToggleFav,
  onUntrack,
}: StockDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'realtime' | 'chart'>('realtime');
  const history = usePriceHistoryStore((s) => selectHistory(s, stock.code));
  const activeSurge = useSurgeStore(
    (s) => s.feed.find((entry) => entry.code === stock.code) ?? null,
  );

  // ESC close + ←/→ navigate. Single registration tied to the focused
  // stock's code so the closure always sees the current ticker index.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (allStocks.length < 2) return;
      const idx = allStocks.findIndex((s) => s.code === stock.code);
      if (idx === -1) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = allStocks[(idx + 1) % allStocks.length];
        if (next !== undefined) onNavigate(next.code);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = allStocks[(idx - 1 + allStocks.length) % allStocks.length];
        if (prev !== undefined) onNavigate(prev.code);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stock.code, allStocks, onClose, onNavigate]);

  const accent = krColor(stock.changePct);
  const lastUpdated = useMemo(() => {
    if (stock.updatedAt === '') return null;
    const d = new Date(stock.updatedAt);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [stock.updatedAt]);
  const signalSurge = useMemo<SignalSurgeInput | null>(() => {
    if (activeSurge === null) return null;
    return {
      isLive: true,
      signalType: activeSurge.signalType,
      momentumPct: activeSurge.momentumPct,
      momentumWindow: activeSurge.momentumWindow,
      dailyChangePct: activeSurge.dailyChangePct,
      volumeSurgeRatio: activeSurge.volumeSurgeRatio,
      volumeBaselineStatus: activeSurge.volumeBaselineStatus,
    };
  }, [activeSurge]);
  const explanation = useMemo(
    () =>
      buildSignalExplanation({
        stock,
        allStocks,
        isFavorite,
        surgeItem: signalSurge,
        marketStatus,
      }),
    [stock, allStocks, isFavorite, signalSurge, marketStatus],
  );

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${stock.name} 상세`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        animation: 'fadeIn 150ms ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="araon-detail-modal"
        style={{
          background: 'var(--bg-card)',
          borderRadius: 14,
          width: 'min(960px, 100%)',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 30px 60px -10px rgba(0,0,0,0.4)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}
      >
        <ModalHeader
          stock={stock}
          accent={accent}
          isFavorite={isFavorite}
          onToggleFav={onToggleFav}
          onUntrack={onUntrack}
          onClose={onClose}
        />

        <div style={{ overflowY: 'auto', padding: '18px 22px 22px' }}>
          <div
            role="tablist"
            aria-label="종목 상세 탭"
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              marginBottom: 12,
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                gap: 4,
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 3,
                background: 'var(--bg-tint)',
              }}
            >
              <DetailTab
                active={activeTab === 'realtime'}
                onClick={() => setActiveTab('realtime')}
              >
                실시간
              </DetailTab>
              <DetailTab
                active={activeTab === 'chart'}
                onClick={() => setActiveTab('chart')}
              >
                차트
              </DetailTab>
            </div>
            <div style={{ flex: 1 }} />
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--text-muted)',
                padding: '3px 8px',
                borderRadius: 50,
                background: 'var(--bg-tint)',
                letterSpacing: 0.3,
              }}
            >
              ← / → 다른 종목 · ESC 닫기
            </span>
          </div>

          {activeTab === 'realtime' ? (
            <ChartArea history={history} positive={stock.changePct >= 0} />
          ) : (
            <StockCandleChart ticker={stock.code} />
          )}

          <div
            style={{
              display: 'flex',
              gap: 14,
              alignItems: 'center',
              marginTop: 18,
              marginBottom: 10,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              실시간 가격 추이
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {history.length === 0
                ? '아직 수신된 가격 업데이트가 없습니다'
                : `${history.length}개 포인트 · 세션 누적`}
            </span>
          </div>

          <MetricsGrid stock={stock} lastUpdated={lastUpdated} />

          {activeTab === 'realtime' && (
            <>
              <div style={{ marginTop: 18 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: 8,
                  }}
                >
                  관찰 근거
                </div>
                <SignalReasonList explanation={explanation} mode="list" />
              </div>
            </>
          )}

          <div style={{ marginTop: 18 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: 8,
              }}
            >
              관련 뉴스 · 공시
            </div>
            <div
              style={{
                padding: '18px 14px',
                border: '1px dashed var(--border)',
                borderRadius: 10,
                fontSize: 12,
                color: 'var(--text-muted)',
                textAlign: 'center',
                lineHeight: 1.6,
              }}
            >
              뉴스 / 공시 피드는 백엔드 연동 후 표시됩니다.
              <br />
              <span style={{ fontSize: 11 }}>(연동 예정)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        border: 'none',
        borderRadius: 8,
        background: active ? 'var(--bg-card)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        fontSize: 12,
        fontWeight: 800,
        padding: '7px 14px',
        cursor: 'pointer',
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
      }}
    >
      {children}
    </button>
  );
}

interface ModalHeaderProps {
  stock: StockViewModel;
  accent: string;
  isFavorite: boolean;
  onToggleFav: (code: string) => void;
  onUntrack: (code: string) => void;
  onClose: () => void;
}

function ModalHeader({
  stock,
  accent,
  isFavorite,
  onToggleFav,
  onUntrack,
  onClose,
}: ModalHeaderProps) {
  return (
    <div
      style={{
        padding: '18px 22px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: 'var(--text-strong)',
            letterSpacing: -0.4,
          }}
        >
          {stock.name}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-muted)',
            letterSpacing: 0.4,
          }}
        >
          {stock.code}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            padding: '2px 6px',
            borderRadius: 4,
            letterSpacing: 0.4,
          }}
        >
          {stock.market}
        </span>
        {stock.isSnapshot && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              padding: '2px 5px',
              borderRadius: 4,
              letterSpacing: 0.3,
            }}
            title="장 시간 외 또는 첫 라이브 틱 전"
          >
            SNAPSHOT
          </span>
        )}
        <span
          title={describeSectorSource(stock.effectiveSector.source)}
          style={{
            fontSize: 10,
            fontWeight: 700,
            color:
              stock.effectiveSector.source === 'unclassified'
                ? 'var(--text-muted)'
                : 'var(--text-secondary)',
            border: '1px solid var(--border)',
            padding: '2px 6px',
            borderRadius: 4,
            letterSpacing: 0.4,
            fontStyle:
              stock.effectiveSector.source === 'kis-industry'
                ? 'italic'
                : 'normal',
          }}
        >
          {stock.effectiveSector.name}
        </span>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFav(stock.code);
        }}
        title={isFavorite ? '즐겨찾기 해제' : '즐겨찾기'}
        aria-pressed={isFavorite}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 6,
          color: isFavorite ? 'var(--gold)' : 'var(--text-inactive)',
          lineHeight: 0,
        }}
      >
        <StarIcon size={20} filled={isFavorite} />
      </button>
      <div style={{ flex: 1 }} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
        }}
      >
        <span
          style={{
            fontSize: 24,
            fontWeight: 800,
            color: accent,
            letterSpacing: -0.6,
            lineHeight: 1,
          }}
        >
          {fmtPrice(stock.price)}
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: accent,
            marginTop: 4,
          }}
        >
          {stock.changeAbs === null ? '—' : fmtAbs(stock.changeAbs)} ({fmtPct(stock.changePct)})
        </span>
      </div>
      <div
        style={{
          width: 1,
          height: 32,
          background: 'var(--border)',
          marginLeft: 8,
        }}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onUntrack(stock.code);
        }}
        title="이 종목을 대시보드 추적 목록에서 제거"
        style={{
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '0 12px',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          height: 32,
          letterSpacing: 0.2,
        }}
      >
        추적 해제
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        title="닫기 (ESC)"
        style={{
          background: 'var(--bg-tint)',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          width: 32,
          height: 32,
          borderRadius: 8,
          color: 'var(--text-secondary)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      >
        <CloseIcon size={14} />
      </button>
    </div>
  );
}

interface ChartAreaProps {
  history: ReadonlyArray<{ price: number; changePct: number; ts: number }>;
  positive: boolean;
}

function ChartArea({ history, positive }: ChartAreaProps) {
  const W = 800;
  const H = 240;
  const PAD = { top: 16, right: 50, bottom: 24, left: 8 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const geom = buildSparklineGeometry(history, innerW, innerH, MIN_POINTS_FOR_SPARKLINE);
  const accent = positive ? 'var(--kr-up)' : 'var(--kr-down)';
  const accentArea = positive ? 'var(--up-tint-1)' : 'var(--down-tint-1)';

  if (geom === null) {
    return (
      <div
        style={{
          border: '1px dashed var(--border)',
          borderRadius: 10,
          padding: '40px 14px',
          textAlign: 'center',
          fontSize: 12,
          color: 'var(--text-muted)',
          lineHeight: 1.6,
          marginBottom: 18,
        }}
      >
        실시간 가격 데이터 수집 중
        <br />
        <span style={{ fontSize: 11 }}>
          ({MIN_POINTS_FOR_SPARKLINE}개 이상의 가격 업데이트가 누적되면 차트가 표시됩니다)
        </span>
      </div>
    );
  }

  // Shift the polyline coordinates into the padded SVG area.
  const shiftedPoints = geom.points
    .split(' ')
    .map((p) => {
      const [xs, ys] = p.split(',');
      const x = Number(xs) + PAD.left;
      const y = Number(ys) + PAD.top;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const baselineY = PAD.top + innerH;
  const lastPoint = shiftedPoints.split(' ').pop() ?? '';
  const firstPoint = shiftedPoints.split(' ')[0] ?? '';
  const areaPoints = `${firstPoint.split(',')[0]},${baselineY} ${shiftedPoints} ${lastPoint.split(',')[0]},${baselineY}`;

  return (
    <div
      style={{
        border: '1px solid var(--border-soft)',
        borderRadius: 10,
        padding: '8px 10px 4px',
        marginBottom: 18,
        background: 'var(--bg-card)',
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        width="100%"
        height={H}
        style={{ display: 'block' }}
        aria-hidden
      >
        <polygon points={areaPoints} fill={accentArea} />
        <polyline
          points={shiftedPoints}
          fill="none"
          stroke={accent}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
        <text
          x={W - PAD.right + 6}
          y={PAD.top + 4}
          fontSize="10"
          fill="var(--text-muted)"
          fontFamily="inherit"
        >
          {Math.round(geom.max).toLocaleString('ko-KR')}
        </text>
        <text
          x={W - PAD.right + 6}
          y={baselineY}
          fontSize="10"
          fill="var(--text-muted)"
          fontFamily="inherit"
        >
          {Math.round(geom.min).toLocaleString('ko-KR')}
        </text>
      </svg>
    </div>
  );
}

interface MetricsGridProps {
  stock: StockViewModel;
  lastUpdated: Date | null;
}

function MetricsGrid({ stock, lastUpdated }: MetricsGridProps) {
  const metrics: Array<{
    label: string;
    value: string;
    pending: boolean;
    title?: string | undefined;
  }> = [
    {
      label: '거래량',
      value: stock.volume > 0 ? fmtVolMan(stock.volume) : PENDING_LABEL,
      pending: stock.volume <= 0,
    },
    {
      label: '업데이트',
      value: lastUpdated !== null ? fmtClock(lastUpdated) : PENDING_LABEL,
      pending: lastUpdated === null,
    },
    {
      label: '시장',
      value: stock.market,
      pending: false,
    },
    {
      label: '데이터',
      value: stock.isSnapshot ? 'SNAPSHOT' : 'LIVE',
      pending: false,
    },
    {
      label: '섹터',
      value: formatSectorMetricValue(stock.effectiveSector),
      pending: false,
      title: describeSectorSource(stock.effectiveSector.source),
    },
    makeOptionalMetric('시가', formatOptionalPrice(stock.openPrice)),
    makeOptionalMetric('고가', formatOptionalPrice(stock.highPrice)),
    makeOptionalMetric('저가', formatOptionalPrice(stock.lowPrice)),
    makeOptionalMetric('시가총액', formatOptionalKrw(stock.marketCapKrw)),
    makeOptionalMetric('PER', formatOptionalMultiple(stock.per)),
    makeOptionalMetric('PBR', formatOptionalMultiple(stock.pbr)),
    makeOptionalMetric('외인 보유', formatOptionalPercent(stock.foreignOwnershipRate)),
    makeOptionalMetric('52주 최고', formatOptionalPrice(stock.week52High)),
    makeOptionalMetric('52주 최저', formatOptionalPrice(stock.week52Low)),
    makeOptionalMetric(
      '평균거래량',
      formatVolumeBaselineMetric(
        stock.volumeSurgeRatio ?? null,
        stock.volumeBaselineStatus ?? 'unavailable',
      ),
      '동일 세션·동일 시간대 누적 거래량 기준선 상태',
    ),
    makeOptionalMetric('배당수익률', formatOptionalPercent(stock.dividendYield)),
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 1,
        background: 'var(--border-soft)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      {metrics.map((m) => (
        <Metric
          key={m.label}
          label={m.label}
          value={m.value}
          pending={m.pending}
          title={m.title}
        />
      ))}
    </div>
  );
}

function formatSectorMetricValue(eff: EffectiveSector): string {
  if (eff.source === 'kis-industry') return `${eff.name} · KIS 공식`;
  return eff.name;
}

function makeOptionalMetric(
  label: string,
  value: string | null,
  title?: string,
): { label: string; value: string; pending: boolean; title?: string | undefined } {
  return {
    label,
    value: value ?? UNAVAILABLE_LABEL,
    pending: value === null,
    title,
  };
}

function formatOptionalPrice(value: number | null | undefined): string | null {
  return value !== undefined && value !== null && value > 0
    ? fmtPrice(value)
    : null;
}

function formatOptionalKrw(value: number | null | undefined): string | null {
  return value !== undefined && value !== null && value > 0
    ? formatKrwCompact(value)
    : null;
}

function formatOptionalMultiple(value: number | null | undefined): string | null {
  return value !== undefined && value !== null && Number.isFinite(value)
    ? `${value.toFixed(2)}x`
    : null;
}

function formatOptionalPercent(value: number | null | undefined): string | null {
  return value !== undefined && value !== null && Number.isFinite(value)
    ? `${value.toFixed(2)}%`
    : null;
}

function formatVolumeBaselineMetric(
  ratio: number | null,
  status: 'collecting' | 'ready' | 'unavailable',
): string | null {
  if (ratio !== null && ratio >= 0) return `기준선 대비 ${ratio.toFixed(1)}x`;
  if (status === 'collecting') return COLLECTING_LABEL;
  return null;
}

function formatKrwCompact(value: number): string {
  if (value >= 1_000_000_000_000) {
    return `${trimTrailingZero(value / 1_000_000_000_000)}조`;
  }
  if (value >= 100_000_000) {
    return `${trimTrailingZero(value / 100_000_000)}억`;
  }
  return `${fmtPrice(value)}원`;
}

function trimTrailingZero(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '');
}

interface MetricProps {
  label: string;
  value: string;
  pending: boolean;
  title?: string | undefined;
}

function Metric({ label, value, pending, title }: MetricProps) {
  return (
    <div
      title={title}
      style={{
        background: 'var(--bg-card)',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--text-muted)',
          letterSpacing: 0.4,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: pending ? 'var(--text-muted)' : 'var(--text-primary)',
          letterSpacing: -0.2,
          fontStyle: pending ? 'italic' : 'normal',
        }}
      >
        {value}
      </span>
    </div>
  );
}
