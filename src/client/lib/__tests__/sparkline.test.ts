import { describe, expect, it } from 'vitest';
import { buildSparklineGeometry } from '../sparkline';
import type { PriceHistoryPoint } from '../../stores/price-history-store';

function pt(price: number, ts: number): PriceHistoryPoint {
  return { price, changePct: 0, ts };
}

describe('buildSparklineGeometry', () => {
  it('returns null with fewer than minPoints', () => {
    expect(buildSparklineGeometry([], 80, 26)).toBeNull();
    expect(buildSparklineGeometry([pt(100, 0)], 80, 26)).toBeNull();
  });

  it('respects custom minPoints', () => {
    const hist = [pt(100, 0), pt(101, 1), pt(102, 2)];
    expect(buildSparklineGeometry(hist, 80, 26, 5)).toBeNull();
  });

  it('builds points spanning full width', () => {
    const hist = [pt(100, 0), pt(110, 1), pt(120, 2)];
    const geom = buildSparklineGeometry(hist, 80, 26);
    expect(geom).not.toBeNull();
    const parts = geom!.points.split(' ');
    expect(parts).toHaveLength(3);
    expect(parts[0]?.startsWith('0.00,')).toBe(true);
    expect(parts[2]?.startsWith('80.00,')).toBe(true);
  });

  it('places highest price at top (y=0) and lowest at bottom (y=height)', () => {
    const hist = [pt(100, 0), pt(120, 1)];
    const geom = buildSparklineGeometry(hist, 80, 26);
    expect(geom).not.toBeNull();
    const [first, last] = geom!.points.split(' ');
    // y=26 (bottom) for the lower price; y=0 (top) for the higher price
    expect(first).toBe('0.00,26.00');
    expect(last).toBe('80.00,0.00');
  });

  it('handles flat history with zero range without dividing by zero', () => {
    const hist = [pt(100, 0), pt(100, 1), pt(100, 2)];
    const geom = buildSparklineGeometry(hist, 80, 26);
    expect(geom).not.toBeNull();
    expect(geom!.min).toBe(100);
    expect(geom!.max).toBe(100);
    // Every y should be 26 (the baseline) since (price-min)/range = 0/1 = 0
    const ys = geom!.points.split(' ').map((p) => p.split(',')[1]);
    expect(new Set(ys).size).toBe(1);
  });

  it('records min, max, endX, endY', () => {
    const hist = [pt(100, 0), pt(150, 1), pt(120, 2)];
    const geom = buildSparklineGeometry(hist, 80, 26);
    expect(geom).not.toBeNull();
    expect(geom!.min).toBe(100);
    expect(geom!.max).toBe(150);
    expect(geom!.endX).toBeCloseTo(80);
  });
});
