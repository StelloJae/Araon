# NXT7h - cap 5 hard-limit UI live smoke

**실행 일시 (UTC)**: 2026-04-28T05:43:39Z  
**실행 일시 (KST)**: 2026-04-28 14:43  
**환경**: live, local dev runtime, in-app browser UI path  
**결과**: PASS - cap 5 `maxAppliedTicks=25` hard limit held on the live UI path

## Goal

NXT7f proved the cap 1 UI live path stops exactly at five applied ticks. NXT7g
proved the same apply-path hard limit for cap 3. NXT7h repeats that evidence
for cap 5: the session may receive a fast live integrated tick burst, but it
must not let the cap 5 session exceed 25 runtime applies.

This run intentionally did not widen beyond cap 5:

- cap 5 only
- no cap 10 / 20 / 40 attempt
- no non-favorite insertion
- no persisted settings enable

## Preflight

- git HEAD at start: `5224c7b`
- git status at start: clean
- local time: 2026-04-28 14:42 KST
- NXT7f/NXT7g report and runbook evidence present: true
- dev server/client started for the smoke:
  - Fastify: `http://127.0.0.1:3000`
  - Vite: `http://127.0.0.1:5173`
- credentials configured: true
- cached access token reused: true
- runtime status before smoke: `started`
- session enabled before smoke: false
- persisted `websocketEnabled`: false
- persisted `applyTicksToPriceStore`: false
- subscribed ticker count before smoke: 0
- favorites count: 5
- favorite tickers: 005930, 000660, 042700, 277810, 017510
- cap 5 target tickers: 005930, 000660, 042700, 277810, 017510
- REST polling before/during smoke: active
- SSE client count before smoke: 1 attached browser client

No raw access token, approval key, app key, app secret, or account value was
logged or written to this report.

## UI Action

Browser automation used the in-app browser against `http://127.0.0.1:5173/`.

Steps:

1. Reloaded the app after starting the dev server/client.
2. Opened SettingsModal.
3. Opened the connection tab.
4. Confirmed the "통합 실시간 시세" section was visible.
5. Selected `최대 5종목`.
6. Checked "이 세션에서만 켜는 실험 기능임을 확인했습니다".
7. Clicked `세션에서 켜기`.

Route-level fallback was not used.

## Subscribe / Status Evidence

- TR_ID: `H0UNCNT0`
- source: `integrated`
- approval key call count for this session: 1
- WebSocket connection count for this session: 1
- requested subscribe tickers: 005930, 000660, 042700, 277810, 017510
- max simultaneous subscribed ticker count: 5
- 6+ ticker subscription attempts: 0

The runtime status shape does not persist raw ACK payloads by ticker. The
session reached the requested five subscribed tickers without subscribe errors,
and server logs recorded KIS control frames plus subsequent integrated tick
frames for four of the five tickers.

Status summary:

| ticker | status evidence |
|---|---|
| 005930 | subscribed in session, integrated ticks observed |
| 000660 | subscribed in session, integrated ticks observed |
| 042700 | subscribed in session, integrated ticks observed |
| 277810 | subscribed in session, integrated ticks observed |
| 017510 | subscribed in session, no tick observed during the short window |

## Live Result

Frame/tick counts from credential-safe server log excerpts:

| ticker | live tick frames | parsed ticks |
|---|---:|---:|
| 005930 | 11 | 30 |
| 000660 | 8 | 15 |
| 042700 | 5 | 12 |
| 277810 | 1 | 1 |
| 017510 | 0 | 0 |
| **total** | **25** | **58** |

Runtime status after automatic cleanup:

- `Price.source`: `ws-integrated`
- `PriceStore.setPrice` / runtime applied count: 25
- stale/equal ignored count: 33
- session-limit ignored count: 0
- parse/apply error count: 0 / 0
- end reason: `applied_tick_limit_reached`

Final credential-safe status excerpt:

```json
{
  "state": "manual-disabled",
  "subscribedTickerCount": 0,
  "subscribedTickers": [],
  "parsedTickCount": 58,
  "appliedTickCount": 25,
  "ignoredStaleTickCount": 33,
  "sessionLimitIgnoredCount": 0,
  "session": {
    "enabled": false,
    "cap": 5,
    "tickers": ["005930", "000660", "042700", "277810", "017510"],
    "maxSessionMs": 60000,
    "maxAppliedTicks": 25,
    "maxParsedTicks": 500,
    "sessionAppliedTickCount": 25,
    "sessionParsedTickCount": 58,
    "sessionLimitIgnoredCount": 0,
    "endReason": "applied_tick_limit_reached"
  }
}
```

The SettingsModal status panel also showed:

- 세션 상태: 꺼짐
- 구독 수: 0 종목
- 파싱/반영/무시: 58 / 25 / 33
- 세션 진행: 적용 25/25
- 세션 제한: 60초 / 수신 58/500
- 종료 사유: 적용 tick 제한 도달

## Hard-Limit Verdict

PASS.

- cap 5 `maxAppliedTicks`: 25
- observed `sessionAppliedTickCount`: 25
- observed runtime `appliedTickCount`: 25
- observed overshoot beyond limit: 0
- no extra tick arrived after the gate closed, so `sessionLimitIgnoredCount`
  remained 0 in this run

This is the key NXT7h result. The apply-path hard limit that passed cap 1 and
cap 3 also held for the cap 5 UI live path.

## SSE Note

The smoke kept one browser SSE client attached during the session. The runtime
`PriceStore.setPrice` path emits a `price-update` event on every successful
write, and `SseManager` consumes that event stream. Because `SseManager`
intentionally throttles and coalesces same-ticker updates, the client-visible
SSE frame count is not expected to equal the 25 apply writes. No separate
per-client SSE frame counter is currently exposed by the runtime status
endpoint.

## Cleanup

- session.enabled after smoke: false
- active subscriptions after smoke: 0
- persisted `websocketEnabled`: false
- persisted `applyTicksToPriceStore`: false
- REST polling after smoke: active; later cycles completed with 105/105
  successes and `errorCount=0`
- SSE browser client detached when the dev server was stopped
- dev server/client stopped after evidence collection

## Security / Leak Guard

- raw approval key stored in report: false
- raw app key / app secret stored in report: false
- raw access token stored in report: false
- raw account identifier stored in report: false
- raw live frames stored: false
- `credentials.enc` manually edited: false
- persisted realtime settings changed: false

## Safe Summary

- UI automation used: true
- route-level fallback used: false
- cap 5 result: green
- target tickers: 005930, 000660, 042700, 277810, 017510
- approval key call count: 1
- WebSocket connection success: true
- subscribe status: five requested favorites reached subscribed state without
  subscribe error
- no_tick_by_ticker: 017510
- live frame count by ticker:
  {"005930":11,"000660":8,"042700":5,"277810":1,"017510":0}
- parsed tick count by ticker:
  {"005930":30,"000660":15,"042700":12,"277810":1,"017510":0}
- parsed count: 58
- applied count: 25
- sessionAppliedTickCount: 25
- sessionLimitIgnoredCount: 0
- stale/equal ignored count: 33
- endReason: `applied_tick_limit_reached`
- hard limit passed: true
- active subscriptions after cleanup: 0
- gates false after cleanup: true
- persisted settings changed: false
- REST polling impact: none observed

Raw live frames and credential-bearing values are intentionally not included in
this report.
