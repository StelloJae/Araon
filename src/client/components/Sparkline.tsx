/**
 * Sparkline — tiny line chart driven by real `usePriceHistoryStore` data.
 *
 * Returns `null` when fewer than `MIN_POINTS_FOR_SPARKLINE` points exist for
 * the ticker. We do NOT synthesize a placeholder shape; an empty state means
 * real local history is still unavailable.
 */

import { memo, useMemo } from 'react';
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

function SparklineComponent({
  history,
  width = 80,
  height = 26,
  positive = true,
  mini = false,
}: SparklineProps) {
  const geom = useMemo(
    () => buildSparklineGeometry(history, width, height, 2, {
      maxPoints: mini ? 120 : 420,
      liveTailPoints: mini ? 24 : 90,
    }),
    [history, width, height, mini],
  );
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

export const Sparkline = memo(SparklineComponent);
Sparkline.displayName = 'Sparkline';
