# NXT WebSocket Rollout Runbook

Last updated: 2026-04-29

## Current Verification Scope

Runtime WebSocket rollout has been validated through controlled smoke tests up
to the KIS WebSocket ceiling and is now configured for steady-state operation:

- NXT6a: 1 ticker runtime apply smoke succeeded.
- NXT6b: 3 favorites runtime apply smoke succeeded.
- NXT6c: 5 favorites runtime apply smoke succeeded.
- NXT6d: 10-candidate cap smoke succeeded with a smoke-only favorite overlay,
  then restored the original favorite snapshot.

Current verification scope: limited runtime smoke through cap 10 only. NXT6e
added non-live operator visibility, and NXT7a added session-scoped operator
controls. NXT7b then checked the actual UI button path: cap 1 reached live
runtime PriceStore/SSE apply through SettingsModal, and optional cap 3 reached a
bounded connected/subscribed state with no new tick observed in the short UI
window. NXT7c added session time/tick limits so UI sessions clean themselves up
without persisting settings. NXT7d confirmed those limits on the UI live path:
cap 1 used `H0UNCNT0` integrated ticks and auto-cleaned on applied tick limit,
but also showed that status-polling cleanup could overshoot the nominal cap 1
applied limit during a fast tick burst. NXT7e hardened the non-live apply path
so the session limits are checked immediately before/after `priceStore.setPrice`.
NXT7f then re-ran the cap 1 UI live path and confirmed the exact hard limit:
`maxAppliedTicks=5` produced `sessionAppliedTickCount=5`, with further burst
ticks counted under `sessionLimitIgnoredCount` instead of reaching
`priceStore.setPrice`. NXT7g then re-ran the cap 3 UI live path and confirmed
the exact cap 3 hard limit: `maxAppliedTicks=15` produced
`sessionAppliedTickCount=15`, with all three selected favorites receiving
integrated ticks before cleanup. NXT7h then re-ran the cap 5 UI live path and
confirmed the exact cap 5 hard limit: `maxAppliedTicks=25` produced
`sessionAppliedTickCount=25`, with five selected favorites subscribed and four
of them receiving integrated ticks before cleanup. NXT7i then made no live KIS
calls and only polished operator UI copy/status labels. Its labels were later
superseded by NXT8e/NXT9 final evidence: cap 1/3/5/10/20/40 are now shown as
verified for session-scoped controlled smoke. NXT8a then ran a cap 10 live session smoke using a smoke-only
favorite overlay from tracked stocks, confirmed the exact cap 10 hard limit
(`sessionAppliedTickCount=50`), and restored the original favorite ticker set.
At that point cap 20 and cap 40 were not yet verified and were not approved by
the cap 10 or NXT7/NXT8a results. NXT8b then fixed the NXT8a UI automation root cause and
verified the SettingsModal cap 10 button path without route-level fallback:
the session reached connected/subscribed status with 10 selected tickers and the
status panels showed cap 10 progress/end-reason state. No live tick arrived
during that 60 second window, so NXT8b was UI-path/status evidence rather than
cap 10 UI hard-limit proof. NXT8c then retried cap 10 through the same
SettingsModal button path with a more active temporary overlay chosen by latest
REST polling volume. That retry again reached connected/subscribed status for 10
tickers and restored the favorite snapshot, but no live tick arrived in the
60 second session. NXT8d made that evidence level explicit in the operator UI
and readiness helper. NXT8e then ran during a higher-liquidity KRX continuous
session and proved the cap 10 UI button path live burst hard limit: cap 10
stopped at `sessionAppliedTickCount=50` with
`endReason=applied_tick_limit_reached`, active subscriptions returned to 0, and
the smoke-only favorite overlay was restored to the original five favorites.
NXT9a then made no live calls and added cap 20 readiness preview only. The final
NXT push then enabled cap 20 and cap 40 for session-scoped operator control and
validated both through the SettingsModal UI button path: cap 20 stopped at
`sessionAppliedTickCount=100`, cap 40 stopped at `sessionAppliedTickCount=200`,
both with `endReason=applied_tick_limit_reached`, active subscriptions returned
to 0, persisted settings stayed unchanged, and the smoke-only favorite overlay
was restored to the original five favorites.

