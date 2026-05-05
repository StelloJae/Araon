# KIS Daily Backfill Live Probe

Date: 2026-05-05

## Summary

Araon's manual historical daily backfill was validated against the live KIS
daily chart endpoint for a single tracked ticker.

Target:

```txt
ticker: 005930
interval: 1d
range: 1m
market phase: post-close, after 20:05 KST
```

The probe used a route-level `app.inject` harness that registered only
`stockRoutes`. It did not start the full Araon server, REST polling scheduler,
WebSocket runtime, cap smoke, or background backfill queue.

## Result

Final successful run:

```txt
POST /stocks/005930/candles/backfill
status: 200
requested: 20
inserted: 20
updated: 0
source: kis-daily
from: 2026-04-05T15:00:00.000Z
to: 2026-05-03T15:00:00.000Z
```

Follow-up chart API check:

```txt
GET /stocks/005930/candles?interval=1D&range=3m&limit=20000
status: 200
items: 20
coverage.backfilled: true
coverage.localOnly: false
coverage.sourceMix: ["kis-daily"]
status.state: ready
```

Network calls in the successful run:

```txt
KIS daily chart REST: 1
KIS token issuance: 0
WebSocket connection: 0
cap smoke: 0
background queue: 0
```

The existing persisted token was reused. No raw app key, app secret, access
token, approval key, account value, or raw KIS response was written to this
document.

## First Attempt

The first live call also reached KIS successfully:

```txt
KIS daily chart REST: 1
status: 200
```

It failed before storage because `PriceCandleRepository.countExistingCandles()`
used `SELECT 1 AS exists`, which SQLite rejected with:

```txt
near "exists": syntax error
```

This was a local repository bug, not a KIS API failure. A regression test now
covers the real repository path, and the alias was changed to `existing`.

Total live KIS daily chart calls for this probe session:

```txt
2
```

No token issuance call occurred in either attempt.

## Verdict

Manual daily historical backfill is operationally validated for the narrow MVP
case:

```txt
single ticker
live credentials
post-close window
manual route
1m daily range
stored source=kis-daily
chart API coverage/status visible
```

The chart/backfill MVP can now be treated as implementation-closed and
single-ticker live-probe verified.

## Not Validated

This probe intentionally did not validate:

- full watchlist backfill
- background backfill queue behavior against live KIS
- historical minute backfill
- KIS weekly/monthly canonical storage
- WebSocket or realtime cap behavior
- publish/release packaging

Those remain separate operator-approved tasks.
