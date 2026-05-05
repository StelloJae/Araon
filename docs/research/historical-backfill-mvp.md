# Historical Backfill MVP

Date: 2026-05-05

## Summary

This MVP adds an operator-controlled historical daily backfill path for Araon
candle charts.

The goal is long-range chart context without pretending that Araon already has
complete intraday history. The first historical source is KIS daily candles
(`1d`). Intraday history remains local-only and is collected while Araon is
running.

Implementation tests use mocked transports by default. The later single-ticker
live probe is recorded in `docs/research/kis-daily-backfill-live-probe.md`,
and the product-surface UI acceptance is recorded in
`docs/research/candle-chart-ui-acceptance.md`.

## Policy

Backfill is allowed only outside the integrated trading window:

```txt
Weekday 07:55-20:05 KST: blocked
Weekday after 20:05 KST: allowed
Weekend: allowed
Unknown phase: blocked
```

The 20:05 safety margin matches Araon's integrated realtime shutdown posture.
It avoids competing with `H0UNCNT0` WebSocket and REST polling during premarket,
regular, and after-hours trading.

This MVP is operator-controlled:

```txt
POST /stocks/:ticker/candles/backfill
```

Automatic background queueing exists, but is intentionally disabled by default:

```txt
backgroundDailyBackfillEnabled=false
backgroundDailyBackfillRange=3m
```

When enabled from Settings → 연결 → 과거 일봉 백필, the scheduler only runs
outside market hours, prioritizes favorites before the rest of the tracked
catalog, and caps each run to a small ticker batch.

## Storage

`price_candles` now has two meaningful stored intervals:

```txt
1m: local Araon runtime candles
1d: KIS historical daily backfill candles
```

Stored KIS daily rows use:

```txt
source = kis-daily
is_partial = false
session = regular
```

Raw KIS responses are not persisted. The mapper normalizes only OHLCV and date
fields into the shared `PriceCandle` contract.

## Aggregation

Araon uses two canonical sources:

```txt
3m-12h: aggregated from stored 1m candles
1D/1W/1M: aggregated from stored 1d candles
```

Calendar policy:

```txt
1D = KST calendar day
1W = KST week starting Monday
1M = KST calendar month
```

This avoids building weekly/monthly candles from partial minute data.

## API

### GET candles

```txt
GET /stocks/:ticker/candles
```

Supported intervals:

```txt
1m 3m 5m 10m 15m 30m 1h 2h 4h 6h 12h 1D 1W 1M
```

Coverage now includes:

```txt
localOnly
backfilled
sourceMix
partialCount
gapCount
oldestBucketAt
newestBucketAt
```

Status now includes:

```txt
empty | collecting | partial | ready
```

### Manual daily backfill

```txt
POST /stocks/:ticker/candles/backfill
{
  "interval": "1d",
  "range": "3m"
}
```

Allowed manual daily backfill ranges:

```txt
1m 3m 6m 1y
```

Long ranges are split into <=100-day KIS request windows and de-duplicated
before upsert. This keeps the UI honest about longer chart coverage without
pretending KIS returns an unlimited daily series in a single call.

Blocked response during market hours:

```txt
BACKFILL_NOT_ALLOWED_DURING_MARKET
```

The endpoint requires the KIS runtime to be started in production. Tests inject
a mock backfill service and perform no external calls.

## UI

`StockCandleChart` now exposes:

- `1W` and `1M` interval options
- a manual `과거 일봉 가져오기` control for `1D`, `1W`, and `1M`
- `6m` and `1y` chart ranges

`SettingsModal` → `연결` now exposes:

- an OFF-by-default `과거 일봉 백필` toggle
- a background range selector: `1m`, `3m`, `6m`, `1y`

The button is hidden for intraday intervals. During market hours, the UI disables
the action and the server also rejects it.

Empty chart copy stays honest:

```txt
Araon이 실행 중인 동안의 1분봉부터 저장됩니다.
1D/1W/1M은 KIS 일봉 백필 후 표시됩니다.
```

No synthetic chart data is generated.

## Not Included

- automatic background queue default ON
- full watchlist backfill
- historical minute backfill
- raw tick persistence
- KIS weekly/monthly as canonical storage
- KIS WebSocket/live smoke or cap tests
- realtime setting changes

## Future Work

- recently opened chart priority ahead of favorites
- explicit 0.5-1 rps token-bucket throttle and 429 cooldown persistence
- holiday-aware backfill calendar
- selected-ticker intraday backfill, if KIS endpoint behavior is validated live
- coverage gap detection beyond `gapCount=0` placeholder
