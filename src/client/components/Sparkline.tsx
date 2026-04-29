/**
 * Sparkline — tiny line chart driven by real `usePriceHistoryStore` data.
 *
 * Returns `null` when fewer than `MIN_POINTS_FOR_SPARKLINE` points exist for
 * the ticker. We do NOT synthesize a placeholder shape; an empty hover state
 * is the correct UX when no live data has accumulated yet.
 */

import { buildSparklineGeometry } from '../lib/sparkline';
import type { PriceHistoryPoint } from '../stores/price-history-store';

interface SparklineProps {
  history: ReadonlyArray<PriceHistoryPoint>;
  width?: number;
  height?: number;
  /** Use the latest changePct sign (true=up=red) for the stroke color. */
  positive?: boolean;
  /** Thinner stroke and no end-dot for in-row hover use. */
  mini?: boolean;
}

export function Sparkline({
  history,
  width = 80,
  height = 26,
  positive = true,
  mini = false,
}: SparklineProps) {
  const geom = buildSparklineGeometry(history, width, height);
  if (geom === null) return null;

  const color = positive ? 'var(--kr-up)' : 'var(--kr-down)';
  const strokeW = mini ? 1.4 : 1.8;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', overflow: 'visible' }}
      aria-hidden
    >
      <polyline
        points={geom.points}
        fill="none"
        stroke={color}
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {!mini && (
        <circle cx={geom.endX} cy={geom.endY} r={2} fill={color} />
      )}
    </svg>
  );
}
