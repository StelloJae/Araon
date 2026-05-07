/**
 * MarketBadge — pill rendering KIS runtime plus human market-session labels.
 *   - PRE · 장전        → NXT premarket / KRX opening preparation
 *   - PRE · 시가대기    → handoff window before regular session
 *   - LIVE · 장중       → regular KRX session
 *   - AFTER · 장후      → NXT after-hours
 *   - SNAPSHOT · 장마감 → no live session
 *
 * `MarketStatus.open` means the integrated realtime feed can be active from
 * 08:00 to 20:00 KST. The badge splits that live window into the user-facing
 * Korean sessions so 08:00-08:50 does not look like regular trading.
 */

import type { MarketStatus } from '@shared/types';

type Variant = 'LIVE' | 'SNAPSHOT' | 'PRE-OPEN' | 'OPENING-WAIT' | 'AFTER-HOURS';

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
    text: 'LIVE · 장중',
    pulse: true,
  },
  SNAPSHOT: {
    bg: 'var(--bg-tint)',
    fg: 'var(--text-secondary)',
    dot: 'var(--text-muted)',
    text: 'SNAPSHOT · 장후',
    pulse: false,
  },
  'PRE-OPEN': {
    bg: 'var(--gold-soft)',
    fg: 'var(--gold-text)',
    dot: 'var(--gold)',
    text: 'PRE · 장전',
    pulse: false,
  },
  'OPENING-WAIT': {
    bg: 'var(--gold-soft)',
    fg: 'var(--gold-text)',
    dot: 'var(--gold)',
    text: 'PRE · 시가대기',
    pulse: false,
  },
  'AFTER-HOURS': {
    bg: 'var(--bg-tint)',
    fg: 'var(--text-secondary)',
    dot: 'var(--kr-up)',
    text: 'AFTER · 장후',
    pulse: false,
  },
};

const PREMARKET_START_MINUTES = 8 * 60;
const PREMARKET_END_MINUTES = 8 * 60 + 50;
const REGULAR_START_MINUTES = 9 * 60;
const AFTER_HOURS_START_MINUTES = 15 * 60 + 30;
const INTEGRATED_CLOSE_MINUTES = 20 * 60;

const KST_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function minutesInKst(now: Date): number {
  const parts = KST_TIME_FORMATTER.formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

function variantOf(status: MarketStatus, now: Date): Variant {
  if (status === 'open') {
    const minutes = minutesInKst(now);
    if (minutes >= PREMARKET_START_MINUTES && minutes < PREMARKET_END_MINUTES) {
      return 'PRE-OPEN';
    }
    if (minutes >= PREMARKET_END_MINUTES && minutes < REGULAR_START_MINUTES) {
      return 'OPENING-WAIT';
    }
    if (minutes >= AFTER_HOURS_START_MINUTES && minutes < INTEGRATED_CLOSE_MINUTES) {
      return 'AFTER-HOURS';
    }
    return 'LIVE';
  }
  if (status === 'pre-open') return 'PRE-OPEN';
  return 'SNAPSHOT';
}

interface MarketBadgeProps {
  status: MarketStatus;
  now?: Date;
}

export function MarketBadge({ status, now = new Date() }: MarketBadgeProps) {
  const cfg = CONFIG_BY_VARIANT[variantOf(status, now)];
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
