# NXT7c - session limits and UI safeguards

**작업 일시 (UTC)**: 2026-04-28
**환경**: non-live implementation
**결과**: implemented

## Scope

NXT7c is a non-live safety step after NXT7b. It does not issue a KIS approval
key, open a WebSocket, subscribe to `H0UNCNT0`, or collect live frames.

The goal is to keep session-scoped realtime usage short and self-cleaning after
NXT7b showed that even cap 1 can receive a fast tick burst.

## Session Limits

Default session time limit:

- maxSessionMs: 60000
- accepted request range: 10000 to 300000

Server-owned cap limits:

| cap | maxAppliedTicks | maxParsedTicks |
|---:|---:|---:|
| 1 | 5 | 100 |
| 3 | 15 | 300 |
| 5 | 25 | 500 |
| 10 | 50 | 1000 |

The client may pass `maxSessionMs`, but the server clamps it. Tick limits are
computed by the server from the selected cap.

## Automatic Cleanup

When a session limit is reached, the runtime:

- disables the session gate
- disconnects the realtime bridge
- clears active subscriptions through the bridge/client path
- leaves REST polling running
- leaves SSE connections running
- keeps existing `priceStore` values
- does not persist `websocketEnabled` or `applyTicksToPriceStore`

Recorded end reasons:

- `time_limit_reached`
- `applied_tick_limit_reached`
- `parsed_tick_limit_reached`
- `operator_disabled`

## Status Shape

`GET /runtime/realtime/status` still exposes the legacy flattened session fields
and now also includes a nested session object:

```json
{
  "session": {
    "enabled": false,
    "applyEnabled": false,
    "cap": null,
    "source": "integrated",
    "enabledAt": null,
    "tickers": [],
    "maxSessionMs": 60000,
    "expiresAt": null,
    "maxAppliedTicks": null,
    "maxParsedTicks": null,
    "parsedTickDelta": 0,
    "appliedTickDelta": 0,
    "endReason": null
  }
}
```

The status payload remains credential-safe: approval key status only, no raw key,
token, app secret, or account value.

## UI Changes

SettingsModal connection tab now makes the operator constraints explicit:

- "실험 기능"
- "이 세션에서만 켜집니다"
- "REST 폴링은 계속 유지됩니다"
- "최대 60초 또는 tick 제한 도달 시 자동으로 정리됩니다"
- "검증 완료 범위: 1 / 3 / 5 / 10종목"
- "20 / 40종목은 아직 미검증"
- "프리마켓/NXT 통합 시세는 H0UNCNT0 기반"

During an active session, the enable button and cap selector are locked. The
disable button remains available. The UI shows last tick time, session limit,
and the last end reason.

The SSEIndicator panel uses faster status polling while a session is active and
returns to the lower frequency when inactive. It still does not create an extra
EventSource.

## Verification

Focused tests added coverage for:

- default session limits
- cap-specific tick limits
- maxSessionMs clamping
- applied/parsed/time limit cleanup
- REST polling not being stopped by session limit cleanup
- active subscriptions cleanup path
- status endReason
- raw approval key absence from status
- active-session UI lock state
- status polling interval switching
- EventSource non-creation
- cap 20/40 rejection remains in place
- settingsStore.save not being called

Raw live frames and credential-bearing values are intentionally not included in
this report.
