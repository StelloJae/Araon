import type { MarketTopMoverItem, MarketTopMoversResponse } from '@shared/types';
import {
  fmtAbs,
  fmtPct,
  fmtPrice,
  krColor,
  rowBarAlpha,
} from '../lib/format';

interface TopMoversBoardProps {
  data: MarketTopMoversResponse;
  onOpenTicker: (ticker: string) => void;
  compact?: boolean;
  embedded?: boolean;
}

export function TopMoversBoard({
  data,
  onOpenTicker,
  compact = false,
  embedded = false,
}: TopMoversBoardProps) {
  const fetchedAt = formatFetchedAt(data.fetchedAt);
  const gainers = sortTopMoverItems(data.gainers, 'up');
  const losers = sortTopMoverItems(data.losers, 'down');
  const subtitle = [
    data.sourceLabel,
    coverageLabel(data),
    partialReasonLabel(data),
    stopReasonLabel(data),
    statusLabel(data.status),
    `${formatRefreshCadence(data.refreshIntervalMs)}마다`,
    `마지막 ${fetchedAt}`,
    lastGoodAgeLabel(data.lastGoodAgeMs),
  ].filter((part): part is string => part !== null && part.length > 0).join(' · ');

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: embedded ? 'none' : '1px solid var(--border)',
        borderRadius: embedded ? 0 : 12,
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 1px minmax(0, 1fr)',
        width: '100%',
        height: compact || embedded ? '100%' : undefined,
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <TopMoversColumn
        title="상승 TOP100"
        tone="up"
        items={gainers}
        subtitle={subtitle}
        message={data.status === 'ready' ? '' : data.message}
        onOpenTicker={onOpenTicker}
        compact={compact}
      />
      <div
        style={{
          background: 'var(--border)',
          width: 1,
          height: 'auto',
        }}
      />
      <TopMoversColumn
        title="하락 TOP100"
        tone="down"
        items={losers}
        subtitle={subtitle}
        message={data.status === 'ready' ? '' : data.message}
        onOpenTicker={onOpenTicker}
        compact={compact}
      />
    </div>
  );
}

function sortTopMoverItems(
  items: ReadonlyArray<MarketTopMoverItem>,
  tone: 'up' | 'down',
): MarketTopMoverItem[] {
  return [...items].sort((a, b) => {
    const diff = tone === 'up'
      ? b.changePct - a.changePct
      : a.changePct - b.changePct;
    if (diff !== 0) return diff;
    return a.rank - b.rank;
  });
}

interface TopMoversColumnProps {
  title: string;
  tone: 'up' | 'down';
  items: MarketTopMoverItem[];
  subtitle: string;
  message: string;
  onOpenTicker: (ticker: string) => void;
  compact: boolean;
}

