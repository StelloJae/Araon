export type VolumeSession = 'pre' | 'regular' | 'after' | 'unknown';

export type VolumeBaselineStatus = 'collecting' | 'ready' | 'unavailable';

export const MIN_VOLUME_BASELINE_SAMPLES = 5;
export const TARGET_VOLUME_BASELINE_SAMPLES = 20;

export interface VolumeBaseline {
  ticker: string;
  session: VolumeSession;
  timeBucket: string;
  sampleCount: number;
  avgCumulativeVolume: number;
  updatedAt: string;
}

export interface VolumeBucket {
  session: VolumeSession;
  timeBucket: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function minutesOfDayKst(iso: string): number | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const kst = new Date(t + 9 * 60 * 60 * 1000);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

function sessionForKstMinutes(minutes: number): VolumeSession {
  if (minutes >= 8 * 60 && minutes < 8 * 60 + 50) return 'pre';
  if (minutes >= 9 * 60 && minutes < 15 * 60 + 20) return 'regular';
  if (minutes >= 15 * 60 + 30 && minutes < 20 * 60) return 'after';
  return 'unknown';
}

export function getKstVolumeBucket(iso: string): VolumeBucket {
  const minutes = minutesOfDayKst(iso);
  if (minutes === null) return { session: 'unknown', timeBucket: 'unknown' };
  return {
    session: sessionForKstMinutes(minutes),
    timeBucket: `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`,
  };
}

export function calculateVolumeSurgeRatio(
  currentVolume: number,
  baseline: VolumeBaseline | null | undefined,
  minSampleCount: number = MIN_VOLUME_BASELINE_SAMPLES,
): number | null {
  if (baseline === null || baseline === undefined) return null;
  if (!Number.isFinite(currentVolume) || currentVolume < 0) return null;
  if (baseline.sampleCount < minSampleCount) return null;
  if (!Number.isFinite(baseline.avgCumulativeVolume)) return null;
  if (baseline.avgCumulativeVolume <= 0) return null;
  return currentVolume / baseline.avgCumulativeVolume;
}

export function formatVolumeSurgeRatio(
  ratio: number | null | undefined,
): string | null {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) {
    return null;
  }
  return `거래량 ${ratio.toFixed(1)}x`;
}
