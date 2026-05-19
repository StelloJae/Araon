import type { CSSProperties } from 'react';
import { useState } from 'react';

interface ProductAvatarProps {
  name: string;
  iconUrl?: string | null;
  productCode?: string | null;
  ticker?: string | null;
  size?: number;
  style?: CSSProperties;
}

export function ProductAvatar({
  name,
  iconUrl = null,
  productCode = null,
  ticker = null,
  size = 28,
  style,
}: ProductAvatarProps) {
  const [failed, setFailed] = useState(false);
  const label = productFallbackLabel(name);
  const safeIconUrl =
    renderableTossIconUrl(iconUrl) ?? tossIconUrlFromProductIdentity(productCode, ticker);
  const baseStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    background: 'var(--bg-tint)',
    border: '1px solid var(--border-soft)',
    color: 'var(--text-secondary)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: Math.max(10, Math.floor(size * 0.4)),
    fontWeight: 900,
    overflow: 'hidden',
    flex: '0 0 auto',
    ...style,
  };

  if (!failed && safeIconUrl !== null) {
    return (
      <span style={baseStyle} aria-hidden>
        <img
          src={safeIconUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      </span>
    );
  }

  return (
    <span style={baseStyle} aria-hidden>
      {label}
    </span>
  );
}

function productFallbackLabel(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return '?';
  return Array.from(trimmed)[0] ?? '?';
}

function renderableTossIconUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (url.hostname !== 'static.toss.im') return null;
    if (!url.pathname.startsWith('/png-icons/securities/')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function tossIconUrlFromProductIdentity(
  productCode: string | null | undefined,
  ticker: string | null | undefined,
): string | null {
  const krTicker = krTickerFromProductIdentity(productCode) ?? krTickerFromProductIdentity(ticker);
  if (krTicker === null) return null;
  return `https://static.toss.im/png-icons/securities/icn-sec-fill-${krTicker}.png`;
}

function krTickerFromProductIdentity(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  const ticker = normalized.startsWith('A') ? normalized.slice(1) : normalized;
  return /^\d{6}$/.test(ticker) ? ticker : null;
}
