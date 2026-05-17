/**
 * StockRow — compact list row used inside sector / tag blocks.
 *
 *   [rank] [★] [name + code/market] [price] [%pct + abs]
 *
 * Click rules:
 *   - Row click → `onOpenDetail(code)` (parent opens StockDetailModal).
 *   - Star click stops propagation and only fires `onToggleFav`.
 *
 * Sparkline: render whenever real persisted/session price history is available.
 * Visible rows pre-load local day history so the mini chart can render after a
 * refresh without waiting for hover. The Sparkline component itself returns
 * `null` when fewer than `MIN_POINTS_FOR_SPARKLINE` points exist, so no
 * synthetic shape is ever drawn.
 *
 * Tick flash: when `flashSeed` increments, background tints to the sentiment
 * color for 280ms (suppressed on first mount).
 *
 * `viewTransitionName: stock-${code}` enables sort animations via the View
 * Transitions API.
 */

import { memo, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { StockViewModel } from '../lib/view-models';
import {
  fmtAbs,
  fmtPct,
  fmtPrice,
  krColor,
  rowBarAlpha,
} from '../lib/format';
import { StarIcon } from '../lib/icons';
import { Sparkline } from './Sparkline';
import {
  selectSparklineHistory,
  usePriceHistoryStore,
} from '../stores/price-history-store';
import { describeSectorSource } from '../lib/effective-sector';
import { usePersistedPriceHistory } from '../hooks/usePersistedPriceHistory';

interface StockRowProps {
  stock: StockViewModel;
  rank: number | null;
  isFav: boolean;
  onToggleFav: (code: string) => void;
  onOpenDetail: (code: string) => void;
  flashSeed: number;
  isFirst: boolean;
}

export function shouldPreloadRowPriceHistory(_input: { readonly isFav: boolean }): boolean {
  return true;
}

export function areStockRowRenderPropsEqual(
  prev: StockRowProps,
  next: StockRowProps,
): boolean {
  return (
    prev.rank === next.rank &&
    prev.isFav === next.isFav &&
    prev.flashSeed === next.flashSeed &&
    prev.isFirst === next.isFirst &&
    prev.onToggleFav === next.onToggleFav &&
    prev.onOpenDetail === next.onOpenDetail &&
    areStockRowsEqual(prev.stock, next.stock)
  );
}

function areStockRowsEqual(a: StockViewModel, b: StockViewModel): boolean {
  return (
    a.code === b.code &&
    a.name === b.name &&
    a.price === b.price &&
    a.changePct === b.changePct &&
    a.changeAbs === b.changeAbs &&
    a.market === b.market &&
    a.effectiveSector.name === b.effectiveSector.name &&
    a.effectiveSector.source === b.effectiveSector.source
  );
}

function StockRowComponent({
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
    market,
    effectiveSector,
  } = stock;
  const color = krColor(changePct);
  const sectorPillColor =
    effectiveSector.source === 'unclassified'
      ? 'var(--text-inactive)'
      : 'var(--text-secondary)';

  const [flash, setFlash] = useState(false);
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
    : null;

  const history = usePriceHistoryStore((s) => selectSparklineHistory(s, code));
  usePersistedPriceHistory(code, shouldPreloadRowPriceHistory({ isFav }));

  const rowStyle: CSSProperties = {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns:
      rank !== null
        ? '20px 16px minmax(0, 1fr) 78px auto auto'
        : '16px minmax(0, 1fr) 78px auto auto',
    gap: 8,
    alignItems: 'center',
    padding: '9px 12px',
    borderTop: isFirst ? 'none' : '1px solid var(--border-soft)',
    cursor: 'pointer',
    viewTransitionName: `stock-${code}`,
    fontVariantNumeric: 'tabular-nums',
  };
  if (flashBg !== null) {
    (rowStyle as CSSProperties & { '--stock-row-bg': string })[
      '--stock-row-bg'
    ] = flashBg;
  }

  return (
    <div
      className="stock-row-interactive"
      data-stock-row={code}
      data-flashing={flash ? 'true' : undefined}
      onClick={() => onOpenDetail(code)}
      style={rowStyle}
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
              fontStyle:
                effectiveSector.source === 'kis-industry' ? 'italic' : 'normal',
            }}
          >
            {effectiveSector.name}
          </span>
        </div>
      </div>

      <div
        style={{
          width: 78,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          opacity: 0.85,
        }}
      >
        {history.length >= 2 && (
          <Sparkline
            history={history}
            width={70}
            height={22}
            positive={changePct >= 0}
            mini
          />
        )}
      </div>

      <div
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

export const StockRow = memo(StockRowComponent, areStockRowRenderPropsEqual);
StockRow.displayName = 'StockRow';
