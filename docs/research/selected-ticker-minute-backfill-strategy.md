# Selected-Ticker Historical Minute Backfill Strategy

Date: 2026-05-06

## Goal

Define the safe boundary for future historical minute backfill without enabling
live KIS minute calls yet.

## Decision

KIS historical minute backfill remains **HOLD** for automatic operation.

The only acceptable first implementation path is:

```txt
selected ticker
manual foreground action
after integrated session close
today-minute endpoint only
small bounded page count
```

## Strategy Guard

Implemented pure planner:

- `src/server/chart/minute-backfill-strategy.ts`
- `planSelectedTickerMinuteBackfill(input)`

Policy:

- one ticker only
- valid 6-digit ticker only
- blocked during 07:55-20:05 KST
- weekend is HOLD because KIS minute data is today-only
- background is never allowed
- full watchlist is never allowed
- initial cap: 30 rows/request, max 4 pages, max 120 rows

## Not Implemented

- No KIS minute REST client call
- No endpoint that executes minute backfill
- No background minute backfill
- No full watchlist minute backfill
- No synthetic intraday candles

## Future GO Criteria

Before implementing actual selected-ticker minute calls:

1. Confirm current KIS `주식당일분봉조회` response shape with one redacted
   fixture.
2. Keep calls manual and selected-ticker only.
3. Store returned candles as missing-bucket repairs only.
4. Preserve local-live candle priority and source metadata.
5. Add a live-probe report before widening.

## Validation

- Focused test:
  - `src/server/chart/__tests__/minute-backfill-strategy.test.ts`
