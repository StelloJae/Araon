/**
 * FavoritesBlock — sticky middle column showing the user's WS-subscribed
 * tickers.
 *
 * Layout:
 *   [★ 즐겨찾기] [WS·N gold pill]
 *   ── scrollable list of FavRow (no rank, no market badge)
 *
 * Sorted by changePct desc. Capped at 30 visible rows + "+N개 더" footer.
 * Each row has a 600ms tinted-background flash on incoming tick. Hovering a
 * row shows a Sparkline of that ticker's recent SSE price history (rendered
 * only when ≥2 real points exist; never synthesized).
 *
 * Click rules: row click opens StockDetailModal via `onOpenDetail`; star
 * click stops propagation and only toggles favorite.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtPct, fmtPrice, krColor } from '../lib/format';
import { StarIcon } from '../lib/icons';
import { Sparkline } from './Sparkline';
import {
  selectHistory,
  usePriceHistoryStore,
} from '../stores/price-history-store';
import type { StockViewModel } from '../lib/view-models';

interface FavoritesBlockProps {
  stocks: ReadonlyArray<StockViewModel>;
  favorites: Set<string>;
  onToggleFav: (code: string) => void;
  onOpenDetail: (code: string) => void;
  flashSeeds: Record<string, number>;
}

const MAX_VISIBLE = 30;

export function FavoritesBlock({
  stocks,
  favorites,
  onToggleFav,
  onOpenDetail,
  flashSeeds,
}: FavoritesBlockProps) {
  const favStocks = useMemo(
    () =>
      stocks
        .filter((s) => favorites.has(s.code))
        .slice()
        .sort((a, b) => b.changePct - a.changePct),
    [stocks, favorites],
  );

  const visible = favStocks.slice(0, MAX_VISIBLE);
  const hidden = Math.max(0, favStocks.length - MAX_VISIBLE);

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        flex: '1 1 0',
        minHeight: 0,
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <span style={{ color: 'var(--gold)', lineHeight: 0, flexShrink: 0 }}>
          <StarIcon size={16} filled />
        </span>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: -0.1,
          }}
        >
          즐겨찾기
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--gold-text)',
            background: 'var(--gold-soft)',
            padding: '2px 7px',
            borderRadius: 50,
            letterSpacing: 0.3,
            marginLeft: 'auto',
            flexShrink: 0,
          }}
        >
          WS · {favStocks.length}
        </span>
      </div>
      <div style={{ overflowY: 'auto', minHeight: 0, flex: '1 1 0' }}>
        {favStocks.length === 0 ? (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              fontSize: 12,
              color: 'var(--text-muted)',
            }}
          >
            즐겨찾기한 종목 없음
          </div>
        ) : (
          <>
            {visible.map((s, i) => (
              <FavRow
                key={s.code}
                stock={s}
                onToggleFav={onToggleFav}
                onOpenDetail={onOpenDetail}
                flashSeed={flashSeeds[s.code] ?? 0}
                isFirst={i === 0}
              />
            ))}
            {hidden > 0 && (
              <div
                style={{
                  padding: '10px 14px',
                  textAlign: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  borderTop: '1px solid var(--border-soft)',
                  letterSpacing: 0.3,
                }}
              >
                + {hidden}개 더
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface FavRowProps {
  stock: StockViewModel;
  onToggleFav: (code: string) => void;
  onOpenDetail: (code: string) => void;
  flashSeed: number;
  isFirst: boolean;
}

function FavRow({
  stock,
  onToggleFav,
  onOpenDetail,
  flashSeed,
  isFirst,
}: FavRowProps) {
  const { code, name, price, changePct } = stock;
  const color = krColor(changePct);

  const [flash, setFlash] = useState(false);
  const [hover, setHover] = useState(false);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (flashSeed === 0) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 600);
    return () => clearTimeout(t);
  }, [flashSeed]);

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
        padding: '8px 14px',
        display: 'grid',
        gridTemplateColumns: '18px 1fr auto',
        gap: 8,
        alignItems: 'center',
        fontSize: 12,
        borderTop: isFirst ? 'none' : '1px solid var(--border-soft)',
        background: flashBg,
        transition: 'background 0.5s ease',
        cursor: 'pointer',
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFav(code);
        }}
        style={{
          width: 18,
          height: 18,
          padding: 0,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--gold)',
          lineHeight: 0,
        }}
        title="즐겨찾기 해제"
        aria-pressed
      >
        <StarIcon size={14} filled />
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span
          style={{
            fontWeight: 700,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-muted)',
            letterSpacing: 0.3,
          }}
        >
          {code}
        </span>
      </div>
      {hover && history.length >= 2 && (
        <div
          style={{
            position: 'absolute',
            right: 96,
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
          }}
        >
          <Sparkline
            history={history}
            width={64}
            height={20}
            positive={changePct >= 0}
            mini
          />
        </div>
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          minWidth: 70,
        }}
      >
        <span
          style={{
            fontWeight: 600,
            color: 'var(--text-secondary)',
            fontSize: 12,
            lineHeight: 1.15,
          }}
        >
          {fmtPrice(price)}
        </span>
        <span
          style={{
            fontWeight: 700,
            color,
            fontSize: 11,
            lineHeight: 1.15,
          }}
        >
          {fmtPct(changePct)}
        </span>
      </div>
    </div>
  );
}
