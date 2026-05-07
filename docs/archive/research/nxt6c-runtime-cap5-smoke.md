# NXT6c — cap5 runtime apply smoke

**실행 일시 (UTC)**: 2026-04-28T02:21:26.039Z
**완료 일시 (UTC)**: 2026-04-28T02:21:27.261Z
**소요 시간**: 1222ms
**환경**: live
**결과**: ok

## Preflight

- git HEAD at probe: `4b694ba`
- NXT6b report present: true
- NXT6b runtime apply evidence: true
- runbook present: true
- default websocketEnabled: false
- default applyTicksToPriceStore: false
- legacy settings apply default: false
- persisted settings existed: true
- persisted settings unchanged: true
- REST polling touched by probe: false
- SSE client count before: 0

## Target

- TR_ID: `H0UNCNT0`
- favorites count: 5
- realtime candidates: 005930, 000660, 042700, 277810, 017510
- subscribed tickers: 005930, 000660, 042700, 277810, 017510
- max subscribe tickers: 5

## Safe Summary

- approval key call count: 1
- websocket connection attempts: 1
- websocket connected: true
- subscribe attempted count: 5
- subscribe sent count: 5
- subscribe ACK status: success
- ACKed tickers: 000660, 005930, 017510, 042700, 277810
- ACK status by ticker: {"277810":"success","005930":"success","000660":"success","042700":"success","017510":"success"}
- live frame count: 13
- parsed tick count: 13
- live frame count by ticker: {"277810":0,"005930":4,"000660":8,"042700":1,"017510":0}
- no_tick_by_ticker: 277810, 017510
- priceStore.setPrice count: 5
- priceStore.setPrice count by ticker: {"277810":0,"005930":2,"000660":2,"042700":1,"017510":0}
- SSE price-update count: 5
- SSE price-update count by ticker: {"277810":0,"005930":2,"000660":2,"042700":1,"017510":0}
- collection reason: target_price_count_reached
- source metadata ok: true
- updatedAt freshness ok: true
- stale policy passed: true

## Bridge Stats

```json
{
  "parsedTickCount": 13,
  "appliedTickCount": 5,
  "ignoredStaleTickCount": 3,
  "parseErrorCount": 0,
  "applyErrorCount": 0,
  "lastTickAt": "2026-04-28T02:21:26.857Z"
}
```

## Parsed Tick Summary

```json
{
  "trId": "H0UNCNT0",
  "source": "integrated",
  "ticker": "000660",
  "price": 1316000,
  "changeAbs": 24000,
  "changeRate": 1.86,
  "volume": 3303245,
  "tradeTime": "112126",
  "updatedAt": "2026-04-28T02:21:26.857Z",
  "isSnapshot": false
}
```

## Applied Price Summary

```json
{
  "ticker": "000660",
  "price": 1316000,
  "changeAbs": 24000,
  "changeRate": 1.86,
  "volume": 3303211,
  "updatedAt": "2026-04-28T02:21:26.857Z",
  "isSnapshot": false,
  "source": "ws-integrated"
}
```

## SSE Price Update Summary

```json
{
  "ticker": "000660",
  "price": 1316000,
  "changeAbs": 24000,
  "changeRate": 1.86,
  "volume": 3303211,
  "updatedAt": "2026-04-28T02:21:26.857Z",
  "isSnapshot": false,
  "source": "ws-integrated"
}
```

## Cleanup

- websocket disconnected: true
- subscribed ticker count after cleanup: 0
- gates false after cleanup: true
- persisted settings changed: false
- SSE client count after cleanup: 0

## Integration Guard

- [x] real PriceStore used
- [x] real SseManager used
- [x] running dev/prod server touched 0회
- [x] UI 변경 0회
- [x] persisted settings 영구 변경 0회
- [x] credentials.enc 수정 0회
- [x] reconnect loop 0회
- [x] 6개 이상 종목 구독 0회
- [x] non-favorite 임의 편입 0회
- [x] approval_key/appKey/appSecret/access token 원문 저장 0회

Raw live frames and approval keys are intentionally not included in this report.