NXT always-on promotion then changed this workstation's local persisted runtime
settings from session-only manual operation to steady-state integrated
realtime. Fresh-install code defaults remain off:

- Local `data/settings.json`: `websocketEnabled=true`.
- Local `data/settings.json`: `applyTicksToPriceStore=true`.
- Fresh install: `websocketEnabled=false`.
- Fresh install: `applyTicksToPriceStore=false`.
- Market-hour scheduling now follows the integrated H0UNCNT0 window:
  warmup 07:55 KST, open 08:00 KST, close 20:00 KST, shutdown 20:05 KST.
- Warmup connects the WebSocket and subscribes the current realtime favorite
  assignment immediately, capped at `WS_MAX_SUBSCRIPTIONS=40`.
- REST polling remains active as fallback.
- The UI now shows real cumulative volume on stock rows and surge rows. It does
  not invent volume-multiple labels without a same-session/time-bucket
  cumulative-volume baseline. Until enough samples exist, the surge UI uses
  `기준선 수집 중`.

Araon runtime acceptance then observed the always-on cap40 runtime for 30.3
minutes during the 2026-04-29 KRX continuous session:

- Local persisted `websocketEnabled=true` and
  `applyTicksToPriceStore=true` stayed enabled.
- `H0UNCNT0` subscribed 40 tickers and did not exceed the cap.
- Parsed ticks increased by 141,132.
- Applied ticks increased by 78,540.
- Stale/equal ignored ticks increased by 62,592.
- `reconnectAttempts=0`, `parseErrorCount=0`, `applyErrorCount=0`.
- SSE emitted 510 `price-update` frames in a 10 second post-observation sample.
- The temporary favorite overlay was restored to the original five favorites.
- Browser acceptance found a client render loop under cap40 tick bursts; this
  was fixed by throttling visible update timestamps and batching client-side
  price update store writes.

Acceptance report: `docs/research/araon-runtime-acceptance.md`.

## Preflight Checklist

- `git status --short` is clean.
- Fresh-install `websocketEnabled` default is `false`.
- Fresh-install `applyTicksToPriceStore` default is `false`.
- This workstation's local persisted settings are intentionally `true`/`true`
  for always-on operation.
- Persisted runtime apply requires both persisted gates:
  - `websocketEnabled === true`
  - `applyTicksToPriceStore === true`
- Session rollout apply requires a session-scoped operator gate:
  - `sessionRealtimeEnabled === true`
  - `sessionApplyTicksToPriceStore === true`
  - incoming ticker is in the selected realtime favorites set
- Session rollout also has server-owned safety limits:
  - default `maxSessionMs=60000`
  - accepted `maxSessionMs` range: `10000` to `300000`
  - cap 1: applied 5 / parsed 100
  - cap 3: applied 15 / parsed 300
  - cap 5: applied 25 / parsed 500
  - cap 10: applied 50 / parsed 1000
  - cap 20: applied 100 / parsed 2000 / default max session 90000 ms
  - cap 40: applied 200 / parsed 4000 / default max session 120000 ms
- Session tick limits are enforced in the realtime apply path, not only by
  status polling:
  - `maxAppliedTicks` blocks further `priceStore.setPrice` calls after the cap
    is reached
  - `maxParsedTicks` and `maxSessionMs` block apply before writing
  - the first `session.endReason` is preserved
- Realtime candidates come from favorites only.
- Runtime tick subscriptions must use `H0UNCNT0` integrated feed by default.
- Session caps are limited to `1`, `3`, `5`, `10`, `20`, or `40`.
- SettingsModal labels cap 1/3/5/10/20/40 as verified after controlled smoke.
- Cap 20/40 remain the maximum verified controlled-session caps. Steady-state
  runtime also remains hard-capped at 40 favorite subscriptions.
- Rollout cap has been smoke-tested through 40 candidates only.
- Hard subscription cap never exceeds `WS_MAX_SUBSCRIPTIONS` (40).
- REST polling is running and healthy before WS rollout.
- `GET /runtime/realtime/status` returns a credential-safe status payload.
- The header SSE indicator panel can display runtime WS state without opening an
  extra EventSource.
