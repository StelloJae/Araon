/**
 * MarketBadge — pill rendering one of three KIS runtime states.
 *   - LIVE              → red tint + pulsing dot
 *   - SNAPSHOT (마감 기준)→ neutral grey
 *   - PRE-OPEN          → yellow tint
 *
 * Maps to the shared `MarketStatus` discriminator: 'open' → LIVE,
 * 'snapshot' / 'closed' → SNAPSHOT, 'pre-open' → PRE-OPEN.
 */

import type { MarketStatus } from '@shared/types';

type Variant = 'LIVE' | 'SNAPSHOT' | 'PRE-OPEN';

interface BadgeConfig {
  bg: string;
  fg: string;
  dot: string;
  text: string;
  pulse: boolean;
}

const CONFIG_BY_VARIANT: Record<Variant, BadgeConfig> = {
  LIVE: {
    bg: 'var(--up-tint-1)',
    fg: 'var(--kr-up)',
    dot: 'var(--kr-up)',
    text: 'LIVE',
    pulse: true,
  },
  SNAPSHOT: {
    bg: 'var(--bg-tint)',
    fg: 'var(--text-secondary)',
    dot: 'var(--text-muted)',
    text: 'SNAPSHOT (마감 기준)',
    pulse: false,
  },
  'PRE-OPEN': {
    bg: 'var(--gold-soft)',
    fg: 'var(--gold-text)',
    dot: 'var(--gold)',
    text: 'PRE-OPEN',
    pulse: false,
  },
};

function variantOf(status: MarketStatus): Variant {
  if (status === 'open') return 'LIVE';
  if (status === 'pre-open') return 'PRE-OPEN';
  return 'SNAPSHOT';
}

interface MarketBadgeProps {
  status: MarketStatus;
}

export function MarketBadge({ status }: MarketBadgeProps) {
  const cfg = CONFIG_BY_VARIANT[variantOf(status)];
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: cfg.bg,
        color: cfg.fg,
        padding: '4px 10px 4px 8px',
        borderRadius: 50,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.4,
      }}
      aria-label={`시장 상태: ${cfg.text}`}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 50,
          background: cfg.dot,
          animation: cfg.pulse ? 'pulse 1.6s ease-out infinite' : 'none',
        }}
      />
      {cfg.text}
    </div>
  );
}
