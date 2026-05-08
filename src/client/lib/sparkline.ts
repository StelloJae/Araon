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

export interface AdaptivePriceSeriesOptions {
  /** Maximum number of points that should reach the SVG layer. */
  maxPoints: number;
  /** Recent points kept at full fidelity so the live tail still feels alive. */
  liveTailPoints: number;
}

function pointKey(point: PriceHistoryPoint): string {
  return `${point.ts}:${point.price}`;
}

/**
 * Reduce long intraday histories before drawing.
 *
 * Older context is bucketed by time/index and each bucket preserves first,
 * high, low and last points. The most recent tail is kept unmodified. This
 * avoids late-day charts becoming a dense vertical comb while preserving the
 * direction of the current ticks.
 */
export function buildAdaptivePriceSeries(
  history: ReadonlyArray<PriceHistoryPoint>,
  options: AdaptivePriceSeriesOptions,
): PriceHistoryPoint[] {
  const maxPoints = Math.max(2, Math.trunc(options.maxPoints));
  const liveTailPoints = Math.max(0, Math.min(
    Math.trunc(options.liveTailPoints),
    Math.floor(maxPoints / 2),
  ));
  if (history.length <= maxPoints) return [...history];

  const tail = liveTailPoints > 0 ? history.slice(-liveTailPoints) : [];
  const context = liveTailPoints > 0 ? history.slice(0, -liveTailPoints) : history;
  const contextBudget = Math.max(2, maxPoints - tail.length);
  if (context.length <= contextBudget) {
    return [...context, ...tail];
  }

  const bucketCount = Math.max(1, Math.floor(contextBudget / 4));
  const bucketSize = context.length / bucketCount;
  const selected = new Map<string, PriceHistoryPoint>();

  function add(point: PriceHistoryPoint): void {
    selected.set(pointKey(point), point);
  }

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = Math.floor(bucket * bucketSize);
    const end = Math.min(
      context.length,
      Math.floor((bucket + 1) * bucketSize),
    );
    if (start >= end) continue;
    const slice = context.slice(start, end);
    let low = slice[0]!;
    let high = slice[0]!;
    for (const point of slice) {
      if (point.price < low.price) low = point;
      if (point.price > high.price) high = point;
    }
    add(slice[0]!);
    add(low);
    add(high);
    add(slice[slice.length - 1]!);
  }

  const compactContext = Array.from(selected.values())
    .sort((a, b) => a.ts - b.ts)
    .slice(-contextBudget);

  return [...compactContext, ...tail].slice(-maxPoints);
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
  adaptiveOptions?: AdaptivePriceSeriesOptions,
): SparklineGeometry | null {
  const series =
    adaptiveOptions === undefined
      ? history
      : buildAdaptivePriceSeries(history, adaptiveOptions);
  if (series.length < minPoints) return null;

  let min = series[0]!.price;
  let max = series[0]!.price;
  for (const p of series) {
    if (p.price < min) min = p.price;
    if (p.price > max) max = p.price;
  }
  const range = max - min || 1;

  const lastIdx = series.length - 1;
  const parts: string[] = [];
  let endX = 0;
  let endY = 0;
  for (let i = 0; i < series.length; i++) {
    const p = series[i]!;
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
