import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CandlestickData,
  HistogramData,
  IChartApi,
  ISeriesApi,
  MouseEventParams,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import type {
  CandleApiCoverage,
  CandleApiItem,
  CandleInterval,
  PriceCandleSource,
  PriceSource,
} from '@shared/types';
import { fmtPrice, fmtVolMan } from '../lib/format';
import {
  ensureStockCandleCoverage,
  getStockCandles,
  type CandleRange,
} from '../lib/api-client';
import { useSettingsStore, type ChartColorScheme } from '../stores/settings-store';

const INTERVALS: CandleInterval[] = [
  '1m',
  '3m',
  '5m',
  '10m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '6h',
  '12h',
  '1D',
  '1W',
  '1M',
];

const RANGES: CandleRange[] = ['1d', '1w', '1m', '3m', '6m', '1y'];

type ChartStatus = 'loading' | 'ready' | 'empty' | 'error';
type CoverageCheckResult = Awaited<ReturnType<typeof ensureStockCandleCoverage>>;

const AUTO_COVERAGE_TIMEOUT_MS = 6_000;
const REPAIR_COVERAGE_TIMEOUT_MS = 10_000;

interface StockCandleChartProps {
  ticker: string;
  height?: number;
  compact?: boolean;
  diagnostics?: boolean;
  fillHeight?: boolean;
  liveQuote?: LiveQuoteCandleInput | null;
}

export interface LiveQuoteCandleInput {
  ticker: string;
  price: number;
  volume: number;
  updatedAt: string;
  isSnapshot: boolean;
  source?: PriceSource | null;
}

