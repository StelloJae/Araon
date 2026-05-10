# KIS Governor AIMD Design Draft

## Goal

Design a conservative AIMD controller for Araon's KIS outbound governor so
polling can slowly learn a safer request pace from normal-operation telemetry.

This document started as a design draft. As of 2026-05-10, polling-only AIMD is
implemented and can be enabled explicitly through runtime controls. Code
defaults still keep the manual polling baseline available for rollback.

## Non-Goals

- No deliberate KIS throttle generation unless a bounded user/PM-approved live
  experiment explicitly allows it
- No live stress test unless a bounded user/PM-approved live experiment
  explicitly allows it
- No WebSocket cap test
- No forced daily/minute backfill run
- No multi-key capacity strategy
- No foreground, auth, approval, ranking, backfill, or master-refresh tuning
- No attempt to run near the documented maximum KIS limit

## Starting Constraints

Current baseline:

- polling min start gap: 350ms
- polling recovery rate: 3rps
- recovery stable window: 30s
- governor-layer polling max in-flight: 2

The baseline came from local normal-operation evidence on 2026-05-10. It is not
a KIS contract and should remain the manual fallback.

## Scope

Initial AIMD scope should be polling only.

Allowed to adjust:

- polling min start gap

Not allowed to adjust:

- auth/token/approval policy
- foreground policy
- ranking policy
- selected or background backfill policy
- master refresh policy
- polling recovery rate
- polling max in-flight
- global token budget
- WebSocket subscription caps

The first implementation should expose AIMD as disabled by default. Production
enable requires PM approval.

## Implementation Status

As of 2026-05-10:

- pure polling AIMD evaluator is implemented behind tests
- local JSON state store is implemented with disabled observe-only defaults
- runtime control route is implemented:
  `POST /runtime/kis-governor/aimd`
- `/runtime/data-health` exposes sanitized AIMD diagnostics
- data-health derives an observe-only `lastDecision` from sanitized governor
  telemetry snapshots
- data-health classifies telemetry windows as `regular_market` only when the
  runtime market phase is `open`; non-open/unknown phases remain conservative
  `mixed` or `startup_warm`
- data-health uses the polling scheduler cycle count for `completedPollingCycles`
  instead of inferring completed cycles from throttle event count alone
- active runtime mode applies polling gap overrides through the outbound limiter
- active runtime mode schedules regular 10-minute evaluations
- active runtime mode can tighten early when a current evaluation window already
  shows a protective signal such as repeated `EGW00201`
- data-health anchors diagnostics to the active evaluation window so old
  pre-adjustment throttle events do not become stale proposals
- runtime rollback clears the AIMD override and returns to the manual baseline

## Inputs

Use sanitized, persisted telemetry and current health snapshots only:

- `data/kis-governor-telemetry.json`
- `GET /runtime/data-health`
- polling scheduler cycle summaries

The controller should consume derived facts, not raw KIS bodies:

- number of `throttle` events in the window
- whether a full `throttle -> half_open -> recovered -> normal` sequence exists
- recovery duration
- recovery attempt count
- circuit breaker presence
- polling cycle success/failure counts
- queue depth trend
- current polling min start gap

## State

The AIMD controller needs small local state:

- enabled flag
- current polling gap override
- last adjustment time
- last adjustment direction: `increase_gap`, `decrease_gap`, or `none`
- last adjustment reason
- observation window start/end
- last safe baseline
- consecutive clean windows
- consecutive degraded windows

This state can live next to governor telemetry as a small JSON file. It must be
safe to delete; deletion should reset to manual defaults.

## Decision Window

Use windows from `docs/runbooks/kis-governor-tuning.md`.

Minimum proposal:

- evaluate every 10 minutes
- require at least 2 completed polling cycles in the window
- ignore the first 2 minutes after runtime start
- ignore windows classified as `startup_warm` or `mixed`
- allow tightening from a 10-minute degraded window
- allow protective early tightening before the scheduled evaluation if the
  current active window already has repeated throttle/circuit-breaker pressure
- allow loosening only after 3 clean 30-minute regular-market windows

## AIMD Rules

Araon should treat the polling min start gap as the controlled variable.

Increasing the gap reduces pressure. Decreasing the gap increases speed.

### Multiplicative Decrease In Pressure

When degraded, increase the polling gap sharply:

