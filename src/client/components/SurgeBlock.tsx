/**
 * SurgeBlock — sticky live feed of "실시간 급상승 ≥3%".
 *
 * Two-row filter chrome:
 *
 *   [실시간] [오늘 누적] [전체]                ← from useSettingsStore
 *   [시총 전체] [대형] [중형] [소형]            ← all disabled (no marketCap data)
 *
 * Filter semantics (defined in `lib/surge-aggregator.ts`):
 *   - 실시간 — only real `useSurgeStore.feed` entries; only while marketStatus
 *              === 'open'. Closed / snapshot show "장 시간 외 — 실시간 없음".
 *   - 오늘 누적 — every catalog stock with changePct ≥ threshold; works in any
 *              market status.
 *   - 전체 — live first, then today's deduped by ticker.
 *
 * The block shows the latest real cumulative volume. It shows a volume multiple
 * only when a same-session/time-bucket baseline exists; otherwise it says the
 * baseline is still being collected.
 *
 * `flush=true` removes the outer card chrome (used inside LeftCombinedBlock).
 */

import { useEffect, useMemo } from 'react';
import {
  fmtAge,
  fmtAgeTag,
  fmtPrice,
  fmtVolMan,
  surgeBarAlpha,
} from '../lib/format';
import {
  aggregateSurgeView,
  type SurgeViewItem,
} from '../lib/surge-aggregator';
import { formatVolumeSurgeRatio } from '@shared/volume-baseline';
import {
  SURGE_ACTIVE_MS,
  SURGE_FADE_MS,
  SURGE_MAX_ROWS,
  useSurgeStore,
} from '../stores/surge-store';
import {
  useSettingsStore,
  type SurgeFilter,
} from '../stores/settings-store';
import { isMarketLive, isPreOpen } from '../lib/market-status';
import type { StockViewModel } from '../lib/view-models';
import type { MarketStatus } from '@shared/types';

interface SurgeBlockProps {
  marketStatus: MarketStatus;
  allStocks: ReadonlyArray<StockViewModel>;
  onOpenDetail: (code: string) => void;
  flush?: boolean;
}

