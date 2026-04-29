import {
  getKstVolumeBucket,
  type VolumeBaseline,
} from '@shared/volume-baseline.js';
import type { PriceSnapshot } from '@shared/types.js';

const DEFAULT_MAX_BASELINE_SAMPLES = 20;

export interface BuildVolumeBaselinesInput {
  snapshots: ReadonlyArray<PriceSnapshot>;
  tickers: ReadonlyArray<string>;
  asOfIso: string;
  maxSamples?: number;
}

function kstDateKey(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'invalid';
  return new Date(t + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function buildVolumeBaselinesFromSnapshots(
  input: BuildVolumeBaselinesInput,
): VolumeBaseline[] {
  const targetBucket = getKstVolumeBucket(input.asOfIso);
  if (targetBucket.session === 'unknown') return [];
  const targetDateKey = kstDateKey(input.asOfIso);
  if (targetDateKey === 'invalid') return [];

  const allowedTickers = new Set(input.tickers);
  const maxSamples = input.maxSamples ?? DEFAULT_MAX_BASELINE_SAMPLES;
  const byTicker = new Map<string, PriceSnapshot[]>();

  for (const snapshot of input.snapshots) {
    if (!allowedTickers.has(snapshot.ticker)) continue;
    if (!Number.isFinite(snapshot.volume) || snapshot.volume <= 0) continue;

    const bucket = getKstVolumeBucket(snapshot.snapshotAt);
    if (bucket.session !== targetBucket.session) continue;
    if (bucket.timeBucket !== targetBucket.timeBucket) continue;
    if (kstDateKey(snapshot.snapshotAt) >= targetDateKey) continue;

    const list = byTicker.get(snapshot.ticker) ?? [];
    list.push(snapshot);
    byTicker.set(snapshot.ticker, list);
  }

  const baselines: VolumeBaseline[] = [];
  for (const [ticker, snapshots] of byTicker.entries()) {
    const latestByKstDate = new Map<string, PriceSnapshot>();
    for (const snapshot of snapshots.sort((a, b) =>
      b.snapshotAt.localeCompare(a.snapshotAt),
    )) {
      const dateKey = kstDateKey(snapshot.snapshotAt);
      if (dateKey === 'invalid') continue;
      if (!latestByKstDate.has(dateKey)) latestByKstDate.set(dateKey, snapshot);
    }

    const samples = Array.from(latestByKstDate.values())
      .sort((a, b) => b.snapshotAt.localeCompare(a.snapshotAt))
      .slice(0, maxSamples);

    if (samples.length === 0) continue;
    const total = samples.reduce((sum, snapshot) => sum + snapshot.volume, 0);
    baselines.push({
      ticker,
      session: targetBucket.session,
      timeBucket: targetBucket.timeBucket,
      sampleCount: samples.length,
      avgCumulativeVolume: total / samples.length,
      updatedAt: samples[0]!.snapshotAt,
    });
  }

  return baselines.sort((a, b) => a.ticker.localeCompare(b.ticker));
}
