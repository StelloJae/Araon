# NXT8c - cap 10 UI hard-limit retry

**Run date**: 2026-04-28 KST
**Starting HEAD**: `37f7b35`
**TR_ID**: `H0UNCNT0`
**Cap**: 10
**Result**: PARTIAL — UI button path connected/subscribed, live tick hard-limit not exercised

## Scope

NXT8c retries the NXT8b gap. NXT8a already proved the cap 10 backend/session
hard limit through route-level fallback. NXT8b then proved the SettingsModal UI
button path and status panels, but no live tick arrived.

NXT8c uses the same UI button path and chooses more active temporary candidates
from recent REST polling volume. It does not widen to cap 20 or cap 40.

## Time And Market Context

```txt
preflight time: 2026-04-28 15:40:22 KST
live session: 2026-04-28 15:43:24 KST - 15:44:25 KST
market context: KRX regular session already closed; NXT after-market window may
  be open, but per-ticker execution frequency can be low.
```

## Preflight

```txt
git status --short: clean
HEAD: 37f7b35
NXT8a report: present
NXT8b report: present
runbook: present
credentials runtime: configured / started / live credentials present
session.enabled: false
subscribedTickerCount: 0
websocketEnabled: false
applyTicksToPriceStore: false
```

REST polling was active before the smoke. A fresh polling cycle completed with:

```txt
tickersInCycle: 105
succeeded: 105
failures: 0
errorCount: 0
effectiveRps: ~7.9-8.1
```

KIS REST rate-limit retry warnings were observed, but the polling scheduler kept
completing cycles with zero final failures.

## Active Candidate Selection

Preflight favorites count: `5`

Original favorites:

- `005930`
- `000660`
- `042700`
- `277810`
- `017510`

NXT8b used simple tracked-stock ordering and saw zero live ticks. NXT8c instead
selected temporary overlay candidates by latest `price_snapshots.volume`
descending among tracked non-favorites.

Top non-favorite candidates at preflight:

| Ticker | Name | Market | Latest REST volume |
|---|---|---|---:|
| `018880` | 한온시스템 | KOSPI | 25,563,211 |
| `009830` | 한화솔루션 | KOSPI | 15,019,366 |
| `006360` | GS건설 | KOSPI | 6,321,355 |
| `028050` | 삼성엔지니어링 | KOSPI | 5,810,567 |
| `010140` | 삼성중공업 | KOSPI | 5,153,371 |

Temporary favorite overlay:

- `018880`
- `009830`
- `006360`
- `028050`
- `010140`

Post-overlay favorites count: `10`

No master-only ticker was introduced. All temporary candidates already existed
in tracked stocks.

## UI Live Session

The live session was started by clicking `realtime-session-enable` in
SettingsModal.

```txt
UI automation used: yes
route-level fallback used: no
approval key call count: 1
WebSocket connection count: 1
session-enable request source: UI button flow
live host: ws://ops.koreainvestment.com:21000
```

Target tickers:

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

Observed status after enable:

```txt
state: connected
sessionRealtimeEnabled: true
session.enabled: true
sessionCap: 10
subscribedTickerCount: 10
approvalKey.status: ready
```

Per-ticker ACK is not exposed by the current status endpoint. The status endpoint
confirmed the ten selected session tickers and `subscribedTickerCount=10`.

## Live Tick Result

No live tick arrived during the 60 second UI session.

```txt
parsedTickCount: 0
appliedTickCount: 0
ignoredStaleTickCount: 0
sessionLimitIgnoredCount: 0
sessionParsedTickCount: 0
sessionAppliedTickCount: 0
endReason: time_limit_reached
```

No tick by ticker:

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

Hard-limit verdict:

```txt
PARTIAL
```

The UI button path reached connected/subscribed status for cap 10, but the
cap 10 hard limit was not exercised because no tick arrived. NXT8c should not be
treated as UI hard-limit proof.

## Status Panel Verification

SettingsModal status panel after the session showed:

```txt
현재 상태: 제한 도달
소스: 통합
현재 cap: 10종목
구독 수: 0 종목
파싱/반영/무시: 0 / 0 / 0
최근 tick: 없음
세션 진행: 적용 0/50
세션 제한: 60초 / 수신 0/1000
종료 사유: 시간 제한 도달
cap20/40: 미검증
```

SSEIndicator panel after cleanup showed:

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

- `018880`: removed
- `009830`: removed
- `006360`: removed
- `028050`: removed
- `010140`: removed

Final cleanup status:

```txt
restoredFavoritesCount: 5
restoredFavorites: 005930, 000660, 042700, 277810, 017510
restoredFavoriteSetMatched: true
activeSubscriptions: 0
sessionRealtimeEnabled: false
session.enabled: false
websocketEnabled: false
applyTicksToPriceStore: false
state: manual-disabled
endReason: time_limit_reached
```

REST polling continued after cleanup. The UI showed `REST 폴링: 100 종목` after
temporary favorites were removed.

## Guard Checks

- route-level fallback for live enable: not used
- repeated live session: not attempted
- cap 20 / cap 40: not attempted
- 11 or more tickers: not subscribed
- persisted settings: unchanged
- `credentials.enc`: unchanged
- raw approval key: not printed or stored
- raw app key / app secret / access token / account: not printed or stored
- temporary favorites: restored exactly

## Regression And Leak Verification

```txt
npm test: 49 files / 450 tests pass
npm run typecheck: clean
npm run build: clean
vite bundle: 315.54 kB / gzip 94.40 kB
git diff --check: clean
focused leak guard: src/server/kis/__tests__/probe-result-leak-guard.test.ts pass
raw secret/token grep: 0 findings
long token-like git diff grep: 0 findings
```

## Follow-up

NXT8c improved the candidate selection and again verified the cap 10 UI button
path, but the market delivered no live ticks in the observed window.

At this point the honest state is:

```txt
cap10 backend/session hard-limit: GREEN from NXT8a
cap10 UI button path/status: GREEN from NXT8b/NXT8c
cap10 UI hard-limit with live tick burst: still unverified
cap20/40: not approved
```

Next recommended step is not cap 20. Either:

- wait for a more liquid tick-producing window and run one more cap 10 UI
  hard-limit attempt, or
- move to NXT8d operator UX/runbook finalization while marking cap 10 UI
  hard-limit as market-liquidity conditional.
