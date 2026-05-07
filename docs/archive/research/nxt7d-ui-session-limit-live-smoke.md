# NXT7d - UI session limit live smoke

**실행 일시 (UTC)**: 2026-04-28T04:33:58Z
**완료 일시 (UTC)**: 2026-04-28T04:38:59Z
**환경**: live, local dev runtime
**결과**: cap 1 UI session limit succeeded on `H0UNCNT0`; optional cap 3 subscribed and self-cleaned on time limit with no new tick observed

## Preflight

- git HEAD at start: `9490265`
- NXT7c session limits present: true
- Settings connection tab control present: true
- browser automation used: true, in-app browser against `http://127.0.0.1:5173`
- route-level fallback used: false
- default websocketEnabled: false
- default applyTicksToPriceStore: false
- session.enabled before smoke: false
- subscribedTickerCount before smoke: 0
- favorites count: 5
- favorite tickers: 005930, 000660, 042700, 277810, 017510
- REST polling active during smoke: true

## Runtime TR_ID Finding And Fix

The first cap 1 attempt proved that session limits could clean up an active
session, but server logs showed the runtime bridge was still using the old KRX
tick TR_ID:

- observed TR_ID before fix: `H0STCNT0`
- observed source before fix: `krx`
- expected NXT runtime TR_ID: `H0UNCNT0`
- expected source: `integrated`

This made the first cap 1 attempt invalid as NXT7d integrated-feed evidence.
No cap 3 widening was attempted until the default was corrected.

Fix applied in this NXT7d commit:

- `src/shared/kis-constraints.ts` now exposes `KIS_WS_TICK_TR_ID_INTEGRATED`.
- `src/server/realtime/realtime-bridge.ts` now defaults tick subscriptions to
  `H0UNCNT0`.
- `src/server/realtime/__tests__/tier-manager.test.ts` now asserts the default
  bridge subscription uses `H0UNCNT0`.

## Cap 1 UI Smoke After Fix

- UI action: SettingsModal connection tab
- selected cap: 1
- confirmation checkbox: checked
- enable action: clicked `세션에서 켜기`
- target ticker: 005930
- target TR_ID: `H0UNCNT0`
- approval key call count: 1 for this valid cap 1 session enable
- WebSocket connection count: 1 for this valid cap 1 session enable
- subscribed tickers: 005930
- observed parser source: integrated
- observed runtime tick ticker: 005930
- session limit that ended the run: `applied_tick_limit_reached`
- PriceStore applied count in session: 20
- stale/equal ignored count in session: 33
- parsed tick count in session: 53
- parse/apply error count: 0 / 0
- raw approval key exposed: false

Final status after automatic cleanup:

```json
{
  "state": "manual-disabled",
  "session": {
    "enabled": false,
    "cap": null,
    "endReason": "applied_tick_limit_reached",
    "parsedTickDelta": 53,
    "appliedTickDelta": 20
  },
  "subscribedTickerCount": 0,
  "subscribedTickers": [],
  "parsedTickCount": 53,
  "appliedTickCount": 20,
  "ignoredStaleTickCount": 33,
  "websocketEnabled": false,
  "applyTicksToPriceStore": false,
  "canApplyTicksToPriceStore": false
}
```

NXT7d note: the server-owned limit is evaluated by the status/limit cleanup
path, so a fast tick burst can overshoot the nominal cap 1 applied limit of 5
before the next cleanup check. The important safety outcome still held: the
session gate flipped false, active subscriptions cleared, and persisted settings
stayed unchanged.

## NXT7e Follow-up Hardening

NXT7e is the non-live follow-up for the cap 1 overshoot observed above. It does
not add live KIS calls or widen subscription caps.

The hardening moves session-limit checks into the realtime apply path:

- each parsed tick is counted before it reaches `priceStore.setPrice`
- `maxAppliedTicks` is checked immediately before every apply
- after the apply that reaches `maxAppliedTicks`, the session gate is flipped
  false synchronously
- further ticks in the same frame are ignored before `priceStore.setPrice`
- `maxParsedTicks` and `maxSessionMs` are also checked before apply
- session cleanup uses a listener-preserving bridge stop path so a later
  session-enable can reuse the same runtime bridge
- the first `endReason` is preserved and not overwritten by later weaker causes
- status now exposes session start counters, session parsed/applied deltas, and
  `sessionLimitIgnoredCount`

Expected cap 1 behavior after NXT7e: `maxAppliedTicks=5` means at most 5
`priceStore.setPrice` calls for that session, even if a fast multi-tick burst
arrives in one WebSocket frame.

## Cap 3 Optional UI Smoke

- cap 3 attempted after valid cap 1 succeeded: true
- UI action: SettingsModal connection tab
- selected cap: 3
- confirmation checkbox: checked
- enable action: clicked `세션에서 켜기`
- approval key call count: 1 for this cap 3 session enable
- WebSocket connection count: 1 for this cap 3 session enable
- subscribed tickers: 005930, 000660, 042700
- subscribedTickerCount while enabled: 3
- session.enabled while enabled: true
- session.cap while enabled: 3
- maxAppliedTicks: 15
- maxParsedTicks: 300
- no new live tick observed during the cap 3 session window
- no_tick_by_ticker in cap 3 window: 005930, 000660, 042700
- session limit that ended the run: `time_limit_reached`

Final status after automatic cleanup:

```json
{
  "state": "manual-disabled",
  "session": {
    "enabled": false,
    "cap": null,
    "endReason": "time_limit_reached",
    "parsedTickDelta": 0,
    "appliedTickDelta": 0,
    "maxAppliedTicks": 15,
    "maxParsedTicks": 300
  },
  "subscribedTickerCount": 0,
  "subscribedTickers": [],
  "websocketEnabled": false,
  "applyTicksToPriceStore": false,
  "canApplyTicksToPriceStore": false
}
```

## Safe Summary

- total approval key call count during NXT7d: 3
  - initial invalid KRX default discovery: 1
  - valid cap 1 integrated rerun: 1
  - optional cap 3 integrated session: 1
- total WebSocket connection count during NXT7d: 3
- max simultaneous subscribe count: 3
- cap 1 valid live frame count by ticker: {"005930":53}
- cap 1 runtime applied count: 20
- cap 1 stale/equal ignored count: 33
- cap 1 endReason: `applied_tick_limit_reached`
- cap 3 live frame delta by ticker: {"005930":0,"000660":0,"042700":0}
- cap 3 runtime applied delta: 0
- cap 3 endReason: `time_limit_reached`
- ACK/status note: raw ACK payload is not persisted by the runtime status shape;
  session state reached the requested subscription set without subscribe error.
- REST polling remained active: true
- persisted settings changed: false
- active subscriptions after cleanup: 0
- gates false after cleanup: true

## Integration Guard

- [x] UI button path used for cap 1 session enable.
- [x] cap 1 valid rerun used `H0UNCNT0` integrated tick frames.
- [x] cap 1 reached live runtime PriceStore/SSE apply path.
- [x] cap 1 automatic limit cleanup worked.
- [x] cap 3 stayed at or below 3 subscribed tickers.
- [x] cap 3 automatic time limit cleanup worked.
- [x] 4 or more simultaneous subscriptions: 0회.
- [x] cap 5 / cap 10 / cap 20 / cap 40 rollout: 0회.
- [x] non-favorite direct subscription: 0회.
- [x] persisted settings permanent mutation: 0회.
- [x] credentials.enc mutation: 0회.
- [x] approval key / app key / app secret / access token / account raw value stored: 0회.

Raw live frames and credential-bearing values are intentionally not included in
this report.
