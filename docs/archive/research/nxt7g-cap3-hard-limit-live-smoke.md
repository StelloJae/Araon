# NXT7g - cap 3 hard-limit UI live smoke

**실행 일시 (UTC)**: 2026-04-28T05:33:40Z  
**실행 일시 (KST)**: 2026-04-28 14:33  
**환경**: live, local dev runtime, in-app browser UI path  
**결과**: PASS — cap 3 `maxAppliedTicks=15` hard limit held on the live UI path

## Goal

NXT7f proved that the cap 1 session hard limit stops exactly at five applied
ticks on the real UI path. NXT7g repeats the same evidence pattern for cap 3:
the session may receive a fast live burst, but it must not let the cap 3
session exceed 15 runtime applies.

This run intentionally did not widen beyond cap 3:

- cap 3 only
- no cap 5 / 10 / 20 / 40 attempt
- no non-favorite insertion
- no persisted settings enable

## Preflight

- git HEAD at start: `9207f85`
- git status at start: clean
- local time: 2026-04-28 14:32 KST
- NXT7f report/runbook evidence present: true
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
- cap 3 target tickers: 005930, 000660, 042700
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
5. Selected `최대 3종목`.
6. Checked "이 세션에서만 켜는 실험 기능임을 확인했습니다".
7. Clicked `세션에서 켜기`.

Route-level fallback was not used.

## Subscribe / ACK Evidence

- TR_ID: `H0UNCNT0`
- source: `integrated`
- approval key call count for this session: 1
- WebSocket connection count for this session: 1
- requested subscribe tickers: 005930, 000660, 042700
- max simultaneous subscribed ticker count: 3
- 4+ ticker subscription attempts: 0

The runtime status shape does not persist raw ACK payloads by ticker. The
session reached the requested three subscribed tickers without subscribe errors,
and server logs recorded KIS control frames plus subsequent integrated tick
frames for all three tickers.

ACK/status summary:

| ticker | status evidence |
|---|---|
| 005930 | subscribed in session, integrated ticks observed |
| 000660 | subscribed in session, integrated ticks observed |
| 042700 | subscribed in session, integrated ticks observed |

## Live Result

Frame/tick counts from credential-safe server logs:

| ticker | live tick frames | parsed ticks |
|---|---:|---:|
| 005930 | 7 | 28 |
| 000660 | 5 | 11 |
| 042700 | 3 | 5 |
| **total** | **15** | **44** |

Runtime status after automatic cleanup:

- `Price.source`: `ws-integrated`
- `PriceStore.setPrice` / runtime applied count: 15
- stale/equal ignored count: 27
- session-limit ignored count: 2
- parse/apply error count: 0 / 0
- end reason: `applied_tick_limit_reached`

Final credential-safe status excerpt:

```json
{
  "state": "manual-disabled",
  "subscribedTickerCount": 0,
  "subscribedTickers": [],
  "parsedTickCount": 44,
  "appliedTickCount": 15,
  "ignoredStaleTickCount": 27,
  "sessionLimitIgnoredCount": 2,
  "session": {
    "enabled": false,
    "cap": 3,
    "tickers": ["005930", "000660", "042700"],
    "maxSessionMs": 60000,
    "maxAppliedTicks": 15,
    "maxParsedTicks": 300,
    "sessionAppliedTickCount": 15,
    "sessionParsedTickCount": 44,
    "sessionLimitIgnoredCount": 2,
    "endReason": "applied_tick_limit_reached"
  }
}
```

The SettingsModal status panel also showed:

- 세션 상태: 꺼짐
- 구독 수: 0 종목
- 파싱/반영/무시: 44 / 15 / 27
- 세션 진행: 적용 15/15
- 세션 제한: 60초 / 수신 44/300
- 종료 사유: 적용 tick 제한 도달

## Hard-Limit Verdict

PASS.

- cap 3 `maxAppliedTicks`: 15
- observed `sessionAppliedTickCount`: 15
- observed runtime `appliedTickCount`: 15
- observed overshoot beyond limit: 0
- post-limit tick handling: 2 ticks were counted under `sessionLimitIgnoredCount`

This is the key NXT7g result. The same apply-path hard limit that passed cap 1
in NXT7f also held for the cap 3 UI live path.

## SSE Note

The smoke kept one browser SSE client attached during the session. The runtime
`PriceStore.setPrice` path emits a `price-update` event on every successful
write, and `SseManager` consumes that event stream. Because `SseManager`
intentionally throttles and coalesces same-ticker updates, the client-visible
SSE frame count is not expected to equal the fifteen apply writes. No separate
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
- cap 3 result: green
- target tickers: 005930, 000660, 042700
- approval key call count: 1
- WebSocket connection success: true
- subscribe status: three requested favorites reached subscribed state without
  subscribe error
- live frame count by ticker: {"005930":7,"000660":5,"042700":3}
- parsed tick count by ticker: {"005930":28,"000660":11,"042700":5}
- parsed count: 44
- applied count: 15
- sessionAppliedTickCount: 15
- sessionLimitIgnoredCount: 2
- stale/equal ignored count: 27
- endReason: `applied_tick_limit_reached`
- hard limit passed: true
- active subscriptions after cleanup: 0
- gates false after cleanup: true
- persisted settings changed: false
- REST polling impact: none observed

Raw live frames and credential-bearing values are intentionally not included in
this report.
