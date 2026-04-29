import {
  getKstVolumeBucket,
  type VolumeSession,
} from '@shared/volume-baseline.js';
import type { Price, Stock } from '@shared/types.js';

export interface VolumeBaselineCandidate {
  ticker: string;
  session: VolumeSession;
  timeBucket: string;
  cumulativeVolume: number;
  observedAt: string;
}

export interface CollectVolumeBaselineCandidatesInput {
  prices: ReadonlyArray<Price>;
  trackedStocks: ReadonlyArray<Stock>;
}

export function collectVolumeBaselineCandidates(
  input: CollectVolumeBaselineCandidatesInput,
): VolumeBaselineCandidate[] {
  const tracked = new Set(input.trackedStocks.map((stock) => stock.ticker));
  const candidates: VolumeBaselineCandidate[] = [];

  for (const price of input.prices) {
    if (!tracked.has(price.ticker)) continue;
    if (!Number.isFinite(price.volume) || price.volume <= 0) continue;

    const bucket = getKstVolumeBucket(price.updatedAt);
    if (bucket.session === 'unknown') continue;

    candidates.push({
      ticker: price.ticker,
      session: bucket.session,
      timeBucket: bucket.timeBucket,
      cumulativeVolume: price.volume,
      observedAt: price.updatedAt,
    });
  }

  return candidates;
}
