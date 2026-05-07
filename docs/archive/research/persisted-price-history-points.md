# Persisted Price History Points

Date: 2026-05-07

## Verdict

Araon now persists a lightweight intraday price trace for hover sparklines and
the StockDetailModal realtime tab.

```txt
status: DONE
storage: price_history_points
resolution: 5 seconds
retention: 48 hours on disk, 24 hours in browser store
scope: tracked stocks only
raw tick storage: no
historical intraday backfill: unchanged
```

This feature is intentionally separate from candle history. Candles remain the
OHLCV chart source. Price history points are only a compact "tick-feel" trace
used to restore short realtime motion after refresh or restart.

## Policy

- `price_history_points` stores one point per ticker per 5-second bucket.
- Each point keeps the latest observed price/change rate in that bucket and a
  `sample_count`.
- Snapshot restores are ignored. Only live/update-like prices are recorded.
- Points are flushed in batches and pruned by maintenance.
- The repository only stores tickers present in the tracked `stocks` table.
- The API defaults to the current KST day window.
- The browser store merges persisted points with live SSE points and dedupes by
  the same 5-second bucket.

## User-Facing Behavior

Dashboard hover sparklines and favorite-row sparklines hydrate persisted points
on hover. The StockDetailModal realtime tab hydrates persisted points when the
modal opens, then keeps appending live SSE updates while the app is running.

This means:

```txt
refresh/restart: same-day short price trace can reappear
open modal: realtime tab starts with stored points when available
live session: incoming SSE points continue the line
no stored points: existing collecting/empty behavior remains honest
```

## API

Endpoint:

```txt
GET /stocks/:ticker/price-history?range=1d
```

Response data:

```txt
ticker
resolutionMs
retentionHours
items[]
coverage.from
coverage.to
coverage.count
```

Each item contains:

```txt
time
bucketAt
price
changePct
sampleCount
source
```

## Storage

Migration:

```txt
src/server/db/migrations/012-price-history-points.sql
```

Primary key:

```txt
ticker + bucket_at
```

This keeps repeated updates within the same 5-second bucket as one compact row.

## Limits

- This does not reconstruct true raw tick history.
- This does not fetch past intraday ticks from KIS.
- This does not change candle backfill policy.
- This does not store untracked master-market data.
- Browser memory keeps at most a 24-hour rolling window per ticker.

## Verification

Implemented with focused tests for:

- DB migration and repository upsert/list/prune
- 5-second bucket aggregation
- snapshot/invalid-price ignore behavior
- recorder flush/stop lifecycle
- price history API validation and empty response
- browser store persisted seed merge/dedupe/caps
- maintenance prune invocation
