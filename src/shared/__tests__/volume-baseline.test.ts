import { describe, expect, it } from 'vitest';

import {
  calculateVolumeSurgeRatio,
  formatVolumeSurgeRatio,
  getKstVolumeBucket,
  MIN_VOLUME_BASELINE_SAMPLES,
  type VolumeBaseline,
} from '../volume-baseline';

function baseline(overrides: Partial<VolumeBaseline> = {}): VolumeBaseline {
  return {
    ticker: '005930',
    session: 'regular',
    timeBucket: '09:30',
    sampleCount: MIN_VOLUME_BASELINE_SAMPLES,
    avgCumulativeVolume: 1_000_000,
    updatedAt: '2026-04-29T00:30:00.000Z',
    ...overrides,
  };
}

describe('volume surge baseline', () => {
  it('returns null when no baseline exists', () => {
    expect(calculateVolumeSurgeRatio(1_500_000, null)).toBeNull();
  });

  it('returns null while baseline sample count is insufficient', () => {
    expect(
      calculateVolumeSurgeRatio(1_500_000, baseline({ sampleCount: 4 })),
    ).toBeNull();
  });

  it('returns null when average cumulative volume is zero', () => {
    expect(
      calculateVolumeSurgeRatio(1_500_000, baseline({ avgCumulativeVolume: 0 })),
    ).toBeNull();
  });

  it('calculates current cumulative volume over same-time baseline average', () => {
    expect(calculateVolumeSurgeRatio(5_200_000, baseline())).toBe(5.2);
  });

  it('formats ratio with one decimal place for display', () => {
    expect(formatVolumeSurgeRatio(5.24)).toBe('거래량 5.2x');
  });

  it('splits KST session and HH:mm time bucket without using full-day average', () => {
    expect(getKstVolumeBucket('2026-04-29T00:30:12.000Z')).toEqual({
      session: 'regular',
      timeBucket: '09:30',
    });
    expect(getKstVolumeBucket('2026-04-29T06:45:00.000Z')).toEqual({
      session: 'after',
      timeBucket: '15:45',
    });
  });
});