export function resolveWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      settled = true;
      resolve(fallback);
    }, Math.max(0, timeoutMs));

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export function StockCandleChart({
  ticker,
  height = 320,
  compact = false,
  diagnostics = false,
  fillHeight = false,
  liveQuote = null,
}: StockCandleChartProps) {
  const chartColorScheme = useSettingsStore((s) => s.settings.chartColorScheme);
  const [interval, setInterval] = useState<CandleInterval>('1m');
  const [range, setRange] = useState<CandleRange>('1d');
  const [status, setStatus] = useState<ChartStatus>('loading');
  const [items, setItems] = useState<CandleApiItem[]>([]);
  const [coverage, setCoverage] = useState<CandleApiCoverage | null>(null);
  const [coveragePending, setCoveragePending] = useState(false);
  const [repairPending, setRepairPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dataSourceText, setDataSourceText] = useState('로컬 저장 candle');
  const [liveOverlayItems, setLiveOverlayItems] = useState<CandleApiItem[]>([]);

  useEffect(() => {
    setLiveOverlayItems([]);
  }, [ticker, interval]);

  useEffect(() => {
    setLiveOverlayItems((current) =>
      pruneLiveOverlayItems(
        mergeLiveQuoteIntoCandleItems(current, liveQuote, interval),
        interval,
      ),
    );
  }, [interval, liveQuote]);

  const displayBaseItems = useMemo(
    () => mergeCandleItemOverlays(items, liveOverlayItems),
    [items, liveOverlayItems],
  );
  const displayItems = useMemo(
    () => hasLiveQuoteApplied(displayBaseItems, liveQuote, interval)
      ? displayBaseItems
      : mergeLiveQuoteIntoCandleItems(displayBaseItems, liveQuote, interval),
    [displayBaseItems, liveQuote, interval],
  );
  const displayStatus =
    status === 'empty' && displayItems.length > 0 ? 'ready' : status;

  const applyCandleData = (data: Awaited<ReturnType<typeof getStockCandles>>) => {
    const displayItems = compactNonTradingCandles(data.items);
    setItems(displayItems);
    setCoverage(data.coverage);
    setStatus(displayItems.length === 0 ? 'empty' : 'ready');
    const sources = data.coverage.sourceMix;
    setDataSourceText(candleSourceStatusText(sources, data.coverage.backfilled));
    return displayItems;
  };

  const refetchCandles = (options: { showLoading?: boolean } = {}) => {
    if (options.showLoading ?? true) setStatus('loading');
    return getStockCandles(ticker, { interval, range })
      .then((data) => {
        const displayItems = applyCandleData(data);
        if (displayItems.length === 0) setMessage(data.status.message);
      })
      .catch(() => {
        setItems([]);
        setCoverage(null);
        setStatus('error');
        setDataSourceText('로컬 저장 candle');
      });
  };

  useEffect(() => {
    let cancelled = false;
    let coverageMessage: string | null = null;
    let loadedItemCount = 0;
    setStatus('loading');
    setCoveragePending(true);
    coverageMessage = dailyInterval(interval)
      ? '과거 일봉 coverage 확인 중'
      : '과거 분봉 coverage 확인 중';
    setMessage(coverageMessage);

    const loadStoredCandles = (showLoading: boolean) =>
      getStockCandles(ticker, { interval, range })
        .then((data) => {
          if (cancelled) return;
          const displayItems = applyCandleData(data);
          loadedItemCount = displayItems.length;
          if (showLoading) setStatus(displayItems.length === 0 ? 'empty' : 'ready');
          if (displayItems.length === 0) setMessage(coverageMessage ?? data.status.message);
        })
        .catch(() => {
          if (cancelled) return;
          setItems([]);
          setCoverage(null);
          setStatus('error');
          setDataSourceText('로컬 저장 candle');
        });

    void loadStoredCandles(true);

    resolveWithTimeout<CoverageCheckResult | null>(
      ensureStockCandleCoverage(ticker, { interval, range }),
      AUTO_COVERAGE_TIMEOUT_MS,
      null,
    )
      .then((coverage) => {
        if (cancelled) return;
        if (coverage === null) {
          coverageMessage = chartCoverageTimeoutMessage(loadedItemCount > 0);
        } else if (coverage.state === 'backfilled') {
          const label = coverage.source === 'kis-daily' || coverage.source === 'toss-daily'
            ? '일봉'
            : '분봉';
          coverageMessage = `${label} 자동 보강 완료: ${coverage.inserted + coverage.updated}개 candle 반영`;
          void loadStoredCandles(false);
        } else if (coverage.state === 'current') {
          coverageMessage = '차트 coverage가 이미 준비되어 있습니다.';
        } else if (coverage.state === 'skipped') {
          coverageMessage = coverage.message;
        } else {
          coverageMessage = '차트 coverage를 확인했습니다. 표시 가능한 candle이 있으면 바로 보여줍니다.';
        }
        setMessage(coverageMessage);
      })
      .catch(() => {
        if (cancelled) return;
        coverageMessage = '데이터 연결 준비 후 차트 과거 데이터를 자동 보강합니다.';
        setMessage(coverageMessage);
      })
      .finally(() => {
        if (!cancelled) setCoveragePending(false);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [ticker, interval, range]);

  const handleRepair = () => {
    setRepairPending(true);
    setMessage(dailyInterval(interval) ? '일봉 차트 재검사 중' : '분봉 차트 재검사 중');
    resolveWithTimeout<CoverageCheckResult | null>(
      ensureStockCandleCoverage(ticker, { interval, range, force: true }),
      REPAIR_COVERAGE_TIMEOUT_MS,
      null,
    )
      .then((coverage) => {
        setMessage(
          coverage === null
            ? '재검사가 오래 걸려 저장된 candle을 먼저 유지합니다.'
            : coverage.message,
        );
      })
      .catch(() => {
        setMessage('현재 범위 재보강을 시작하지 못했습니다.');
      })
      .then(() => refetchCandles({ showLoading: false }))
      .finally(() => {
        setRepairPending(false);
      });
  };

  return (
    <div
      style={
        fillHeight
          ? {
              height: '100%',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
            }
          : undefined
      }
    >
      {!compact && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 10,
            flexShrink: 0,
          }}
        >
          <SegmentedButtonGroup
            label="봉"
            value={interval}
            values={INTERVALS}
            onChange={(value) => {
              const nextInterval = value as CandleInterval;
              setInterval(nextInterval);
              setRange((currentRange) =>
                normalizeCandleRangeForInterval(nextInterval, currentRange),
              );
            }}
          />
          <SegmentedButtonGroup
            label="범위"
            value={range}
            values={RANGES}
            onChange={(value) => setRange(value as CandleRange)}
          />
          {diagnostics && (
            <>
              <ChartAutoBackfillStatus
                interval={interval}
                pending={coveragePending || repairPending}
                message={message}
              />
              <ChartRepairButton running={repairPending} onRepair={handleRepair} />
            </>
          )}
          <div style={{ flex: 1 }} />
          {diagnostics && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {dataSourceText}
            </span>
          )}
        </div>
      )}
      {!compact && diagnostics && message !== null && !coveragePending && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
          {message}
        </div>
      )}
      <CandleChartView
        status={displayStatus}
        items={displayItems}
        coverage={coverage}
        interval={interval}
        range={range}
        colorScheme={chartColorScheme}
        height={height}
        compact={compact}
        showDiagnostics={diagnostics}
        fillHeight={fillHeight}
      />
    </div>
  );
}

export function chartCoverageTimeoutMessage(hasStoredCandles: boolean): string {
  return hasStoredCandles
    ? '저장된 candle을 표시하고 있으며 보강 확인은 백그라운드에서 이어집니다.'
    : '보강 확인이 오래 걸려 저장된 candle을 먼저 표시합니다.';
}

