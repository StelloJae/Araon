# NXT7f - cap 1 hard-limit UI live smoke

**실행 일시 (UTC)**: 2026-04-28T05:18:19Z  
**실행 일시 (KST)**: 2026-04-28 14:18  
**환경**: live, local dev runtime, in-app browser UI path  
**결과**: PASS — cap 1 `maxAppliedTicks=5` hard limit held on the live UI path

## Goal

NXT7e moved session tick limits into the realtime apply path. NXT7f verifies
that the UI button path now stops a cap 1 live session at the exact applied
tick limit, even when `H0UNCNT0` frames arrive in a fast burst.

This run intentionally did not widen the rollout:

- cap 1 only
- no cap 3 / 5 / 10 / 20 / 40 attempt
- no non-favorite insertion
- no persisted settings enable

## Preflight

- git HEAD at start: `bec682f`
- git status at start: clean
- local time: 2026-04-28 14:16 KST
- NXT7e hard-limit code present: true
- dev server/client started for the smoke:
  - Fastify: `http://127.0.0.1:3000`
  - Vite: `http://127.0.0.1:5173`
- credentials configured: true
- runtime status before smoke: `started`
- session enabled before smoke: false
- persisted `websocketEnabled`: false
- persisted `applyTicksToPriceStore`: false
- subscribed ticker count before smoke: 0
- favorites count: 5
- favorite tickers: 005930, 000660, 042700, 277810, 017510
- cap 1 target ticker: 005930
- REST polling before/during smoke: active
- SSE client count before smoke: 1 attached browser client

Note: the dev runtime refreshed/persisted its cached access token during
startup before the WebSocket smoke. No raw token value was logged or written to
this report. Persisted realtime settings stayed unchanged.

## UI Action

Browser automation used the in-app browser against `http://127.0.0.1:5173/`.

Steps:

1. Opened SettingsModal.
2. Opened the connection tab.
3. Confirmed the "통합 실시간 시세" section was visible.
4. Left cap selector at `최대 1종목`.
5. Checked "이 세션에서만 켜는 실험 기능임을 확인했습니다".
6. Clicked `세션에서 켜기`.

Route-level fallback was not used.

## Live Result

- TR_ID: `H0UNCNT0`
- source: `integrated`
- approval key call count for this session: 1
- WebSocket connection count for this session: 1
- subscribed tickers: 005930
- subscribedTickerCount while enabled: 1
- live tick frames observed in server logs: 7
- live ticks parsed: 17
- live ticks by ticker: {"005930":17}
- `Price.source`: `ws-integrated`
- `PriceStore.setPrice` / runtime applied count: 5
- stale/equal ignored count: 10
- session-limit ignored count: 2
- parse/apply error count: 0 / 0
- end reason: `applied_tick_limit_reached`

Final credential-safe status excerpt:

```json
{
  "state": "manual-disabled",
  "subscribedTickerCount": 0,
  "subscribedTickers": [],
  "parsedTickCount": 17,
  "appliedTickCount": 5,
  "ignoredStaleTickCount": 10,
  "sessionLimitIgnoredCount": 2,
  "session": {
    "enabled": false,
    "cap": 1,
    "tickers": ["005930"],
    "maxSessionMs": 60000,
    "maxAppliedTicks": 5,
    "maxParsedTicks": 100,
    "sessionAppliedTickCount": 5,
    "sessionParsedTickCount": 17,
    "sessionLimitIgnoredCount": 2,
    "endReason": "applied_tick_limit_reached"
  }
}
```

## Hard-Limit Verdict

PASS.

- cap 1 `maxAppliedTicks`: 5
- observed `sessionAppliedTickCount`: 5
- observed runtime `appliedTickCount`: 5
- observed overshoot beyond limit: 0
- post-limit tick handling: 2 ticks were counted under `sessionLimitIgnoredCount`

This is the key NXT7f result. The NXT7d overshoot pattern (`maxAppliedTicks=5`
but applied count reaching 20) did not reproduce after NXT7e.

## SSE Note

The smoke kept one browser SSE client attached and REST polling continued. The
runtime `PriceStore.setPrice` path emits a `price-update` event on every
successful write, and `SseManager` consumes that event stream. Because
`SseManager` intentionally throttles and coalesces same-ticker updates, the
client-visible SSE frame count is not expected to equal the five apply writes.
No separate per-client SSE frame counter is currently exposed by the runtime
status endpoint.

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
- cap 1 result: green
- target ticker: 005930
- approval key call count: 1
- WebSocket connection success: true
- ACK/status note: raw ACK payload is not persisted by the runtime status
  shape; session state reached one active subscription without subscribe error
- live frame count: 7
- parsed count: 17
- applied count: 5
- sessionAppliedTickCount: 5
- sessionLimitIgnoredCount: 2
- stale/equal ignored count: 10
- endReason: `applied_tick_limit_reached`
- hard limit passed: true
- active subscriptions after cleanup: 0
- gates false after cleanup: true
- persisted settings changed: false
- REST polling impact: none observed

Raw live frames and credential-bearing values are intentionally not included in
this report.