- When testing through the Vite dev client, `/runtime/*` must proxy to the
  Fastify server; otherwise the Settings panel receives HTML instead of JSON.
- No raw credential, token, or approval key appears in logs, docs, fixtures, or
  git diff.

## Limited Rollout Procedure

1. Confirm REST polling baseline is healthy.
2. Confirm realtime candidate tickers are the oldest favorites only.
3. Keep the next rollout cap at or below the explicitly approved target.
4. For manual verification sessions, use the operator control route with
   explicit confirmation:
   - `POST /runtime/realtime/session-enable`
   - body: `{ "cap": 1 | 3 | 5 | 10 | 20 | 40, "confirm": true }`
   - or use the Settings connection tab's manual verification control.
   - cap labels should read:
     - 1종목: 검증됨
     - 3종목: 검증됨
     - 5종목: 검증됨
     - 10종목: 검증됨
     - 20종목: 검증됨
     - 40종목: 검증됨
5. Check `GET /runtime/realtime/status` and the header SSE indicator panel:
   - state is `connected`
   - source is `integrated`
   - session gate reflects the selected cap
   - session limit fields show the expected max time/tick values
   - subscribed ticker count is at or below cap
   - parsed tick count increases
   - applied tick count increases only when persisted or session gates allow it
   - stale, parse, and apply errors stay low
6. Keep the initial runtime rollout short. Widen only after a clean observation
   window.
7. Disable the session-scoped rollout with:
   - `POST /runtime/realtime/session-disable`
   - expected result: session gate false, active subscriptions cleared, REST
     polling still running, persisted settings unchanged.

## Healthy Criteria

- `state` is `connected`.
- `source` is `integrated`.
- `subscribedTickerCount` stays at or below the current approved cap.
- `parsedTickCount` increases during market hours.
- `appliedTickCount` increases only when persisted or session gates allow it.
- `ignoredStaleTickCount` may increase, but should match newer-only policy.
- `sessionLimitIgnoredCount` may increase after a session limit closes the gate
  while a burst still has queued ticks.
- `parseErrorCount` remains near zero.
- `applyErrorCount` remains zero.
- Client-visible SSE frame count can be lower than `PriceStore` apply count
  because `SseManager` may throttle/coalesce same-ticker `price-update` events.
- REST polling continues.
- SSE stays connected.
- Existing `priceStore` values are preserved.

## Stop Criteria

- Approval/auth failure: move WS to `disabled`; do not reconnect.
- Max reconnect attempts reached: move WS to `disabled`.
- Parse error rate exceeds threshold: move WS to `degraded` or `disabled`
  according to operator judgment.
- Consecutive apply errors reach threshold: move WS to `disabled`.
- No tick arrives past `noTickTimeoutMs` during expected live windows: move WS to
  `degraded`.
- Operator action requested: move WS to `manual-disabled`.

These criteria must never stop REST polling.

## Rollback Method

Internal stop:

- Invoke the realtime operator action without persisting settings.
- Expected effect:
  - pending reconnect timer is cleared by WS client disconnect
  - active subscriptions are cleared
  - state becomes `manual-disabled`
  - REST polling remains running
  - SSE connections remain open
  - existing `priceStore` values remain intact

Operator rollback:

- Invoke the realtime operator action with persisted rollback.
- Expected persisted settings:
  - `websocketEnabled: false`
  - `applyTicksToPriceStore: false`
- Keep favorites unchanged; overflow favorites remain polling tier.
- In SettingsModal, the realtime control can end a session-scoped run. For this
  workstation's persisted always-on mode, use the settings rollback path below
  so the server restarts with both gates off.
- HTTP fallback if the UI is unavailable: call `PUT /settings` with the current
  settings snapshot but `websocketEnabled=false` and
  `applyTicksToPriceStore=false`.
- After server restart, fresh-install defaults are already off; this
  workstation remains on only while its local persisted settings stay true.

Session disable:

