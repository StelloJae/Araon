import type { MarketTopMoverItem, MarketTopMoversResponse } from '@shared/types';
import { fmtAbs, fmtPct, fmtPrice, krColor } from '../lib/format';

interface TopMoversBoardProps {
  data: MarketTopMoversResponse;
  onOpenTicker: (ticker: string) => void;
}

export function TopMoversBoard({ data, onOpenTicker }: TopMoversBoardProps) {
  const fetchedAt = data.fetchedAt === null
    ? '대기 중'
    : new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date(data.fetchedAt));
  const refreshSec = Math.max(1, Math.round(data.refreshIntervalMs / 1000));

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 14px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
            전체 종목 TOP100
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>
            KIS 등락률 순위 · {refreshSec}초마다 갱신 · 마지막 {fetchedAt}
          </div>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: data.status === 'ready' ? 'var(--kr-up)' : 'var(--gold-text)',
            background: data.status === 'ready' ? 'var(--up-tint-1)' : 'var(--gold-soft)',
            padding: '3px 8px',
            borderRadius: 999,
            whiteSpace: 'nowrap',
          }}
        >
          {statusLabel(data.status)}
        </span>
      </div>
      {data.message.length > 0 && data.status !== 'ready' && (
        <div
          style={{
            padding: '9px 14px',
            borderBottom: '1px solid var(--border-soft)',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-secondary)',
          }}
        >
          {data.message}
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1px 1fr',
          minWidth: 0,
        }}
      >
        <TopMoversColumn
          title="상승 TOP100"
          tone="up"
          items={data.gainers}
          onOpenTicker={onOpenTicker}
        />
        <div style={{ background: 'var(--border)' }} />
        <TopMoversColumn
          title="하락 TOP100"
          tone="down"
          items={data.losers}
          onOpenTicker={onOpenTicker}
        />
      </div>
    </div>
  );
}

interface TopMoversColumnProps {
  title: string;
  tone: 'up' | 'down';
  items: MarketTopMoverItem[];
  onOpenTicker: (ticker: string) => void;
}

function TopMoversColumn({
  title,
  tone,
  items,
  onOpenTicker,
}: TopMoversColumnProps) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          padding: '10px 14px 8px',
          fontSize: 13,
          fontWeight: 800,
          color: tone === 'up' ? 'var(--kr-up)' : 'var(--kr-down)',
          borderBottom: '1px solid var(--border-soft)',
        }}
      >
        {title} · {items.length}종목
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
        display: 'grid',
        gridTemplateColumns: '26px minmax(0, 1fr) auto',
        gap: 10,
        alignItems: 'center',
        padding: '9px 12px',
        cursor: 'pointer',
        textAlign: 'left',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: 'var(--text-muted)',
          textAlign: 'right',
        }}
      >
        {String(item.rank).padStart(2, '0')}
      </span>
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 800,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {item.name}
        </span>
        <span style={{ display: 'block', marginTop: 1, fontSize: 9, fontWeight: 700, color: 'var(--text-muted)' }}>
          {item.ticker}
        </span>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 74 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
          {fmtPrice(item.price)}
        </span>
        <span style={{ marginTop: 1, fontSize: 11, fontWeight: 800, color }}>
          {fmtPct(item.changePct)}
        </span>
        {item.changeAbs !== null && (
          <span style={{ fontSize: 9, fontWeight: 700, color }}>
            {fmtAbs(item.changeAbs)}
          </span>
        )}
      </span>
    </button>
  );
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