export function ChartRepairButton({
  running,
  onRepair,
}: {
  running: boolean;
  onRepair: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRepair}
      disabled={running}
      title="현재 보이는 종목과 범위만 다시 보강합니다"
      style={{
        height: 30,
        border: '1px solid var(--border-soft)',
        borderRadius: 8,
        background: running ? 'var(--bg-muted)' : 'var(--bg-card)',
        color: running ? 'var(--text-muted)' : 'var(--text-primary)',
        fontSize: 11,
        fontWeight: 800,
        padding: '0 9px',
        cursor: running ? 'wait' : 'pointer',
      }}
    >
      {running ? '재검사 중' : '차트 재검사'}
    </button>
  );
}

function dailyInterval(interval: CandleInterval): boolean {
  return interval === '1D' || interval === '1W' || interval === '1M';
}

export function normalizeCandleRangeForInterval(
  interval: CandleInterval,
  range: CandleRange,
): CandleRange {
  const minimumRange = minimumRangeForInterval(interval);
  if (minimumRange === null) return range;
  return rangeRank(range) < rangeRank(minimumRange) ? minimumRange : range;
}

function minimumRangeForInterval(interval: CandleInterval): CandleRange | null {
  switch (interval) {
    case '1D':
      return '1m';
    case '1W':
      return '3m';
    case '1M':
      return '1y';
    case '1m':
    case '3m':
    case '5m':
    case '10m':
    case '15m':
    case '30m':
    case '1h':
    case '2h':
    case '4h':
    case '6h':
    case '12h':
      return null;
  }
}

function rangeRank(range: CandleRange): number {
  return RANGES.indexOf(range);
}

export function mergeLiveQuoteIntoCandleItems(
  items: readonly CandleApiItem[],
  liveQuote: LiveQuoteCandleInput | null | undefined,
  interval: CandleInterval,
): CandleApiItem[] {
  if (liveQuote === null || liveQuote === undefined) return [...items];
  if (liveQuote.isSnapshot || dailyInterval(interval)) return [...items];
  if (!Number.isFinite(liveQuote.price) || liveQuote.price <= 0) return [...items];

  const bucketAt = bucketAtForKstInterval(liveQuote.updatedAt, interval);
  if (bucketAt === null) return [...items];
  const time = Math.trunc(Date.parse(bucketAt) / 1000);
  if (!Number.isFinite(time)) return [...items];

  const next = [...items];
  const index = next.findIndex((item) => item.time === time);
  if (index >= 0) {
    const existing = next[index];
    if (existing === undefined) return next;
    next[index] = {
      ...existing,
      high: Math.max(existing.high, liveQuote.price),
      low: Math.min(existing.low, liveQuote.price),
      close: liveQuote.price,
      volume: Math.max(existing.volume, liveQuote.volume),
      sampleCount: existing.sampleCount + 1,
      source: mergeLiveCandleSource(existing.source ?? null, liveQuote.source ?? null),
      isPartial: true,
    };
    return next;
  }

  if (!canAppendLiveQuoteCandle(items, bucketAt)) return next;

  next.push({
    time,
    bucketAt,
    open: liveQuote.price,
    high: liveQuote.price,
    low: liveQuote.price,
    close: liveQuote.price,
    volume: 0,
    sampleCount: 1,
    source: liveQuote.source ?? null,
    isPartial: true,
  });
  next.sort((a, b) => a.time - b.time);
  return next;
}

function hasLiveQuoteApplied(
  items: readonly CandleApiItem[],
  liveQuote: LiveQuoteCandleInput | null | undefined,
  interval: CandleInterval,
): boolean {
  if (liveQuote === null || liveQuote === undefined) return true;
  if (liveQuote.isSnapshot || dailyInterval(interval)) return true;
  if (!Number.isFinite(liveQuote.price) || liveQuote.price <= 0) return true;
  const bucketAt = bucketAtForKstInterval(liveQuote.updatedAt, interval);
  if (bucketAt === null) return true;
  const time = Math.trunc(Date.parse(bucketAt) / 1000);
  if (!Number.isFinite(time)) return true;
  const existing = items.find((item) => item.time === time);
  return existing !== undefined && existing.close === liveQuote.price;
}

function canAppendLiveQuoteCandle(
  items: readonly CandleApiItem[],
  bucketAt: string,
): boolean {
  if (isKstClosedNightMinute(bucketAt)) return false;
  if (items.length === 0) return true;
  const latest = items[items.length - 1];
  if (latest === undefined) return true;
  const latestKey = kstDateKey(latest.bucketAt);
  const liveKey = kstDateKey(bucketAt);
  return latestKey !== null && latestKey === liveKey;
}

function kstDateKey(iso: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const shifted = new Date(ms + KST_OFFSET_MS);
  return [
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  ].join('-');
}

