/**
 * Sparkline geometry — pure helpers, kept out of the React tree so the
 * polyline math is unit-testable in node.
 */

import type { PriceHistoryPoint } from '../stores/price-history-store';

export interface SparklineGeometry {
  /** SVG `points="x,y x,y ..."` string. */
  points: string;
  /** Min/max prices used for vertical scaling. */
  min: number;
  max: number;
  /** Last point's (x, y) — useful for the trailing dot in non-mini mode. */
  endX: number;
  endY: number;
}

/**
 * Build the `<polyline points="...">` value for a sparkline of `history`.
 * Returns `null` when there are not enough points to draw a meaningful line.
 */
export function buildSparklineGeometry(
  history: ReadonlyArray<PriceHistoryPoint>,
  width: number,
  height: number,
  minPoints: number = 2,
): SparklineGeometry | null {
  if (history.length < minPoints) return null;

  let min = history[0]!.price;
  let max = history[0]!.price;
  for (const p of history) {
    if (p.price < min) min = p.price;
    if (p.price > max) max = p.price;
  }
  const range = max - min || 1;

  const lastIdx = history.length - 1;
  const parts: string[] = [];
  let endX = 0;
  let endY = 0;
  for (let i = 0; i < history.length; i++) {
    const p = history[i]!;
    const x = (i / lastIdx) * width;
    const y = height - ((p.price - min) / range) * height;
    parts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    if (i === lastIdx) {
      endX = x;
      endY = y;
    }
  }

  return { points: parts.join(' '), min, max, endX, endY };
}
