/**
 * SectionStack — right column of the ARAON dashboard.
 *
 * Renders sector / tag / mixed views by routing on `useWatchlistStore.view`.
 *
 *   'sector' → SectorsCombinedBlock: single card, internal 2-col grid splitting
 *              theme sectors by even/odd index. No collapse / sort (compact).
 *   'tag'    → TagView: KOSPI / KOSDAQ buckets with #pill headers (backend has
 *              no tag catalog yet — markets are the closest substitute).
 *   'mixed'  → MixedView: each sector as its own SectorBlock with header,
 *              sort dropdown, and collapse chevron.
 *
 * Watchlist tickers that don't map to any backend theme bucket fall into
 * a synthetic '기타' sector at the end.
 */

import { useMemo } from 'react';
import {
  buildStockVM,
  OTHERS_SECTOR_ID,
  useStocksStore,
  type SectorMeta,
} from '../stores/stocks-store';
import { useWatchlistStore } from '../stores/watchlist-store';
import { StockRow } from './StockRow';
import { SectionHeader } from './SectionHeader';
import type { SortKey, StockViewModel } from '../lib/view-models';

const OTHERS_META: SectorMeta = {
  id: OTHERS_SECTOR_ID,
  name: '기타',
  tagline: '테마 미분류',
};

interface SectionStackProps {
  onToggleFav: (ticker: string) => void;
  onOpenDetail: (code: string) => void;
}

