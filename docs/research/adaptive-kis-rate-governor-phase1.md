# Adaptive KIS Rate Governor Phase 1

## Goal

Araon treats KIS `EGW00201` / "초당 거래건수를 초과하였습니다." as a
second-window REST throttle, not as a generic upstream outage. Phase 1 replaces
the old fixed long cooldown path with a conservative adaptive governor:

- classify second-window throttle separately from auth, upstream, timeout, and
  malformed-response failures
- pause the affected class, then allow one short half-open recovery request
- back off failed canaries and keep a 30s circuit breaker as a last resort
- enforce request start spacing so burst tokens do not stampede KIS
- expose sanitized governor state through data health

This is not a full priority-queue rewrite and does not attempt aggressive RPS
tuning.

## State Model

The governor tracks each app-key profile plus endpoint class through these
states:

- `normal`
- `throttled`
- `half_open`
- `recovering`
- `circuit_breaker`

On `KIS_RATE_LIMIT_SECOND_WINDOW`, the affected class enters throttled recovery.
The first recovery probe is short, then failures back off through increasing
delays. Repeated failures escalate to the 30s circuit breaker. A canary success
does not return traffic to full speed immediately; recovery uses a reduced
allowed RPS until enough stable successes have been observed.

## Request Spacing

Phase 1 keeps the global token budget but adds start-spacing and in-flight
limits. Initial policies are intentionally conservative:

| Class | Min start gap | Max in-flight |
|---|---:|---:|
| `auth` / `token` / `approval` | 1000ms | 1 |
| `foreground` | 80ms | 2 |
| `polling` | 120ms | 2 |
| `ranking` | 750ms | 1 |
| `selected-minute` | 1000ms | 1 |
| `daily-backfill` | 1500ms | 1 |
| `master_refresh` | 2000ms | 1 |
| `maintenance` | 1500ms | 1 |

Foreground calls receive higher priority metadata, but they still go through the
same global governor. Backfill and ranking use lower spacing and pause first
when throttling is observed.

## Integration Inventory

Covered by the Phase 1 governor:

- OAuth token issuance: `token`
- WebSocket approval-key issuance: `approval`
- REST quote polling: `polling`
- foreground quote refresh and KIS watchlist import: `foreground`
- selected daily/minute chart backfill: `daily-backfill` / `selected-minute`
- background daily backfill through the daily candle client plus batch pause
- market top-movers/ranking calls: `ranking`

Still outside or not fully solved in Phase 1:

- the full priority queue is not implemented yet
- master file refresh remains a separate low-frequency refresh path unless it is
  routed through the KIS REST client in a later slice
- persistent governor telemetry is not stored yet
- AIMD auto-tuning is not enabled

## Data Health

`GET /runtime/data-health` exposes sanitized KIS outbound governor diagnostics:

- current state and per-class state
- current allowed RPS estimate
- configured rate/burst/tokens
- min start gap and max in-flight
- last throttle time, class, and code
- recovery attempt count
- circuit breaker deadline
- recent throttle and success counts
- observed recovery timing when available

The payload must not contain raw KIS response bodies, tokens, app keys, app
secrets, approval keys, or account values.

## Live Boundary

No live KIS stress test was part of Phase 1. The governor should be observed
during normal use after deploy; it should not intentionally create `EGW00201`.

## Follow-Up

- Phase 2: full priority queue and complete scheduler integration
- Phase 2: explicit foreground vs background fairness policy
- Phase 3: AIMD auto-tuning
- Phase 3: persistent governor telemetry and normal-operation live observation