- Invoke `POST /runtime/realtime/session-disable`.
- Expected effect:
  - session gate becomes false
  - active subscriptions are cleared by the bridge
  - REST polling remains running
  - persisted `websocketEnabled` and `applyTicksToPriceStore` are unchanged
  - existing `priceStore` values remain intact

## Status Fields

The operator status endpoint is:

```text
GET /runtime/realtime/status
```

It returns HTTP 200 even when the KIS runtime is not started, so operators can
inspect disabled/unconfigured states without opening `/events`. The header SSE
indicator panel fetches this endpoint only while the panel is open and clears its
timer when the panel closes. It must not create an additional EventSource.

- `configured`
- `runtimeStatus`
- `state`
- `source`
- `websocketEnabled`
- `applyTicksToPriceStore`
- `canApplyTicksToPriceStore`
- `sessionRealtimeEnabled`
- `sessionApplyTicksToPriceStore`
- `sessionCap`
- `sessionSource`
- `sessionEnabledAt`
- `sessionTickers`
- nested `session.enabled`
- nested `session.maxSessionMs`
- nested `session.expiresAt`
- nested `session.maxAppliedTicks`
- nested `session.maxParsedTicks`
- nested `session.parsedTickCountAtSessionStart`
- nested `session.appliedTickCountAtSessionStart`
- nested `session.sessionParsedTickCount`
- nested `session.sessionAppliedTickCount`
- nested `session.sessionLimitIgnoredCount`
- nested `session.parsedTickDelta`
- nested `session.appliedTickDelta`
- nested `session.endReason`
- `subscribedTickerCount`
- `subscribedTickers`
- `reconnectAttempts`
- `nextReconnectAt`
- `lastConnectedAt`
- `lastTickAt`
- `parsedTickCount`
- `appliedTickCount`
- `ignoredStaleTickCount`
- `sessionLimitIgnoredCount`
- `parseErrorCount`
- `applyErrorCount`
- `approvalKey.status`
- `approvalKey.issuedAt`
- sanitized `runtimeError`, only when present
- nested `readiness.verifiedCaps`
- nested `readiness.nextCandidateCap`
- nested `readiness.cap20Readiness`
- nested `readiness.cap20Preview`
- nested `readiness.cap40Readiness`

The status shape must never include raw approval key, app key, app secret,
access token, account identifier, or raw upstream credential text.

## Session Operator Controls

NXT7a adds session-scoped controls for the operator UI. These controls are
intentionally not persisted across restarts.

```text
POST /runtime/realtime/session-enable
POST /runtime/realtime/session-disable
```

`session-enable` accepts only caps `1`, `3`, `5`, `10`, `20`, and `40`, and requires
`confirm: true`. Caps above 40 are rejected. If there are no favorite
candidates, the route returns `no_candidates` and leaves the session gate off.

The Settings connection tab exposes the same controls as an experimental
section: cap selection, explicit confirmation, enable, and disable. It must not
render raw credential, token, approval key, or account values.

NXT7b UI smoke evidence:

- cap 1 via SettingsModal succeeded and reached the live runtime apply path.
- cap 1 stayed to one subscribed ticker, but the market delivered a fast burst
  before manual disable completed. Treat this as evidence that future UI smoke
  runs need an explicit operator timebox or bounded helper if an exact 1-3
  update cap is required.
- optional cap 3 via SettingsModal reached connected/subscribed state for the
  top three realtime favorites. No new tick arrived during the short observation
  window, so it is status/subscription evidence rather than cap 3 apply-volume
  evidence.
- session disable returned the runtime to `manual-disabled`, cleared active
  subscriptions, and left persisted settings at `false` / `false`.

NXT7c session safety additions:

- `session-enable` accepts optional `maxSessionMs`; the server clamps it to the
  safe range and computes tick limits from the selected cap.
- When time, applied tick, or parsed tick limits are reached, the server
  disables the session gate and disconnects the realtime bridge.
- Limit cleanup must not stop REST polling, close SSE, delete existing
  `priceStore` values, or persist settings.
- SettingsModal locks the cap selector and enable button while a session is
  active, keeps the disable action visible, and shows last tick, session limit,
  and the last end reason.
- The SSEIndicator status panel polls faster during an active session and stays
  low-frequency when inactive; it still must not create another EventSource.