export function mergeCandleItemOverlays(
  items: readonly CandleApiItem[],
  overlays: readonly CandleApiItem[],
): CandleApiItem[] {
  if (overlays.length === 0) return [...items];
  const byTime = new Map<number, CandleApiItem>();
  for (const item of items) {
    byTime.set(item.time, { ...item });
  }
  for (const overlay of overlays) {
    const existing = byTime.get(overlay.time);
    byTime.set(
      overlay.time,
      existing === undefined ? { ...overlay } : mergeCandleItem(existing, overlay),
    );
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function mergeCandleItem(
  base: CandleApiItem,
  overlay: CandleApiItem,
): CandleApiItem {
  return {
    ...base,
    high: Math.max(base.high, overlay.high),
    low: Math.min(base.low, overlay.low),
    close: overlay.close,
    volume: Math.max(base.volume, overlay.volume),
    sampleCount: Math.max(base.sampleCount, overlay.sampleCount),
    source: mergeLiveCandleSource(base.source ?? null, overlay.source ?? null),
    isPartial: base.isPartial || overlay.isPartial,
  };
}

function pruneLiveOverlayItems(
  items: readonly CandleApiItem[],
  interval: CandleInterval,
): CandleApiItem[] {
  const maxCount = dailyInterval(interval) ? 0 : 720;
  if (maxCount === 0 || items.length <= maxCount) return [...items];
  return items.slice(items.length - maxCount);
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function bucketAtForKstInterval(input: string, interval: CandleInterval): string | null {
  const ms = Date.parse(input);
  if (!Number.isFinite(ms)) return null;
  const shifted = new Date(ms + KST_OFFSET_MS);
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  const step = intervalMinutes(interval);
  if (step === null) return null;
  const bucketMinute = Math.floor(minutes / step) * step;
  const bucketUtcMs =
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
      Math.floor(bucketMinute / 60),
      bucketMinute % 60,
      0,
      0,
    ) - KST_OFFSET_MS;
  return new Date(bucketUtcMs).toISOString();
}

function intervalMinutes(interval: CandleInterval): number | null {
  switch (interval) {
    case '1m':
      return 1;
    case '3m':
      return 3;
    case '5m':
      return 5;
    case '10m':
      return 10;
    case '15m':
      return 15;
    case '30m':
      return 30;
    case '1h':
      return 60;
    case '2h':
      return 120;
    case '4h':
      return 240;
    case '6h':
      return 360;
    case '12h':
      return 720;
    case '1D':
    case '1W':
    case '1M':
      return null;
  }
}

function mergeLiveCandleSource(
  previous: CandleApiItem['source'] | null,
  next: PriceCandleSource | null,
): PriceCandleSource | null {
  if (previous === null || previous === undefined) return next;
  if (next === null) return previous;
  return previous === next ? previous : 'mixed';
}

export function ChartAutoBackfillStatus({
  interval,
  pending,
  message,
}: {
  interval: CandleInterval;
  pending: boolean;
  message: string | null;
}) {
  const label = dailyInterval(interval) ? '일봉 자동' : '분봉 자동';
  const statusText = pending ? '보강 중' : (message ?? 'coverage 관리');

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        minHeight: 30,
        border: '1px solid var(--border-soft)',
        borderRadius: 8,
        background: 'var(--bg-muted)',
        color: 'var(--text-muted)',
        fontSize: 11,
        fontWeight: 800,
        padding: '0 9px',
        maxWidth: 320,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
      title={message ?? `${label} coverage 관리`}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: pending ? '#F0B90B' : '#0ECB81',
          display: 'inline-block',
        }}
      >
      </span>
      {label} · {statusText}
    </span>
  );
}

function SegmentedButtonGroup({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--text-muted)',
      }}
    >
      <span>{label}</span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--bg-tint)',
          padding: 2,
        }}
      >
        {values.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            style={{
              height: 24,
              border: 'none',
              borderRadius: 6,
              background: value === v ? 'var(--bg-card)' : 'transparent',
              color: value === v ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: value === v ? '0 1px 3px rgba(15, 23, 42, 0.08)' : 'none',
              fontSize: 11,
              fontWeight: 900,
              fontFamily: 'inherit',
              padding: '0 8px',
              cursor: 'pointer',
            }}
          >
            {v}
          </button>
        ))}
      </span>
    </div>
  );
}

