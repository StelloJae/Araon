/**
 * SectionStack — right column of the ARAON dashboard.
 *
 * Renders sector / TOP100 views by routing on `useWatchlistStore.view`.
 *
 *   'sector' → SectorsCombinedBlock: single card, internal 2-col grid splitting
 *              theme sectors by even/odd index. No collapse / sort (compact).
 *   'top100' → KIS 등락률 순위 기반 상승/하락 TOP100 board.
 *
 * Watchlist tickers without a manual theme or KIS official index industry fall
 * into a synthetic '미분류' sector at the end.
 */

import { useEffect, useMemo, useState } from 'react';
import type { MarketTopMoversResponse } from '@shared/types';
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
        stocks={Object.keys(catalog)
          .map((ticker) => buildStockVM(ticker, catalog, quotes))
          .filter((vm): vm is StockViewModel => vm !== null)}
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
}

function SectorsCombinedBlock({
  sectors,
  stocksBySector,
  favorites,
  onToggleFav,
  onOpenDetail,
  flashSeeds,
}: SectorsCombinedBlockProps) {
  const cols: SectorMeta[][] = [
    sectors.filter((_, i) => i % 2 === 0),
    sectors.filter((_, i) => i % 2 === 1),
  ];
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: '1fr 1px 1fr',
        width: '100%',
        minWidth: 0,
      }}
    >
      {cols.map((colSectors, colIdx) => (
        <ColumnAndDivider
          key={`col-${colIdx}`}
          showDivider={colIdx === 0}
          colSectors={colSectors}
          stocksBySector={stocksBySector}
          favorites={favorites}
          onToggleFav={onToggleFav}
          onOpenDetail={onOpenDetail}
          flashSeeds={flashSeeds}
        />
      ))}
    </div>
  );
}

interface ColumnAndDividerProps {
  showDivider: boolean;
  colSectors: SectorMeta[];
  stocksBySector: Record<string, StockViewModel[]>;
  favorites: Set<string>;
  onToggleFav: (code: string) => void;
  onOpenDetail: (code: string) => void;
  flashSeeds: Record<string, number>;
}

function ColumnAndDivider({
  showDivider,
  colSectors,
  stocksBySector,
  favorites,
  onToggleFav,
  onOpenDetail,
  flashSeeds,
}: ColumnAndDividerProps) {
  return (
    <>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
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
      </div>
      {showDivider && <div style={{ background: 'var(--border)' }} />}
    </>
  );
}

// ---------- TOP100 live ranking ----------

function MarketTop100Block({
  stocks,
  onOpenTicker,
}: {
  stocks: StockViewModel[];
  onOpenTicker: (ticker: string) => void;
}) {
  const [data, setData] = useState<MarketTopMoversResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        timer = setTimeout(load, 3_000);
        return;
      }
      try {
        const next = await getMarketTopMovers({ limit: 100 });
        if (!cancelled) {
          setData(next);
          setError(null);
        }
        timer = setTimeout(load, next.refreshIntervalMs);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
        timer = setTimeout(load, 10_000);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, []);

  if (data === null) {
    return (
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 48,
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        전체 종목 TOP100 랭킹을 불러오는 중
        {error !== null && (
          <div style={{ marginTop: 8, color: 'var(--gold-text)' }}>{error}</div>
        )}
      </div>
    );
  }

  return (
    <TopMoversBoard
      data={buildLocalTopMoversFallback(data, stocks)}
      onOpenTicker={onOpenTicker}
    />
  );
}

// ---------- Helpers ----------

export function buildLocalTopMoversFallback(
  data: MarketTopMoversResponse,
  stocks: StockViewModel[],
): MarketTopMoversResponse {
  if (data.gainers.length > 0 || data.losers.length > 0) return data;
  const tradable = stocks.filter((stock) => stock.price > 0 && Number.isFinite(stock.changePct));
  const gainers = tradable
    .filter((stock) => stock.changePct > 0)
    .sort((a, b) => b.changePct - a.changePct)
    .slice(0, 100)
    .map(stockToTopMover);
  const losers = tradable
    .filter((stock) => stock.changePct < 0)
    .sort((a, b) => a.changePct - b.changePct)
    .slice(0, 100)
    .map(stockToTopMover);
  if (gainers.length === 0 && losers.length === 0) return data;
  return {
    ...data,
    status: data.status === 'ready' ? 'ready' : 'stale',
    message: 'KIS 직접 랭킹 대기 중 · 현재 화면 종목 기준으로 표시합니다.',
    gainers,
    losers,
  };
}

function stockToTopMover(stock: StockViewModel, index: number) {
  return {
    rank: index + 1,
    ticker: stock.code,
    name: stock.name,
    price: stock.price,
    changeAbs: stock.changeAbs,
    changePct: stock.changePct,
    volume: stock.volume,
  };
}

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