NXT7d UI limit live evidence:

- The first cap 1 attempt exposed that the runtime bridge default still used
  `H0STCNT0`; that attempt is not counted as integrated-feed evidence.
- The bridge default was corrected to `H0UNCNT0` and covered by a regression
  test before the valid NXT7d run continued.
- Valid cap 1 via SettingsModal used `H0UNCNT0`, parsed/applied/stale counters
  reached 53 / 20 / 33, and the session auto-cleaned with
  `applied_tick_limit_reached`.
- Optional cap 3 via SettingsModal subscribed 005930, 000660, and 042700. No
  new tick arrived during the window, and the session auto-cleaned with
  `time_limit_reached`.
- After both sessions, active subscriptions were 0 and persisted
  `websocketEnabled` / `applyTicksToPriceStore` remained false.

NXT7e apply-path hardening:

- No live KIS call, WebSocket connection, or subscription was made.
- The bridge now evaluates session limits before every price apply.
- The apply that reaches `maxAppliedTicks` is the last allowed write; later
  ticks in the same frame are ignored before `priceStore.setPrice`.
- Session cleanup uses a listener-preserving bridge stop path rather than
  destroying the bridge message listener, so later session-enable flows can
  reuse the same runtime.
- Limit-ignored ticks are counted separately as `sessionLimitIgnoredCount`.
- The status payload now shows session start counters and session-local
  parsed/applied/limit-ignored counts.
- SettingsModal and the SSEIndicator panel show clearer Korean labels for the
  session progress and last end reason.

NXT7f cap 1 live hard-limit evidence:

- UI path: SettingsModal connection tab, cap 1, confirmation checkbox, then
  `세션에서 켜기`.
- Target: `H0UNCNT0` / `005930`.
- Approval key call count: 1.
- WebSocket connection count: 1.
- Live tick frames observed: 7.
- Live ticks parsed: 17.
- Runtime applied count: 5.
- Stale/equal ignored count: 10.
- Session-limit ignored count: 2.
- End reason: `applied_tick_limit_reached`.
- Active subscriptions after cleanup: 0.
- Persisted `websocketEnabled` / `applyTicksToPriceStore` remained false.
- Verdict: cap 1 hard limit passed; NXT7d applied-count overshoot was not
  reproduced.

NXT7g cap 3 live hard-limit evidence:

- UI path: SettingsModal connection tab, cap 3, confirmation checkbox, then
  `세션에서 켜기`.
- Target: `H0UNCNT0` / 005930, 000660, 042700.
- Approval key call count: 1.
- WebSocket connection count: 1.
- Subscribe status: three requested favorite tickers reached subscribed state
  without subscribe error; raw ACK payloads are not persisted by status.
- Live tick frames observed: 15 total
  - 005930: 7 frames / 28 parsed ticks
  - 000660: 5 frames / 11 parsed ticks
  - 042700: 3 frames / 5 parsed ticks
- Runtime applied count: 15.
- Stale/equal ignored count: 27.
- Session-limit ignored count: 2.
- End reason: `applied_tick_limit_reached`.
- Active subscriptions after cleanup: 0.
- Persisted `websocketEnabled` / `applyTicksToPriceStore` remained false.
- Verdict: cap 3 hard limit passed; applied count did not exceed 15.

NXT7h cap 5 live hard-limit evidence:

- UI path: SettingsModal connection tab, cap 5, confirmation checkbox, then
  `세션에서 켜기`.
- Target: `H0UNCNT0` / 005930, 000660, 042700, 277810, 017510.
- Approval key call count: 1.
- WebSocket connection count: 1.
- Subscribe status: five requested favorite tickers reached subscribed state
  without subscribe error; raw ACK payloads are not persisted by status.
- Live tick frames observed: 25 total
  - 005930: 11 frames / 30 parsed ticks
  - 000660: 8 frames / 15 parsed ticks
  - 042700: 5 frames / 12 parsed ticks
  - 277810: 1 frame / 1 parsed tick
  - 017510: 0 frames / 0 parsed ticks
