import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CandlestickData,
  HistogramData,
  MouseEventParams,
  UTCTimestamp,
} from 'lightweight-charts';
import type { CandleApiCoverage, CandleApiItem, CandleInterval } from '@shared/types';
import { fmtPrice, fmtVolMan } from '../lib/format';
import {
  ensureStockCandleCoverage,
  getStockCandles,
  type CandleRange,
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
  const [coverage, setCoverage] = useState<CandleApiCoverage | null>(null);
  const [coveragePending, setCoveragePending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dataSourceText, setDataSourceText] = useState('로컬 저장 candle');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setCoveragePending(true);
    setMessage(dailyInterval(interval) ? '과거 일봉 coverage 확인 중' : '과거 분봉 coverage 확인 중');

    ensureStockCandleCoverage(ticker, { interval, range })
      .then((coverage) => {
        if (cancelled) return;
        if (coverage.state === 'backfilled') {
          const label = coverage.source === 'kis-daily' ? '일봉' : '분봉';
          setMessage(`${label} 자동 보강 완료: ${coverage.inserted + coverage.updated}개 candle 반영`);
        } else if (coverage.state === 'current') {
          setMessage('차트 coverage가 이미 준비되어 있습니다.');
        } else if (coverage.state === 'skipped') {
          setMessage(coverage.message);
        } else {
          setMessage('차트 coverage를 확인했습니다. 표시 가능한 candle이 있으면 바로 보여줍니다.');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setMessage('KIS credentials 준비 후 차트 과거 데이터를 자동 보강합니다.');
      })
      .finally(() => {
        if (!cancelled) setCoveragePending(false);
      })
      .then(() => getStockCandles(ticker, { interval, range }))
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setCoverage(data.coverage);
        setStatus(data.items.length === 0 ? 'empty' : 'ready');
        const sources = data.coverage.sourceMix;
        setDataSourceText(
          sources.includes('kis-time-daily')
            ? 'KIS 과거 분봉 포함'
            : sources.includes('kis-time-today')
              ? 'KIS 당일분봉 포함'
            : data.coverage.backfilled
              ? 'KIS 일봉 백필 포함'
              : '로컬 저장 candle',
        );
        if (data.items.length === 0) {
          setMessage(data.status.message);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setItems([]);
        setCoverage(null);
        setStatus('error');
        setDataSourceText('로컬 저장 candle');
      });

    return () => {
      cancelled = true;
    };
  }, [ticker, interval, range]);

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
        <ChartAutoBackfillStatus
          interval={interval}
          pending={coveragePending}
          message={message}
        />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {dataSourceText}
        </span>
      </div>
      {message !== null && !coveragePending && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
          {message}
        </div>
      )}
      <CandleChartView
        status={status}
        items={items}
        coverage={coverage}
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
  coverage,
  interval,
  range,
}: {
  status: ChartStatus;
  items: readonly CandleApiItem[];
  coverage?: CandleApiCoverage | null;
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
        <span>
          {items.length} candles · 마우스를 올리면 OHLCV 표시 · 클릭하면 봉 고정
        </span>
      </div>
      {coverage !== undefined && coverage !== null && (
        <CandleDataInspector coverage={coverage} />
      )}
      <LightweightCandleCanvas items={items} />
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
  if (sources.includes('kis-time-daily')) return 'KIS 과거 분봉';
  if (sources.includes('kis-time-today')) return 'KIS 당일분봉';
  if (sources.includes('kis-daily')) return 'KIS 일봉';
  if (sources.length === 0) return '저장 데이터 없음';
  return sources.join(', ');
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
  const [pinnedRows, setPinnedRows] = useState<Array<[string, string]> | null>(null);
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
    setTooltip(null);
    setPinnedRows(null);

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
        };
        const handleClick = (param: MouseEventParams) => {
          if (param.time === undefined) {
            setPinnedRows(null);
            return;
          }
          const item = itemByTime.get(Number(param.time));
          setPinnedRows(item === undefined ? null : formatCandleTooltipRows(item));
        };
        chart.subscribeCrosshairMove(handleCrosshairMove);
        chart.subscribeClick(handleClick);
        chart.timeScale().fitContent();
        removeChart = () => {
          chart.unsubscribeCrosshairMove(handleCrosshairMove);
          chart.unsubscribeClick(handleClick);
          chart.remove();
        };
      },
    );

    return () => {
      disposed = true;
      removeChart?.();
    };
  }, [candleData, itemByTime, volumeData]);

  return (
    <div style={{ position: 'relative' }}>
      {pinnedRows !== null && (
        <PinnedCandlePanel
          rows={pinnedRows}
          onClear={() => setPinnedRows(null)}
        />
      )}
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
