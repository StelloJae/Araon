/**
 * Display formatters + KR-stock color helpers.
 *
 * KR convention: red = up (상승), blue = down (하락), grey = flat (보합).
 * Colors return CSS variable strings so light/dark theming flows through
 * automatically.
 */

export const fmtPrice = (n: number): string => n.toLocaleString('ko-KR');

export const fmtPct = (n: number): string =>
  (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

export const fmtAbs = (n: number): string =>
  (n >= 0 ? '+' : '') + n.toLocaleString('ko-KR');

/**
 * Volume comes from the backend in raw 주 (shares). Display in 만주
 * (10_000-share) units with one decimal.
 */
export const fmtVolMan = (rawShares: number): string =>
  (rawShares / 10_000).toFixed(1) + '만';

/** `HH:MM:SS` for the status bar's last-update clock. */
export function fmtClock(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ---------- KR sentiment colors ----------

export function krColor(pct: number): string {
  if (pct > 0.01) return 'var(--kr-up)';
  if (pct < -0.01) return 'var(--kr-down)';
  return 'var(--text-muted)';
}

/** Background tint string (rgba) for sentiment cards. Hard-coded RGB so dark
 *  mode's stronger tints (the 'dark' tokens) still carry the same hue. */
export function krTintBg(pct: number): string {
  const a = Math.abs(pct);
  if (a < 0.01) return 'transparent';
  let alpha = 0.035;
  if (a >= 5) alpha = 0.07;
  if (a >= 10) alpha = 0.12;
  return pct > 0
    ? `rgba(246,70,93,${alpha})`
    : `rgba(30,174,219,${alpha})`;
}

export function krTintBorder(pct: number): string {
  const a = Math.abs(pct);
  if (a < 0.01) return 'var(--border)';
  if (a >= 10) return pct > 0 ? 'rgba(246,70,93,0.35)' : 'rgba(30,174,219,0.35)';
  if (a >= 5)  return pct > 0 ? 'rgba(246,70,93,0.22)' : 'rgba(30,174,219,0.22)';
  return 'var(--border)';
}

/** Movers depth gradient alpha: bigger move, denser bar. */
export function moversBarAlpha(pct: number): number {
  const a = Math.abs(pct);
  if (a >= 10) return 0.5;
  if (a >= 5) return 0.28;
  return 0.15;
}

/** StockRow depth gradient alpha (slightly subtler than Movers). */
export function rowBarAlpha(pct: number): number {
  const a = Math.abs(pct);
  if (a >= 10) return 0.32;
  if (a >= 5) return 0.18;
  return 0.10;
}

/** Surge feed bar alpha — thicker, since the column is the focal point. */
export function surgeBarAlpha(pct: number): number {
  if (pct >= 8) return 0.5;
  if (pct >= 5) return 0.32;
  return 0.18;
}

/** Human-friendly age label for surge rows ("방금" / "12초 전" / "1분 5초 전"). */
export function fmtAge(ageMs: number): string {
  if (ageMs < 1_000) return '방금';
  const sec = Math.floor(ageMs / 1_000);
  if (sec < 60) return `${sec}초 전`;
  const m = Math.floor(sec / 60);
  return `${m}분 ${sec % 60}초 전`;
}

/** Compact age tag ("12s" / "3m") for surge row right side. */
export function fmtAgeTag(ageMs: number): string {
  const sec = Math.floor(ageMs / 1_000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m`;
}

/**
 * Relative human-friendly time for the SSE panel ("마지막 이벤트 N초 전").
 * `nowMs` is passed in so the calling component controls the tick cadence and
 * we don't read `Date.now()` from a pure formatter (testability).
 */
export function fmtRelativeTime(d: Date | null, nowMs: number): string {
  if (d === null) return '—';
  const ageMs = Math.max(0, nowMs - d.getTime());
  if (ageMs < 1_000) return '방금';
  const sec = Math.floor(ageMs / 1_000);
  if (sec < 60) return `${sec}초 전`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  return `${h}시간 전`;
}