- Runtime applied count: 25.
- Stale/equal ignored count: 33.
- Session-limit ignored count: 0.
- End reason: `applied_tick_limit_reached`.
- Active subscriptions after cleanup: 0.
- Persisted `websocketEnabled` / `applyTicksToPriceStore` remained false.
- Verdict: cap 5 hard limit passed; applied count did not exceed 25.

NXT7i operator UI polish evidence:

- No live KIS approval key, WebSocket connect, subscribe, or frame collection.
- SettingsModal explains that integrated realtime is experimental, session-only,
  and automatically cleaned up by time or tick limits.
- SettingsModal originally showed "검증 완료: 1 / 3 / 5종목",
  "10종목은 다음 검증 예정", and "20 / 40종목은 아직 미검증"; that historical
  UI state was later superseded by cap 10/20/40 verification.
- Cap selector labels:
  - 최대 1종목 · 검증됨
  - 최대 3종목 · 검증됨
  - 최대 5종목 · 검증됨
  - 최대 10종목 · 다음 검증 예정
- SettingsModal and SSEIndicator share the same end-reason labels:
  - `applied_tick_limit_reached`: 적용 tick 제한 도달
  - `parsed_tick_limit_reached`: 수신 tick 제한 도달
  - `time_limit_reached`: 시간 제한 도달
  - `no_live_tick_observed`: live tick 미관찰
  - `safe_error`: 안전 오류
  - `operator_disabled`: 사용자가 세션 해제
- Status fetch failure copy is user-safe: "실시간 상태를 불러오지 못했습니다.
  REST 폴링은 계속 유지됩니다."
- The status panel still polls only while open, uses 5s while active and 15s
  when inactive, and does not create another EventSource.

NXT8a cap 10 live hard-limit evidence:

- Starting HEAD: `554e3e0`.
- Browser automation was attempted, but SettingsModal did not open through the
  in-app Browser runtime; the smoke used the same backend route as the UI
  control and records this as route-level fallback.
- Preflight favorites count: 5.
- Temporary favorite overlay used from already-tracked stocks:
  - `005380`
  - `035420`
  - `051910`
  - `068270`
  - `105560`
- Target tickers: `005930`, `000660`, `042700`, `277810`, `017510`,
  `005380`, `035420`, `051910`, `068270`, `105560`.
- Active subscribed ticker count: 10.
- Session parsed count: 124.
- Session applied count: 50 / 50.
- Stale/equal ignored count: 73.
- Session-limit ignored count: 1.
- End reason: `applied_tick_limit_reached`.
- Active subscriptions after cleanup: 0.
- `websocketEnabled` / `applyTicksToPriceStore` remained false after cleanup.
- Temporary favorites were removed and the original five favorite tickers were
  restored exactly.
- Verdict: cap 10 hard limit passed; applied count did not exceed 50. This is
  not cap 20 or cap 40 approval.

NXT8b cap 10 UI button path evidence:

- Starting HEAD: `f7154be`.
- Root cause of the NXT8a UI automation issue:
  - `aria-label="설정 열기"` was duplicated between header and footer settings
    buttons.
  - The footer StatusBar settings button was visible but did not receive
    `onOpenSettings`, so it could be a no-op automation target.
- Fix:
  - `App` now wires `onOpenSettings` into `StatusBar`.
  - Header/StatusBar/SettingsModal/SSEIndicator expose stable automation hooks
    for the settings entrypoints, connection tab, realtime controls, cap
    selector, confirmation checkbox, enable/disable actions, and status panels.
  - A regression test verifies the distinct header/footer settings hooks.
- Non-live UI checks passed before live enable: SettingsModal opened, connection
  tab opened, cap 10 was selectable, enable was disabled before confirmation and
  enabled after confirmation, and cap 20/40 options were absent.
- Live enable used the SettingsModal button path. Route-level fallback was not
  used.
- Preflight favorites count: 5.
- Temporary favorite overlay used from already-tracked stocks:
  - `000080`
  - `000100`
  - `000120`
  - `000210`
  - `000270`
- Target tickers: `005930`, `000660`, `042700`, `277810`, `017510`,
  `000080`, `000100`, `000120`, `000210`, `000270`.
