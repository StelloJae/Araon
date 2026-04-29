# NXT8b - cap 10 UI button live smoke

**Run date**: 2026-04-28 KST
**Starting HEAD**: `f7154be`
**TR_ID**: `H0UNCNT0`
**Cap**: 10
**Result**: PARTIAL — UI button path verified, live tick hard-limit not exercised

## Scope

NXT8b follows NXT8a. NXT8a proved the cap 10 backend/session hard limit through
route-level fallback. NXT8b verifies the SettingsModal button path and status
panel behavior without using route-level fallback for the live session.

This did not widen to cap 20 or cap 40 and did not change the default runtime
gates.

## NXT8a UI Failure Root Cause

NXT8a could not open SettingsModal reliably through browser automation. NXT8b
found two concrete causes:

- `aria-label="설정 열기"` existed on both the header settings button and the
  footer StatusBar settings button.
- The footer StatusBar settings button accepted `onOpenSettings` but `App` did
  not pass it, so automation could pick a visible no-op button.

NXT8b added stable automation hooks and wired the footer button to the same
settings open action.

Added hooks:

- `settings-button`
- `statusbar-settings-button`
- `settings-modal`
- `settings-connection-tab`
- `realtime-session-control`
- `realtime-status-panel`
- `realtime-cap-select`
- `realtime-cap-1` / `realtime-cap-3` / `realtime-cap-5` /
  `realtime-cap-10`
- `realtime-confirm-checkbox`
- `realtime-session-enable`
- `realtime-session-disable`
- `sse-indicator-button`
- `sse-status-panel`

## Non-live UI Regression

Before live enable, browser automation verified:

- `settings-button` count: 1
- `statusbar-settings-button` count: 1
- SettingsModal opened through `settings-button`
- Connection tab opened through `settings-connection-tab`
- realtime control hooks were present
- cap 10 was selectable
- cap 20 / cap 40 options were absent
- enable button was disabled before confirmation
- enable button became enabled after checking confirmation
- realtime control text did not render raw key/account/secret wording

## Temporary Favorite Overlay

Preflight favorites count: `5`

Original favorites:

- `005930`
- `000660`
- `042700`
- `277810`
- `017510`

The app had fewer than ten favorites, so NXT8b used a smoke-only overlay from
already-tracked stocks.

Temporary favorites:

- `000080`
- `000100`
- `000120`
- `000210`
- `000270`

Post-overlay favorites count: `10`

No master-only ticker was introduced.

## UI Live Session

The live session was started by clicking `realtime-session-enable` in the
browser. Route-level fallback was not used.

Target tickers:

- `005930`
- `000660`
- `042700`
- `277810`
- `017510`
- `000080`
- `000100`
- `000120`
- `000210`
- `000270`

Observed status sample immediately after UI enable:

```txt
state: connected
sessionRealtimeEnabled: true
subscribedTickerCount: 10
approvalKey.status: ready
maxAppliedTicks: 50
maxParsedTicks: 1000
```

Server log evidence:

- `POST /runtime/realtime/session-enable` came from the UI button flow.
- approval key was issued; key value was not logged.
- live WebSocket connected to `ws://ops.koreainvestment.com:21000`.
- realtime bridge received control/PINGPONG frames.

Per-ticker exact ACK counters are not exposed by the status endpoint. Final
status confirmed the active session selected all 10 target tickers.

## Live Tick Result

No live tick arrived during the 60 second session.

```txt
parsedTickCount: 0
appliedTickCount: 0
ignoredStaleTickCount: 0
sessionLimitIgnoredCount: 0
sessionAppliedTickCount: 0
sessionParsedTickCount: 0
endReason: time_limit_reached
```

No tick by ticker:

- `005930`
- `000660`
- `042700`
- `277810`
- `017510`
- `000080`
- `000100`
- `000120`
- `000210`
- `000270`

Hard-limit verdict:

```txt
PARTIAL
```

The UI button path reached connected/subscribed status for cap 10, but the
cap 10 hard limit was not exercised because no tick arrived. This should be
retried in a tick-producing window; do not treat NXT8b as cap 10 live tick
hard-limit proof.

## Status Panel Verification

SettingsModal status panel showed:

```txt
현재 상태: 제한 도달
소스: 통합
현재 cap: 10종목
구독 수: 0 종목
세션 진행: 적용 0/50
세션 제한: 60초 / 수신 0/1000
종료 사유: 시간 제한 도달
cap20/40: 미검증
```

SSEIndicator panel after overlay cleanup showed:

```txt
WebSocket (즐겨찾기): 5 / 40 종목
REST 폴링: 100 종목
WS 런타임: 수동 중지 / 통합
적용 gate: WS off / apply off
세션 gate: 제한 도달 / off
구독 수: 0 종목
세션 제한: 적용 0/50 · 수신 0/1000
종료 사유: 시간 제한 도달
```

## Cleanup

Temporary favorite cleanup:

- `000080`: removed
- `000100`: removed
- `000120`: removed
- `000210`: removed
- `000270`: removed

Final cleanup status:

```txt
restoredFavoritesCount: 5
restoredFavorites: 005930, 000660, 042700, 277810, 017510
restoredFavoriteSetMatched: true
activeSubscriptions: 0
sessionRealtimeEnabled: false
websocketEnabled: false
applyTicksToPriceStore: false
state: manual-disabled
endReason: time_limit_reached
```

REST polling continued during the smoke. KIS REST rate-limit retry warnings were
observed, but polling cycles continued to complete with `105` succeeded and
`errorCount: 0`.

## Regression Verification

```txt
npm test -- src/client/components/__tests__/settings-entrypoints.test.ts
  1 file / 1 test passed

npm test -- src/server/kis/__tests__/probe-result-leak-guard.test.ts
  1 file / 29 tests passed

npm test
  49 files / 449 tests passed

npm run typecheck
  clean

npm run build
  clean, vite bundle 315.54 kB / gzip 94.40 kB

git diff --check
  clean
```

Manual grep for raw approval key, app key, app secret, access token, account-like
long literals, and long token-like runs returned no findings in the changed
surface.

## Guard Checks

- route-level fallback for live enable: not used
- cap 20 / cap 40: not attempted
- 11 or more tickers: not subscribed
- persisted settings: unchanged
- `credentials.enc`: unchanged
- raw approval key: not printed or stored
- raw app key / app secret / access token / account: not printed or stored
- temporary favorites: restored exactly

## Follow-up

NXT8b verified the cap 10 UI button path and status panels. Because no live tick
arrived, cap 10 UI hard-limit behavior remains retry-needed. The next live
attempt should run during a tick-producing window and should still avoid cap 20
or cap 40.
