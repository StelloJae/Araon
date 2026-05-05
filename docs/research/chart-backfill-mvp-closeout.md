# Chart / Backfill MVP Closeout

Date: 2026-05-06

## Verdict

The chart/backfill MVP is closed at this checkpoint.

```txt
status: DONE for single-ticker daily live probe + UI acceptance
scope: local candle persistence, manual KIS daily backfill, StockDetailModal chart display
hold: full watchlist/background/minute historical backfill
```

This is not a release approval for wider background backfill operation. It is a
product checkpoint saying the narrow MVP works end-to-end from local storage to
the user-facing chart.

## MVP Goal

Araon needed to move from a memory-only realtime sparkline to a local candle
history surface that survives reloads/restarts and can show honest historical
daily context when explicitly backfilled.

The MVP target was deliberately narrow:

- persist local `1m` candles while Araon is running
- expose candle data through a typed API
- render the data in `StockDetailModal`
- add manual KIS daily backfill for long-range daily context
- show missing data honestly instead of generating synthetic chart history

## Done Scope

The following items are DONE:

- local `1m` candle persistence in SQLite `price_candles`
- batched candle aggregation from observed price updates
- cumulative-volume delta handling for local candle volume
- KIS daily chart mapper/client with mock-based tests
- manual daily backfill endpoint: `POST /stocks/:ticker/candles/backfill`
- market-hours backfill guard
- candle API: `GET /stocks/:ticker/candles`
- coverage/source/status contract on candle API responses
- `StockDetailModal` `차트` tab
- TradingView Lightweight Charts integration
- `1D` / `1W` / `1M` aggregate display from stored `1d` rows
- empty state for tickers or ranges without candle data
- localOnly/backfilled/source labeling in UI/API
- `005930` single-ticker KIS daily live probe
- `005930` product-surface UI acceptance
- no synthetic chart policy

## Verified Scope

Implementation verification:

```txt
npm test: pass
npm run typecheck: pass
npm run build: pass
```

Live probe:

```txt
ticker: 005930
manual KIS daily chart REST: verified
stored rows: 20
source: kis-daily
token issuance during successful run: 0
WebSocket/cap/background queue during probe: 0
```

UI acceptance:

```txt
005930 1D: 20 candles visible
005930 1W: 5 candles visible
005930 1M: 2 candles visible
empty ticker state: collecting / no synthetic chart
modal close cleanup: chart host/canvas removed
browser console errors/warnings: 0
additional KIS historical calls during UI acceptance: 0
```

Supporting records:

- `docs/research/persisted-candle-history-mvp.md`
- `docs/research/historical-backfill-mvp.md`
- `docs/research/kis-daily-backfill-live-probe.md`
- `docs/research/candle-chart-ui-acceptance.md`

## User Flow Acceptance

Observed user flow:

```txt
open Araon dashboard
open an existing stock row
open StockDetailModal
review 실시간 tab
select 차트 tab
select 1D
select 1W
select 1M
open a ticker without daily candle data
confirm empty state
close/reopen modal
reload dashboard and repeat 005930 chart check
```

Result:

```txt
005930: chart visible after reload
1D: visible with daily backfill data
1W: visible from 1d aggregation
1M: visible from 1d aggregation
empty ticker: shows "차트 데이터 수집 중"
```

Not executed in this closeout:

```txt
fresh clean dataDir first-run flow
npx/npm beta install flow
Electron/Docker packaging
```

Those belong to the broader Araon beta acceptance track, not this chart/backfill
closeout.

## Candle API Contract

Endpoint:

```txt
GET /stocks/:ticker/candles
```

Supported intervals:

```txt
1m 3m 5m 10m 15m 30m 1h 2h 4h 6h 12h 1D 1W 1M
```

Supported ranges:

```txt
1d 1w 1m 3m 6m 1y
```

Canonical storage:

```txt
1m: local Araon runtime candles
1d: KIS daily backfill candles
```

Aggregation policy:

```txt
3m-12h: aggregated from stored 1m rows
1D/1W/1M: aggregated from stored 1d rows
1W: KST Monday-start week
1M: KST calendar month
```

Coverage fields:

```txt
coverage.localOnly
coverage.backfilled
coverage.sourceMix
coverage.partialCount
coverage.gapCount
coverage.oldestBucketAt
coverage.newestBucketAt
```

Status states:

```txt
empty: no candle rows and no active collection signal
collecting: no chartable rows yet, but local collection/backfill path is available
partial: rows exist but partial candles are present
ready: chartable rows are available
```

Known sources:

```txt
local-ws-integrated
local-rest
kis-daily
mixed
```

## Data Policy

Araon only displays candle data it actually has:

- Local intraday candles are created from price updates observed while Araon is running.
- KIS historical backfill stores daily candles only.
- `1W` and `1M` are derived from stored `1d` candles.
- Missing historical ranges return empty/collecting states.
- Raw ticks are not persisted.
- Missing chart history is not synthesized.

## Risks And Limitations

Known limitations:

- KIS daily historical source and `H0UNCNT0` realtime source may not represent
  exactly the same market scope.
- Local `1m` candles are incomplete for periods when Araon was not running.
- Historical minute backfill is not implemented.
- Full watchlist backfill is not live-validated.
- Background daily backfill exists as opt-in infrastructure, but live operation
  remains HOLD.
- `gapCount` is still a light contract field, not a full data-quality audit.
- Corporate action / adjusted-price semantics follow KIS returned values and
  are not deeply modeled yet.
- Chart tooltip/crosshair polish is not part of the MVP closeout.

## Hold Items

These remain HOLD and require separate approval:

- full watchlist backfill
- automatic background backfill live operation
- historical minute backfill
- KIS weekly/monthly canonical storage
- chart tooltip/crosshair polish
- news/disclosure tab
- observation log / memo
- volume surge historical bootstrap beyond the current foundation
- release/npm/Electron/Docker work

## Operating Guardrails

Do not enable background live backfill without separate approval.

Do not synthesize missing chart data.

Do not run historical backfill during the integrated market window.

Do not add raw tick persistence.

Do not treat this closeout as approval for full watchlist or background live
backfill.

## Recommended Next Work

Recommended next checkpoint:

```txt
Araon beta acceptance
```

That should validate the whole product from a user perspective: first-run
guidance, credentials setup, dashboard load, stock search, tracking, sector
grouping, surge views, modal realtime/chart tabs, settings, restart behavior,
and documented beta readiness.

Not recommended immediately:

```txt
background backfill expansion
historical minute strategy
news/disclosure feature
memo/observation log
chart polish
```

Those are useful, but they should be backlog items after beta acceptance
re-establishes the full product baseline.