- Session reached `connected` status with `sessionRealtimeEnabled=true`,
  `subscribedTickerCount=10`, and `approvalKey.status=ready`.
- No live tick arrived in the 60 second window:
  - session parsed count: 0
  - session applied count: 0 / 50
  - stale/equal ignored count: 0
  - session-limit ignored count: 0
  - end reason: `time_limit_reached`
- SettingsModal and SSEIndicator status panels showed source integrated, cap 10,
  session progress 0/50, the Korean time-limit end reason, and REST polling
  continuity copy.
- Active subscriptions after cleanup: 0.
- `websocketEnabled` / `applyTicksToPriceStore` remained false after cleanup.
- Temporary favorites were removed and the original five favorite tickers were
  restored exactly.
- Verdict: UI button path and status panels passed. Cap 10 UI hard-limit remains
  retry-needed because no tick arrived. This is not cap 20 or cap 40 approval.

NXT8c cap 10 UI hard-limit retry evidence:

- Starting HEAD: `37f7b35`.
- KST time: 2026-04-28 15:43-15:44.
- Market context: KRX regular session was closed; NXT after-market may be open,
  but live execution frequency can be low by ticker.
- Live enable used the SettingsModal button path. Route-level fallback was not
  used.
- Preflight favorites count: 5.
- Temporary favorite overlay used from already-tracked stocks, ranked by latest
  REST snapshot volume among non-favorites:
  - `018880`
  - `009830`
  - `006360`
  - `028050`
  - `010140`
- Target tickers: `005930`, `000660`, `042700`, `277810`, `017510`,
  `018880`, `009830`, `006360`, `028050`, `010140`.
- Session reached `connected` status with `sessionRealtimeEnabled=true`,
  `subscribedTickerCount=10`, and `approvalKey.status=ready`.
- No live tick arrived in the 60 second window:
  - session parsed count: 0
  - session applied count: 0 / 50
  - stale/equal ignored count: 0
  - session-limit ignored count: 0
  - end reason: `time_limit_reached`
- SettingsModal and SSEIndicator status panels showed source integrated, cap 10,
  session progress 0/50, the Korean time-limit end reason, and REST polling
  continuity copy.
- Active subscriptions after cleanup: 0.
- `websocketEnabled` / `applyTicksToPriceStore` remained false after cleanup.
- Temporary favorites were removed and the original five favorite tickers were
  restored exactly.
- Verdict: UI button path and status panels remain green. Cap 10 UI hard-limit
  remains unexercised because no tick arrived. This is not cap 20 or cap 40
  approval.

NXT8d operator UX/readiness evidence:

- Historical note: this was the correct state before NXT8e. Current cap 10
  readiness is listed in the NXT8e section below.
- No live KIS approval key, WebSocket connect, subscribe, or frame collection.
- SettingsModal cap labels now separate the evidence level:
  - 1종목: 검증됨
  - 3종목: 검증됨
  - 5종목: 검증됨
  - 10종목: 조건부
- SettingsModal explains that the cap 10 button path and session limit structure
  are verified, but recent UI live retries observed no execution ticks, so live
  burst hard-limit proof remains market-liquidity conditional.
- SSEIndicator shows cap 10 as `버튼 확인 · 유동성 조건부`.
- `evaluateNxtRolloutReadiness()` now exposes:
  - `cap1Ready=true`
  - `cap3Ready=true`
  - `cap5Ready=true`
  - `cap10RouteReady=true`
  - `cap10UiPathReady=true`
  - `cap10UiHardLimitReady=false`
  - `cap10UiHardLimitConditional=true`
- Readiness warning: `cap10_ui_hard_limit_live_burst_not_observed`.
- Historical NXT8d state: cap 20/40 were blocked by `cap20_not_verified` and
  `cap40_not_verified`. This is superseded by the NXT final cap20/cap40 smoke.

NXT8e cap 10 UI hard-limit evidence:

- SettingsModal UI button path was used; route-level fallback was not used.
- Smoke-only favorite overlay expanded the target set from five to ten
  favorites, then restored the original favorite ticker set exactly.
