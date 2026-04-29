# NXT6b — favorites runtime apply smoke

**실행 일시 (UTC)**: 2026-04-28T02:12:40.397Z
**완료 일시 (UTC)**: 2026-04-28T02:12:41.178Z
**소요 시간**: 781ms
**환경**: live
**결과**: ok

## Preflight

- git HEAD at probe: `15ef303`
- NXT6a report present: true
- NXT6a runtime apply evidence: true
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
- realtime candidates: 005930, 000660, 042700
- subscribed tickers: 005930, 000660, 042700
- max subscribe tickers: 3

## Safe Summary

- approval key call count: 1
- websocket connection attempts: 1
- websocket connected: true
- subscribe attempted count: 3
- subscribe sent count: 3
- subscribe ACK status: success
- ACKed tickers: 000660, 005930, 042700
- live frame count: 9
- parsed tick count: 9
- live frame count by ticker: {"005930":5,"000660":4,"042700":0}
- priceStore.setPrice count: 3
- priceStore.setPrice count by ticker: {"005930":2,"000660":1,"042700":0}
- SSE price-update count: 3
- SSE price-update count by ticker: {"005930":2,"000660":1,"042700":0}
- collection reason: target_price_count_reached
- source metadata ok: true
- updatedAt freshness ok: true
- stale policy passed: true

## Bridge Stats

```json
{
  "parsedTickCount": 9,
  "appliedTickCount": 3,
  "ignoredStaleTickCount": 4,
  "parseErrorCount": 0,
  "applyErrorCount": 0,
  "lastTickAt": "2026-04-28T02:12:40.973Z"
}
```

## Parsed Tick Summary

```json
{
  "trId": "H0UNCNT0",
  "source": "integrated",
  "ticker": "005930",
  "price": 222250,
  "changeAbs": -2250,
  "changeRate": -1,
  "volume": 17989396,
  "tradeTime": "111240",
  "updatedAt": "2026-04-28T02:12:40.973Z",
  "isSnapshot": false
}
```

## Applied Price Summary

```json
{
  "ticker": "005930",
  "price": 222250,
  "changeAbs": -2250,
  "changeRate": -1,
  "volume": 17989304,
  "updatedAt": "2026-04-28T02:12:40.973Z",
  "isSnapshot": false,
  "source": "ws-integrated"
}
```

## SSE Price Update Summary

```json
{
  "ticker": "005930",
  "price": 222250,
  "changeAbs": -2250,
  "changeRate": -1,
  "volume": 17989304,
  "updatedAt": "2026-04-28T02:12:40.973Z",
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
- [x] 4개 이상 종목 구독 0회
- [x] non-favorite 임의 편입 0회
- [x] approval_key/appKey/appSecret/access token 원문 저장 0회

Raw live frames and approval keys are intentionally not included in this report.