export function SectionStack({ onToggleFav, onOpenDetail }: SectionStackProps) {
  const catalog = useStocksStore((s) => s.catalog);
  const sectors = useStocksStore((s) => s.sectors);
  const quotes = useStocksStore((s) => s.quotes);
  const flashSeeds = useStocksStore((s) => s.flashSeeds);

  const view = useWatchlistStore((s) => s.view);
  const favorites = useWatchlistStore((s) => s.favorites);
  const collapsed = useWatchlistStore((s) => s.collapsed);
  const sortKeys = useWatchlistStore((s) => s.sortKeys);
  const toggleCollapsed = useWatchlistStore((s) => s.toggleCollapsed);
  const setSortKey = useWatchlistStore((s) => s.setSortKey);

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
      } else if (eff.source === 'auto') {
        // If a manual sector with the same display name exists, merge into it
        // so users see one '반도체' bucket regardless of classification source.
        const match = sectorByName.get(eff.name);
        key = match !== undefined ? match.id : `auto:${eff.name}`;
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

  if (totalCount === 0) {
    return <EmptyState />;
  }

  // Active sector list (only non-empty buckets). Manual themes keep their
  // catalog order, then auto: buckets discovered from autoSector classification,
  // and 기타 last.
  const sectorList: SectorMeta[] = (() => {
    const out: SectorMeta[] = [];
    const knownIds = new Set<string>(sectors.map((s) => s.id));
    for (const s of sectors) {
      if ((stocksBySector[s.id]?.length ?? 0) > 0) out.push(s);
    }
    for (const key of Object.keys(stocksBySector)) {
      if (key === OTHERS_SECTOR_ID || knownIds.has(key)) continue;
      if (!key.startsWith('auto:')) continue;
      out.push({
        id: key,
        name: key.slice(5),
        tagline: 'KRX 업종 자동 분류',
      });
    }
    if ((stocksBySector[OTHERS_SECTOR_ID]?.length ?? 0) > 0) {
      out.push(OTHERS_META);
    }
    return out;
  })();

  if (view === 'tag') {
    const allStocks = Object.values(stocksBySector).flat();
    const buckets: Array<{ id: string; title: string; stocks: StockViewModel[] }> = [
      { id: 'KOSPI',  title: 'KOSPI',  stocks: allStocks.filter((s) => s.market === 'KOSPI') },
      { id: 'KOSDAQ', title: 'KOSDAQ', stocks: allStocks.filter((s) => s.market === 'KOSDAQ') },
    ].filter((b) => b.stocks.length > 0);
    return (
      <>
        {buckets.map((bucket) => (
          <TagBlock
            key={bucket.id}
            tag={bucket.title}
            stocks={bucket.stocks}
            favorites={favorites}
            onToggleFav={onToggleFav}
            onOpenDetail={onOpenDetail}
            flashSeeds={flashSeeds}
          />
        ))}
      </>
    );
  }

  if (view === 'mixed') {
    return (
      <>
        {sectorList.map((sector) => (
          <SectorBlock
            key={sector.id}
            sector={sector}
            stocks={stocksBySector[sector.id] ?? []}
            favorites={favorites}
            onToggleFav={onToggleFav}
            onOpenDetail={onOpenDetail}
            flashSeeds={flashSeeds}
            collapsed={collapsed[sector.id] === true}
            onToggleCollapsed={() => toggleCollapsed(sector.id)}
            sortKey={sortKeys[sector.id] ?? 'changeDesc'}
            onSortChange={(k) => setSortKey(sector.id, k)}
          />
        ))}
      </>
    );
  }

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

// ---------- SectorBlock (mixed view: header + body per sector) ----------

interface SectorBlockProps {
  sector: SectorMeta;
  stocks: StockViewModel[];
  favorites: Set<string>;
  onToggleFav: (code: string) => void;
  onOpenDetail: (code: string) => void;
  flashSeeds: Record<string, number>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  sortKey: SortKey;
  onSortChange: (k: SortKey) => void;
}

function SectorBlock({
  sector,
  stocks,
  favorites,
  onToggleFav,
  onOpenDetail,
  flashSeeds,
  collapsed,
  onToggleCollapsed,
  sortKey,
  onSortChange,
}: SectorBlockProps) {
  const sorted = useMemo(() => sortStocks(stocks, sortKey), [stocks, sortKey]);
  return (
    <div className="section-block">
      <SectionHeader
        sector={{ name: sector.name, tagline: sector.tagline }}
        count={stocks.length}
        sortKey={sortKey}
        onSortChange={(k) => transition(() => onSortChange(k))}
        collapsed={collapsed}
        onToggle={onToggleCollapsed}
      />
      {!collapsed && (
        <SectionBody>
          {sorted.map((s, i) => (
            <StockRow
              key={s.code}
              stock={s}
              rank={sortKey === 'name' ? null : i + 1}
              isFav={favorites.has(s.code)}
              onToggleFav={onToggleFav}
              onOpenDetail={onOpenDetail}
              flashSeed={flashSeeds[s.code] ?? 0}
              isFirst={i === 0}
            />
          ))}
        </SectionBody>
      )}
    </div>
  );
}

// ---------- Tag block (#pill header + sorted rows) ----------

interface TagBlockProps {
  tag: string;
  stocks: StockViewModel[];
  favorites: Set<string>;
  onToggleFav: (code: string) => void;
  onOpenDetail: (code: string) => void;
  flashSeeds: Record<string, number>;
}

function TagBlock({
  tag,
  stocks,
  favorites,
  onToggleFav,
  onOpenDetail,
  flashSeeds,
}: TagBlockProps) {
  const sorted = useMemo(() => sortByChangeDesc(stocks), [stocks]);
  return (
    <div className="section-block">
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '12px 12px 0 0',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--gold-text)',
            background: 'var(--gold-soft)',
            padding: '4px 10px',
            borderRadius: 50,
            letterSpacing: 0.3,
          }}
        >
          #{tag}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
          {stocks.length}종목
        </span>
      </div>
      <SectionBody>
        {sorted.map((s, i) => (
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
      </SectionBody>
    </div>
  );
}

// ---------- Shared body wrapper ----------

function SectionBody({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderTop: 'none',
        borderRadius: '0 0 12px 12px',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

// ---------- Helpers ----------

function sortStocks(stocks: StockViewModel[], key: SortKey): StockViewModel[] {
  const copy = [...stocks];
  switch (key) {
    case 'changeDesc':
      return copy.sort((a, b) => b.changePct - a.changePct);
    case 'changeAsc':
      return copy.sort((a, b) => a.changePct - b.changePct);
    case 'volume':
      return copy.sort((a, b) => b.volume - a.volume);
    case 'name':
      return copy.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }
}

function sortByChangeDesc(stocks: StockViewModel[]): StockViewModel[] {
  return [...stocks].sort((a, b) => b.changePct - a.changePct);
}

function transition(fn: () => void): void {
  type DocWithVT = Document & { startViewTransition?: (cb: () => void) => unknown };
  const d = document as DocWithVT;
  if (typeof d.startViewTransition === 'function') {
    d.startViewTransition(fn);
  } else {
    fn();
  }
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
      <div>POST /stocks 또는 /import/kis-watchlist로 종목을 추가해 주세요.</div>
    </div>
  );
}