- Live session result:
  - `sessionParsedTickCount=179`
  - `sessionAppliedTickCount=50`
  - `ignoredStaleTickCount=129`
  - `endReason=applied_tick_limit_reached`
- Active subscriptions returned to 0.
- `websocketEnabled=false` and `applyTicksToPriceStore=false` after cleanup.
- Cap 10 UI hard-limit is now verified. Historical note: cap 20/40 were still
  not approved at NXT8e time, but were later verified in the NXT final push.

NXT9 final cap 20 / cap 40 controlled live evidence:

- SettingsModal UI button path was used for both sessions; route-level fallback
  was not used.
- Cap 20 target used 20 favorite candidates via smoke-only overlay and stopped
  at `sessionAppliedTickCount=100`, `endReason=applied_tick_limit_reached`.
- Cap 40 target used 40 favorite candidates via smoke-only overlay and stopped
  at `sessionAppliedTickCount=200`, `endReason=applied_tick_limit_reached`.
- Cap 40 never exceeded 40 subscriptions.
- The original five-favorite snapshot was restored exactly after both sessions.
- `websocketEnabled=false` and `applyTicksToPriceStore=false` after cleanup.
- Verdict: cap 20 and cap 40 are verified for controlled, session-scoped
  operator use. They are not persisted always-on defaults.

## Readiness Helper

`evaluateNxtRolloutReadiness()` is a pure helper for operator checks. It should
not be treated as approval to widen live rollout by itself.

- Current cap-level status:
  - `cap1Ready=true`
  - `cap3Ready=true`
  - `cap5Ready=true`
  - `cap10RouteReady=true`
  - `cap10UiPathReady=true`
  - `cap10UiHardLimitReady=true`
  - `cap10UiHardLimitConditional=false`
- `verifiedCaps=[1,3,5,10,20,40]`
- `nextCandidateCap=20`
- `cap20Readiness.status=verified`
- `cap20Preview` reports favorites-only candidate count and shortage
- `cap40Readiness.status=verified`
- With required surfaces present, `readyForCap20=true`.
- With required surfaces present, `readyForCap40=true`.
- Missing status endpoint, missing status panel, or stale runbook blocks
  widening/operation checks.

## Cap 20 / Cap 40 Conditions

Completion notes:

- cap 1/3/5/10/20/40 controlled UI sessions now have exact hard-limit evidence.
- status endpoint is reachable and credential-safe.
- status panel shows state/gates/counts without extra EventSource.
- REST polling fallback remains healthy.
- session-enable accepts cap20/cap40 only with explicit confirmation.
- cap40 is the maximum controlled session cap.
- no reconnect loop, parse-error spike, or apply-error spike was observed in the
  final cap20/cap40 smoke evidence.
- operator rollback/session cleanup remains required after any future live
  observation.

## Absolute Do-Not List

- Do not subscribe more than 40 tickers.
- Do not subscribe more than 40 tickers in steady-state or manual sessions.
- Do not promote non-favorites into realtime even when capacity remains.
- Do not expose realtime market-source UI before the rollout phase requests it.
- Do not write raw live frames containing sensitive material.
- Do not log or persist approval key, app key, app secret, or access token.
- Do not let WS failure stop REST polling.

## Leak Checks

Run before commit:

```bash
rg -n "approval_key\\s*[:=]\\s*[\"']?[A-Za-z0-9_-]{20,}|approvalkey\\s*[:=]\\s*[\"']?[A-Za-z0-9_-]{20,}|appkey\\s*[:=]\\s*[\"']?[A-Za-z0-9_-]{20,}|appsecret\\s*[:=]\\s*[\"']?[A-Za-z0-9_-]{20,}|secretkey\\s*[:=]\\s*[\"']?[A-Za-z0-9_-]{20,}|access[_-]?token\\s*[:=]\\s*[\"']?[A-Za-z0-9_-]{20,}|Bearer\\s+[A-Za-z0-9_-]{20,}" AGENTS.md docs src scripts
rg -n "[A-Za-z0-9_-]{40,}" docs/research docs/runbooks src/server/kis/__fixtures__
```

Allowed findings must be reviewed manually. Documentation that names sensitive
field names is allowed; long raw values are not.
