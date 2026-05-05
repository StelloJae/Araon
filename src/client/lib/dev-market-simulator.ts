import type { MarketStatus, Price, Stock } from '@shared/types';
import type { CatalogEntry } from '../stores/stocks-store';
import { useMarketStore } from '../stores/market-store';
import { usePriceHistoryStore } from '../stores/price-history-store';
import { useStocksStore } from '../stores/stocks-store';
import { useSurgeStore, type SurgeEntry } from '../stores/surge-store';
import { useWatchlistStore } from '../stores/watchlist-store';

export const SIMULATED_MARKET_LABEL = 'SIMULATED MARKET';

export type DevMarketScenarioId =
  | 'momentum-burst'
  | 'sector-rotation'
  | 'volume-ready'
  | 'snapshot-caveat';

interface BuildDevMarketFrameInput {
  scenarioId: DevMarketScenarioId;
  step: number;
  now: number;
  catalog: Record<string, CatalogEntry>;
}

export interface DevMarketFrame {
  label: typeof SIMULATED_MARKET_LABEL;
  scenarioId: DevMarketScenarioId;
  marketStatus: MarketStatus;
  catalogStocks: Stock[];
  prices: Price[];
  surgeEntries: Array<Omit<SurgeEntry, 'ts'>>;
  favoriteTickers: string[];
}

const FALLBACK_STOCKS: Stock[] = [
  { ticker: '005930', name: '삼성전자', market: 'KOSPI', autoSector: '전기전자' },
  { ticker: '000660', name: 'SK하이닉스', market: 'KOSPI', autoSector: '전기전자' },
  { ticker: '042700', name: '한미반도체', market: 'KOSPI', autoSector: '전기전자' },
  { ticker: '011070', name: 'LG이노텍', market: 'KOSPI', autoSector: '전기전자' },
  { ticker: '035720', name: '카카오', market: 'KOSPI', autoSector: '서비스업' },
  { ticker: '051910', name: 'LG화학', market: 'KOSPI', autoSector: '화학' },
];

const BASE_PRICE_BY_INDEX = [70_000, 142_000, 184_000, 221_000, 48_000, 342_000];

export function isDevMarketSimulatorVisible(isDevBuild: boolean): boolean {
  return isDevBuild;
}

export function buildDevMarketFrame({
  scenarioId,
  step,
  now,
  catalog,
}: BuildDevMarketFrameInput): DevMarketFrame {
  const catalogStocks = readCatalogStocks(catalog);
  const marketStatus: MarketStatus =
    scenarioId === 'snapshot-caveat' ? 'snapshot' : 'open';
  const safeStep = Math.max(0, Math.floor(step));

  const prices = catalogStocks.map((stock, index) =>
    buildPrice(stock, index, scenarioId, safeStep, now),
  );

  return {
    label: SIMULATED_MARKET_LABEL,
    scenarioId,
    marketStatus,
    catalogStocks,
    prices,
    surgeEntries:
      scenarioId === 'snapshot-caveat'
        ? []
        : [buildSurgeEntry(catalogStocks[0]!, prices[0]!, scenarioId, safeStep)],
    favoriteTickers: catalogStocks.slice(0, 3).map((stock) => stock.ticker),
  };
}

export function applyDevMarketFrame(frame: DevMarketFrame): void {
  const stockStore = useStocksStore.getState();
  const existingCatalogSize = Object.keys(stockStore.catalog).length;
  if (existingCatalogSize === 0) {
    stockStore.setCatalog(frame.catalogStocks);
  }

  const market = useMarketStore.getState();
  market.setMarketStatus(frame.marketStatus);
  market.setSseStatus('connected');
  market.markUpdate(Date.parse(frame.prices[0]?.updatedAt ?? new Date().toISOString()));

  useStocksStore.getState().applyPriceUpdates(frame.prices);

  const history = usePriceHistoryStore.getState();
  for (const price of frame.prices) {
    if (price.isSnapshot) continue;
    history.appendPoint(price.ticker, {
      price: price.price,
      changePct: price.changeRate,
      ts: Date.parse(price.updatedAt),
    });
  }

  const favorites = useWatchlistStore.getState();
  if (favorites.favorites.size === 0) {
    favorites.setFavorites(frame.favoriteTickers);
  }

  const surge = useSurgeStore.getState();
  for (const entry of frame.surgeEntries) {
    surge.spawn(entry);
    surge.update(entry.code, {
      price: entry.price,
      surgePct: entry.surgePct,
      ...(entry.momentumPct !== undefined
        ? { momentumPct: entry.momentumPct }
        : {}),
      ...(entry.dailyChangePct !== undefined
        ? { dailyChangePct: entry.dailyChangePct }
        : {}),
      ...(entry.volume !== undefined ? { volume: entry.volume } : {}),
      ...(entry.volumeSurgeRatio !== undefined
        ? { volumeSurgeRatio: entry.volumeSurgeRatio }
        : {}),
      ...(entry.volumeBaselineStatus !== undefined
        ? { volumeBaselineStatus: entry.volumeBaselineStatus }
        : {}),
      ...(entry.currentAt !== undefined ? { currentAt: entry.currentAt } : {}),
    });
  }
}

