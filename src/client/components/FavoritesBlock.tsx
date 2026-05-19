/**
 * FavoritesBlock — compact watchlist surface. Membership comes from Araon's
 * normalized watchlist model; realtime tracking is only a speed-state badge.
 *
 * Layout:
 *   [★ 즐겨찾기] [sync · tracking summary]
 *   ── scrollable list of FavRow (no rank, no market badge)
 *
 * Sorted by changePct desc. Capped at 30 visible rows + "+N개 더" footer.
 * Each row has a 600ms tinted-background flash on incoming tick. Rows show a
 * Sparkline whenever real persisted/session price history is available
 * (rendered only when ≥2 real points exist; never synthesized).
 *
 * Click rules: row click opens StockDetailModal via `onOpenDetail`; star
 * click stops propagation and only toggles favorite.
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { fmtPct, fmtPrice, krColor } from '../lib/format';
import { StarIcon } from '../lib/icons';
import { Sparkline } from './Sparkline';
import {
  selectSparklineHistory,
  usePriceHistoryStore,
} from '../stores/price-history-store';
import type { StockViewModel } from '../lib/view-models';
import type { AraonWatchlistItem, KisWsSlotStatusPayload } from '../lib/api-client';
import { usePersistedPriceHistory } from '../hooks/usePersistedPriceHistory';

interface FavoritesBlockProps {
  stocks: ReadonlyArray<StockViewModel>;
  favorites: Set<string>;
  watchlistMembers?: Set<string>;
  watchlistItemsByCode?: Readonly<Record<string, AraonWatchlistItem>>;
  onToggleFav: (code: string) => void;
  onOpenDetail: (code: string) => void;
  flashSeeds: Record<string, number>;
  kisStatus?: KisWsSlotStatusPayload | null;
  kisLoading?: boolean;
  kisError?: string | null;
  flush?: boolean;
}

const MAX_VISIBLE = 30;

export function FavoritesBlock({
  stocks,
  favorites,
  watchlistMembers = favorites,
  watchlistItemsByCode = {},
  onToggleFav,
  onOpenDetail,
  flashSeeds,
  kisStatus = null,
  kisLoading = false,
  kisError = null,
  flush = false,
}: FavoritesBlockProps) {
  const favStocks = useMemo(
    () =>
      stocks
        .filter((s) => favorites.has(s.code))
        .slice()
        .sort((a, b) => b.changePct - a.changePct),
    [stocks, favorites],
  );
  const watchlistOnlyItems = useMemo(() => {
    const stockCodes = new Set(favStocks.map((stock) => stock.code));
    return Array.from(favorites)
      .filter((code) => !stockCodes.has(code))
      .map((code) => watchlistItemsByCode[code])
      .filter((item): item is AraonWatchlistItem => item !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [favStocks, favorites, watchlistItemsByCode]);
  const visibleWatchlistOnlyItems = useMemo(
    () => watchlistOnlyItems.filter(shouldShowWatchlistOnlyRow),
    [watchlistOnlyItems],
  );

  const visibleStocks = favStocks.slice(0, MAX_VISIBLE);
  const visibleWatchlistOnly = visibleWatchlistOnlyItems.slice(
    0,
    Math.max(0, MAX_VISIBLE - visibleStocks.length),
  );
  const displayRowCount = favStocks.length + visibleWatchlistOnlyItems.length;
  const pendingHidden = watchlistOnlyItems.length - visibleWatchlistOnlyItems.length;
  const rowCount = favStocks.length + watchlistOnlyItems.length;
  const hidden = Math.max(0, displayRowCount - MAX_VISIBLE);
  const syncLabel = useMemo(
    () => watchlistSyncLabel(watchlistMembers, watchlistItemsByCode),
    [watchlistMembers, watchlistItemsByCode],
  );
  const realtimeLabel = kisRealtimeLabel(
    kisStatus,
    kisLoading,
    kisError,
    favorites,
    watchlistItemsByCode,
  );
  const headerStatus = favoriteHeaderStatus(syncLabel, realtimeLabel);
  const kisCandidateByTicker = useMemo(() => {
    const map = new Map<string, KisWsSlotStatusPayload['candidates'][number]>();
    for (const candidate of kisStatus?.candidates ?? []) {
      map.set(candidate.ticker, candidate);
    }
    return map;
  }, [kisStatus]);

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: flush ? 'none' : '1px solid var(--border)',
        borderRadius: flush ? 0 : 12,
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
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          즐겨찾기
        </div>
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            minWidth: 0,
            flex: '1 1 auto',
            justifyContent: 'flex-end',
          }}
        >
          {headerStatus !== null && (
            <span style={headerStatusBadgeStyle(headerStatus.tone)} title={headerStatus.title}>
              {headerStatus.text}
            </span>
          )}
        </div>
      </div>
      <div
        className="favorites-block__list"
        style={{ overflowY: 'auto', minHeight: 0, flex: '1 1 0' }}
      >
        {rowCount === 0 ? (
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
        ) : displayRowCount === 0 ? (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              fontSize: 12,
              color: 'var(--text-muted)',
            }}
          >
            표시 가능한 가격을 수집 중
          </div>
        ) : (
          <>
            {visibleStocks.map((s, i) => (
              <MemoFavRow
                key={s.code}
                stock={s}
                isWatchlistMember={watchlistMembers.has(s.code)}
                watchlistItem={watchlistItemsByCode[s.code] ?? null}
                onToggleFav={onToggleFav}
                onOpenDetail={onOpenDetail}
                flashSeed={flashSeeds[s.code] ?? 0}
                isFirst={i === 0}
                kisCandidate={kisCandidateByTicker.get(s.code) ?? null}
                kisEnabled={kisStatus?.enabled === true}
              />
            ))}
            {visibleWatchlistOnly.map((item, i) => (
              <WatchlistOnlyRow
                key={item.productCode}
                item={item}
                isFirst={visibleStocks.length === 0 && i === 0}
                onOpenDetail={onOpenDetail}
                onToggleFav={onToggleFav}
              />
            ))}
            {pendingHidden > 0 && (
              <div
                title="아직 가격 또는 차트가 준비되지 않은 항목은 즐겨찾기 본문에서 잠시 숨깁니다."
                style={{
                  padding: '8px 14px',
                  textAlign: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  borderTop: '1px solid var(--border-soft)',
                  letterSpacing: 0.1,
                }}
              >
                수집 지연 {pendingHidden}개
              </div>
            )}
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

function WatchlistOnlyRow({
  item,
  isFirst,
  onOpenDetail,
  onToggleFav,
}: {
  item: AraonWatchlistItem;
  isFirst: boolean;
  onOpenDetail: (code: string) => void;
  onToggleFav: (code: string) => void;
}) {
  const code = item.krTicker ?? item.symbol;
  const quoteKey = item.krTicker ?? item.productCode;
  const subscribedHistory = usePriceHistoryStore((s) => selectSparklineHistory(s, quoteKey));
  const history = subscribedHistory.length > 0
    ? subscribedHistory
    : selectSparklineHistory(usePriceHistoryStore.getState(), quoteKey);
  usePersistedPriceHistory(quoteKey, shouldPreloadWatchlistOnlyPriceHistory(item));
  const latestPoint = history.at(-1);
  const displayPrice =
    displayableWatchlistPrice(latestPoint?.price ?? null) ??
    displayableWatchlistPrice(item.last);
  const priceText = displayPrice !== null
    ? fmtPrice(displayPrice)
    : pendingWatchlistPriceText(item);
  const changePct = watchlistOnlyChangePct(item, history, latestPoint, displayPrice);
  const stateText = compactWatchlistOnlyStateText(item);
  const starLocked = item.holding && !item.watchlistMember;
  const starFilled = item.watchlistMember || item.holding;
  return (
    <div
      className="stock-row-interactive"
      role={item.chartEligible ? 'button' : undefined}
      tabIndex={item.chartEligible ? 0 : undefined}
      onClick={item.chartEligible ? () => onOpenDetail(code) : undefined}
      onKeyDown={
        item.chartEligible
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpenDetail(code);
              }
            }
          : undefined
      }
      style={{
        position: 'relative',
        padding: '8px 14px',
        display: 'grid',
        gridTemplateColumns: '18px minmax(0, 1fr) 72px minmax(70px, auto)',
        gap: 8,
        alignItems: 'center',
        fontSize: 12,
        borderTop: isFirst ? 'none' : '1px solid var(--border-soft)',
        opacity: item.chartEligible ? 1 : 0.82,
        cursor: item.chartEligible ? 'pointer' : 'default',
      }}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          if (starLocked) return;
          onToggleFav(code);
        }}
        disabled={starLocked}
        style={{
          width: 18,
          height: 18,
          padding: 0,
          border: 'none',
          background: 'transparent',
          cursor: starLocked ? 'not-allowed' : 'pointer',
          color: 'var(--gold)',
          opacity: starLocked ? 0.68 : 1,
          lineHeight: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title={
          starLocked
            ? '보유 종목은 자동 유지됩니다'
            : item.watchlistMember
              ? 'Toss 즐겨찾기 해제'
              : 'Toss 즐겨찾기 추가'
        }
        aria-pressed={starFilled}
      >
        <StarIcon size={14} filled={starFilled} />
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 800,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {item.name}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            minWidth: 0,
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--text-muted)',
            letterSpacing: 0.3,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {code}
          </span>
          {stateText !== null && <span style={{ flex: '0 0 auto' }}>{stateText}</span>}
        </span>
      </div>
      <div
        style={{
          width: 72,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        {history.length >= 2 && (
          <Sparkline
            history={history}
            width={64}
            height={20}
            positive={changePct === null || changePct >= 0}
            mini
          />
        )}
      </div>
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
            fontWeight: 800,
            color: 'var(--text-secondary)',
            fontSize: 13,
            lineHeight: 1.15,
          }}
        >
          {priceText}
        </span>
        {changePct !== null && (
          <span
            style={{
              fontWeight: 800,
              color: krColor(changePct),
              fontSize: 12,
              lineHeight: 1.15,
            }}
          >
            {fmtPct(changePct)}
          </span>
        )}
        {displayPrice !== null && changePct === null && (
          <span
            style={{
              fontWeight: 800,
              color: 'var(--text-muted)',
              fontSize: 11,
              lineHeight: 1.15,
            }}
          >
            등락률 수집 중
          </span>
        )}
      </div>
    </div>
  );
}

function shouldShowWatchlistOnlyRow(item: AraonWatchlistItem): boolean {
  if (item.holding) return true;
  return displayableWatchlistPrice(item.last) !== null;
}

export function shouldPreloadWatchlistOnlyPriceHistory(item: AraonWatchlistItem): boolean {
  return item.krTicker !== null && item.chartEligible;
}

function pendingWatchlistPriceText(item: AraonWatchlistItem): string {
  return item.quoteEligible ? '수집 지연' : '지원 대기';
}

function compactWatchlistOnlyStateText(item: AraonWatchlistItem): string | null {
  if (item.syncState === 'sync_failed') return '확인 필요';
  if (item.syncState === 'sync_pending' && item.autoSyncedFromHolding) return '동기화 대기';
  return null;
}

function displayableWatchlistPrice(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function watchlistOnlyChangePct(
  item: AraonWatchlistItem,
  history: ReadonlyArray<{ price: number; changePct: number }>,
  latestPoint: { price: number; changePct: number } | undefined,
  displayPrice: number | null,
): number | null {
  if (typeof item.changePct === 'number' && Number.isFinite(item.changePct)) {
    return item.changePct;
  }
  const historyChangePct = deriveHistoryChangePct(history);
  if (historyChangePct !== null) return historyChangePct;
  if (
    latestPoint !== undefined &&
    Number.isFinite(latestPoint.changePct)
  ) {
    return latestPoint.changePct;
  }
  if (item.base !== null && item.base > 0 && displayPrice !== null) {
    return ((displayPrice - item.base) / item.base) * 100;
  }
  return null;
}

function deriveHistoryChangePct(
  history: ReadonlyArray<{ price: number }>,
): number | null {
  if (history.length < 2) return null;
  const first = history.find((point) => Number.isFinite(point.price) && point.price > 0);
  const last = [...history]
    .reverse()
    .find((point) => Number.isFinite(point.price) && point.price > 0);
  if (first === undefined || last === undefined || first.price <= 0) return null;
  if (first.price === last.price) return null;
  return ((last.price - first.price) / first.price) * 100;
}

interface FavRowProps {
  stock: StockViewModel;
  isWatchlistMember: boolean;
  watchlistItem: AraonWatchlistItem | null;
  onToggleFav: (code: string) => void;
  onOpenDetail: (code: string) => void;
  flashSeed: number;
  isFirst: boolean;
  kisCandidate: KisWsSlotStatusPayload['candidates'][number] | null;
  kisEnabled: boolean;
}

function FavRow({
  stock,
  isWatchlistMember,
  watchlistItem,
  onToggleFav,
  onOpenDetail,
  flashSeed,
  isFirst,
  kisCandidate,
  kisEnabled,
}: FavRowProps) {
  const { code, name, price, changePct } = stock;
  const color = krColor(changePct);
  const metaText = watchlistRowMetaText(watchlistItem, isWatchlistMember);
  const starLocked = watchlistItem?.holding === true && !isWatchlistMember;
  const starFilled = isWatchlistMember || watchlistItem?.holding === true;

  const [flash, setFlash] = useState(false);
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
    : null;

  const history = usePriceHistoryStore((s) => selectSparklineHistory(s, code));
  usePersistedPriceHistory(code, true);

  const rowStyle: CSSProperties = {
    position: 'relative',
    padding: '8px 14px',
    display: 'grid',
    gridTemplateColumns: '18px minmax(0, 1fr) 72px minmax(70px, auto)',
    gap: 8,
    alignItems: 'center',
    fontSize: 12,
    borderTop: isFirst ? 'none' : '1px solid var(--border-soft)',
    cursor: 'pointer',
  };
  (rowStyle as CSSProperties & { '--stock-row-transition': string })[
    '--stock-row-transition'
  ] = 'background 0.5s ease';
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
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (starLocked) return;
          onToggleFav(code);
        }}
        disabled={starLocked}
        style={{
          width: 18,
          height: 18,
          padding: 0,
          background: 'transparent',
          border: 'none',
          cursor: starLocked ? 'not-allowed' : 'pointer',
          color: starFilled ? 'var(--gold)' : 'var(--text-muted)',
          opacity: starLocked ? 0.68 : 1,
          lineHeight: 0,
        }}
        title={
          starLocked
            ? '보유 종목은 자동 유지됩니다'
            : isWatchlistMember
              ? 'Toss 즐겨찾기 해제'
              : 'Toss 즐겨찾기 추가'
        }
        aria-pressed={starFilled}
      >
        <StarIcon size={14} filled={starFilled} />
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 800,
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
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            minWidth: 0,
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--text-muted)',
            letterSpacing: 0.3,
          }}
        >
          <span>{code}</span>
          {metaText !== null && <span>{metaText}</span>}
          <KisRowBadge candidate={kisCandidate} enabled={kisEnabled} />
        </span>
      </div>
      <div
        style={{
          width: 72,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        {history.length >= 2 && (
          <Sparkline
            history={history}
            width={64}
            height={20}
            positive={changePct >= 0}
            mini
          />
        )}
      </div>
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
            fontWeight: 800,
            color: 'var(--text-secondary)',
            fontSize: 13,
            lineHeight: 1.15,
          }}
        >
          {fmtPrice(price)}
        </span>
        <span
          style={{
            fontWeight: 800,
            color,
            fontSize: 12,
            lineHeight: 1.15,
          }}
        >
          {fmtPct(changePct)}
        </span>
      </div>
    </div>
  );
}

function watchlistRowMetaText(
  item: AraonWatchlistItem | null,
    _isWatchlistMember: boolean,
): string | null {
  if (item === null) return null;
  if (item.holding && !item.watchlistMember) return '보유';
  if (!item.watchlistMember) return null;
  if (item.syncState === 'sync_failed') return '확인 필요';
  if (item.syncState === 'sync_unavailable') return '지원 대기';
  return null;
}

const MemoFavRow = memo(FavRow, areFavRowPropsEqual);
MemoFavRow.displayName = 'FavRow';

function KisRowBadge({
  candidate,
  enabled,
}: {
  candidate: KisWsSlotStatusPayload['candidates'][number] | null;
  enabled: boolean;
}) {
  const tone = !enabled
    ? 'muted'
    : candidate?.state === 'subscribed'
      ? 'live'
      : candidate?.state === 'fallback'
        ? 'warn'
        : 'muted';
  const label = !enabled
    ? '비실시간'
    : candidate?.state === 'subscribed'
      ? '실시간 추적'
      : candidate?.state === 'fallback'
        ? '추적 대기'
        : '추적 준비 중';
  return <span style={rowBadgeStyle(tone)} title={label} aria-label={label} />;
}

function rowBadgeStyle(tone: 'live' | 'warn' | 'muted'): CSSProperties {
  const color =
    tone === 'live'
      ? 'var(--kr-up)'
      : tone === 'warn'
        ? 'var(--gold-text)'
        : 'var(--text-muted)';
  const bg =
    tone === 'live'
      ? 'var(--up-tint-1)'
      : tone === 'warn'
        ? 'var(--gold-soft)'
        : 'var(--bg-tint)';
  return {
    display: 'inline-flex',
    alignItems: 'center',
    width: 6,
    height: 6,
    borderRadius: '50%',
    color,
    background: bg,
    boxShadow: `0 0 0 2px ${bg}`,
    flex: '0 0 auto',
  };
}

function kisRealtimeLabel(
  status: KisWsSlotStatusPayload | null,
  loading: boolean,
  error: string | null,
  favorites: Set<string>,
  itemsByCode: Readonly<Record<string, AraonWatchlistItem>>,
): string {
  if (error !== null) return '추적 대기';
  if (loading) return '추적 확인 중';
  if (status === null) return `관심 ${favorites.size}`;
  if (!status.enabled) return '추적 꺼짐';

  const eligibleFavorites = Array.from(favorites).filter((code) => {
    const item = itemsByCode[code];
    if (item !== undefined) return item.kisEligible;
    return /^\d{6}$/.test(code);
  });
  if (eligibleFavorites.length === 0) return '추적 없음';

  const favoriteCodes = new Set(eligibleFavorites);
  const subscribed = status.candidates.filter(
    (candidate) => candidate.state === 'subscribed' && favoriteCodes.has(candidate.ticker),
  ).length;
  return `실시간 추적 ${subscribed}/${eligibleFavorites.length}`;
}

function watchlistSyncLabel(
  favorites: Set<string>,
  itemsByCode: Readonly<Record<string, AraonWatchlistItem>>,
): { text: string; title: string; tone: 'synced' | 'pending' | 'error' | 'muted' } | null {
  const codes = Array.from(favorites);
  if (codes.length === 0) return null;
  const items = codes
    .map((code) => itemsByCode[code])
    .filter((item): item is AraonWatchlistItem => item !== undefined);
  if (items.length === 0) {
    return {
      text: '상태 확인 중',
      title: '즐겨찾기 동기화 상태를 확인하고 있습니다.',
      tone: 'muted',
    };
  }

  const tossSynced = items.filter((item) => item.syncState === 'toss_synced').length;
  const localOnly = items.filter((item) => item.syncState === 'local_only').length;
  const pending = items.filter((item) => item.syncState === 'sync_pending').length;
  const unavailable = items.filter((item) => item.syncState === 'sync_unavailable').length;
  const failed = items.filter((item) => item.syncState === 'sync_failed').length;

  if (failed > 0) {
    return {
      text: `동기화 실패 ${failed}`,
      title: '일부 즐겨찾기 동기화가 실패했습니다.',
      tone: 'error',
    };
  }
  if (pending > 0) {
    return {
      text: `동기화 대기 ${pending}`,
      title: '일부 즐겨찾기 변경이 Toss 동기화를 기다리고 있습니다.',
      tone: 'pending',
    };
  }
  if (tossSynced > 0) {
    return {
      text: tossSynced === codes.length ? 'Toss 동기화' : `Toss ${tossSynced}/${codes.length}`,
      title: 'Toss watchlist에서 읽은 즐겨찾기입니다.',
      tone: 'synced',
    };
  }
  if (unavailable > 0) {
    return {
      text: `지원 대기 ${unavailable}`,
      title: '일부 상품은 아직 Toss 즐겨찾기 동기화를 지원하지 않습니다.',
      tone: 'pending',
    };
  }
  if (localOnly > 0) {
    return {
      text: `로컬 보관 ${localOnly}/${codes.length}`,
      title: 'Toss 세션이나 mutation 지원 전까지 로컬에 보관된 즐겨찾기입니다.',
      tone: 'pending',
    };
  }
  return {
    text: '상태 확인 중',
    title: '즐겨찾기 동기화 상태를 확인하고 있습니다.',
    tone: 'muted',
  };
}

function favoriteHeaderStatus(
  syncLabel: { text: string; title: string; tone: 'synced' | 'pending' | 'error' | 'muted' } | null,
  realtimeLabel: string,
): { text: string; title: string; tone: 'synced' | 'pending' | 'error' | 'muted' } | null {
  if (syncLabel === null && realtimeLabel.length === 0) return null;

  const text = [syncLabel !== null ? compactSyncLabel(syncLabel.text) : null, compactRealtimeLabel(realtimeLabel)]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(' · ');
  const title = [
    syncLabel !== null ? `${syncLabel.text}: ${syncLabel.title}` : null,
    realtimeLabel,
  ]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(' · ');

  return {
    text,
    title,
    tone: syncLabel?.tone ?? 'muted',
  };
}

function compactSyncLabel(text: string): string {
  return text
    .replace(/^동기화\s+대기/, '동기화 대기')
    .replace(/^동기화\s+실패/, '동기화 실패')
    .replace(/^Toss\s+동기화$/, 'Toss 동기화')
    .replace(/^로컬\s+보관/, '로컬');
}

function compactRealtimeLabel(text: string): string {
  return text
    .replace(/^실시간\s+추적/, '추적')
    .replace(/^추적\s+확인\s+중$/, '추적 확인');
}

function headerStatusBadgeStyle(
  tone: 'synced' | 'pending' | 'error' | 'muted',
): CSSProperties {
  return {
    ...syncBadgeStyle(tone),
    maxWidth: '100%',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flexShrink: 1,
  };
}

function syncBadgeStyle(tone: 'synced' | 'pending' | 'error' | 'muted'): CSSProperties {
  const color =
    tone === 'synced'
      ? 'var(--kr-up)'
      : tone === 'error'
        ? 'var(--accent)'
        : tone === 'pending'
          ? 'var(--gold-text)'
          : 'var(--text-muted)';
  const background =
    tone === 'synced'
      ? 'var(--up-tint-1)'
      : tone === 'error'
        ? 'var(--accent-soft)'
        : tone === 'pending'
          ? 'var(--gold-soft)'
          : 'var(--bg-tint)';
  return {
    fontSize: 10,
    fontWeight: 700,
    color,
    background,
    padding: '2px 7px',
    borderRadius: 50,
    letterSpacing: 0.3,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };
}

function areFavRowPropsEqual(prev: FavRowProps, next: FavRowProps): boolean {
  return (
    prev.flashSeed === next.flashSeed &&
    prev.isFirst === next.isFirst &&
    prev.isWatchlistMember === next.isWatchlistMember &&
    prev.watchlistItem?.holding === next.watchlistItem?.holding &&
    prev.watchlistItem?.syncState === next.watchlistItem?.syncState &&
    prev.kisEnabled === next.kisEnabled &&
    prev.kisCandidate?.state === next.kisCandidate?.state &&
    prev.onToggleFav === next.onToggleFav &&
    prev.onOpenDetail === next.onOpenDetail &&
    prev.stock.code === next.stock.code &&
    prev.stock.name === next.stock.name &&
    prev.stock.price === next.stock.price &&
    prev.stock.changePct === next.stock.changePct
  );
}
