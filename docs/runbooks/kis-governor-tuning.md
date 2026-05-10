# KIS Governor Tuning Criteria

## Purpose

This runbook defines when Araon should keep, loosen, or tighten KIS outbound
governor settings. It is a decision aid for normal-operation review, not an
instruction to create throttles on purpose.

Current live polling baseline:

- manual polling min start gap: 350ms
- active AIMD observed polling override: 548ms, later 800ms after repeated
  polling throttle pressure
- manual polling recovery rate: 3rps
- recovery stable window: 30s
- polling max in-flight: 2 at the governor layer

These values come from local normal-operation evidence on 2026-05-10. They are
not a KIS contract.

The code baseline remains 350ms. Active AIMD may layer a runtime override on top
of that baseline; rollback returns polling to the baseline. Recovery rps can be
overridden for explicit experiments, but automatic AIMD decisions still tune the
gap only.

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

Exception: a specific user/PM-approved live experiment may use controlled
throttle probes. Keep the probe short, record the start value, stop condition,
rollback condition, observed timing, and never run trading/order endpoints.

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
inside the same short window unless `circuit_breaker` appears or active AIMD sees
a fresh repeated-throttle signal in the current post-adjustment evaluation
window.

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

## AIMD Runtime Mode

As of 2026-05-10, Araon's AIMD implementation can run in `observe_only` or
`active` mode. It still adjusts polling only.

Active AIMD behavior:

- scheduled evaluation every 10 minutes
- protective early tighten when the current evaluation window already has a
  strong pressure signal such as repeated `EGW00201`
- no early loosen; loosening still requires clean windows
- `pollingRecoveryRatePerSec` is accepted by the control route for bounded
  experiments, but is not auto-tuned by AIMD
- selected daily chart backfill uses `selected_backfill`, while managed
  background daily backfill uses `background_backfill`, so chart-visible work
  stays ahead of background budget in the governor queue
- data-health exposes sanitized effective `policies` so these class settings
  can be checked even when no throttle profile exists yet
- data-health diagnostics are anchored to the same active evaluation window, so
  old pre-adjustment throttle events do not look like a fresh proposal

The design is tracked in
[`docs/research/kis-governor-aimd-design.md`](../research/kis-governor-aimd-design.md).

## 2026-05-10 Live AIMD Observation

Controlled live observation was run under explicit user goal approval.

Observed polling sequence:

- start: active AIMD polling gap 438ms
- first live throttle after startup: observed recovery around 458ms
- repeated throttle in the same active window: active AIMD tightened early at
  `2026-05-10T08:09:10.468Z`
- applied override: 438ms -> 548ms
- next evaluation: `2026-05-10T08:19:10.468Z`
- post-adjustment observation: state returned to `normal`; one full 105-ticker
  polling cycle completed with 0 throttles at about 1.62 effective rps
- data-health after the diagnostics-window fix reported the current window with
  `throttleCount: 0` and no sensitive-field names
- later class smoke exposed sanitized policies for `selected_backfill`,
  `background_backfill`, `ranking`, `foreground`, and `polling`
- the same smoke ran one selected daily backfill, one top-movers request, and
  one foreground quote refresh; all returned HTTP 200
- during that observation, polling pressure tightened active AIMD from 685ms to
  800ms after another `EGW00201`; this is a local observation, not a KIS
  guarantee

These are local observations, not a permanent KIS timing guarantee.

## Rollback

Preferred runtime rollback:

```bash
curl -s -X POST http://127.0.0.1:3000/runtime/kis-governor/aimd \
  -H 'content-type: application/json' \
  -d '{"action":"rollback"}'
```

Explicit recovery-rps experiment example:

```bash
curl -s -X POST http://127.0.0.1:3000/runtime/kis-governor/aimd \
  -H 'content-type: application/json' \
  -d '{"action":"enable_active","pollingMinStartGapMs":548,"pollingRecoveryRatePerSec":4.5}'
```

Fallback rollback:

- stop the runtime
- delete `data/kis-governor-aimd-state.json`
- restart
- verify `/runtime/data-health` shows the baseline polling gap again

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

Direct user approval for a bounded `$goal`-style experiment may replace the PM
check for live measurement/tuning work, but it does not override the absolute
ban on order/account-changing endpoints or secret exposure.

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
