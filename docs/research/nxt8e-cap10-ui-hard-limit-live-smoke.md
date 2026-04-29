# NXT8e - cap10 UI hard-limit live smoke

**Run date**: 2026-04-29 KST
**Starting HEAD**: `0914fdf`
**Result**: GREEN - cap 10 UI button path reached the exact live hard limit

## Scope

NXT8e re-ran the cap 10 live session during the KRX continuous session after
NXT8b/NXT8c both proved the SettingsModal button path but saw no live ticks.

This run used the SettingsModal UI path only. No route-level fallback was used.
Cap 20 and cap 40 were not attempted.

## Preflight

- KST time: 2026-04-29 09:14.
- Runtime status before enable: `session.enabled=false`.
- Default gates before enable: `websocketEnabled=false`,
  `applyTicksToPriceStore=false`.
- Original favorites snapshot:
  - `005930`
  - `000660`
  - `042700`
  - `277810`
  - `017510`
- Because only five favorites existed, a smoke-only favorite overlay was added
  from tracked stocks with recent REST volume:
  - `018880`
  - `009830`
  - `006360`
  - `028050`
  - `010140`
- Final cap 10 target set:
  - `005930`
  - `000660`
  - `042700`
  - `277810`
  - `017510`
  - `018880`
  - `009830`
  - `006360`
  - `028050`
  - `010140`

## UI Path

- In-app Browser automation backend was unavailable, so Playwright CLI drove the
  real browser UI.
- SettingsModal was opened through the stable settings button hook.
- Connection tab was selected.
- Cap selector was changed to `10`.
- Confirmation checkbox was checked.
- `세션에서 켜기` was clicked in the UI.
- Route-level fallback calls were not used for session enable.

## Live Result

- Approval key issuance: 1 observed session issuance.
- WebSocket connection: 1.
- TR_ID: `H0UNCNT0`.
- Subscribed tickers: 10, all from the favorite candidate set above.
- Session source: `integrated`.
- Session parsed ticks: 179.
- Session applied ticks: 50 / 50.
- Stale or equal ticks ignored: 129.
- Session limit ignored count: 0.
- End reason: `applied_tick_limit_reached`.
- Last tick observed: 2026-04-29 09:14 KST.

The status endpoint currently exposes total session counters, not per-ticker
frame counters. This report therefore records aggregate live counts only.

## Status Panel Evidence

SettingsModal showed:

```txt
현재 상태: 제한 도달
현재 cap: 10종목
파싱/반영/무시: 179 / 50 / 129
세션 진행: 적용 50/50
세션 제한: 60초 / 수신 179/1000
종료 사유: 적용 tick 제한 도달
```

## Cleanup

- Active subscriptions after cleanup: 0.
- Session gate after cleanup: false.
- Runtime gates after cleanup: `websocketEnabled=false`,
  `applyTicksToPriceStore=false`.
- Persisted settings change: 0.
- REST polling continued after the WS session; subsequent polling cycles
  completed with 105 succeeded and 0 failures.
- Smoke-only favorite overlay was removed.
- Restored favorite ticker set exactly matched the original five tickers.

## Verdict

Cap 10 is no longer only conditional. NXT8e proves the SettingsModal UI button
path can drive a live burst to the exact cap 10 hard limit without allowing the
51st apply.

Cap 20 and cap 40 remain unverified and unsupported.

## Guard Checks

- raw approval key stored in report: 0.
- raw app key, app secret, access token, or account stored in report: 0.
- raw live frame stored in report: 0.
- route-level fallback for live enable: 0.
- cap 20 / cap 40 attempts: 0.
