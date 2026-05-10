# Adaptive KIS Rate Governor

## Phase 1 Goal

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

## Phase 1 State Model

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

## Phase 1 Request Spacing

Phase 1 keeps the global token budget but adds start-spacing and in-flight
limits. Initial policies are intentionally conservative:

| Class | Min start gap | Max in-flight |
|---|---:|---:|
| `auth` / `token` / `approval` | 1000ms | 1 |
| `foreground` | 80ms | 2 |
| `polling` | 350ms | 2 |
| `ranking` | 750ms | 1 |
| `selected-minute` | 1000ms | 1 |
| `daily-backfill` | 1500ms | 1 |
| `master_refresh` | 2000ms | 1 |
| `maintenance` | 1500ms | 1 |

Foreground calls receive higher priority metadata, but they still go through the
same global governor. Backfill and ranking use lower spacing and pause first
when throttling is observed.

## Phase 2 Queue And Integration

Phase 2 adds an in-process priority queue in front of governor grants. Requests
still share the same app-key budget, but pending work is ordered by priority:

1. `auth`
2. `foreground`
3. `selected_backfill`
4. `polling`
5. `ranking`
6. `background_backfill`
7. `master_refresh`
8. `maintenance`

The queue is conservative rather than aggressive:

- token availability, start spacing, and max in-flight limits still apply
- foreground can jump ahead of queued background work, but it cannot bypass the
  global governor
- queued work for a class that enters throttle is rejected with the local
  cooldown error instead of leaking through before the throttle state is recorded
- queue depth and priority counts are exposed through data health

## Integration Inventory

Covered by the governor after Phase 2:

- OAuth token issuance: `token`
- WebSocket approval-key issuance: `approval`
- REST quote polling: `polling`
- foreground quote refresh and KIS watchlist import: `foreground`
- selected daily/minute chart backfill: `daily-backfill` / `selected-minute`
- background daily backfill through the daily candle client plus batch pause
- market top-movers/ranking calls: `ranking`
- KIS public master `.mst` downloads: `master_refresh`

Still outside or not fully solved after Phase 2:

- AIMD auto-tuning started as a follow-up and is now implemented for polling-only
  explicit active mode
- AIMD design and live observations are tracked in
  [`docs/research/kis-governor-aimd-design.md`](kis-governor-aimd-design.md)

## Data Health

`GET /runtime/data-health` exposes sanitized KIS outbound governor diagnostics:

- current state and per-class state
- queue depth and queued counts by priority
- current allowed RPS estimate
- configured rate/burst/tokens
- min start gap and max in-flight
- last throttle time, class, and code
- recovery attempt count
- circuit breaker deadline
- recent throttle and success counts
- observed recovery timing when available
- bounded recent governor telemetry events persisted in
  `data/kis-governor-telemetry.json`

The payload must not contain raw KIS response bodies, tokens, app keys, app
secrets, approval keys, or account values.

## Persistent Telemetry

Phase 3 prep stores a bounded sanitized ring of recent governor transition
events. The persisted events include transition time, event type, endpoint
class, priority class, governor state, throttle code, recovery attempt count,
observed recovery timing, current allowed RPS, start gap, and max in-flight.
They intentionally exclude raw KIS response bodies, tokens, app keys, app
secrets, approval keys, and account values.

Telemetry events are operational breadcrumbs for normal-use observation. They
are not used as an automatic tuning source yet.

Tuning decisions should follow
[`docs/runbooks/kis-governor-tuning.md`](../runbooks/kis-governor-tuning.md).
In short: keep the current `350ms / 3rps recovery` baseline unless normal-use
telemetry provides enough evidence to tighten or, more cautiously, loosen it.

## Live Boundary

No live KIS stress test was part of Phase 1. The governor should be observed
during normal use after deploy; it should not intentionally create `EGW00201`.

Later AIMD work did use controlled live polling observation under explicit user
goal approval. That live work remains separate from the Phase 1 acceptance
boundary and still did not touch trading/order/account-changing endpoints.

## Normal-Operation Live Observation

On 2026-05-10, normal runtime startup with existing live credentials was
observed. No deliberate stress test, WebSocket cap test, full watchlist
background run, or daily/minute backfill live run was performed.

Local observation showed that 250ms polling spacing could complete a 105-ticker
cycle near 4rps, but repeated continuous cycles still hit `EGW00201`. The live
polling policy was therefore tuned to 350ms minimum start spacing and 3rps
recovery for the polling class. With that setting, the first startup cycle still
hit one throttle after prior observation had already warmed the upstream window,
then recovery returned to `normal` and two consecutive 105-ticker polling cycles
completed with 0 throttles at about 2.87 effective rps.

This is local operational evidence, not a KIS contract. Future tuning should use
normal-operation telemetry and should not intentionally generate throttles.

## Follow-Up

- Phase 3: expand AIMD beyond polling only if needed
- Phase 3: normal-operation telemetry review after deploy