function readCatalogStocks(catalog: Record<string, CatalogEntry>): Stock[] {
  const entries = Object.entries(catalog);
  if (entries.length === 0) return FALLBACK_STOCKS;
  return entries
    .slice(0, 8)
    .map(([ticker, entry]) => ({
      ticker,
      name: entry.name,
      market: entry.market,
      autoSector: entry.autoSector,
    }));
}

function buildPrice(
  stock: Stock,
  index: number,
  scenarioId: DevMarketScenarioId,
  step: number,
  now: number,
): Price {
  const base = BASE_PRICE_BY_INDEX[index % BASE_PRICE_BY_INDEX.length] ?? 50_000;
  const changeRate = scenarioChangePct(scenarioId, index, step);
  const price = Math.round(base * (1 + changeRate / 100));
  const volume = 600_000 + index * 180_000 + step * (90_000 + index * 12_000);
  const volumeReady = scenarioId === 'volume-ready';
  const isSnapshot = scenarioId === 'snapshot-caveat';

  return {
    ticker: stock.ticker,
    price,
    changeRate,
    changeAbs: Math.round(base * (changeRate / 100)),
    volume,
    accumulatedTradeValue: price * volume,
    openPrice: Math.round(base * 0.992),
    highPrice: Math.round(price * 1.012),
    lowPrice: Math.round(base * 0.982),
    marketCapKrw: Math.round(price * (70_000_000 + index * 8_500_000)),
    per: round1(11.2 + index * 0.7),
    pbr: round1(0.9 + index * 0.12),
    foreignOwnershipRate: round1(18 + index * 4.5),
    week52High: Math.round(base * 1.38),
    week52Low: Math.round(base * 0.72),
    dividendYield: index % 3 === 0 ? null : round1(1.1 + index * 0.15),
    volumeSurgeRatio: volumeReady ? 2.2 + step * 0.08 + index * 0.05 : null,
    volumeBaselineStatus: volumeReady ? 'ready' : 'collecting',
    updatedAt: new Date(now + step * 1_000).toISOString(),
    isSnapshot,
    source: isSnapshot ? 'rest' : 'ws-integrated',
  };
}

function scenarioChangePct(
  scenarioId: DevMarketScenarioId,
  index: number,
  step: number,
): number {
  switch (scenarioId) {
    case 'momentum-burst':
      return round1(index === 0 ? 3.0 + step * 0.6 : 0.8 + index * 0.3);
    case 'sector-rotation':
      return round1(index < 4 ? 2.8 + step * 0.35 + index * 0.4 : 0.4);
    case 'volume-ready':
      return round1(index === 0 ? 5.0 + step * 0.35 : 1.0 + index * 0.2);
    case 'snapshot-caveat':
      return round1(index === 0 ? 8.0 + step * 0.4 : 1.5 + index * 0.2);
  }
}

function buildSurgeEntry(
  stock: Stock,
  price: Price,
  scenarioId: Exclude<DevMarketScenarioId, 'snapshot-caveat'>,
  step: number,
): Omit<SurgeEntry, 'ts'> {
  const signalType =
    scenarioId === 'sector-rotation'
      ? 'trend'
      : scenarioId === 'volume-ready'
        ? 'strong_scalp'
        : 'scalp';
  const momentumWindow = signalType === 'trend' ? '3m' : '10s';
  const momentumPct =
    signalType === 'trend'
      ? round1(2.8 + step * 0.25)
      : round1(1.4 + step * 0.2);

  return {
    code: stock.ticker,
    name: stock.name,
    price: price.price,
    surgePct: momentumPct,
    source: 'realtime-momentum',
    signalType,
    momentumPct,
    momentumWindow,
    baselinePrice: Math.max(1, Math.round(price.price / (1 + momentumPct / 100))),
    baselineAt: Date.parse(price.updatedAt) - 10_000,
    currentAt: Date.parse(price.updatedAt),
    dailyChangePct: price.changeRate,
    volume: price.volume,
    volumeSurgeRatio: price.volumeSurgeRatio ?? null,
    ...(price.volumeBaselineStatus !== undefined
      ? { volumeBaselineStatus: price.volumeBaselineStatus }
      : {}),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
