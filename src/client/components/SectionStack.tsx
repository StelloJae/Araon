/**
 * SectionStack — market board of the ARAON dashboard.
 *
 * Renders sector / TOP100 views by routing on `useWatchlistStore.view`.
 *
 *   'sector' → SectorsCombinedBlock: single card, internal 2-col grid splitting
 *              theme sectors by even/odd index. No collapse / sort (compact).
 *   'top100' → Toss 웹 랭킹 기반 상승/하락 TOP100 board.
 *
 * Watchlist tickers without a manual theme or KIS official index industry fall
 * into a synthetic '미분류' sector at the end.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  MarketTopMoversMarket,
  MarketTopMoversResponse,
} from '@shared/types';
import { getMarketTopMovers } from '../lib/api-client';
import {
  buildStockVM,
  OTHERS_SECTOR_ID,
  useStocksStore,
  type SectorMeta,
} from '../stores/stocks-store';
import { useWatchlistStore } from '../stores/watchlist-store';
import { StockRow } from './StockRow';
import type { StockViewModel } from '../lib/view-models';
import { TopMoversBoard } from './TopMoversBoard';

const OTHERS_META: SectorMeta = {
  id: OTHERS_SECTOR_ID,
  name: '미분류',
  tagline: '공식 지수업종 없음',
};

const MIN_TOP100_REFRESH_INTERVAL_MS = 300;
const HIDDEN_TOP100_REFRESH_INTERVAL_MS = 3_000;
const FAILED_TOP100_REFRESH_INTERVAL_MS = 10_000;

export function normalizeMarketTop100RefreshDelayMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return MIN_TOP100_REFRESH_INTERVAL_MS;
  }
  return Math.max(MIN_TOP100_REFRESH_INTERVAL_MS, Math.trunc(value));
}

export function shouldScheduleMarketTop100Refresh(cancelled: boolean): boolean {
  return !cancelled;
}

interface SectionStackProps {
  onToggleFav: (ticker: string) => void;
  onOpenDetail: (code: string) => void;
  onOpenRankingTicker?: (ticker: string) => void;
}

export function SectionStack({
  onToggleFav,
  onOpenDetail,
  onOpenRankingTicker,
}: SectionStackProps) {
  const catalog = useStocksStore((s) => s.catalog);
  const sectors = useStocksStore((s) => s.sectors);
  const quotes = useStocksStore((s) => s.quotes);
  const flashSeeds = useStocksStore((s) => s.flashSeeds);

  const view = useWatchlistStore((s) => s.view);
  const setView = useWatchlistStore((s) => s.setView);
  const favorites = useWatchlistStore((s) => s.favorites);

  const stocksBySector = useMemo<Record<string, StockViewModel[]>>(() => {
    const sectorByName = new Map<string, SectorMeta>();
    for (const s of sectors) sectorByName.set(s.name, s);

    const buckets: Record<string, StockViewModel[]> = {};
    for (const ticker of Object.keys(catalog)) {
      const vm = buildStockVM(ticker, catalog, quotes);
      if (vm === null) continue;
      const eff = vm.effectiveSector;
      let key: string;
      if (eff.source === 'manual' && vm.sectorId !== null) {
        key = vm.sectorId;
      } else if (eff.source === 'kis-industry') {
        // If a manual sector with the same display name exists, merge into it
        // so users see one bucket regardless of classification source.
        const match = sectorByName.get(eff.name);
        key = match !== undefined ? match.id : `kis:${eff.name}`;
      } else {
        key = OTHERS_SECTOR_ID;
      }
      (buckets[key] ??= []).push(vm);
    }
    return buckets;
  }, [catalog, quotes, sectors]);

  const totalCount = Object.values(stocksBySector).reduce(
    (n, arr) => n + arr.length,
    0,
  );

  if (view === 'top100') {
    return (
      <MarketTop100Block
        view={view}
        onViewChange={setView}
        onOpenTicker={onOpenRankingTicker ?? onOpenDetail}
      />
    );
  }

  if (totalCount === 0) {
    return <EmptyState />;
  }

  // Active sector list (only non-empty buckets). Manual themes keep their
  // catalog order, then kis: buckets discovered from KIS official industry
  // classification, and 미분류 last.
  const sectorList: SectorMeta[] = (() => {
    const out: SectorMeta[] = [];
    const knownIds = new Set<string>(sectors.map((s) => s.id));
    for (const s of sectors) {
      if ((stocksBySector[s.id]?.length ?? 0) > 0) out.push(s);
    }
    for (const key of Object.keys(stocksBySector)) {
      if (key === OTHERS_SECTOR_ID || knownIds.has(key)) continue;
      if (!key.startsWith('kis:')) continue;
      out.push({
        id: key,
        name: key.slice(4),
        tagline: 'KIS 공식 지수업종',
      });
    }
    if ((stocksBySector[OTHERS_SECTOR_ID]?.length ?? 0) > 0) {
      out.push(OTHERS_META);
    }
    return out;
  })();

  // 'sector' (default) — 2-col combined card
  return (
    <SectorsCombinedBlock
      sectors={sectorList}
      stocksBySector={stocksBySector}
      favorites={favorites}
      onToggleFav={onToggleFav}
      onOpenDetail={onOpenDetail}
      flashSeeds={flashSeeds}
      view={view}
      onViewChange={setView}
    />
  );
}

// ---------- Sectors combined (2-col internal grid) ----------

interface SectorsCombinedBlockProps {
  sectors: SectorMeta[];
  stocksBySector: Record<string, StockViewModel[]>;
  favorites: Set<string>;
  onToggleFav: (code: string) => void;
  onOpenDetail: (code: string) => void;
  flashSeeds: Record<string, number>;
  view: 'sector' | 'top100';
  onViewChange: (view: 'sector' | 'top100') => void;
}

function SectorsCombinedBlock({
  sectors,
  stocksBySector,
  favorites,
  onToggleFav,
  onOpenDetail,
  flashSeeds,
  view,
  onViewChange,
}: SectorsCombinedBlockProps) {
  const cols: SectorMeta[][] = [
    sectors.filter((_, i) => i % 2 === 0),
    sectors.filter((_, i) => i % 2 === 1),
  ];
  return (
    <div
      className="market-board"
    >
      <MarketBoardHeader view={view} onViewChange={onViewChange}>
        <span className="market-board__count">{sectors.length}개 그룹</span>
      </MarketBoardHeader>
      <div className="market-board__body market-board__body--sectors">
        {cols.map((colSectors, colIdx) => (
          <div
            key={`col-${colIdx}`}
            className={colIdx === 0 ? 'market-board__column' : 'market-board__column market-board__column--divided'}
          >
            <SectorColumn
              colSectors={colSectors}
              stocksBySector={stocksBySector}
              favorites={favorites}
              onToggleFav={onToggleFav}
              onOpenDetail={onOpenDetail}
              flashSeeds={flashSeeds}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

interface SectorColumnProps {
  colSectors: SectorMeta[];
  stocksBySector: Record<string, StockViewModel[]>;
  favorites: Set<string>;
  onToggleFav: (code: string) => void;
  onOpenDetail: (code: string) => void;
  flashSeeds: Record<string, number>;
}

function SectorColumn({
  colSectors,
  stocksBySector,
  favorites,
  onToggleFav,
  onOpenDetail,
  flashSeeds,
}: SectorColumnProps) {
  return (
    <>
      {colSectors.map((sector, rowIdx) => {
        const stocks = sortByChangeDesc(stocksBySector[sector.id] ?? []);
        return (
          <div
            key={sector.id}
            style={{
              borderTop: rowIdx === 0 ? 'none' : '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
            }}
          >
            <div
              style={{
                padding: '12px 14px 8px',
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: -0.1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {sector.name}
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {sector.tagline}
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-tint)',
                  padding: '2px 7px',
                  borderRadius: 50,
                  letterSpacing: 0.3,
                  flexShrink: 0,
                }}
              >
                {stocks.length}
              </span>
            </div>
            <div>
              {stocks.map((s, i) => (
                <StockRow
                  key={s.code}
                  stock={s}
                  rank={i + 1}
                  isFav={favorites.has(s.code)}
                  onToggleFav={onToggleFav}
                  onOpenDetail={onOpenDetail}
                  flashSeed={flashSeeds[s.code] ?? 0}
                  isFirst={i === 0}
                />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

// ---------- TOP100 live ranking ----------

function MarketTop100Block({
  view,
  onViewChange,
  onOpenTicker,
}: {
  view: 'sector' | 'top100';
  onViewChange: (view: 'sector' | 'top100') => void;
  onOpenTicker: (ticker: string) => void;
}) {
  const [data, setData] = useState<MarketTopMoversResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [market, setMarket] = useState<MarketTopMoversMarket>('kr');

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setData(null);
    setError(null);

    async function load() {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        if (shouldScheduleMarketTop100Refresh(cancelled)) {
          timer = setTimeout(load, HIDDEN_TOP100_REFRESH_INTERVAL_MS);
        }
        return;
      }
      try {
        const next = await getMarketTopMovers({ limit: 100, market });
        if (cancelled) {
          return;
        }
        setData(next);
        setError(null);
        if (shouldScheduleMarketTop100Refresh(cancelled)) {
          timer = setTimeout(load, normalizeMarketTop100RefreshDelayMs(next.refreshIntervalMs));
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
        if (shouldScheduleMarketTop100Refresh(cancelled)) {
          timer = setTimeout(load, FAILED_TOP100_REFRESH_INTERVAL_MS);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [market]);

  if (data === null) {
    return (
      <div className="market-board">
        <MarketBoardHeader view={view} onViewChange={onViewChange}>
          <Top100MarketSelector market={market} onSelect={setMarket} />
        </MarketBoardHeader>
        <div className="market-board__empty">
          <span>{market === 'us' ? '미국' : '국내'} TOP100 랭킹을 불러오는 중</span>
          {error !== null && <em>{error}</em>}
        </div>
      </div>
    );
  }

  return (
    <div className="market-board">
      <MarketBoardHeader view={view} onViewChange={onViewChange}>
        <Top100MarketSelector market={market} onSelect={setMarket} />
      </MarketBoardHeader>
      <div className="market-board__body">
        <TopMoversBoard
          data={data}
          compact
          embedded
          onOpenTicker={onOpenTicker}
        />
      </div>
    </div>
  );
}

function MarketBoardHeader({
  view,
  onViewChange,
  children,
}: {
  view: 'sector' | 'top100';
  onViewChange: (view: 'sector' | 'top100') => void;
  children?: ReactNode;
}) {
  return (
    <div className="market-board__header">
      <div className="market-board__title">
        <strong>{view === 'top100' ? 'TOP100' : '섹터'}</strong>
        <span>{view === 'top100' ? '상승/하락 랭킹' : '테마/업종 그룹'}</span>
      </div>
      <div className="market-board__actions">
        <ViewModeButton view="sector" selected={view === 'sector'} onSelect={onViewChange}>
          섹터
        </ViewModeButton>
        <ViewModeButton view="top100" selected={view === 'top100'} onSelect={onViewChange}>
          TOP100
        </ViewModeButton>
        {children}
      </div>
    </div>
  );
}

function ViewModeButton({
  view,
  selected,
  onSelect,
  children,
}: {
  view: 'sector' | 'top100';
  selected: boolean;
  onSelect: (view: 'sector' | 'top100') => void;
  children: string;
}) {
  return (
    <button
      type="button"
      className={selected ? 'market-board__segment market-board__segment--active' : 'market-board__segment'}
      aria-pressed={selected}
      onClick={() => onSelect(view)}
    >
      {children}
    </button>
  );
}

function Top100MarketSelector({
  market,
  onSelect,
}: {
  market: MarketTopMoversMarket;
  onSelect: (market: MarketTopMoversMarket) => void;
}) {
  return (
    <div className="market-board__market" role="tablist" aria-label="TOP100 시장">
      <Top100MarketButton market="kr" selected={market === 'kr'} onSelect={onSelect}>
        국내
      </Top100MarketButton>
      <Top100MarketButton market="us" selected={market === 'us'} onSelect={onSelect}>
        미국
      </Top100MarketButton>
    </div>
  );
}

function Top100MarketButton({
  market,
  selected,
  onSelect,
  children,
}: {
  market: MarketTopMoversMarket;
  selected: boolean;
  onSelect: (market: MarketTopMoversMarket) => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => onSelect(market)}
      className={selected ? 'market-board__market-button market-board__market-button--active' : 'market-board__market-button'}
    >
      {children}
    </button>
  );
}

// ---------- Helpers ----------

function sortByChangeDesc(stocks: StockViewModel[]): StockViewModel[] {
  return [...stocks].sort((a, b) => b.changePct - a.changePct);
}

function EmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 64,
        color: 'var(--text-muted)',
        fontSize: 14,
      }}
    >
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
        관심종목이 없어요
      </div>
      <div>상단 검색창에서 종목명이나 종목코드를 입력해 첫 관심종목을 추가해 주세요.</div>
    </div>
  );
}
