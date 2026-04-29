/**
 * StockRow — compact list row used inside sector / tag blocks.
 *
 *   [rank] [★] [name + code/market] [price] [%pct + abs]
 *
 * Click rules:
 *   - Row click → `onOpenDetail(code)` (parent opens StockDetailModal).
 *   - Star click stops propagation and only fires `onToggleFav`.
 *
 * Hover: while the cursor is over the row, render a Sparkline of the
 * ticker's recent SSE price history. The Sparkline component itself returns
 * `null` when fewer than `MIN_POINTS_FOR_SPARKLINE` points exist, so no
 * synthetic shape is ever drawn.
 *
 * Tick flash: when `flashSeed` increments, background tints to the sentiment
 * color for 280ms (suppressed on first mount).
 *
 * `viewTransitionName: stock-${code}` enables sort animations via the View
 * Transitions API.
 */

import { useEffect, useRef, useState } from 'react';
import type { StockViewModel } from '../lib/view-models';
import {
  fmtAbs,
  fmtPct,
  fmtPrice,
  fmtVolMan,
  krColor,
  rowBarAlpha,
} from '../lib/format';
import { StarIcon } from '../lib/icons';
import { Sparkline } from './Sparkline';
import {
  selectHistory,
  usePriceHistoryStore,
} from '../stores/price-history-store';
import { describeSectorSource } from '../lib/effective-sector';

interface StockRowProps {
  stock: StockViewModel;
  rank: number | null;
  isFav: boolean;
  onToggleFav: (code: string) => void;
  onOpenDetail: (code: string) => void;
  flashSeed: number;
  isFirst: boolean;
}

export function StockRow({
  stock,
  rank,
  isFav,
  onToggleFav,
  onOpenDetail,
  flashSeed,
  isFirst,
}: StockRowProps) {
  const {
    code,
    name,
    price,
    changePct,
    changeAbs,
    volume,
    market,
    effectiveSector,
  } = stock;
  const color = krColor(changePct);
  const sectorPillColor =
    effectiveSector.source === 'fallback'
      ? 'var(--text-inactive)'
      : 'var(--text-secondary)';

  const [flash, setFlash] = useState(false);
  const [hover, setHover] = useState(false);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 280);
    return () => clearTimeout(t);
  }, [flashSeed]);

  const a = Math.abs(changePct);
  const barAlpha = rowBarAlpha(changePct);
  const barColor =
    changePct > 0
      ? `rgba(246,70,93,${barAlpha})`
      : changePct < 0
        ? `rgba(30,174,219,${barAlpha})`
        : 'transparent';
  const depthPct = Math.min(100, (a / 12) * 100);
  const dir = changePct > 0 ? '90deg' : '-90deg';

  const marketColor =
    market === 'KOSPI' ? 'var(--text-secondary)' : 'var(--text-muted)';

  const flashBg = flash
    ? changePct >= 0
      ? 'var(--up-tint-1)'
      : 'var(--down-tint-1)'
    : hover
      ? 'var(--bg-tint)'
      : 'transparent';

  const history = usePriceHistoryStore((s) => selectHistory(s, code));

  return (
    <div
      data-stock-row={code}
      onClick={() => onOpenDetail(code)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns:
          rank !== null
            ? '20px 16px minmax(0, 1fr) auto auto'
            : '16px minmax(0, 1fr) auto auto',
        gap: 8,
        alignItems: 'center',
        padding: '9px 12px',
        borderTop: isFirst ? 'none' : '1px solid var(--border-soft)',
        cursor: 'pointer',
        background: flashBg,
        transition: 'background 220ms ease',
        viewTransitionName: `stock-${code}`,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {/* depth bar */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            changePct === 0
              ? 'transparent'
              : `linear-gradient(${dir}, ${barColor} 0%, ${barColor} ${depthPct}%, transparent ${depthPct}%)`,
          opacity: 0.6,
          pointerEvents: 'none',
        }}
      />

      {rank !== null && (
        <div
          style={{
            position: 'relative',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--text-muted)',
            letterSpacing: 0.4,
            textAlign: 'right',
          }}
        >
          {String(rank).padStart(2, '0')}
        </div>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFav(code);
        }}
        style={{
          position: 'relative',
          background: 'transparent',
          border: 'none',
          padding: 0,
          lineHeight: 0,
          cursor: 'pointer',
          color: isFav ? 'var(--gold)' : 'var(--text-inactive)',
        }}
        title={isFav ? '즐겨찾기 해제' : '즐겨찾기 추가'}
        aria-pressed={isFav}
      >
        <StarIcon size={13} filled={isFav} />
      </button>

      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: 'var(--text-muted)',
              letterSpacing: 0.3,
            }}
          >
            {code}
          </span>
          <span
            style={{
              fontSize: 8,
              fontWeight: 700,
              color: marketColor,
              padding: '0 3px',
              border: '1px solid var(--border)',
              borderRadius: 3,
              letterSpacing: 0.4,
              lineHeight: 1.4,
            }}
          >
            {market}
          </span>
          <span
            title={describeSectorSource(effectiveSector.source)}
            style={{
              fontSize: 8,
              fontWeight: 700,
              color: sectorPillColor,
              padding: '0 3px',
              border: '1px solid var(--border-soft)',
              borderRadius: 3,
              letterSpacing: 0.4,
              lineHeight: 1.4,
              maxWidth: 80,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontStyle: effectiveSector.source === 'auto' ? 'italic' : 'normal',
            }}
          >
            {effectiveSector.name}
          </span>
          <span
            style={{
              fontSize: 8,
              fontWeight: 700,
              color: 'var(--text-muted)',
              padding: '0 3px',
              border: '1px solid var(--border-soft)',
              borderRadius: 3,
              lineHeight: 1.4,
              whiteSpace: 'nowrap',
            }}
          >
            거래량 {fmtVolMan(volume)}
          </span>
        </div>
      </div>

      {hover && history.length >= 2 && (
        <div
          style={{
            position: 'absolute',
            right: 140,
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            opacity: 0.85,
          }}
        >
          <Sparkline
            history={history}
            width={70}
            height={22}
            positive={changePct >= 0}
            mini
          />
        </div>
      )}

      <div
        style={{
          position: 'relative',
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--text-primary)',
          textAlign: 'right',
          minWidth: 56,
          whiteSpace: 'nowrap',
        }}
      >
        {fmtPrice(price)}
      </div>

      <div
        style={{
          position: 'relative',
          textAlign: 'right',
          minWidth: 60,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 1,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color, lineHeight: 1.1 }}>
          {fmtPct(changePct)}
        </span>
        <span style={{ fontSize: 9, fontWeight: 600, color, lineHeight: 1.1 }}>
          {changeAbs === null ? '—' : fmtAbs(changeAbs)}
        </span>
      </div>
    </div>
  );
}
