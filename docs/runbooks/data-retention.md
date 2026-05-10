# Araon Data Retention Runbook

## Scope

Araon is a localhost monitoring tool, so local data should stay useful without
growing without bound. This runbook covers the P1 data-growth hardening policies
for signal events, cached news links, and candle pruning.

No policy here creates synthetic market data, runs KIS live probes, or enables
historical minute backfill.

## Policies

### Signal Events

- Table: `stock_signal_events`
- Retention: 90 days
- Default ticker read limit: 100
- Server/repository max read limit: 200
- Prune path: `pruneOldSignalEvents(now, retentionDays)`
- Outcome calculation only runs for retained signal rows.

### Cached News Links

- Table: `stock_news_items`
- Fetch status table: `stock_news_fetch_status`
- Stale threshold: 24 hours
- Prune threshold: 7 days
- Failure status: `success` or `failed`
- Failure code: sanitized only, for example `HTTP_503`, `TIMEOUT`, or
  `NETWORK_ERROR`

Araon stores external news links only. It does not summarize, rank, or analyze
news content.

### Candles

- Table: `price_candles`
- `1m` retention: 30 days
- `1d` retention: 2 years
- Prune path: `PriceCandleRepository.pruneOldCandles(now)`
- Maintenance failures are isolated and reported as sanitized diagnostics.

## Maintenance

`createDataRetentionScheduler()` runs once when the server starts listening and
then once per day while the process is alive.

The scheduler calls:

1. `PriceCandleRepository.pruneOldCandles()`
2. `StockSignalEventRepository.pruneOldSignalEvents()`
3. `StockNewsRepository.pruneOldNewsItems()`

If pruning fails, the runtime continues. The error is reduced to a safe code such
as `database locked` or `maintenance_failed`.

## Data Health

`GET /runtime/data-health` includes:

- signal event count and oldest/newest signal timestamp
- news item count, stale count, failed fetch count, and last fetch status
- candle prune last run time and sanitized last error
- existing candle coverage, daily backfill call count/cooldown, and volume baseline
  readiness
- KIS outbound rate governor state, throttle/recovery timing, and sanitized
  per-class diagnostics

The Settings connection tab renders these as diagnostics under the data-health
panel. Raw keys, tokens, approval keys, and account values must never appear in
this response or UI.

Observation notes/plans/timeline were removed from the product surface on
2026-05-07. Existing migration tables may remain for deployed DB compatibility,
but they are not part of current data-health or backup/restore policy.

## Still Out Of Scope

- full watchlist minute backfill
- background minute backfill queue
- full master-market backfill
- news summarization or sentiment analysis
- LLM-generated market commentary
