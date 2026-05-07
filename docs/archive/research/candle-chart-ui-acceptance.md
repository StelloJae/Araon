# Candle Chart UI Acceptance

Date: 2026-05-06

## Summary

Araon's StockDetailModal candle chart was checked against the local
`kis-daily` candles stored by the single-ticker KIS daily backfill live probe.

This acceptance did not run another KIS historical call, WebSocket session,
cap smoke, full watchlist backfill, or background backfill queue.

## Preflight

Starting point:

```txt
HEAD: 7224d46
tracked ticker: 005930
stored daily candles: 20
stored source: kis-daily
oldest bucket: 2026-04-05T15:00:00.000Z
newest bucket: 2026-05-03T15:00:00.000Z
```

Realtime status was read-only checked before UI work:

```txt
runtimeStatus: started
state: manual-disabled
subscribedTickerCount: 0
session.enabled: false
session.applyEnabled: false
```

## API Checks

The chart-facing candles API returned the expected stored and aggregated rows:

```txt
GET /stocks/005930/candles?interval=1D&range=1m
items: 20
coverage.backfilled: true
coverage.localOnly: false
coverage.sourceMix: ["kis-daily"]
status.state: ready

GET /stocks/005930/candles?interval=1W&range=3m
items: 5
coverage.backfilled: true
coverage.localOnly: false
coverage.sourceMix: ["kis-daily"]
status.state: ready

GET /stocks/005930/candles?interval=1M&range=1y
items: 2
coverage.backfilled: true
coverage.localOnly: false
coverage.sourceMix: ["kis-daily"]
status.state: ready
```

An empty ticker check stayed honest:

```txt
GET /stocks/010620/candles?interval=1D&range=1m
items: 0
coverage.backfilled: false
coverage.localOnly: true
status.state: collecting
```

## UI Checks

Browser acceptance was run against the local Araon dashboard at
`http://127.0.0.1:5173/`.

Flow:

```txt
open dashboard
open 005930 StockDetailModal
select 차트 tab
select 1D
```

Result after refresh:

```txt
1D · 1m
20 candles
data source label: KIS 일봉 백필 포함
status message: 저장된 candle을 표시하고 있습니다.
```

Daily aggregate intervals were also checked:

```txt
1W · 3m
5 candles

1M · 1y
2 candles
```

The initial UI check found a small usability gap: if the user selected `1D`
while range stayed at `1d`, the API correctly returned no daily rows for that
short window, so the modal showed the empty state even though `kis-daily`
candles existed. The chart selector now widens too-short ranges for daily
intervals:

```txt
1D minimum range: 1m
1W minimum range: 3m
1M minimum range: 1y
```

This keeps the first daily/weekly/monthly chart selection aligned with the
available KIS daily backfill data without inventing candles.

## Cleanup And Console

Lightweight Charts lifecycle was checked by opening and closing the modal and
switching intervals:

```txt
after close: chart hosts 0, canvases 0
open 1D: chart hosts 1, canvases 7, host 912x320
after 1W/1M switch: chart hosts 1, canvases 7
final close: chart hosts 0, canvases 0
```

Browser console:

```txt
errors: 0
warnings: 0
```

Observed browser requests for this acceptance were local API `GET` requests.
No `POST /stocks/:ticker/candles/backfill` request was made during UI
acceptance.

## Verdict

The chart/backfill MVP is now product-surface verified for the narrow accepted
case:

```txt
single ticker 005930
stored KIS daily candles
StockDetailModal chart tab
1D visible
1W/1M aggregate visible
empty state honest for tickers without candle data
no additional KIS historical call
no WebSocket/cap/background queue run
```

## Not Validated

This UI acceptance intentionally did not validate:

- full watchlist backfill
- live background backfill queue operation
- historical minute backfill
- live WebSocket/cap behavior
- release packaging
