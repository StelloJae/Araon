import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CandlestickData,
  HistogramData,
  MouseEventParams,
  UTCTimestamp,
} from 'lightweight-charts';
import type { CandleApiItem, CandleInterval } from '@shared/types';
import { fmtPrice, fmtVolMan } from '../lib/format';
import {
  ApiError,
  backfillStockCandles,
  getStockCandles,
  type CandleRange,
  type DailyBackfillRange,
} from '../lib/api-client';

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

interface StockCandleChartProps {
  ticker: string;
}

export function StockCandleChart({ ticker }: StockCandleChartProps) {
  const [interval, setInterval] = useState<CandleInterval>('1m');
  const [range, setRange] = useState<CandleRange>('1d');
  const [status, setStatus] = useState<ChartStatus>('loading');
  const [items, setItems] = useState<CandleApiItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [backfillPending, setBackfillPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dataSourceText, setDataSourceText] = useState('로컬 저장 candle');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    getStockCandles(ticker, { interval, range })
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setStatus(data.items.length === 0 ? 'empty' : 'ready');
        setDataSourceText(data.coverage.backfilled ? 'KIS 일봉 백필 포함' : '로컬 저장 candle');
        setMessage(data.status.message);
      })
      .catch(() => {
        if (cancelled) return;
        setItems([]);
        setStatus('error');
        setDataSourceText('로컬 저장 candle');
      });

    return () => {
      cancelled = true;
    };
  }, [ticker, interval, range, refreshKey]);

  async function handleBackfill(): Promise<void> {
    if (!dailyInterval(interval)) return;
    setBackfillPending(true);
    setMessage(null);
    try {
      const result = await backfillStockCandles(ticker, {
        interval: '1d',
        range: dailyBackfillRange(range),
      });
      setMessage(`일봉 백필 완료: ${result.inserted + result.updated}개 candle 반영`);
      setRefreshKey((key) => key + 1);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setMessage('장중에는 과거 데이터 가져오기를 멈춥니다. 20:05 이후 다시 시도해 주세요.');
      } else {
        setMessage('과거 일봉을 가져오지 못했습니다. 설정과 KIS 런타임 상태를 확인해 주세요.');
      }
    } finally {
      setBackfillPending(false);
    }
  }

  const backfillWindow = isManualBackfillWindow(new Date());
  const backfillMessage = dailyInterval(interval)
    ? (backfillWindow
      ? 'KIS 과거 일봉을 가져와 1D/1W/1M 차트를 채웁니다.'
      : '장중에는 과거 데이터 가져오기를 멈춥니다.')
    : null;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 10,
        }}
      >
        <SegmentedSelect
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
        <SegmentedSelect
          label="범위"
          value={range}
          values={RANGES}
          onChange={(value) => setRange(value as CandleRange)}
        />
        <ChartBackfillControl
          interval={interval}
          disabled={!backfillWindow}
          pending={backfillPending}
          message={backfillMessage}
          onBackfill={() => {
            void handleBackfill();
          }}
        />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {dataSourceText}
        </span>
      </div>
      {message !== null && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
          {message}
        </div>
      )}
      <CandleChartView
        status={status}
        items={items}
        interval={interval}
        range={range}
      />
    </div>
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

function dailyBackfillRange(range: CandleRange): DailyBackfillRange {
  switch (range) {
    case '3m':
    case '6m':
    case '1y':
      return range;
    case '1d':
    case '1w':
    case '1m':
      return '1m';
  }
}

function isManualBackfillWindow(now: Date): boolean {
  const shifted = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const day = shifted.getUTCDay();
  if (day === 0 || day === 6) return true;
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  return minutes >= 20 * 60 + 5 || minutes < 7 * 60 + 55;
}

export function ChartBackfillControl({
  interval,
  disabled,
  pending,
  message,
  onBackfill,
}: {
  interval: CandleInterval;
  disabled: boolean;
  pending: boolean;
  message: string | null;
  onBackfill: () => void;
}) {
  if (!dailyInterval(interval)) return null;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
      }}
    >
      <button
        type="button"
        disabled={disabled || pending}
        onClick={onBackfill}
        style={{
          height: 30,
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: disabled ? 'var(--bg-muted)' : '#F0B90B',
          color: disabled ? 'var(--text-muted)' : '#1E2026',
          fontSize: 12,
          fontWeight: 800,
          padding: '0 10px',
          cursor: disabled || pending ? 'not-allowed' : 'pointer',
        }}
      >
        {pending ? '가져오는 중' : '과거 일봉 가져오기'}
      </button>
      {message !== null && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {message}
        </span>
      )}
    </span>
  );
}

