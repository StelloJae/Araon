# KIS Governor Tuning Criteria

## Purpose

This runbook defines when Araon should keep, loosen, or tighten KIS outbound
governor settings. It is a decision aid for normal-operation review, not an
instruction to create throttles on purpose.

Current live polling baseline:

- polling min start gap: 350ms
- polling recovery rate: 3rps
- recovery stable window: 30s
- polling max in-flight: 2 at the governor layer

These values come from local normal-operation evidence on 2026-05-10. They are
not a KIS contract.

## Data Sources

Use only normal-operation evidence:

- `GET /runtime/data-health`
- `data/kis-governor-telemetry.json`
- polling scheduler cycle summaries already emitted by the server

Do not use:

- deliberate KIS throttle induction
- live stress tests
- WebSocket cap tests
- forced daily/minute backfill runs
- full-watchlist background experiments

## Review Window

Use at least one continuous observation window before changing defaults:

- Preferred: 30-60 minutes during regular market operation
- Minimum for a small conservative tightening: 10 minutes
- Minimum for loosening or faster polling: 3 clean 30-minute windows across
  separate sessions

Classify the window before deciding:

- `regular_market`: normal KRX/NXT market hours
- `thin_liquidity`: after-hours, pre-open, lunch/quiet periods, or visibly
  sparse updates
- `startup_warm`: first 2 minutes after server start or after recent throttles
- `mixed`: unclear or interrupted observation

Do not loosen settings from `startup_warm`, `thin_liquidity`, or `mixed`
evidence alone.

## Health Signals

The governor is healthy when:

- `currentState` returns to `normal` after a throttle
- a `throttle -> half_open -> recovered -> normal` telemetry sequence is
  present after an incident
- `normal` is reached without `circuit_breaker`
- subsequent 105-ticker polling cycles complete with 0 throttles
- queue depth drains instead of growing indefinitely
- telemetry contains no raw KIS body, app key, app secret, token, approval key,
  or account value

Treat the governor as degraded when:

- `circuit_breaker` appears
- `recoveryAttemptCount` grows above 2 in one incident
- repeated `throttle` events occur less than 5 minutes apart
- a successful full polling cycle is followed immediately by another throttle
- queue depth remains non-zero for more than 2 polling cycles after recovery
- `data-health` reports `normal` while the latest telemetry event is
  `throttle`, `half_open`, or `recovered` and no later `normal` event exists

## Keep Current Settings

Keep `350ms / 3rps recovery` when a 30-minute regular-market window shows:

- 0-1 natural `EGW00201` incidents
- every incident reaches `normal` within 60 seconds
- no `circuit_breaker`
- at least 2 full polling cycles after recovery complete with 0 throttles
- no foreground-visible stall or manual refresh regression is reported

This is the default decision. Absence of strong evidence should keep the current
settings unchanged.

## Tighten Settings

Tighten polling only when normal-operation evidence shows repeated pressure.

Suggested conservative changes:

| Evidence | Change |
|---|---|
| 2+ throttle incidents within 10 minutes | increase polling gap by 50ms |
| throttle after each normal return | increase polling gap by 100ms |
| recovery attempt count > 2 | reduce polling recovery rate from 3rps to 2rps |
| circuit breaker appears | increase polling gap by 150ms and keep recovery at 2rps |
| queue depth does not drain after recovery | keep gap, reduce polling max in-flight by 1 if possible |

After tightening, observe again under normal operation. Do not tighten repeatedly
inside the same short window unless `circuit_breaker` appears.

## Loosen Settings

Loosen only with strong clean evidence.

A small loosen is allowed only if all are true:

- 3 separate regular-market 30-minute windows are clean
- no `EGW00201`
- no `circuit_breaker`
- polling cycles consistently complete with 0 throttles
- queue depth drains normally
- no foreground request latency complaint is linked to the governor

Suggested loosen step:

- reduce polling min start gap by 25ms
- keep recovery rate unchanged
- never reduce below 300ms without explicit PM approval

Do not loosen recovery rate before the normal polling gap has been validated.

## AIMD Candidate Gate

AIMD auto-tuning is a future implementation candidate only when:

- persistent telemetry has been validated in normal operation
- current fixed settings have at least 3 review windows of evidence
- tighten/keep/loosen rules above are accepted
- manual rollback is documented
- data-health exposes enough state to explain every AIMD adjustment

Initial AIMD scope should be polling only. Ranking, backfill, auth, approval,
foreground, and master refresh should stay manually configured until polling is
proven stable.

## PM Check Required

Ask PM before:

- enabling AIMD in production
- reducing polling min start gap below 300ms
- increasing polling recovery rate above 3rps
- changing foreground limits
- adding or rotating multiple KIS API keys for capacity
- running any deliberate live stress test
- running WebSocket cap tests
- forcing daily/minute backfill or full-watchlist runs to test limits
- changing ranking/top-list strategy in a way that competes with polling budget

PM check is not required for:

- read-only telemetry review
- documentation updates
- sanitized data-health display improvements
- tests or mock/fake-transport verification
- conservative tightening that reduces KIS pressure

## Review Report Template

Use this shape when reporting a window:

```text
Window:
- date/time:
- classification:
- duration:

Governor:
- incidents:
- latest sequence:
- recovery time:
- circuit breaker:
- max queue depth:

Polling:
- full cycles:
- throttled cycles:
- effective rps:

Decision:
- KEEP / TIGHTEN / LOOSEN / DEFER
- reason:
- PM check needed:
```