function TopMoversColumn({
  title,
  tone,
  items,
  subtitle,
  message,
  onOpenTicker,
  compact,
}: TopMoversColumnProps) {
  return (
    <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div
        style={{
          padding: compact ? '9px 10px 7px' : '12px 14px 8px',
          borderBottom: '1px solid var(--border-soft)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div
            style={{
              fontSize: compact ? 13 : 14,
              fontWeight: 800,
              color: tone === 'up' ? 'var(--kr-up)' : 'var(--kr-down)',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </div>
          <div
            style={{
            marginLeft: 'auto',
              fontSize: compact ? 9 : 10,
              fontWeight: 700,
              color: 'var(--text-secondary)',
              background: 'var(--bg-tint)',
              padding: '2px 7px',
              borderRadius: 50,
              whiteSpace: 'nowrap',
            }}
          >
            {items.length >= 100 ? '100' : `${items.length}/100`}
          </div>
        </div>
        <div
          style={{
            marginTop: 3,
            fontSize: compact ? 9 : 10,
            fontWeight: 500,
            color: 'var(--text-muted)',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
          title={message.length > 0 ? `${subtitle} · ${message}` : subtitle}
        >
          {message.length > 0 ? `${subtitle} · ${message}` : subtitle}
        </div>
      </div>
      <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto' }}>
        {items.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            랭킹 데이터를 기다리는 중
          </div>
        ) : (
          items.map((item, index) => (
            <TopMoverRow
              key={`${tone}-${item.ticker}`}
              item={item}
              isFirst={index === 0}
              onOpenTicker={onOpenTicker}
              compact={compact}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface TopMoverRowProps {
  item: MarketTopMoverItem;
  isFirst: boolean;
  onOpenTicker: (ticker: string) => void;
  compact: boolean;
}

function TopMoverRow({ item, isFirst, onOpenTicker, compact }: TopMoverRowProps) {
  const color = krColor(item.changePct);
  const depthPct = Math.min(100, (Math.abs(item.changePct) / 30) * 100);
  const barAlpha = rowBarAlpha(item.changePct);
  const barColor =
    item.changePct > 0
      ? `rgba(246,70,93,${barAlpha})`
      : item.changePct < 0
        ? `rgba(30,174,219,${barAlpha})`
        : 'transparent';
  const dir = item.changePct > 0 ? '90deg' : '-90deg';

  return (
    <button
      type="button"
      onClick={() => onOpenTicker(item.ticker)}
      className="stock-row-interactive"
      style={{
        width: '100%',
        border: 'none',
        borderTop: isFirst ? 'none' : '1px solid var(--border-soft)',
        background: 'transparent',
        position: 'relative',
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: compact ? '18px minmax(0, 1fr) minmax(58px, auto)' : '20px minmax(0, 1fr) auto auto',
        gap: compact ? 6 : 8,
        alignItems: 'center',
        padding: compact ? '7px 9px' : '9px 12px',
        cursor: 'pointer',
        textAlign: 'left',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            item.changePct === 0
              ? 'transparent'
              : `linear-gradient(${dir}, ${barColor} 0%, ${barColor} ${depthPct}%, transparent ${depthPct}%)`,
          opacity: 0.6,
          pointerEvents: 'none',
        }}
      />
      <span
        style={{
          position: 'relative',
          fontSize: compact ? 9 : 10,
          fontWeight: 700,
          color: 'var(--text-muted)',
          textAlign: 'right',
        }}
      >
        {String(item.rank).padStart(2, '0')}
      </span>
      <span style={{ position: 'relative', minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: compact ? 12 : 13,
            fontWeight: 800,
            color: 'var(--text-primary)',
            lineHeight: 1.2,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {item.name}
        </span>
        <span style={{ display: 'block', marginTop: 1, fontSize: compact ? 9 : 10, fontWeight: 700, color: 'var(--text-muted)' }}>
          {item.ticker}
        </span>
      </span>
      {!compact && (
        <span
          style={{
            position: 'relative',
            fontSize: 13,
            fontWeight: 800,
            color: 'var(--text-primary)',
            textAlign: 'right',
            minWidth: 64,
            whiteSpace: 'nowrap',
          }}
        >
          {fmtPrice(item.price)}
        </span>
      )}
      <span
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 1,
          minWidth: 60,
          textAlign: 'right',
        }}
      >
        {compact && (
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
            {fmtPrice(item.price)}
          </span>
        )}
        <span style={{ fontSize: compact ? 11 : 12, fontWeight: 800, color, lineHeight: 1.1 }}>
          {fmtPct(item.changePct)}
        </span>
        {!compact && item.changeAbs !== null && (
          <span style={{ fontSize: 9, fontWeight: 600, color, lineHeight: 1.1 }}>
            {fmtAbs(item.changeAbs)}
          </span>
        )}
      </span>
    </button>
  );
}

function formatFetchedAt(value: string | null): string {
  if (value === null) return '대기 중';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function formatRefreshCadence(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '갱신 대기';
  if (ms < 1_000) return `${(ms / 1_000).toFixed(1)}초`;
  const seconds = ms / 1_000;
  return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(1)}초`;
}

function statusLabel(status: MarketTopMoversResponse['status']): string {
  switch (status) {
    case 'ready':
      return 'LIVE';
    case 'partial':
      return '일부 수신';
    case 'stale':
      return '직전 데이터';
    case 'unconfigured':
      return '연결 대기';
    case 'cooldown':
      return '쿨다운';
    case 'error':
      return '오류';
  }
}

function coverageLabel(data: MarketTopMoversResponse): string {
  const source = data.coverage.marketUniverse === 'toss-web-ranking' ? '토스 웹 랭킹' : 'KIS 전체시장';
  if (data.coverage.includesLocalFallback) return '화면 종목 포함';
  if (data.coverage.guaranteedTop100) return `${source} 보장`;
  if (data.coverage.gainersCount > 0 || data.coverage.losersCount > 0) {
    return `${source} 일부`;
  }
  return `${source} 대기`;
}

function partialReasonLabel(data: MarketTopMoversResponse): string | null {
  const source = data.coverage.marketUniverse === 'toss-web-ranking' ? '토스' : 'KIS';
  switch (data.partialReason) {
    case 'under_requested_limit':
      return `${source} 부분 응답`;
    case 'smaller_refresh_retained':
      return '직전 데이터 유지';
    case 'rate_limited':
      return `${source} 요청 제한`;
    case 'no_continuation':
      return `${source} 응답 종료`;
    case 'timeout':
      return '시간 초과';
    case 'malformed_response':
      return '응답 해석 실패';
    case 'upstream_partial_limit_suspected':
      return `${source} 부분 응답 한계 의심`;
    case 'source_unsupported':
      return '미지원';
    case null:
      return null;
  }
}

function stopReasonLabel(data: MarketTopMoversResponse): string | null {
  if (data.stopReason === null || data.partialReason !== null) return null;
  const source = data.coverage.marketUniverse === 'toss-web-ranking' ? '토스' : 'KIS';
  switch (data.stopReason) {
    case 'complete':
      return null;
    case 'no_continuation':
      return `${source} 응답 종료`;
    case 'under_requested_limit':
      return '요청 미달';
    case 'rate_limited':
      return `${source} 요청 제한`;
    case 'timeout':
      return '시간 초과';
    case 'malformed_response':
      return '응답 해석 실패';
    case 'smaller_refresh_retained':
      return '직전 데이터 유지';
    case 'unsupported_source':
      return '미지원';
    case 'upstream_partial_limit_suspected':
      return `${source} 부분 응답 한계 의심`;
  }
}

function lastGoodAgeLabel(ageMs: number | null): string | null {
  if (ageMs === null || !Number.isFinite(ageMs) || ageMs < 1_000) return null;
  const minutes = Math.max(1, Math.round(ageMs / 60_000));
  if (minutes < 60) return `약 ${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  return `약 ${hours}시간 전`;
}