| Evidence | Gap Change |
|---|---:|
| Any `circuit_breaker` | `gap = gap * 1.5` |
| 2+ throttle incidents in 10 minutes | `gap = gap * 1.25` |
| throttle immediately after returning to normal | `gap = gap * 1.25` |
| recovery attempt count > 2 | `gap = gap * 1.25` |
| queue depth stuck after recovery | `gap = gap * 1.15` |

Clamp the result:

- minimum: 300ms, unless PM approves lower
- normal maximum: 800ms
- emergency maximum: 1200ms after circuit breaker

### Additive Increase In Speed

When clean, decrease the polling gap slowly:

- only after 3 clean 30-minute `regular_market` windows
- subtract 25ms per accepted loosen step
- never decrease below 300ms without PM approval
- never loosen if any throttle occurred in the review period
- never loosen from after-hours or thin-liquidity evidence alone

### Hold

Hold current settings when:

- evidence is mixed
- the window is too short
- telemetry is missing or malformed
- data-health state and telemetry disagree
- foreground/manual refresh symptoms are reported but not yet attributed

Hold is a first-class decision, not a failure.

## 2026-05-10 Controlled Live Observation

Under an explicit user `$goal`, controlled live polling observation was allowed.
No order/account-changing endpoints were used.

Observed values:

- 438ms active polling gap still hit repeated `EGW00201`
- short recovery samples observed around 458-493ms
- active AIMD tightened early at `2026-05-10T08:09:10.468Z`
- applied polling override: 438ms -> 548ms
- post-adjustment data-health returned to `normal`
- a following 105-ticker polling cycle completed with 0 throttles at about 1.62
  effective rps
- diagnostics-window anchoring then reported `throttleCount: 0` for the current
  post-adjustment window instead of carrying pre-adjustment pressure forward

These are local observations, not a KIS contract.

## Rollback

Manual rollback must be simple:

- call `POST /runtime/kis-governor/aimd` with `{"action":"rollback"}`
- or stop runtime, remove `data/kis-governor-aimd-state.json`, and restart
- verify polling baseline is back to 350ms / 3rps recovery

The baseline should remain in code and docs. AIMD overrides should be layered on
top, not replace defaults.

## Data Health Additions

Before enabling AIMD, data-health should expose sanitized AIMD diagnostics:

- enabled
- mode: `observe_only` or `active`
- current polling gap
- baseline polling gap
- last adjustment time
- last adjustment direction
- last adjustment reason
- next evaluation time
- clean/degraded window counters
- rollback baseline

No raw KIS response body, credentials, token, approval key, account value, or
raw request payload should appear.

## Implementation Sketch

Suggested files:

- `src/server/kis/kis-governor-aimd.ts`
  - pure AIMD evaluator
  - input: sanitized telemetry/window summary
  - output: `keep`, `tighten`, `loosen`, or `hold`
- `src/server/kis/kis-governor-aimd-state.ts`
  - JSON state load/save
  - missing/malformed file resets to disabled observe-only defaults
- `src/server/bootstrap-kis.ts`
  - wires observe-only AIMD state into runtime
  - does not enable active adjustments without explicit config
- `src/server/routes/runtime.ts`
  - exposes AIMD diagnostics in data-health
- tests under `src/server/kis/__tests__/`

## Test Plan

Use fake telemetry only.

Required tests:

- clean windows do not loosen until the required count is reached
- clean windows loosen by only 25ms
- loosen never crosses 300ms without an explicit approval flag
- one throttle does not necessarily tighten if the window still qualifies as
  keep
- repeated throttles tighten by the configured factor
- circuit breaker tightens more strongly
- malformed telemetry returns `hold`
- startup-warm windows return `hold`
- thin-liquidity windows never loosen
- active adjustments are disabled by default
- rollback clears AIMD override and returns baseline
- data-health exposes sanitized AIMD state
- raw secret/key/token/account strings cannot enter persisted AIMD state

## PM Gate

PM approval is required before:

- enabling active AIMD in production
- allowing the gap below 300ms
- changing recovery rate above 3rps
- applying AIMD to foreground, ranking, backfill, auth, approval, or master
  refresh
- running live stress tests
- changing multi-key capacity strategy

PM approval is not required for:

- pure evaluator implementation behind disabled defaults
- observe-only diagnostics
- mock/fake-transport tests
- docs updates

## Recommended Next Implementation Slice

Implement AIMD in observe-only mode first:

1. Add pure evaluator and tests.
2. Add JSON state store disabled by default.
3. Expose data-health diagnostics.
4. Do not apply runtime setting changes yet.
5. Review one normal-operation telemetry window.

Only after that evidence should active polling-gap adjustment be considered.
