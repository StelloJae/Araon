import {
  calculateVolumeSurgeRatio,
  getKstVolumeBucket,
  type VolumeBaseline,
} from '@shared/volume-baseline.js';
import type { Price, PriceSnapshot, Stock } from '@shared/types.js';
import { buildVolumeBaselinesFromSnapshots } from './volume-baseline-builder.js';

export interface VolumeBaselineSnapshotRepo {
  findSinceForTickers(tickers: readonly string[], sinceIso: string): PriceSnapshot[];
}

export interface VolumeBaselineStockRepo {
  findAll(): Stock[];
}

export interface VolumeBaselineEnricher {
  enrich(price: Price): Price;
}

export interface VolumeBaselineEnricherOptions {
  stockRepo: VolumeBaselineStockRepo;
  snapshotRepo: VolumeBaselineSnapshotRepo;
  lookbackDays?: number;
}

const DEFAULT_LOOKBACK_DAYS = 45;

export function createVolumeBaselineEnricher(
  options: VolumeBaselineEnricherOptions,
): VolumeBaselineEnricher {
  const lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  let loadedBucketKey: string | null = null;
  let baselines = new Map<string, VolumeBaseline>();

  function refresh(asOfIso: string): void {
    const bucketKey = comparableBucketKey(asOfIso);
    if (bucketKey === null) {
      loadedBucketKey = null;
      baselines = new Map();
      return;
    }
    if (loadedBucketKey === bucketKey) return;

    const tickers = options.stockRepo.findAll().map((stock) => stock.ticker);
    if (tickers.length === 0) {
      loadedBucketKey = bucketKey;
      baselines = new Map();
      return;
    }

    const sinceIso = new Date(
      Date.parse(asOfIso) - lookbackDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const snapshots = options.snapshotRepo.findSinceForTickers(tickers, sinceIso);
    const next = new Map<string, VolumeBaseline>();
    for (const baseline of buildVolumeBaselinesFromSnapshots({
      snapshots,
      tickers,
      asOfIso,
    })) {
      next.set(baselineKey(baseline.ticker, baseline.session, baseline.timeBucket), baseline);
    }
    loadedBucketKey = bucketKey;
    baselines = next;
  }

  function enrich(price: Price): Price {
    if (!Number.isFinite(price.volume) || price.volume <= 0) {
      return {
        ...price,
        volumeSurgeRatio: null,
        volumeBaselineStatus: 'unavailable',
      };
    }

    const bucket = getKstVolumeBucket(price.updatedAt);
    if (bucket.session === 'unknown') {
      return {
        ...price,
        volumeSurgeRatio: null,
        volumeBaselineStatus: 'unavailable',
      };
    }

    refresh(price.updatedAt);
    const baseline = baselines.get(
      baselineKey(price.ticker, bucket.session, bucket.timeBucket),
    );
    const ratio = calculateVolumeSurgeRatio(price.volume, baseline);
    return {
      ...price,
      volumeSurgeRatio: ratio,
      volumeBaselineStatus: ratio === null ? 'collecting' : 'ready',
    };
  }

  return { enrich };
}

function baselineKey(
  ticker: string,
  session: string,
  timeBucket: string,
): string {
  return `${ticker}|${session}|${timeBucket}`;
}

function comparableBucketKey(iso: string): string | null {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  const kst = new Date(parsed + 9 * 60 * 60 * 1000);
  const dateKey = kst.toISOString().slice(0, 10);
  const bucket = getKstVolumeBucket(iso);
  if (bucket.session === 'unknown') return null;
  return `${dateKey}|${bucket.session}|${bucket.timeBucket}`;
}
