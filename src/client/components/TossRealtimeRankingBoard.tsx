import type { TossRealtimeRankingItem, TossRealtimeRankingResponse } from '@shared/types';
import { fmtAbs, fmtPct, fmtPrice, krColor, rowBarAlpha } from '../lib/format';

interface TossRealtimeRankingBoardProps {
  data: TossRealtimeRankingResponse;
  onOpenTicker: (ticker: string) => void;
}

export function TossRealtimeRankingBoard({
  data,
  onOpenTicker,
}: TossRealtimeRankingBoardProps) {
  const fetchedAt = formatFetchedAt(data.fetchedAt);
  const subtitle = [
    data.sourceLabel,
    marketLabel(data.coverage.market),
    `가격 ${data.coverage.pricedCount}/${data.coverage.returnedCount}`,
    rankingTimestampLabel(data),
    statusLabel(data.status),
    `${Math.max(1, Math.round(data.refreshIntervalMs / 1000))}초마다`,
    `마지막 ${fetchedAt}`,
  ].filter((part): part is string => part !== null && part.length > 0).join(' · ');

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
        width: '100%',
        minWidth: 0,
      }}
    >
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
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
            }}
          >
            토스 실시간 인기 TOP100
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
            {data.coverage.returnedCount >= data.coverage.requestedLimit
              ? String(data.coverage.requestedLimit)
              : `${data.coverage.returnedCount}/${data.coverage.requestedLimit}`}
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
          title={`${subtitle} · ${data.message}`}
        >
          {subtitle} · {data.message}
        </div>
      </div>
      {data.items.length === 0 ? (
        <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          토스 인기 랭킹 데이터를 기다리는 중
        </div>
      ) : (
        data.items.map((item, index) => (
          <TossRankingRow
            key={item.productCode}
            item={item}
            isFirst={index === 0}
            onOpenTicker={onOpenTicker}
          />
        ))
      )}
    </div>
  );
}

function TossRankingRow({
  item,
  isFirst,
  onOpenTicker,
}: {
  item: TossRealtimeRankingItem;
  isFirst: boolean;
  onOpenTicker: (ticker: string) => void;
}) {
  const changePct = item.changePct ?? 0;
  const color = krColor(changePct);
  const depthPct = Math.min(100, (Math.abs(changePct) / 30) * 100);
  const barAlpha = rowBarAlpha(changePct);
  const barColor =
    changePct > 0
      ? `rgba(246,70,93,${barAlpha})`
      : changePct < 0
        ? `rgba(30,174,219,${barAlpha})`
        : 'transparent';
  const dir = changePct > 0 ? '90deg' : '-90deg';

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
        gridTemplateColumns: '26px minmax(0, 1fr) auto auto',
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
            item.changePct === null || item.changePct === 0
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
          {item.ticker} · {item.market}
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
        {formatPrice(item)}
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
          {item.changePct === null ? '수집 중' : fmtPct(item.changePct)}
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

function formatPrice(item: TossRealtimeRankingItem): string {
  if (item.price === null) return '수집 중';
  if (item.currency === 'USD') return `$${item.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  return fmtPrice(item.price);
}

function formatFetchedAt(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function rankingTimestampLabel(data: TossRealtimeRankingResponse): string {
  switch (data.rankingTimestampStatus) {
    case 'fresh':
      return '랭킹 시각 최신';
    case 'stale':
      return '랭킹 시각 오래됨';
    case 'missing':
      return '랭킹 시각 없음';
  }
}

function statusLabel(status: TossRealtimeRankingResponse['status']): string {
  switch (status) {
    case 'ready':
      return 'LIVE';
    case 'partial':
      return '부분 수신';
    case 'empty':
      return '대기';
    case 'error':
      return '오류';
  }
}

function marketLabel(market: TossRealtimeRankingResponse['coverage']['market']): string {
  switch (market) {
    case 'kr':
      return '국내';
    case 'us':
      return '미국';
    case 'all':
      return '전체';
  }
}
