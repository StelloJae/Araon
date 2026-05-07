# KIS Historical Minute Auto Coverage

Date: 2026-05-07 KST
Scope: selected ticker chart coverage, no full-watchlist minute backfill

## Decision

Araon now treats KIS `주식일별분봉조회` as the official source for selected-ticker historical intraday candles.

Official sample reference:

- `koreainvestment/open-trading-api` example: `/uapi/domestic-stock/v1/quotations/inquire-time-dailychartprice`
- TR ID: `FHKST03010230`
- Query shape: ticker, date, time cursor, market code, past-data flag
- Official sample notes real accounts can retrieve up to 120 rows per request and can query past dates with `FID_INPUT_DATE_1` + `FID_INPUT_HOUR_1`.

Araon stores these rows as canonical `price_candles.interval='1m'` with `source='kis-time-daily'`.

## User Flow

StockDetailModal chart no longer relies on a user clicking “오늘 분봉 가져오기” or “과거 일봉 가져오기.”

When the user changes chart interval/range:

1. Client calls `POST /stocks/:ticker/candles/ensure-coverage`.
2. Server decides the canonical backing data:
   - `1D/1W/1M` -> KIS daily `1d` candles.
   - `1m/3m/5m/10m/15m/30m/1h/2h/4h/6h/12h` -> KIS historical daily-minute `1m` candles.
3. Server upserts missing candles into `price_candles`.
4. Client fetches `GET /stocks/:ticker/candles`.
5. Chart renders only stored candles. Missing data remains an honest empty/collecting state.

## Data Policy

- Raw tick persistence remains prohibited.
- No synthetic candle generation.
- `kis-time-daily` overwrites matching local corrupted/realtime candle buckets through the existing unique key `(ticker, interval, bucket_at)`.
- Rows with flat OHLC and zero minute volume are dropped to avoid fake after-hours tails.
- Cumulative `acml_vol` is not treated as minute volume.
- `UN` integrated market code is used for historical minute requests to align with Araon’s integrated realtime posture.

## Boundaries

Allowed:

- Selected ticker chart-opened coverage.
- Daily and historical minute foreground requests driven by chart interval/range.
- Server-side aggregation from canonical 1m to displayed intraday intervals.

Still HOLD:

- Full watchlist minute backfill.
- Background minute queue.
- Full master-market backfill.
- News analysis or LLM market commentary.

## Verification

Focused tests added/updated:

- `src/server/kis/__tests__/kis-historical-minute-chart.test.ts`
- `src/server/chart/__tests__/historical-minute-backfill-service.test.ts`
- `src/server/routes/__tests__/candles.test.ts`
- `src/client/components/__tests__/stock-candle-chart.test.ts`

No live KIS call was required for this implementation pass. The endpoint contract is based on the official KIS sample and covered with mock transport tests.
