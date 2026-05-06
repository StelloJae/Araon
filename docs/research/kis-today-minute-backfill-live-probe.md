# KIS Today-Minute Backfill Live Probe

## Summary

- **Date**: 2026-05-06 19:45 KST
- **Repository**: `/Users/stello/korean-stock-follower`
- **HEAD before probe**: `ab23875`
- **Target**: `005930` 삼성전자
- **Endpoint**: `POST /stocks/005930/candles/backfill-minute`
- **Final result**: `safe_rejected_by_policy`
- **Market/window state**: 07:55-20:05 KST blocked window

The selected-ticker today-minute route was probed once. The server-side market
guard rejected the request with `423 Locked` and `MARKET_HOURS`, so no KIS
today-minute REST call was made and no `kis-time-today` candle was inserted.

## Preflight

- `git status --short`: clean
- Current local time: `2026-05-06 19:45:20 KST`
- Credentials status:
  - `configured=true`
  - `runtime=started`
  - `isPaper=false`
- Realtime status at probe time:
  - `runtimeStatus=started`
  - `state=connected`
  - `subscribedTickerCount=7`
  - `approvalKey.status=ready`

The existing local server already had managed realtime running. This probe did
not start a WebSocket session, cap smoke, or any new realtime validation.

## Existing Candle Baseline

Local DB read-only preflight for `005930`, `interval='1m'`:

```txt
source=null          count=997  min=2026-05-05T10:38:00.000Z  max=2026-05-06T06:39:00.000Z
source=ws-integrated count=450  min=2026-05-06T02:56:00.000Z  max=2026-05-06T10:45:00.000Z
source=kis-time-today count=0
```

API preflight:

```txt
GET /stocks/005930/candles?interval=1m&range=1d
items=1439
sourceMix=["ws-integrated"]
localOnly=true
backfilled=false
status.state=partial
```

## Probe Request

Single attempted request:

```txt
POST /stocks/005930/candles/backfill-minute
body={"interval":"1m","maxPages":4}
```

Response:

```txt
HTTP/1.1 423 Locked
{"success":false,"error":{"code":"MARKET_HOURS"}}
```

Interpretation:

- The selected-ticker route exists and is wired.
- The route did not permit execution during the blocked market window.
- The market-hours guard was not bypassed.
- No force option was used.

## Post-Probe Checks

Local DB read-only post-check:

```txt
source=null          count=997
source=ws-integrated count=451
source=kis-time-today count=0
```

The `ws-integrated` count increased by one because managed realtime was already
running in the existing local server. This was not caused by the selected-minute
backfill route.

API post-check:

```txt
GET /stocks/005930/candles?interval=1m&range=1d
items=1439
sourceMix=["ws-integrated"]
localOnly=true
backfilled=false
status.state=partial
newestBucketAt=2026-05-06T10:46:00.000Z
```

Data-health post-check:

```txt
dailyCallCount=0
cooldownActive=false
candlePruneLastError=null
```

## Safety Result

- KIS today-minute REST call count: `0` by route-policy rejection.
- `kis-time-today` inserted/updated count: `0`.
- Full watchlist minute backfill: `0`.
- Background minute backfill: `0`.
- Automatic historical minute backfill: `0`.
- WebSocket/cap test started by this probe: `0`.
- Daily backfill live run: `0`.
- Raw app key, app secret, token, approval key, or account output: `0`.

## UI Status

UI chart verification was not executed for this probe because the route was
correctly rejected before any minute candle was written. Existing UI acceptance
for the chart tab remains covered by earlier P1/P2 integration acceptance.

## Limitations

- Live selected-minute write remains pending until a permitted window.
- The next live write probe should use the same endpoint and ticker, after
  20:05 KST or before 07:55 KST on a weekday.
- Do not widen to full watchlist or background minute backfill.
