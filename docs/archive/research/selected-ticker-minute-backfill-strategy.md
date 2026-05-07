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

## Still Prohibited

- No background minute backfill
- No full watchlist minute backfill
- No synthetic intraday candles

## Live Probe Status

2026-05-06 19:45 KST:

- Probe target: `005930`
- Endpoint: `POST /stocks/005930/candles/backfill-minute`
- Result: `safe_rejected_by_policy`
- Response: `423 Locked`, `MARKET_HOURS`
- KIS today-minute REST calls: `0`
- `kis-time-today` candle writes: `0`

2026-05-06 20:05 KST:

- Probe target: `005930`
- Endpoint: `POST /stocks/005930/candles/backfill-minute`
- Result: `success_after_allowed_window`
- Response: `200 OK`
- KIS today-minute REST pages: `4`
- `kis-time-today` candle writes: `0 inserted`, `120 updated`
- API coverage: `backfilled=true`, `localOnly=false`
- Source mix: `["kis-time-today","ws-integrated"]` for 1m/3m views
- UI: 삼성전자 detail modal `차트` tab displayed `1m · 1d`, `1439 candles`,
  and `KIS 당일분봉 포함`

Report:

- `docs/research/kis-today-minute-backfill-live-probe.md`

## Future GO Criteria

Selected-ticker minute live write is now verified for one ticker. Future
expansion still requires separate approval:

1. Keep calls manual and selected-ticker only.
2. Store returned candles as missing-bucket repairs only.
3. Preserve local-live candle priority and source metadata.
4. Keep full watchlist/background minute backfill prohibited.
5. Do not add automatic historical minute backfill without a new PM decision.

## Validation

- Focused test:
  - `src/server/chart/__tests__/minute-backfill-strategy.test.ts`
