# KIS Today-Minute Backfill Live Probe

## Summary

- **Date**: 2026-05-06 19:45 KST, follow-up at 20:05 KST
- **Repository**: `/Users/stello/korean-stock-follower`
- **HEAD before probe**: `ab23875`
- **HEAD for allowed-window follow-up**: `ce9378a`
- **Target**: `005930` 삼성전자
- **Endpoint**: `POST /stocks/005930/candles/backfill-minute`
- **Final result**: `success_after_allowed_window`

The selected-ticker today-minute route was probed first during the blocked
market window and was safely rejected with `423 Locked` and `MARKET_HOURS`.
After 20:05 KST, the same selected-ticker route was called once more and wrote
bounded `kis-time-today` 1m candles for `005930`.

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

## Initial Probe Request

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

## Allowed-Window Follow-Up

At `2026-05-06 20:05:10 KST`, the same route was called once after the blocked
window ended:

```txt
POST /stocks/005930/candles/backfill-minute
body={"interval":"1m","maxPages":4}
```

Response:

```txt
HTTP/1.1 200 OK
success=true
ticker=005930
requested=120
inserted=0
updated=120
from=2026-05-06T09:06:00.000Z
to=2026-05-06T11:05:00.000Z
source=kis-time-today
pages=4
coverage.backfilled=true
coverage.localOnly=false
```

Interpretation:

- The selected-ticker live write path is verified for one ticker.
- The route stayed bounded to the requested selected ticker.
- The route used a bounded 4-page KIS today-minute request window.
- Existing local buckets were updated rather than duplicated.
- Full watchlist, background, and automatic minute backfill remained inactive.

## Post-Probe Checks

Local DB read-only post-check after the initial blocked probe:

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

Local DB read-only post-check after the 20:05 follow-up:

```txt
source=null           count=997  min=2026-05-05T10:38:00.000Z  max=2026-05-06T06:39:00.000Z
source=kis-time-today count=120  min=2026-05-06T09:06:00.000Z  max=2026-05-06T11:05:00.000Z
source=ws-integrated  count=350  min=2026-05-06T02:56:00.000Z  max=2026-05-06T09:05:00.000Z
```

API post-check after the 20:05 follow-up:

```txt
GET /stocks/005930/candles?interval=1m&range=1d
items=1439
sourceMix=["kis-time-today","ws-integrated"]
localOnly=false
backfilled=true
status.state=partial
newestBucketAt=2026-05-06T11:05:00.000Z

GET /stocks/005930/candles?interval=3m&range=1d
items=480
sourceMix=["kis-time-today","ws-integrated"]
localOnly=false
backfilled=true
status.state=partial

GET /stocks/005930/candles?interval=5m&range=1d
items=289
sourceMix=["kis-time-today","mixed","ws-integrated"]
localOnly=false
backfilled=true
status.state=partial
```

## Safety Result

- Initial KIS today-minute REST call count: `0` by route-policy rejection.
- Follow-up KIS today-minute REST page count: `4`.
- `kis-time-today` inserted/updated count: `0 inserted`, `120 updated`.
- Full watchlist minute backfill: `0`.
- Background minute backfill: `0`.
- Automatic historical minute backfill: `0`.
- WebSocket/cap test started by this probe: `0`.
- Daily backfill live run: `0`.
- Raw app key, app secret, token, approval key, or account output: `0`.

## UI Status

UI chart verification was executed after the 20:05 follow-up with the Browser
Use/Playwright tool:

- Dashboard loaded at `http://127.0.0.1:5173/`.
- `005930` search result opened the 삼성전자 detail modal.
- The `차트` tab displayed `1m · 1d`.
- The chart showed `1439 candles`.
- The chart status showed `KIS 당일분봉 포함`.
- No synthetic chart or fake candle fill was observed.

## Limitations

- Live selected-minute write is verified for one ticker in an allowed window.
- This does not approve full watchlist minute backfill.
- This does not approve background or automatic historical minute backfill.
- Do not widen to full watchlist or background minute backfill.
