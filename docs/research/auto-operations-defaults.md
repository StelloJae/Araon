# Auto Operations Defaults

Date: 2026-05-06

## Decision

Araon now treats realtime and daily candle backfill as managed product
operations after credentials are configured.

```txt
clean install without credentials: external KIS calls 0
after credentials: managed realtime cap40 ON
after credentials: managed daily backfill ON
REST polling: always fallback
```

This replaces the older "user manually enables experimental realtime/backfill"
posture. The Settings connection tab should primarily show managed status,
diagnostics, and emergency pause controls.

## Defaults

Fresh settings now default to:

```txt
rateLimiterMode=live
websocketEnabled=true
applyTicksToPriceStore=true
backgroundDailyBackfillEnabled=true
backgroundDailyBackfillRange=3m
```

Existing persisted settings are still respected. If a user or operator has
persisted `false` for realtime or backfill, Araon treats that as an emergency
disable / rollback decision and does not silently flip it back to true.

## Realtime Policy

- Source: KIS `H0UNCNT0` integrated WebSocket feed.
- Cap: maximum 40 subscriptions.
- Candidate policy: favorites/realtime tier first; overflow remains REST
  polling.
- REST polling remains active as fallback.
- Status endpoint and diagnostics remain available.
- Raw approval keys, access tokens, app keys, app secrets, and account material
  must never be exposed.
- Emergency pause persists `websocketEnabled=false` and
  `applyTicksToPriceStore=false`, disconnecting realtime while leaving REST
  polling active.

## Daily Backfill Policy

- Enabled by default after credentials.
- Runs only when `isBackfillAllowed()` permits it.
- Blocked during `07:55~20:05 KST` weekday market window.
- Targets only favorites and tracked stocks.
- Never backfills the full KIS master catalog.
- Never stores raw ticks.
- Does not perform historical minute backfill.
- Runs sequentially with a low request gap, daily budget, and failure cooldown.
- 429-like errors use a longer cooldown than generic failures.

## UI Policy

Settings should not ask ordinary users to decide whether the core observation
engine is enabled. It should show:

- integrated realtime managed status
- cap40 / REST fallback explanation
- realtime diagnostics in a collapsed operator area
- daily backfill managed status
- market-hours guard explanation
- emergency pause controls

Session cap selectors may remain in a collapsed operator diagnostics area for
future smoke/reverification work, but they are no longer the primary product
flow.

## Still Out Of Scope

- raw tick persistence
- historical minute automatic backfill
- full KIS master backfill
- synthetic chart history
- buy/sell/order execution

