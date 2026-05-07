# NXT9 - cap20 / cap40 controlled live smoke

**Run date**: 2026-04-29 KST  
**Starting HEAD**: `3d9330d`  
**Result**: GREEN - cap20 and cap40 SettingsModal UI sessions reached exact hard limits

## Scope

This final push widened the session-scoped operator controls from cap 10 to cap
20 and cap 40, then validated both caps through the SettingsModal UI button
path.

This was still a controlled smoke, not an always-on production rollout.
Persisted defaults stayed off:

```txt
websocketEnabled=false
applyTicksToPriceStore=false
```

Route-level fallback was not used for either live session.

## Policy Changes

Allowed session caps are now:

```txt
1 / 3 / 5 / 10 / 20 / 40
```

Session limits:

| Cap | maxAppliedTicks | maxParsedTicks | maxSessionMs |
|---:|---:|---:|---:|
| 1 | 5 | 100 | 60000 |
| 3 | 15 | 300 | 60000 |
| 5 | 25 | 500 | 60000 |
| 10 | 50 | 1000 | 60000 |
| 20 | 100 | 2000 | 90000 |
| 40 | 200 | 4000 | 120000 |

Cap requests above 40 remain invalid. The bridge hard cap remains
`WS_MAX_SUBSCRIPTIONS <= 40`.

## Preflight

- KST window: around 10:15-10:18.
- Runtime before each smoke: `session.enabled=false`.
- Active subscriptions before each smoke: 0.
- Default gates before each smoke: false.
- REST polling was running; observed polling cycles continued with 105
  succeeded and 0 failures after the live sessions.
- Original favorites snapshot:
  - `005930`
  - `000660`
  - `042700`
  - `277810`
  - `017510`

Because only five favorites existed, smoke-only favorite overlays were used.
Candidates were selected from tracked stocks using recent REST snapshot volume.
The original favorite ticker set was restored after both cap20 and cap40.

## cap20 UI Live Smoke

Target tickers:

```txt
005930, 000660, 042700, 277810, 017510,
018880, 009830, 475150, 004020, 096770,
088350, 010140, 005935, 034020, 050890,
028050, 001740, 006400, 006360, 066570
```

Evidence:

- UI path: SettingsModal button path.
- Route-level fallback: 0.
- Approval key issuance: 1 session issuance observed.
- WebSocket connection: 1.
- TR_ID: `H0UNCNT0`.
- Subscribed ticker cap: 20 or fewer.
- Session parsed ticks: 252.
- Session applied ticks: 100 / 100.
- Stale or equal ticks ignored: 151.
- Session limit ignored count: 1.
- End reason: `applied_tick_limit_reached`.
- Last tick observed: 2026-04-29 10:15:57 KST.
- Active subscriptions after cleanup: 0.
- Gates after cleanup: false.
- Persisted settings change: 0.
- Favorite snapshot restored: yes.

The cap20 hard limit was reached before the timebox mattered. During this smoke
the UI still sent the old 60000 ms timebox; the final code now uses the cap20
design value of 90000 ms and includes a focused regression test for that helper.

## cap40 UI Live Smoke

Target tickers:

```txt
005930, 000660, 042700, 277810, 017510,
018880, 009830, 475150, 004020, 096770,
088350, 010140, 005935, 034020, 050890,
028050, 001740, 006400, 006360, 066570,
010950, 005380, 035720, 006800, 035420,
011170, 005490, 042660, 000720, 000270,
055550, 015760, 003490, 316140, 272210,
036570, 090430, 047050, 329180, 003670
```

Evidence:

- UI path: SettingsModal button path.
- Route-level fallback: 0.
- Approval key issuance: 1 session issuance observed.
- WebSocket connection: 1.
- TR_ID: `H0UNCNT0`.
- Subscribed ticker cap: 40 or fewer.
- 41+ subscription attempt: 0.
- Session parsed ticks: 528.
- Session applied ticks: 200 / 200.
- Stale or equal ticks ignored: 328.
- Session limit ignored count: 0.
- Session max timebox observed: 120000 ms.
- End reason: `applied_tick_limit_reached`.
- Last tick observed: 2026-04-29 10:17:36 KST.
- Active subscriptions after cleanup: 0.
- Gates after cleanup: false.
- Persisted settings change: 0.
- Favorite snapshot restored: yes.

The cap40 hard limit passed: the session stopped at exactly 200 applied ticks,
and no 201st `priceStore.setPrice` was allowed.

## UI / Status Result

SettingsModal now exposes all verified session caps:

```txt
최대 1종목 · 검증됨
최대 3종목 · 검증됨
최대 5종목 · 검증됨
최대 10종목 · 검증됨
최대 20종목 · 검증됨
최대 40종목 · 검증됨
```

`GET /runtime/realtime/status` now reports:

```txt
verifiedCaps: [1, 3, 5, 10, 20, 40]
cap20Readiness.status: verified
cap40Readiness.status: verified
readyForCap20: true
readyForCap40: true
blockers: []
```

## Cleanup

- Active subscriptions after final cleanup: 0.
- Session gate after final cleanup: false.
- Runtime gates after final cleanup:
  - `websocketEnabled=false`
  - `applyTicksToPriceStore=false`
- Persisted settings change: 0.
- Favorite ticker set restored exactly to the original five tickers.
- REST polling continued after the WS sessions.
- `credentials.enc` change: 0.

## Guard Checks

- raw approval key stored in report: 0.
- raw app key, app secret, access token, or account stored in report: 0.
- raw live frame stored in report: 0.
- route-level fallback for live enable: 0.
- cap 40 exceeded: 0.

## Verdict

Cap20 and cap40 are verified for controlled, session-scoped UI operation.

This is not the same as making realtime WebSocket always-on. Production defaults
remain off, REST polling remains the fallback, and operator confirmation is
still required for each session.
