# KIS REST budget meter and TOP100 partial diagnostics

Date: 2026-05-11

## Summary

Araon now separates two questions that used to be blurred together:

- Is KIS REST budget pressure high right now?
- If TOP100 is partial, did Araon stop too early, did KIS rate-limit ranking,
  or did the upstream ranking endpoint simply end without more continuation
  pages?

This matters because the 2026-05-11 observation after reducing polling pressure
showed low REST usage and no fresh throttle during the sample window, while
TOP100 still stayed around 30 gainers and fewer losers. That makes pure rate
limit pressure an insufficient explanation.

## TOP100 stop reasons

TOP100 ranking refresh now records sanitized fetch diagnostics for gainers and
losers:

- pages attempted
- rows received per page
- rows accepted after parsing/filtering
- continuation values
- stop reason
- duration in milliseconds

No raw KIS response body, credentials, token, approval key, or account value is
stored in this diagnostic surface.

Stop reasons:

- `complete`: requested TOP100 rows were filled.
- `no_continuation`: KIS returned no useful rows and no continuation.
- `under_requested_limit`: Araon attempted the allowed page path but still did
  not fill the requested count.
- `rate_limited`: KIS second-window throttle interrupted ranking.
- `timeout`: ranking refresh timed out.
- `malformed_response`: response could not be interpreted safely.
- `smaller_refresh_retained`: a smaller later refresh was discarded and the
  previous better snapshot was retained.
- `unsupported_source`: the current market phase has no supported ranking
  source.
- `upstream_partial_limit_suspected`: KIS returned useful rows, but fewer than
  requested, and did not offer continuation.

For the known 30-row style result, the expected diagnosis is:

```text
pagesAttempted=1
rowsReceived=30
continuationValues=[null]
stopReason=upstream_partial_limit_suspected
```

That means Araon did not fabricate missing rows and did not mix watchlist/local
fallback into an all-market TOP100.

## KIS REST budget meter

The outbound limiter now tracks rolling 10-second and 60-second budget metrics:

- started
- success
- failure
- throttle
- call/s
- success/s
- failure/min
- throttle/min
- queue depth
- current allowed RPS

Metrics are grouped by request class, including:

- foreground
- polling
- ranking
- selected_backfill
- background_backfill
- master_refresh
- auth/token/approval
- maintenance

## Risk state

Data-health and the footer pill expose a compact budget risk state:

- `idle`: no recent KIS REST traffic, or runtime not configured.
- `safe`: recent calls exist and there is no throttle/queue pressure.
- `busy`: queue pressure is visible, or call rate is close to the current
  allowed RPS.
- `recovering`: governor is in half-open/recovering state after throttle.
- `risky`: recent throttle exists in the rolling window.
- `throttled`: governor is actively throttled or in circuit breaker.

Example UI labels:

- `KIS 여유 · 1.0/s`
- `KIS 주의 · queue 6`
- `KIS 회복중 · EGW00201`
- `KIS 위험 · ranking 제한`

## Current interpretation

If polling pressure is low and ranking has no fresh throttle, but TOP100 still
stops at roughly one page with no continuation, the root cause should be treated
as an upstream partial limit suspicion rather than an Araon rate-limit failure.

If future diagnostics show `tr_cont=M` but Araon does not fetch the next page,
that is an Araon pagination bug and should be fixed before changing data source
strategy.

## Remaining strategy

If KIS ranking continues to provide only one partial page during normal
operation, the next product strategy is one of:

- Keep the honest KIS partial label and last-good retention.
- Add a separate licensed/full-market ranking data source.
- Build a slow, budgeted, explicit whole-market scanner, but label it as
  Araon-derived and avoid pretending it is the KIS TOP100 endpoint result.

Live stress testing was not performed for this change.
