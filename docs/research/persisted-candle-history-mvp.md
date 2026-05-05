# Persisted Candle History MVP

Date: 2026-05-05

## Summary

Araon previously had two price-history surfaces:

- Browser session sparkline: `usePriceHistoryStore`, memory-only, lost on reload/restart.
- Server snapshot store: `price_snapshots`, useful for warm-start latest prices, not intraday chart history.

This MVP adds a local candle foundation. The server records observed price updates into SQLite `price_candles` as canonical 1-minute candles, exposes a candle API, and the stock detail modal shows a `차트` tab with TradingView Lightweight Charts.

No raw tick table was added. No synthetic past candles are generated.

Historical daily backfill was added as a follow-up MVP in
`docs/research/historical-backfill-mvp.md`. It is operator-controlled,
daily-only, OFF by default for automatic background runs, and blocked during
market hours.

## Storage Policy

`price_candles` stores observed local candles and manual daily backfill candles:

- canonical intraday interval: `1m`
- canonical historical daily interval: `1d`
- bucket boundary: KST-based, stored as ISO UTC
- session: `pre`, `regular`, `after`, or `unknown`
- OHLCV: open/high/low/close/volume
- `sample_count`: number of observed price updates folded into the candle
- `is_partial`: true when volume continuity is incomplete, such as first observed cumulative volume

Only tracked ticker rows are persisted. The repository filters candle writes against `stocks` before upsert.

## Volume Delta Policy

KIS `Price.volume` is treated as current-session cumulative volume. Candle volume is therefore derived as:

```txt
delta = current cumulative volume - previous cumulative volume
```

Rules:

- first observation for a ticker/session/day uses delta `0` and marks the candle partial
- negative delta is treated as a reset; delta `0`, baseline reset, partial candle
- cumulative volume is never added directly to candle volume

This avoids pretending that all volume before Araon started belongs to the first observed candle.

## Flush Policy

`createCandleRecorder` listens to `PriceStore` `price-update` events.

Flow:

```txt
PriceStore price-update
→ in-memory candle aggregator
→ dirty candle set
→ batch upsert every 5 seconds
→ flush on app close / graceful shutdown snapshot step
```

SQLite writes are intentionally batched. The recorder does not write once per tick.

Aggregation failures are isolated with warning logs and counters; they must not stop REST polling, WebSocket runtime, SSE, or the price store.

## API

Endpoint:

```txt
GET /stocks/:ticker/candles
```

Query:

```txt
interval=1m|3m|5m|10m|15m|30m|1h|2h|4h|6h|12h|1D|1W|1M
range=1d|1w|1m|3m|6m|1y
from=<ISO optional>
to=<ISO optional>
limit=<optional>
```

Policy:

- Intraday intervals are aggregated server-side from local `1m` rows.
- `1D`/`1W`/`1M` are aggregated server-side from stored `1d` rows.
- `1D` groups by KST calendar day.
- `1W` groups by KST Monday-start week.
- `1M` groups by KST calendar month.
- Empty data returns `items: []`.
- `coverage.localOnly` is `false` when KIS daily rows are included.
- `coverage.backfilled` is `true` when `sourceMix` contains `kis-daily`.

The response includes Unix seconds `time` so Lightweight Charts can consume intraday candles directly.

## UI

`StockDetailModal` now has:

- `실시간`: existing browser-session sparkline and deterministic signal explanation
- `차트`: local persisted candles rendered by TradingView Lightweight Charts

The default chart query is:

```txt
interval=1m
range=1d
```

For daily and higher intervals, the UI avoids too-short first views by widening
the selected range to a useful minimum:

```txt
1D -> 1m
1W -> 3m
1M -> 1y
```

If no local candles exist, the modal shows:

```txt
차트 데이터 수집 중
Araon이 실행 중인 동안의 1분봉부터 저장됩니다.
```

No synthetic chart is displayed for missing historical ranges.

## Lightweight Charts Choice

TradingView Lightweight Charts is used as a small client dependency for custom local data.

Explicitly not used:

- TradingView Widget
- TradingView Advanced Charts
- iframe-based external charting

Araon owns the data source and only renders local candle rows.

## Not Included

This combined candle/backfill MVP does not include:

- raw tick persistence
- KIS historical minute backfill
- automatic background backfill default ON
- automatic 1w/1m/3m completeness
- historical volume baseline bootstrap

## Future Work

- KIS historical 1m backfill with strict operator controls
- recently opened chart priority for the background daily queue
- volume baseline bootstrap from historical daily/minute data
- chart tooltip/crosshair metadata
- regular-only vs integrated-day candle mode