export function CandleChartView({
  status,
  items,
  coverage,
  interval,
  range,
  colorScheme = 'kr',
  height = 320,
  compact = false,
  showDiagnostics = false,
  fillHeight = false,
}: {
  status: ChartStatus;
  items: readonly CandleApiItem[];
  coverage?: CandleApiCoverage | null;
  interval: CandleInterval;
  range: CandleRange;
  colorScheme?: ChartColorScheme;
  height?: number;
  compact?: boolean;
  showDiagnostics?: boolean;
  fillHeight?: boolean;
}) {
  if (status === 'loading') {
    return <ChartMessage title="차트 불러오는 중" detail="로컬 candle 저장소를 확인하고 있습니다." fillHeight={fillHeight} />;
  }
  if (status === 'error') {
    return <ChartMessage title="차트를 불러오지 못했습니다" detail="잠시 후 다시 시도해 주세요." fillHeight={fillHeight} />;
  }
  if (status === 'empty' || items.length === 0) {
    return (
      <ChartMessage
        title="차트 데이터 수집 중"
        detail="이 종목의 저장된 candle이 아직 부족합니다. 장중에는 현재 선택 종목의 오늘 분봉부터 보강합니다. 1D/1W/1M은 Toss 차트 데이터를 우선 보강합니다."
        fillHeight={fillHeight}
      />
    );
  }

  return (
    <div
      style={{
        border: '1px solid var(--border-soft)',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--bg-card)',
        ...(fillHeight
          ? {
              flex: '1 1 0',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column' as const,
            }
          : {}),
      }}
    >
      {!compact && (
        <div
          style={{
            padding: '8px 10px',
            borderBottom: '1px solid var(--border-soft)',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            fontSize: 11,
            color: 'var(--text-muted)',
          }}
        >
          <span>
            {interval} · {range}
          </span>
          <span>
            {items.length} candles · 마우스를 올리면 OHLCV 표시 · 클릭하면 봉 고정
          </span>
        </div>
      )}
      {!compact && showDiagnostics && coverage !== undefined && coverage !== null && (
        <CandleDataInspector coverage={coverage} />
      )}
      <LightweightCandleCanvas
        items={items}
        colorScheme={colorScheme}
        height={height}
        fillHeight={fillHeight}
      />
    </div>
  );
}

export function CandleDataInspector({ coverage }: { coverage: CandleApiCoverage }) {
  const sourceText = sourceMixLabel(coverage.sourceMix);
  return (
    <div
      style={{
        borderBottom: '1px solid var(--border-soft)',
        padding: '7px 10px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'center',
        fontSize: 11,
        color: 'var(--text-muted)',
        background: 'rgba(132, 142, 156, 0.05)',
      }}
    >
      <strong style={{ color: 'var(--text-primary)' }}>데이터 검사</strong>
      <span>{sourceText}</span>
      <span>공백 {coverage.gapCount}</span>
      <span>부분 {coverage.partialCount}</span>
      {coverage.ledger !== undefined && (
        <span>장부 완료 {coverage.ledger.completeSegments}</span>
      )}
    </div>
  );
}

function sourceMixLabel(sources: readonly string[]): string {
  if (sources.includes('toss-time-daily')) return '토스 과거 분봉';
  if (sources.includes('toss-time-today')) return '토스 당일분봉';
  if (sources.includes('kis-time-daily')) return 'KIS 과거 분봉';
  if (sources.includes('kis-time-today')) return 'KIS 당일분봉';
  if (sources.includes('toss-daily')) return '토스 일봉';
  if (sources.includes('kis-daily')) return 'legacy KIS 일봉';
  if (sources.length === 0) return '저장 데이터 없음';
  return sources.join(', ');
}

export function candleSourceStatusText(sources: readonly string[], backfilled: boolean): string {
  if (sources.includes('toss-time-daily')) return '토스 과거 분봉 포함';
  if (sources.includes('toss-time-today')) return '토스 당일분봉 포함';
  if (sources.includes('kis-time-daily')) return 'KIS 과거 분봉 포함';
  if (sources.includes('kis-time-today')) return 'KIS 당일분봉 포함';
  if (sources.includes('toss-daily')) return '토스 일봉 백필 포함';
  if (sources.includes('kis-daily')) return 'legacy KIS 일봉 포함';
  if (backfilled) return '자동 차트 백필 포함';
  return '로컬 저장 candle';
}

export function trimNonTradingEdgeCandles(
  items: readonly CandleApiItem[],
): CandleApiItem[] {
  let first = 0;
  let last = items.length - 1;

  while (first <= last && isNonTradingEdgePlaceholder(items[first])) {
    first += 1;
  }
  while (last >= first && isNonTradingEdgePlaceholder(items[last])) {
    last -= 1;
  }
  return items.slice(first, last + 1);
}

export function compactNonTradingCandles(
  items: readonly CandleApiItem[],
): CandleApiItem[] {
  return trimNonTradingEdgeCandles(items).filter(
    (item) => !isNonTradingGapPlaceholder(item),
  );
}

function isNonTradingEdgePlaceholder(item: CandleApiItem | undefined): boolean {
  if (item === undefined) return false;
  return (
    item.source === 'rest' &&
    item.volume === 0 &&
    item.open === item.high &&
    item.high === item.low &&
    item.low === item.close
  );
}