export function SurgeBlock({
  marketStatus,
  allStocks,
  onOpenDetail,
  flush = false,
}: SurgeBlockProps) {
  const feed = useSurgeStore((s) => s.feed);
  const now = useSurgeStore((s) => s.now);
  const tick = useSurgeStore((s) => s.tick);
  const clear = useSurgeStore((s) => s.clear);
  const filter = useSettingsStore((s) => s.settings.surgeFilter);
  const surgeThreshold = useSettingsStore((s) => s.settings.surgeThreshold);
  const updateSettings = useSettingsStore((s) => s.update);

  const preOpen = isPreOpen(marketStatus);
  const sessionLive = isMarketLive(marketStatus);

  // 1Hz tick keeps age-based opacity fresh without re-firing on every SSE.
  // Cleared in pre-open so we don't accumulate idle timers before the bell.
  useEffect(() => {
    if (preOpen) {
      clear();
      return;
    }
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [preOpen, tick, clear]);

  const items = useMemo<SurgeViewItem[]>(
    () =>
      aggregateSurgeView(
        feed,
        allStocks,
        filter,
        marketStatus,
        surgeThreshold,
        now,
        SURGE_MAX_ROWS,
      ),
    [feed, allStocks, filter, marketStatus, surgeThreshold, now],
  );

  // If the user picked '실시간' but the market is closed, fall back to a
  // friendly empty state instead of silently rendering nothing.
  const liveDisabledByMarket = filter === 'live' && !sessionLive;

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: flush ? 'none' : '1px solid var(--border)',
        borderRadius: flush ? 0 : 12,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 0',
        minHeight: 0,
        minWidth: 0,
        height: '100%',
      }}
    >
      <div
        style={{
          padding: '12px 16px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1px solid var(--border-soft)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: sessionLive ? 'var(--kr-up)' : 'var(--text-inactive)',
            animation: sessionLive
              ? 'liveDotPulse 1.4s ease-in-out infinite'
              : 'none',
            flexShrink: 0,
          }}
        />
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: -0.1,
          }}
        >
          실시간 급상승
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-muted)',
            letterSpacing: 0.4,
          }}
        >
          ≥{surgeThreshold}%
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-muted)',
            marginLeft: 'auto',
          }}
        >
          {preOpen ? '대기' : `${items.length}종목`}
        </span>
      </div>

      {!preOpen && (
        <FilterChrome
          filter={filter}
          surgeThreshold={surgeThreshold}
          onFilterChange={(next) => updateSettings({ surgeFilter: next })}
          sessionLive={sessionLive}
        />
      )}

      {preOpen ? (
        <div
          style={{
            padding: '40px 16px',
            textAlign: 'center',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text-muted)',
          }}
        >
          <div style={{ fontSize: 22, marginBottom: 6, opacity: 0.4 }}>◔</div>
          장 시작 대기 중
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          filter={filter}
          surgeThreshold={surgeThreshold}
          liveDisabledByMarket={liveDisabledByMarket}
        />
      ) : (
        <div style={{ overflowY: 'auto', minHeight: 0 }}>
          {items.map((it, i) => (
            <SurgeRow
              key={`${it.code}-${it.ts ?? 'today'}`}
              item={it}
              now={now}
              isFirst={i === 0}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- FilterChrome ----------

interface FilterChromeProps {
  filter: SurgeFilter;
  surgeThreshold: number;
  onFilterChange: (next: SurgeFilter) => void;
  sessionLive: boolean;
}

function FilterChrome({
  filter,
  surgeThreshold: _surgeThreshold,
  onFilterChange,
  sessionLive,
}: FilterChromeProps) {
  type FilterOpt = { v: SurgeFilter; l: string; disabled: boolean; title: string | null };
  const filterOpts: FilterOpt[] = [
    {
      v: 'live',
      l: '실시간',
      disabled: !sessionLive,
      title: sessionLive ? null : '장 시간 외 — 실시간 이벤트 없음',
    },
    { v: 'today', l: '오늘 누적', disabled: false, title: null },
    { v: 'all', l: '전체', disabled: false, title: null },
  ];

  // Market cap tiers — UI present but disabled until backend supplies marketCap.
  const capOpts: Array<{ v: string; l: string }> = [
    { v: 'all', l: '시총 전체' },
    { v: 'large', l: '대형' },
    { v: 'mid', l: '중형' },
    { v: 'small', l: '소형' },
  ];

  return (
    <div
      style={{
        padding: '8px 16px 10px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', gap: 4 }}>
        {filterOpts.map((o) => {
          const active = filter === o.v;
          const disabled = o.disabled;
          return (
            <button
              key={o.v}
              type="button"
              onClick={() => {
                if (!disabled) onFilterChange(o.v);
              }}
              disabled={disabled}
              {...(o.title !== null ? { title: o.title } : {})}
              style={{
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 700,
                cursor: disabled ? 'not-allowed' : 'pointer',
                background: active
                  ? 'var(--accent)'
                  : disabled
                    ? 'transparent'
                    : 'var(--bg-tint)',
                color: active
                  ? '#fff'
                  : disabled
                    ? 'var(--text-inactive)'
                    : 'var(--text-secondary)',
                border: `1px solid ${
                  active
                    ? 'var(--accent)'
                    : disabled
                      ? 'var(--border-soft)'
                      : 'var(--border)'
                }`,
                borderRadius: 6,
                opacity: disabled ? 0.6 : 1,
              }}
            >
              {o.l}
            </button>
          );
        })}
      </div>
      <div
        style={{ display: 'flex', gap: 4 }}
        title="시총 데이터 연동 전 — 비활성"
      >
        {capOpts.map((o) => (
          <button
            key={o.v}
            type="button"
            disabled
            style={{
              padding: '3px 8px',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'not-allowed',
              background: 'transparent',
              color: 'var(--text-inactive)',
              border: '1px solid var(--border-soft)',
              borderRadius: 5,
              opacity: 0.6,
            }}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- EmptyState ----------

interface EmptyStateProps {
  filter: SurgeFilter;
  surgeThreshold: number;
  liveDisabledByMarket: boolean;
}

function EmptyState({
  filter,
  surgeThreshold,
  liveDisabledByMarket,
}: EmptyStateProps) {
  let message = '현재 조건에 맞는 종목 없음';
  if (liveDisabledByMarket) {
    message = '장 시간 외 — 실시간 이벤트 없음';
  } else if (filter === 'today') {
    message = `오늘 ≥${surgeThreshold}% 종목 없음`;
  } else if (filter === 'live') {
    message = '현재 급상승 종목 없음';
  } else {
    message = `급상승 종목 없음`;
  }
  return (
    <div
      style={{
        padding: '24px 16px',
        textAlign: 'center',
        fontSize: 12,
        color: 'var(--text-muted)',
      }}
    >
      {message}
    </div>
  );
}

// ---------- SurgeRow ----------

interface SurgeRowProps {
  item: SurgeViewItem;
  now: number;
  isFirst: boolean;
  onOpenDetail: (code: string) => void;
}

function SurgeRow({ item, now, isFirst, onOpenDetail }: SurgeRowProps) {
  const hasLiveTs = item.isLive && item.ts !== null;
  const ageMs = hasLiveTs ? Math.max(0, now - (item.ts as number)) : 0;
  const ageSec = Math.floor(ageMs / 1_000);

  // Live entries fade with age; today-cumulative entries stay at full opacity.
  let opacity = 1;
  let isFading = false;
  let isFresh = false;
  if (hasLiveTs) {
    if (ageMs <= SURGE_ACTIVE_MS) {
      opacity = 1 - 0.3 * (ageMs / SURGE_ACTIVE_MS);
    } else {
      const fade = Math.min(1, (ageMs - SURGE_ACTIVE_MS) / SURGE_FADE_MS);
      opacity = 0.7 * (1 - fade);
    }
    isFading = ageMs > SURGE_ACTIVE_MS;
    isFresh = ageMs < 4_000;
  }

  const barAlpha = surgeBarAlpha(item.changePct);
  const barColor = `rgba(246,70,93,${barAlpha})`;
  const depthPct = Math.min(100, (item.changePct / 10) * 100);

  const subLabel = formatSurgeSubLabel(item, ageMs);

  const tagLabel = hasLiveTs
    ? ageSec < 60
      ? `${ageSec}s`
      : fmtAgeTag(ageMs)
    : '오늘';

  return (
    <div
      data-stock-row={item.code}
      onClick={() => onOpenDetail(item.code)}
      style={{
        position: 'relative',
        padding: '8px 16px',
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        gap: 10,
        alignItems: 'center',
        fontSize: 12,
        borderTop: isFirst ? 'none' : '1px solid var(--border-soft)',
        opacity,
        transition: 'opacity 0.8s ease',
        animation: isFresh ? 'surgeIn 0.5s ease-out' : 'none',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(90deg, ${barColor} 0%, ${barColor} ${depthPct}%, transparent ${depthPct}%)`,
          opacity: isFading ? 0.25 : 0.5,
          pointerEvents: 'none',
          transition: 'opacity 0.8s ease',
        }}
      />
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: item.isLive ? 'var(--kr-up)' : 'var(--text-muted)',
              animation:
                isFresh && item.isLive
                  ? 'liveDotPulse 1.4s ease-in-out infinite'
                  : 'none',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontWeight: 700,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {item.name}
          </span>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-muted)',
            letterSpacing: 0.3,
            marginLeft: 11,
          }}
        >
          {subLabel}
        </span>
      </div>
      <div
        style={{
          position: 'relative',
          fontWeight: 600,
          color: 'var(--text-secondary)',
        }}
      >
        {fmtPrice(item.price)}
      </div>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          minWidth: 64,
        }}
      >
        <span
          style={{
            fontWeight: 700,
            color: 'var(--kr-up)',
            fontSize: 13,
            lineHeight: 1.1,
          }}
        >
          {'+' + item.changePct.toFixed(2) + '%'}
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: 'var(--text-muted)',
            letterSpacing: 0.4,
            lineHeight: 1.1,
          }}
        >
          {tagLabel}
        </span>
      </div>
    </div>
  );
}

export function formatSurgeSubLabel(item: SurgeViewItem, ageMs: number): string {
  const volumeLabel =
    item.volume !== null ? ` · 거래량 ${fmtVolMan(item.volume)}` : '';
  const surgeRatioLabel = formatVolumeSurgeRatio(item.volumeSurgeRatio);
  const baselineLabel =
    surgeRatioLabel !== null
      ? ` · ${surgeRatioLabel}`
      : item.volume !== null && item.volumeBaselineStatus === 'collecting'
        ? ' · 기준선 수집 중'
        : '';
  return item.isLive && item.ts !== null
    ? `${item.code} · ${fmtAge(ageMs)}${volumeLabel}${baselineLabel}`
    : `${item.code} · 오늘 누적${volumeLabel}${baselineLabel}`;
}