function SegmentedSelect({
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
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--text-muted)',
      }}
    >
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        style={{
          height: 30,
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          fontSize: 12,
          fontWeight: 700,
          padding: '0 8px',
        }}
      >
        {values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CandleChartView({
  status,
  items,
  interval,
  range,
}: {
  status: ChartStatus;
  items: readonly CandleApiItem[];
  interval: CandleInterval;
  range: CandleRange;
}) {
  if (status === 'loading') {
    return <ChartMessage title="차트 불러오는 중" detail="로컬 candle 저장소를 확인하고 있습니다." />;
  }
  if (status === 'error') {
    return <ChartMessage title="차트를 불러오지 못했습니다" detail="잠시 후 다시 시도해 주세요." />;
  }
  if (status === 'empty' || items.length === 0) {
    return (
      <ChartMessage
        title="차트 데이터 수집 중"
        detail="Araon이 실행 중인 동안의 1분봉부터 저장됩니다. 1D/1W/1M은 KIS 일봉 백필 후 표시됩니다."
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
      }}
    >
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
        <span>{items.length} candles · 차트 위에 마우스를 올리면 OHLCV 표시</span>
      </div>
      <LightweightCandleCanvas items={items} />
    </div>
  );
}

function ChartMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <div
      style={{
        border: '1px dashed var(--border)',
        borderRadius: 10,
        padding: '42px 14px',
        textAlign: 'center',
        color: 'var(--text-muted)',
        lineHeight: 1.6,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
        {title}
      </div>
      <div style={{ fontSize: 11, marginTop: 4 }}>{detail}</div>
    </div>
  );
}

function LightweightCandleCanvas({ items }: { items: readonly CandleApiItem[] }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    rows: Array<[string, string]>;
  } | null>(null);
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
            ? 'rgba(14, 203, 129, 0.35)'
            : 'rgba(246, 70, 93, 0.35)',
      })),
    [items],
  );
  const itemByTime = useMemo(() => {
    const map = new Map<number, CandleApiItem>();
    for (const item of items) {
      map.set(item.time, item);
    }
    return map;
  }, [items]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null || candleData.length === 0) return;

    let disposed = false;
    let removeChart: (() => void) | null = null;

    void import('lightweight-charts').then(
      ({ CandlestickSeries, HistogramSeries, createChart }) => {
        if (disposed) return;
        const chart = createChart(host, {
          autoSize: true,
          height: 320,
          layout: {
            background: { color: 'transparent' },
            textColor: '#848E9C',
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
          },
        });
        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#0ECB81',
          downColor: '#F6465D',
          borderVisible: false,
          wickUpColor: '#0ECB81',
          wickDownColor: '#F6465D',
        });
        candleSeries.setData(candleData);

        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: '',
        });
        volumeSeries.priceScale().applyOptions({
          scaleMargins: { top: 0.78, bottom: 0 },
        });
        volumeSeries.setData(volumeData);
        chart.subscribeCrosshairMove((param: MouseEventParams) => {
          const point = param.point;
          if (
            point === undefined ||
            point.x < 0 ||
            point.y < 0 ||
            point.x > host.clientWidth ||
            point.y > host.clientHeight ||
            param.time === undefined
          ) {
            setTooltip(null);
            return;
          }
          const item = itemByTime.get(Number(param.time));
          if (item === undefined) {
            setTooltip(null);
            return;
          }
          setTooltip({
            x: Math.min(point.x + 12, Math.max(12, host.clientWidth - 190)),
            y: Math.min(point.y + 12, Math.max(12, host.clientHeight - 164)),
            rows: formatCandleTooltipRows(item),
          });
        });
        chart.timeScale().fitContent();
        removeChart = () => chart.remove();
      },
    );

    return () => {
      disposed = true;
      removeChart?.();
    };
  }, [candleData, volumeData]);

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={hostRef}
        data-testid="stock-candle-chart-host"
        style={{
          height: 320,
          width: '100%',
        }}
      />
      {tooltip !== null && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x,
            top: tooltip.y,
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
          {tooltip.rows.map(([label, value]) => (
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
