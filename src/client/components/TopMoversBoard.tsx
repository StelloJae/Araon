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
}

export function TopMoversBoard({ data, onOpenTicker }: TopMoversBoardProps) {
  const fetchedAt = formatFetchedAt(data.fetchedAt);
  const refreshSec = Math.max(1, Math.round(data.refreshIntervalMs / 1000));
  const subtitle = `${statusLabel(data.status)} · ${refreshSec}초마다 · 마지막 ${fetchedAt}`;

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 1px minmax(0, 1fr)',
        width: '100%',
        minWidth: 0,
      }}
    >
      <TopMoversColumn
        title="상승 TOP100"
        tone="up"
        items={data.gainers}
        subtitle={subtitle}
        message={data.status === 'ready' ? '' : data.message}
        onOpenTicker={onOpenTicker}
      />
      <div style={{ background: 'var(--border)' }} />
      <TopMoversColumn
        title="하락 TOP100"
        tone="down"
        items={data.losers}
        subtitle={subtitle}
        message={data.status === 'ready' ? '' : data.message}
        onOpenTicker={onOpenTicker}
      />
    </div>
  );
}

interface TopMoversColumnProps {
  title: string;
  tone: 'up' | 'down';
  items: MarketTopMoverItem[];
  subtitle: string;
  message: string;
  onOpenTicker: (ticker: string) => void;
}

function TopMoversColumn({
  title,
  tone,
  items,
  subtitle,
  message,
  onOpenTicker,
}: TopMoversColumnProps) {
  return (
    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          padding: '12px 14px 8px',
          borderBottom: '1px solid var(--border-soft)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: tone === 'up' ? 'var(--kr-up)' : 'var(--kr-down)',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </div>
          <div
            style={{
              marginLeft: 'auto',
              fontSize: 10,
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
            fontSize: 10,
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
          />
        ))
      )}
    </div>
  );
}

interface TopMoverRowProps {
  item: MarketTopMoverItem;
  isFirst: boolean;
  onOpenTicker: (ticker: string) => void;
}

function TopMoverRow({ item, isFirst, onOpenTicker }: TopMoverRowProps) {
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
        gridTemplateColumns: '20px minmax(0, 1fr) auto auto',
        gap: 8,
        alignItems: 'center',
        padding: '9px 12px',
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
          fontSize: 10,
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
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1.2,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {item.name}
        </span>
        <span style={{ display: 'block', marginTop: 1, fontSize: 9, fontWeight: 600, color: 'var(--text-muted)' }}>
          {item.ticker}
        </span>
      </span>
      <span
        style={{
          position: 'relative',
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--text-primary)',
          textAlign: 'right',
          minWidth: 64,
          whiteSpace: 'nowrap',
        }}
      >
        {fmtPrice(item.price)}
      </span>
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
        <span style={{ fontSize: 12, fontWeight: 700, color, lineHeight: 1.1 }}>
          {fmtPct(item.changePct)}
        </span>
        {item.changeAbs !== null && (
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

function statusLabel(status: MarketTopMoversResponse['status']): string {
  switch (status) {
    case 'ready':
      return 'LIVE';
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
