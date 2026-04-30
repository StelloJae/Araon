/**
 * StockDetailModal — shell for the detail view.
 *
 * Honest-data policy:
 *   - Real values shown: 종목명, 코드, 시장, 즐겨찾기, 현재가, 등락률,
 *     전일대비, 거래량, 업데이트 시각, 스냅샷 여부.
 *   - "연동 예정" placeholders for fields that need backend data we don't
 *     have yet: 시가/고가/저가, 시가총액, PER, PBR, 외인보유, 52주 최고/최저,
 *     평균거래량, 배당, 뉴스/공시.
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

import { useEffect, useMemo } from 'react';
import {
  fmtAbs,
  fmtClock,
  fmtPct,
  fmtPrice,
  fmtVolMan,
  krColor,
} from '../lib/format';
import { CloseIcon, StarIcon } from '../lib/icons';
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

const PENDING_LABEL = '연동 예정';

interface StockDetailModalProps {
  stock: StockViewModel;
  allStocks: ReadonlyArray<StockViewModel>;
  isFavorite: boolean;
  onClose: () => void;
  onNavigate: (code: string) => void;
  onToggleFav: (code: string) => void;
  onUntrack: (code: string) => void;
}

export function StockDetailModal({
  stock,
  allStocks,
  isFavorite,
  onClose,
  onNavigate,
  onToggleFav,
  onUntrack,
}: StockDetailModalProps) {
  const history = usePriceHistoryStore((s) => selectHistory(s, stock.code));

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
            style={{
              display: 'flex',
              gap: 14,
              alignItems: 'center',
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

          <ChartArea history={history} positive={stock.changePct >= 0} />

          <MetricsGrid stock={stock} lastUpdated={lastUpdated} />

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
  const realMetrics: Array<{ label: string; value: string; title?: string }> = [
    {
      label: '거래량',
      value: stock.volume > 0 ? fmtVolMan(stock.volume) : PENDING_LABEL,
    },
    {
      label: '업데이트',
      value: lastUpdated !== null ? fmtClock(lastUpdated) : PENDING_LABEL,
    },
    {
      label: '시장',
      value: stock.market,
    },
    {
      label: '데이터',
      value: stock.isSnapshot ? 'SNAPSHOT' : 'LIVE',
    },
    {
      label: '섹터',
      value: formatSectorMetricValue(stock.effectiveSector),
      title: describeSectorSource(stock.effectiveSector.source),
    },
  ];

  const pendingMetrics: string[] = [
    '시가',
    '고가',
    '저가',
    '시가총액',
    'PER',
    'PBR',
    '외인 보유',
    '52주 최고',
    '52주 최저',
    '평균거래량',
    '배당수익률',
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
      {realMetrics.map((m) => (
        <Metric
          key={m.label}
          label={m.label}
          value={m.value}
          pending={false}
          title={m.title}
        />
      ))}
      {pendingMetrics.map((label) => (
        <Metric key={label} label={label} value={PENDING_LABEL} pending />
      ))}
    </div>
  );
}

function formatSectorMetricValue(eff: EffectiveSector): string {
  if (eff.source === 'kis-industry') return `${eff.name} · KIS 공식`;
  return eff.name;
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