function isNonTradingGapPlaceholder(item: CandleApiItem): boolean {
  return isNonTradingEdgePlaceholder(item) && isKstClosedNightMinute(item.bucketAt);
}

function isKstClosedNightMinute(iso: string): boolean {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  const shifted = new Date(ms + KST_OFFSET_MS);
  const minuteOfDay = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  return minuteOfDay >= 20 * 60 || minuteOfDay < 8 * 60;
}

function ChartMessage({
  title,
  detail,
  fillHeight = false,
}: {
  title: string;
  detail: string;
  fillHeight?: boolean;
}) {
  return (
    <div
      style={{
        border: '1px dashed var(--border)',
        borderRadius: 10,
        padding: '42px 14px',
        textAlign: 'center',
        color: 'var(--text-muted)',
        lineHeight: 1.6,
        ...(fillHeight
          ? {
              flex: '1 1 0',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }
          : {}),
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
        {title}
      </div>
      <div style={{ fontSize: 11, marginTop: 4 }}>{detail}</div>
    </div>
  );
}

export function getChartPalette(colorScheme: ChartColorScheme) {
  if (colorScheme === 'us') {
    return {
      upColor: '#0ECB81',
      downColor: '#F6465D',
      volumeUpColor: 'rgba(14, 203, 129, 0.35)',
      volumeDownColor: 'rgba(246, 70, 93, 0.35)',
    };
  }
  return {
    upColor: '#F6465D',
    downColor: '#1EAEDB',
    volumeUpColor: 'rgba(246, 70, 93, 0.35)',
    volumeDownColor: 'rgba(30, 174, 219, 0.35)',
  };
}

type CandleTooltipRows = Array<[string, string]>;

export function shouldReplaceCandleTooltipRows(
  previousTime: number | null,
  nextTime: number,
): boolean {
  return previousTime !== nextTime;
}

function LightweightCandleCanvas({
  items,
  colorScheme,
  height,
  fillHeight,
}: {
  items: readonly CandleApiItem[];
  colorScheme: ChartColorScheme;
  height: number;
  fillHeight: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const tooltipTimeRef = useRef<number | null>(null);
  const tooltipVisibleRef = useRef(false);
  const tooltipPositionRef = useRef<{ x: number; y: number } | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const latestDataRef = useRef<{
    candleData: CandlestickData[];
    volumeData: HistogramData[];
  }>({ candleData: [], volumeData: [] });
  const itemByTimeRef = useRef<Map<number, CandleApiItem>>(new Map());
  const visibleRangeKeyRef = useRef<string | null>(null);
  const palette = getChartPalette(colorScheme);
  const [tooltipRows, setTooltipRows] = useState<CandleTooltipRows | null>(null);
  const [pinnedRows, setPinnedRows] = useState<CandleTooltipRows | null>(null);
  const candleData = useMemo<CandlestickData[]>(
    () =>
      items.map((item) => ({
        time: item.time as UTCTimestamp,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
      })),
    [items],
  );
  const volumeData = useMemo<HistogramData[]>(
    () =>
      items.map((item) => ({
        time: item.time as UTCTimestamp,
        value: item.volume,
        color:
          item.close >= item.open
            ? palette.volumeUpColor
            : palette.volumeDownColor,
      })),
    [items, palette.volumeDownColor, palette.volumeUpColor],
  );
  const itemByTime = useMemo(() => {
    const map = new Map<number, CandleApiItem>();
    for (const item of items) {
      map.set(item.time, item);
    }
    return map;
  }, [items]);
  const latestItem = items.length === 0 ? null : items[items.length - 1];

  useEffect(() => {
    latestDataRef.current = { candleData, volumeData };
    itemByTimeRef.current = itemByTime;

    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (candleSeries === null || volumeSeries === null) return;

    candleSeries.setData(candleData);
    volumeSeries.setData(volumeData);

    const nextRangeKey = chartVisibleRangeKey(items);
    if (nextRangeKey !== null && nextRangeKey !== visibleRangeKeyRef.current) {
      visibleRangeKeyRef.current = nextRangeKey;
      chartRef.current?.timeScale().fitContent();
    }
  }, [candleData, itemByTime, items, volumeData]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    let disposed = false;
    let removeChart: (() => void) | null = null;
    let tooltipFrameId: number | null = null;
    let pendingTooltipPosition: { x: number; y: number } | null = null;

    const scheduleTooltipPosition = (x: number, y: number) => {
      const position = { x, y };
      pendingTooltipPosition = position;
      tooltipPositionRef.current = position;
      if (tooltipFrameId !== null) return;

      tooltipFrameId = window.requestAnimationFrame(() => {
        tooltipFrameId = null;
        const nextPosition = pendingTooltipPosition;
        if (nextPosition === null || tooltipRef.current === null) return;
        tooltipRef.current.style.transform = `translate(${nextPosition.x}px, ${nextPosition.y}px)`;
      });
    };

    const hideTooltip = () => {
      pendingTooltipPosition = null;
      tooltipPositionRef.current = null;
      tooltipTimeRef.current = null;
      if (tooltipFrameId !== null) {
        window.cancelAnimationFrame(tooltipFrameId);
        tooltipFrameId = null;
      }
      if (!tooltipVisibleRef.current) return;
      tooltipVisibleRef.current = false;
      setTooltipRows(null);
    };

    setTooltipRows(null);
    tooltipTimeRef.current = null;
    tooltipVisibleRef.current = false;
    tooltipPositionRef.current = null;
    setPinnedRows(null);
    visibleRangeKeyRef.current = null;

    void import('lightweight-charts').then(
      ({ CandlestickSeries, HistogramSeries, createChart }) => {
        if (disposed) return;
        const initialHeight = fillHeight
          ? Math.max(180, host.clientHeight || height)
          : height;
        const chart = createChart(host, {
          autoSize: true,
          height: initialHeight,
          layout: {
            background: { color: 'transparent' },
            textColor: '#848E9C',
          },
          localization: {
            locale: 'ko-KR',
            dateFormat: 'yyyy-MM-dd',
            timeFormatter: formatKstChartTime,
          },
          grid: {
            vertLines: { color: 'rgba(132, 142, 156, 0.12)' },
            horzLines: { color: 'rgba(132, 142, 156, 0.12)' },
          },
          rightPriceScale: {
            borderColor: 'rgba(132, 142, 156, 0.25)',
          },
          timeScale: {
            borderColor: 'rgba(132, 142, 156, 0.25)',
            timeVisible: true,
            tickMarkFormatter: formatKstTickMark,
          },
        });
        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: palette.upColor,
          downColor: palette.downColor,
          borderVisible: false,
          wickUpColor: palette.upColor,
          wickDownColor: palette.downColor,
        });
        candleSeriesRef.current = candleSeries;
        candleSeries.setData(latestDataRef.current.candleData);

        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: '',
        });
        volumeSeries.priceScale().applyOptions({
          scaleMargins: { top: 0.78, bottom: 0 },
        });
        volumeSeriesRef.current = volumeSeries;
        volumeSeries.setData(latestDataRef.current.volumeData);
        chartRef.current = chart;
        const handleCrosshairMove = (param: MouseEventParams) => {
          const point = param.point;
          if (
            point === undefined ||
            point.x < 0 ||
            point.y < 0 ||
            point.x > host.clientWidth ||
            point.y > host.clientHeight ||
            param.time === undefined
          ) {
            hideTooltip();
            return;
          }
          const tooltipTime = Number(param.time);
          const item = itemByTimeRef.current.get(tooltipTime);
          if (item === undefined) {
            hideTooltip();
            return;
          }
          scheduleTooltipPosition(
            Math.min(point.x + 12, Math.max(12, host.clientWidth - 190)),
            Math.min(point.y + 12, Math.max(12, host.clientHeight - 164)),
          );
          if (
            tooltipVisibleRef.current &&
            !shouldReplaceCandleTooltipRows(tooltipTimeRef.current, tooltipTime)
          ) {
            return;
          }
          tooltipVisibleRef.current = true;
          tooltipTimeRef.current = tooltipTime;
          setTooltipRows(formatCandleTooltipRows(item));
        };
        const handleClick = (param: MouseEventParams) => {
          if (param.time === undefined) {
            setPinnedRows(null);
            return;
          }
          const item = itemByTimeRef.current.get(Number(param.time));
          setPinnedRows(item === undefined ? null : formatCandleTooltipRows(item));
        };
        chart.subscribeCrosshairMove(handleCrosshairMove);
        chart.subscribeClick(handleClick);
        chart.timeScale().fitContent();
        visibleRangeKeyRef.current = chartVisibleRangeKeyFromCandles(
          latestDataRef.current.candleData,
        );
        removeChart = () => {
          chart.unsubscribeCrosshairMove(handleCrosshairMove);
          chart.unsubscribeClick(handleClick);
          chart.remove();
          chartRef.current = null;
          candleSeriesRef.current = null;
          volumeSeriesRef.current = null;
        };
      },
    );

    return () => {
      disposed = true;
      if (tooltipFrameId !== null) {
        window.cancelAnimationFrame(tooltipFrameId);
        tooltipFrameId = null;
      }
      removeChart?.();
    };
  }, [
    fillHeight,
    height,
    palette.downColor,
    palette.upColor,
    palette.volumeDownColor,
    palette.volumeUpColor,
  ]);

  const tooltipTransform =
    tooltipPositionRef.current === null
      ? 'translate(12px, 12px)'
      : `translate(${tooltipPositionRef.current.x}px, ${tooltipPositionRef.current.y}px)`;

  return (
    <div
      style={{
        position: 'relative',
        ...(fillHeight
          ? {
              flex: '1 1 0',
              minHeight: 0,
            }
          : {}),
      }}
    >
      {pinnedRows !== null && (
        <PinnedCandlePanel
          rows={pinnedRows}
          onClear={() => setPinnedRows(null)}
        />
      )}
      <div
        ref={hostRef}
        data-testid="stock-candle-chart-host"
        data-candle-count={items.length}
        data-latest-candle-time={latestItem?.bucketAt ?? ''}
        data-latest-candle-close={latestItem?.close ?? ''}
        data-latest-candle-sample-count={latestItem?.sampleCount ?? ''}
        data-latest-candle-source={latestItem?.source ?? ''}
        data-latest-candle-partial={latestItem?.isPartial === true ? 'true' : 'false'}
        style={{
          height: fillHeight ? '100%' : height,
          minHeight: fillHeight ? 180 : undefined,
          width: '100%',
        }}
      />
      {tooltipRows !== null && (
        <div
          ref={tooltipRef}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transform: tooltipTransform,
            width: 178,
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--bg-card)',
            boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
            padding: '8px 9px',
            pointerEvents: 'none',
            fontSize: 11,
            color: 'var(--text-primary)',
            zIndex: 2,
          }}
        >
          {tooltipRows.map(([label, value]) => (
            <div
              key={label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                lineHeight: 1.55,
              }}
            >
              <span style={{ color: 'var(--text-muted)' }}>{label}</span>
              <span style={{ fontWeight: 700, textAlign: 'right' }}>{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PinnedCandlePanel({
  rows,
  onClear,
}: {
  rows: Array<[string, string]>;
  onClear: () => void;
}) {
  return (
    <div
      style={{
        borderBottom: '1px solid var(--border-soft)',
        background: 'rgba(240, 185, 11, 0.08)',
        padding: '9px 10px',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        gap: 10,
        fontSize: 11,
        color: 'var(--text-primary)',
      }}
    >
      <strong style={{ fontSize: 12 }}>고정된 봉</strong>
      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          minWidth: 0,
        }}
      >
        {rows.map(([label, value]) => (
          <span key={label} style={{ whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--text-muted)', marginRight: 3 }}>
              {label}
            </span>
            <span style={{ fontWeight: 800 }}>{value}</span>
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={onClear}
        style={{
          height: 26,
          border: '1px solid var(--border)',
          borderRadius: 7,
          background: 'var(--bg-card)',
          color: 'var(--text-muted)',
          fontSize: 11,
          fontWeight: 800,
          padding: '0 8px',
          cursor: 'pointer',
        }}
      >
        해제
      </button>
    </div>
  );
}

export function formatCandleTooltipRows(
  item: CandleApiItem,
): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ['시각', formatKstMinute(item.bucketAt)],
    ['시가', fmtPrice(item.open)],
    ['고가', fmtPrice(item.high)],
    ['저가', fmtPrice(item.low)],
    ['종가', fmtPrice(item.close)],
    ['거래량', fmtVolMan(item.volume)],
  ];
  if (item.source !== undefined && item.source !== null) {
    rows.push(['데이터', item.source]);
  }
  return rows;
}

function formatKstMinute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const shifted = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  const hour = String(shifted.getUTCHours()).padStart(2, '0');
  const minute = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${year}. ${month}. ${day}. ${hour}:${minute}`;
}

export function formatKstChartTime(time: Time): string {
  const ms = chartTimeToMs(time);
  if (ms === null) return String(time);
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms));
}

export function formatKstTickMark(time: Time): string | null {
  const ms = chartTimeToMs(time);
  if (ms === null) return null;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms));
}

function chartTimeToMs(time: Time): number | null {
  if (typeof time === 'number') return time * 1000;
  if (typeof time === 'string') {
    const parsed = Date.parse(time);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const date = Date.UTC(time.year, time.month - 1, time.day, 0, 0, 0, 0);
  return Number.isFinite(date) ? date : null;
}

function chartVisibleRangeKey(items: readonly CandleApiItem[]): string | null {
  if (items.length === 0) return null;
  const first = items[0];
  const last = items[items.length - 1];
  if (first === undefined || last === undefined) return null;
  return `${first.time}:${last.time}:${items.length}`;
}

function chartVisibleRangeKeyFromCandles(
  candles: readonly CandlestickData[],
): string | null {
  if (candles.length === 0) return null;
  const first = candles[0];
  const last = candles[candles.length - 1];
  if (first === undefined || last === undefined) return null;
  return `${String(first.time)}:${String(last.time)}:${candles.length}`;
}
