# NXT7b - UI session live smoke

**실행 일시 (UTC)**: 2026-04-28T03:24:00Z
**완료 일시 (UTC)**: 2026-04-28T03:26:30Z
**환경**: live, local dev runtime
**결과**: cap 1 UI live apply succeeded; cap 3 UI subscribe/status path checked with no new tick observed in the short window

## Preflight

- git HEAD at start: `347c357`
- NXT7a session controls present: true
- backend status route present: `GET /runtime/realtime/status`
- backend session routes present:
  - `POST /runtime/realtime/session-enable`
  - `POST /runtime/realtime/session-disable`
- Settings connection tab control present: true
- browser automation used: true, in-app browser against `http://127.0.0.1:5173`
- route-level fallback used: false
- default websocketEnabled: false
- default applyTicksToPriceStore: false
- sessionRealtimeEnabled before smoke: false
- subscribedTickerCount before smoke: 0
- favorites count: 5
- favorite tickers: 005930, 000660, 042700, 277810, 017510
- REST polling active during smoke: true

## UI Wiring Finding

The first SettingsModal attempt could not read realtime status because the Vite
dev proxy did not forward `/runtime/*` routes to the Fastify server. NXT7a's
backend route was correct, but the browser UI received the Vite fallback HTML
instead of JSON.

Fix applied in this NXT7b commit:

- `vite.config.ts` now proxies `/runtime` to `http://127.0.0.1:3000`.
- After restarting the client dev server, the Settings connection tab loaded the
  runtime status and session controls correctly.

## Cap 1 UI Smoke

- UI action: SettingsModal connection tab
- selected cap: 1
- confirmation checkbox: checked
- enable action: clicked `세션에서 켜기`
- disable action: clicked `끄기`
- target ticker: 005930
- approval key call count: 1 for this session enable
- WebSocket connection count: 1 for this session enable
- subscribed tickers: 005930
- subscribedTickerCount while enabled: 1
- sessionRealtimeEnabled while enabled: true
- sessionCap while enabled: 1
- source: integrated
- approvalKey status exposed to UI/status: ready
- raw approval key exposed: false

Status while enabled showed live runtime counters increasing:

```json
{
  "state": "connected",
  "sessionRealtimeEnabled": true,
  "sessionCap": 1,
  "sessionTickers": ["005930"],
  "subscribedTickerCount": 1,
  "subscribedTickers": ["005930"],
  "parsedTickCount": 56,
  "appliedTickCount": 31,
  "ignoredStaleTickCount": 25,
  "parseErrorCount": 0,
  "applyErrorCount": 0
}
```

Final counters after the UI disable completed:

```json
{
  "state": "manual-disabled",
  "sessionRealtimeEnabled": false,
  "sessionCap": null,
  "subscribedTickerCount": 0,
  "subscribedTickers": [],
  "parsedTickCount": 89,
  "appliedTickCount": 49,
  "ignoredStaleTickCount": 40,
  "parseErrorCount": 0,
  "applyErrorCount": 0,
  "websocketEnabled": false,
  "applyTicksToPriceStore": false,
  "canApplyTicksToPriceStore": false
}
```

NXT7b note: the UI path does not cap update count by itself. The cap 1 ticker
limit held, but the market sent a fast burst before manual disable completed.
This is not a rollout expansion, but it should be treated as NXT7c follow-up
evidence for a bounded operator smoke control or clearer timebox guidance.

## Cap 3 Optional UI Smoke

- cap 3 attempted after cap 1 succeeded: true
- UI action: SettingsModal connection tab
- selected cap: 3
- confirmation checkbox: already checked
- enable action: clicked `세션에서 켜기`
- disable action: clicked `끄기`
- approval key call count: 1 for this session enable
- WebSocket connection count: 1 for this session enable
- subscribed tickers: 005930, 000660, 042700
- subscribedTickerCount while enabled: 3
- sessionRealtimeEnabled while enabled: true
- sessionCap while enabled: 3
- source: integrated
- no new live tick observed during the 20 second UI observation window
- no_tick_by_ticker in cap 3 window: 005930, 000660, 042700

Cap 3 status remained connected and bounded:

```json
{
  "state": "connected",
  "sessionRealtimeEnabled": true,
  "sessionCap": 3,
  "sessionTickers": ["005930", "000660", "042700"],
  "subscribedTickerCount": 3,
  "subscribedTickers": ["005930", "000660", "042700"],
  "parsedTickCount": 89,
  "appliedTickCount": 49,
  "ignoredStaleTickCount": 40,
  "parseErrorCount": 0,
  "applyErrorCount": 0
}
```

Final status after cap 3 disable:

```json
{
  "state": "manual-disabled",
  "sessionRealtimeEnabled": false,
  "sessionCap": null,
  "sessionTickers": [],
  "subscribedTickerCount": 0,
  "subscribedTickers": [],
  "parsedTickCount": 89,
  "appliedTickCount": 49,
  "ignoredStaleTickCount": 40,
  "parseErrorCount": 0,
  "applyErrorCount": 0,
  "websocketEnabled": false,
  "applyTicksToPriceStore": false,
  "canApplyTicksToPriceStore": false
}
```

## SSEIndicator Status Panel Check

After closing SettingsModal and opening the header SSEIndicator panel, the panel
showed the post-cleanup status:

- WS runtime: manual-disabled
- source: integrated
- apply gate: WS off / apply off
- session gate: off
- subscribedTickerCount: 0
- parsed/applied/ignored counters: 89 / 49 / 40
- approval key display: status only
- raw key/account/secret display: false
- extra EventSource created by status panel: false

## Safe Summary

- total approval key call count across cap 1 and cap 3: 2
- total WebSocket connection count across cap 1 and cap 3: 2
- max simultaneous subscribe count: 3
- cap 1 live frame count by ticker: {"005930":89}
- cap 1 runtime applied count: 49
- cap 1 stale/equal ignored count: 40
- cap 3 live frame delta by ticker: {"005930":0,"000660":0,"042700":0}
- cap 3 runtime applied delta: 0
- runtime parse errors: 0
- runtime apply errors: 0
- PriceStore/SSE path observed through runtime counters and status panel: true
- REST polling remained active: true
- persisted settings changed: false
- active subscriptions after cleanup: 0
- gates false after cleanup: true

## Integration Guard

- [x] UI button path used for session enable.
- [x] UI button path used for session disable.
- [x] cap 1 live apply reached the runtime PriceStore/SSE path.
- [x] cap 3 stayed at or below 3 subscribed tickers.
- [x] 4 or more simultaneous subscriptions: 0회.
- [x] cap 20 / cap 40 rollout: 0회.
- [x] non-favorite direct subscription: 0회.
- [x] persisted settings permanent mutation: 0회.
- [x] credentials.enc mutation: 0회.
- [x] approval key / app key / app secret / access token / account raw value stored: 0회.

Raw live frames and credential-bearing values are intentionally not included in
this report.
