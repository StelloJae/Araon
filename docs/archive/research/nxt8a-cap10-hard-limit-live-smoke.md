# NXT8a - cap 10 hard-limit live smoke

**Run date**: 2026-04-28 KST
**Starting HEAD**: `554e3e0`
**TR_ID**: `H0UNCNT0`
**Cap**: 10
**Result**: PASS, with route-level fallback

## Scope

NXT8a verifies the cap 10 session hard limit after NXT7f/g/h proved the UI live
hard limit for cap 1, cap 3, and cap 5, and NXT7i polished the operator UI
messaging.

This was a live smoke. It did not widen to cap 20 or cap 40, and it did not
change the default runtime gates.

## Browser Automation Note

Browser automation was attempted against the in-app browser at
`http://127.0.0.1:5173/`, but the Settings button did not open the modal through
the Browser runtime after locator and coordinate attempts. The smoke therefore
used the same backend session route as the UI control:

```txt
POST /runtime/realtime/session-enable
```

Report verdict:

```txt
browser automation unavailable, route-level fallback used
```

## Preflight

- runtime status: `started`
- session enabled before smoke: `false`
- subscribed ticker count before smoke: `0`
- `websocketEnabled`: `false`
- `applyTicksToPriceStore`: `false`
- credentials configured: `true`
- investment environment: live
- preflight favorites count: `5`
- preflight favorite tickers:
  - `005930`
  - `000660`
  - `042700`
  - `277810`
  - `017510`

## Temporary Favorite Overlay

The repository had only five favorites, so NXT8a used a smoke-only favorite
overlay from already-tracked stocks.

Temporary favorites added for the smoke:

- `005380`
- `035420`
- `051910`
- `068270`
- `105560`

Post-overlay favorite count: `10`

No master-only ticker was introduced.

## Session Enable

Request shape:

```json
{
  "cap": 10,
  "confirm": true,
  "maxSessionMs": 60000
}
```

Session response:

```txt
outcome: enabled
cap: 10
maxAppliedTicks: 50
maxParsedTicks: 1000
```

Target tickers:

- `005930`
- `000660`
- `042700`
- `277810`
- `017510`
- `005380`
- `035420`
- `051910`
- `068270`
- `105560`

## Live Result

The session reached the cap 10 applied tick hard limit quickly.

```txt
parsedTickCount: 124
appliedTickCount: 50
ignoredStaleTickCount: 73
sessionLimitIgnoredCount: 1
sessionAppliedTickCount: 50
sessionParsedTickCount: 124
endReason: applied_tick_limit_reached
```

Hard-limit verdict:

```txt
PASS
```

The cap 10 applied limit is `50`. The final status reported
`sessionAppliedTickCount=50`, so the 51st apply did not reach
`priceStore.setPrice`. One post-limit tick was counted under
`sessionLimitIgnoredCount`.

## Approval And SSE Notes

The smoke made one `session-enable` request. Runtime status moved from no active
session to an enabled cap 10 session and reported `approvalKey.status=ready`
during the live session. No repeated approval-key issuance loop was observed,
and the raw approval key was not printed or stored.

`PriceStore.setPrice` emits the existing `price-update` event, and the runtime
`SseManager` listens to that event path. NXT8a confirmed 50 successful runtime
applies through this path. The status endpoint does not expose an exact
client-visible SSE frame count, and `SseManager` may throttle/coalesce same
ticker updates, so this report does not invent a separate SSE frame count.

## Subscribe Status

Session route accepted all 10 target tickers and final status showed the session
tickers as the same 10 tickers. During the active status sample,
`subscribedTickerCount` was `10`.

Per-ticker exact ACK and frame counters are not exposed by the status endpoint.
The server log excerpt observed integrated `H0UNCNT0` ticks for these tickers:

- `000660`
- `005930`
- `005380`
- `042700`
- `051910`
- `277810`
- `035420`
- `068270`
- `105560`

`017510` was subscribed but was not observed in the captured log excerpt. This
does not fail NXT8a because the success criterion is aggregate cap 10
hard-limit behavior, not tick arrival from every ticker.

## Cleanup

Final runtime status:

```txt
sessionRealtimeEnabled: false
subscribedTickerCount: 0
subscribedTickers: []
state: manual-disabled
websocketEnabled: false
applyTicksToPriceStore: false
```

Temporary favorite cleanup:

- `005380`: removed
- `035420`: removed
- `051910`: removed
- `068270`: removed
- `105560`: removed

Restored favorite count: `5`

Restored favorite ticker set:

- `005930`
- `000660`
- `042700`
- `277810`
- `017510`

Restored ticker set matched the preflight snapshot: `true`

## Guard Checks

- cap 20 / cap 40 not attempted
- 11 or more tickers not subscribed
- persisted settings unchanged
- `credentials.enc` unchanged
- raw approval key not printed
- raw app key / app secret / access token not printed
- REST polling remained active during and after the smoke

## Verdict

NXT8a is green for cap 10 hard-limit behavior:

```txt
cap 10 sessionAppliedTickCount: 50 / 50
endReason: applied_tick_limit_reached
active subscriptions after cleanup: 0
favorites restored: true
```

This does not approve cap 20 or cap 40.
