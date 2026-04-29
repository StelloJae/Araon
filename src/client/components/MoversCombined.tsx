/**
 * MoversCombined + LeftCombinedBlock — left sticky column (col 1 in App grid).
 *
 * The outer LeftCombinedBlock is one card with two halves divided by a 1px
 * vertical line:
 *   - left:  Today's TOP 10 (gainers + losers stacked, sticky group headers)
 *   - right: 실시간 급상승 (live ≥3% feed, age-faded rows)
 *
 * Both halves scroll internally; the outer card stays sticky in the App layout
 * grid. PRE-OPEN replaces both lists with "장 시작 대기 중".
 */

import { useMemo } from 'react';
import {
  fmtPct,
  fmtPrice,
  krColor,
  moversBarAlpha,
} from '../lib/format';
import { SurgeBlock } from './SurgeBlock';
import type { StockViewModel } from '../lib/view-models';
import type { MarketStatus } from '@shared/types';

interface LeftCombinedBlockProps {
  allStocks: ReadonlyArray<StockViewModel>;
  marketStatus: MarketStatus;
  onOpenDetail: (code: string) => void;
}

export function LeftCombinedBlock({
  allStocks,
  marketStatus,
  onOpenDetail,
}: LeftCombinedBlockProps) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        flex: '1 1 0',
        minHeight: 0,
      }}
    >
      <div
        style={{
          flex: '1 1 0',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <MoversCombined
          allStocks={allStocks}
          marketStatus={marketStatus}
          onOpenDetail={onOpenDetail}
          flush
        />
      </div>
      <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />
      <div
        style={{
          flex: '1 1 0',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <SurgeBlock
          allStocks={allStocks}
          marketStatus={marketStatus}
          onOpenDetail={onOpenDetail}
          flush
        />
      </div>
    </div>
  );
}

// ---------- MoversCombined ----------

interface MoversCombinedProps {
  allStocks: ReadonlyArray<StockViewModel>;
  marketStatus: MarketStatus;
  onOpenDetail: (code: string) => void;
  flush?: boolean;
}

export function MoversCombined({
  allStocks,
  marketStatus,
  onOpenDetail,
  flush = false,
}: MoversCombinedProps) {
  const sorted = useMemo(
    () => [...allStocks].sort((a, b) => b.changePct - a.changePct),
    [allStocks],
  );
  const gainers = sorted.slice(0, 10).filter((s) => s.changePct > 0);
  const losers = sorted.slice(-10).reverse().filter((s) => s.changePct < 0);
  const preOpen = marketStatus === 'pre-open';

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: flush ? 'none' : '1px solid var(--border)',
        borderRadius: flush ? 0 : 12,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 0',
        minHeight: 0,
        minWidth: 0,
        height: '100%',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: -0.1,
          }}
        >
          오늘의 TOP 10
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
          상승 / 하락
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-muted)',
            marginLeft: 'auto',
          }}
        >
          {preOpen ? '대기' : `${gainers.length + losers.length}종목`}
        </span>
      </div>

      {preOpen ? (
        <div
          style={{
            padding: '40px 16px',
            textAlign: 'center',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text-muted)',
          }}
        >
          <div style={{ fontSize: 22, marginBottom: 6, opacity: 0.4 }}>◔</div>
          장 시작 대기 중
        </div>
      ) : (
        <div
          style={{
            overflowY: 'auto',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <MoverGroupHeader tone="up" icon="▲" title="상승" count={gainers.length} />
          {gainers.length === 0 ? (
            <EmptyMover label="상승 종목 없음" />
          ) : (
            gainers.map((s, i) => (
              <MoverRow
                key={`u-${s.code}`}
                rank={i + 1}
                stock={s}
                tone="up"
                onOpenDetail={onOpenDetail}
              />
            ))
          )}
          <MoverGroupHeader tone="down" icon="▼" title="하락" count={losers.length} divider />
          {losers.length === 0 ? (
            <EmptyMover label="하락 종목 없음" />
          ) : (
            losers.map((s, i) => (
              <MoverRow
                key={`d-${s.code}`}
                rank={i + 1}
                stock={s}
                tone="down"
                onOpenDetail={onOpenDetail}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface MoverGroupHeaderProps {
  tone: 'up' | 'down';
  icon: '▲' | '▼';
  title: string;
  count: number;
  divider?: boolean;
}

function MoverGroupHeader({ tone, icon, title, count, divider = false }: MoverGroupHeaderProps) {
  const color = tone === 'up' ? 'var(--kr-up)' : 'var(--kr-down)';
  const bg = tone === 'up' ? 'var(--up-tint-1)' : 'var(--down-tint-1)';
  return (
    <div
      style={{
        padding: '7px 16px',
        background: bg,
        borderTop: divider ? '1px solid var(--border)' : 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 1,
      }}
    >
      <span style={{ color, fontSize: 11, fontWeight: 800 }}>{icon}</span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: 0.2,
        }}
      >
        {title} TOP 10
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--text-muted)',
          marginLeft: 'auto',
        }}
      >
        {count}
      </span>
    </div>
  );
}

function EmptyMover({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: '14px 16px',
        textAlign: 'center',
        fontSize: 11,
        color: 'var(--text-muted)',
      }}
    >
      {label}
    </div>
  );
}

interface MoverRowProps {
  rank: number;
  stock: StockViewModel;
  tone: 'up' | 'down';
  onOpenDetail: (code: string) => void;
}

function MoverRow({ rank, stock, tone, onOpenDetail }: MoverRowProps) {
  const color = krColor(stock.changePct);
  const a = Math.abs(stock.changePct);
  const barAlpha = moversBarAlpha(stock.changePct);
  const barColor =
    tone === 'up' ? `rgba(246,70,93,${barAlpha})` : `rgba(30,174,219,${barAlpha})`;
  const depthPct = Math.min(100, (a / 12) * 100);

  return (
    <div
      data-stock-row={stock.code}
      onClick={() => onOpenDetail(stock.code)}
      style={{
        position: 'relative',
        padding: '8px 16px',
        display: 'grid',
        gridTemplateColumns: '20px 1fr auto auto',
        gap: 10,
        alignItems: 'center',
        fontSize: 12,
        borderTop: '1px solid rgba(255,255,255,0.6)',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(${tone === 'up' ? '90deg' : '-90deg'}, ${barColor} 0%, ${barColor} ${depthPct}%, transparent ${depthPct}%)`,
          opacity: 0.35,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'relative',
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--text-muted)',
          letterSpacing: 0.4,
        }}
      >
        {String(rank).padStart(2, '0')}
      </div>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontWeight: 700,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {stock.name}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-muted)',
            letterSpacing: 0.3,
          }}
        >
          {stock.code}
        </span>
      </div>
      <div style={{ position: 'relative', fontWeight: 600, color: 'var(--text-secondary)' }}>
        {fmtPrice(stock.price)}
      </div>
      <div
        style={{
          position: 'relative',
          fontWeight: 700,
          color,
          minWidth: 56,
          textAlign: 'right',
        }}
      >
        {fmtPct(stock.changePct)}
      </div>
    </div>
  );
}
