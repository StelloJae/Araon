# Araon runtime acceptance

**Date**: 2026-04-29
**Window**: 11:10:49-11:41:09 KST
**Market state**: KRX continuous session, integrated realtime window open
**Verdict**: GO for always-on local single-user operation

## Scope

This acceptance checked Araon with integrated realtime enabled by this
workstation's local persisted runtime settings:

```txt
websocketEnabled=true
applyTicksToPriceStore=true
TR_ID=H0UNCNT0
subscription cap=40
REST polling fallback=enabled
```

At the time of this acceptance, fresh installs remained conservative. The later
auto-operations promotion changed the product policy: clean installs still make
no external KIS calls before credentials exist, but after credentials are
configured Araon defaults to managed cap40 realtime and guarded daily backfill.

The run used a smoke-only favorite overlay to exercise the full 40-ticker
runtime path. The original favorite ticker set was restored after observation.

## Preflight

- HEAD before acceptance: `8616a93`
- Runtime settings before observation:
  - `websocketEnabled=true`
  - `applyTicksToPriceStore=true`
- Current managed defaults after credentials:
  - `websocketEnabled=true`
  - `applyTicksToPriceStore=true`
  - `backgroundDailyBackfillEnabled=true`
- Original favorites snapshot: 5 tickers
  - `005930`, `000660`, `042700`, `277810`, `017510`
- Temporary overlay: 35 tracked stocks selected by recent REST snapshot volume
- Candidate count after overlay: 40 favorites
- Approval key: issued once by runtime startup; raw value was not logged or saved
- WebSocket: connected to live KIS host
- Feed: `H0UNCNT0` integrated ticks

## Acceptance Observation

30.3 minutes were observed from the status endpoint while the dev runtime was
running in always-on mode.

| Metric | Start | End | Delta |
|---|---:|---:|---:|
| subscribedTickerCount | 40 | 40 | 0 |
| parsedTickCount | 28,551 | 169,683 | 141,132 |
| appliedTickCount | 14,989 | 93,529 | 78,540 |
| ignoredStaleTickCount | 13,562 | 76,154 | 62,592 |
| reconnectAttempts | 0 | 0 | 0 |
| parseErrorCount | 0 | 0 | 0 |
| applyErrorCount | 0 | 0 | 0 |

Resource observations:

- Max RSS: about 298.7 MB
- Max sampled CPU: 32.7%
- Last tick stayed fresh throughout the window

Post-observation status was still connected:

```txt
state=connected
subscribedTickerCount=40
parsedTickCount=185292
appliedTickCount=102395
ignoredStaleTickCount=82897
reconnectAttempts=0
parseErrorCount=0
applyErrorCount=0
approvalKey.status=ready
```

SSE sample after the observation:

```txt
duration=10s
snapshot frames=1
price-update frames=510
heartbeat frames=0
```

## UI Acceptance Finding

During the first browser check, the dashboard stayed at `초기화 중...` and React
reported `Maximum update depth exceeded`. The backend was healthy; the issue was
client-side render pressure from the new always-on cap40 stream.

Root cause:

- `marketStore.markUpdate()` wrote a new `Date` on every SSE frame.
- `stocksStore.applyPriceUpdate()` wrote a full Zustand update on every
  `price-update` frame.
- With cap40 live bursts, this made the React root re-render continuously.

Fix:

- Throttle visible `lastUpdate` writes to at most once per second.
- Batch client-side price updates into 100 ms windows.
- Preserve every latest ticker value in the batch; do not alter server-side
  PriceStore, SSE emission, or KIS handling.

Post-fix browser verification:

- Dashboard rendered normally.
- Header showed `LIVE`.
- Favorites panel showed `WS · 40`.
- Footer showed `즐겨찾기 (WS) 40`, `폴링 65`, and a live last-update time.
- Settings connection tab showed:
  - `WebSocket: 상시 활성`
  - `통합 실시간 시세는 H0UNCNT0 기반으로 상시 운영됩니다`
  - `REST 폴링은 fallback으로 계속 유지됩니다`
  - subscription count 40
  - live parsed/applied/ignored counters
- SSE indicator panel showed:
  - WebSocket 40 / 40
  - REST polling 65
  - WS on / apply on
  - recent tick
  - parsed/applied/ignored counters

The only remaining browser console error observed after the fix was the missing
`favicon.ico` 404, which was cosmetic and was resolved in the favicon follow-up.

## Cleanup

- Dev server stopped after observation.
- Dev client stopped after observation.
- Browser automation session closed.
- Temporary favorite overlay removed.
- Favorites restored exactly to the preflight snapshot:
  - `005930`, `000660`, `042700`, `277810`, `017510`
- Persisted runtime settings remained:
  - `websocketEnabled=true`
  - `applyTicksToPriceStore=true`
- Explicit persisted emergency-disable settings remain respected. Clean installs
  still do not call KIS until credentials are configured.
- No credential file changes were made.

## Volume Surge Decision

The UI now shows real cumulative volume, for example `거래량 N.N만`, in compact
stock rows and surge rows.

It still does not show a volume-surge multiplier such as `거래량 5.2x`.
That multiplier needs a real baseline. The recommended baseline is:

```txt
today cumulative volume at current session/time bucket
/
recent 20 trading days average cumulative volume at the same session/time bucket
```

NXT premarket, KRX continuous trading, and NXT after-hours should use separate
time/session buckets. A simple full-day average volume is acceptable only as a
secondary hint, because it exaggerates normal morning volume concentration.

Until that baseline exists, displaying only cumulative volume is intentional.

## Final Decision

GO for local single-user always-on operation:

- cap40 integrated realtime connected and stayed connected
- tick parsing and apply path stayed healthy
- SSE price-update path emitted live events
- REST polling fallback stayed enabled
- UI rendered under cap40 after client batching fix
- temporary favorite overlay restored
- local persisted settings remain always-on by user decision
- fresh-install defaults remain off
- raw credentials/tokens/approval keys were not stored in docs or fixtures

Remaining work:

- P1: baseline foundation is implemented. Live ratio display remains hidden
  until same-session/time-bucket samples are collected.
- P2: favicon 404 resolved with Araon favicon assets.

## Verification

Post-fix regression checks:

```txt
npm test: 51 files / 469 tests passed
npm run typecheck: clean
npm run build: clean
git diff --check: clean
raw secret leak grep over git diff: 0 matches
```
