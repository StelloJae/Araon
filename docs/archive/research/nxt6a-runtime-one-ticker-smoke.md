# NXT6a — one-ticker runtime apply smoke

**실행 일시 (UTC)**: 2026-04-28T01:36:09.766Z
**완료 일시 (UTC)**: 2026-04-28T01:36:10.579Z
**소요 시간**: 813ms
**환경**: live
**결과**: ok

## Preflight

- git HEAD at probe: `edfe36c`
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
- ticker: `005930`
- max subscribe tickers: 1

## Safe Summary

- approval key call count: 1
- websocket connection attempts: 1
- websocket connected: true
- subscribe attempted count: 1
- subscribe sent count: 1
- subscribe ACK status: success
- live frame count: 7
- parsed tick count: 7
- priceStore.setPrice count: 3
- SSE price-update count: 3
- collection reason: target_sse_count_reached
- source metadata ok: true
- updatedAt freshness ok: true
- stale policy passed: true

## Bridge Stats

```json
{
  "parsedTickCount": 7,
  "appliedTickCount": 3,
  "ignoredStaleTickCount": 4,
  "parseErrorCount": 0,
  "applyErrorCount": 0,
  "lastTickAt": "2026-04-28T01:36:10.577Z"
}
```

## Parsed Tick Summary

```json
{
  "trId": "H0UNCNT0",
  "source": "integrated",
  "ticker": "005930",
  "price": 224500,
  "changeAbs": 0,
  "changeRate": 0,
  "volume": 15094053,
  "tradeTime": "103610",
  "updatedAt": "2026-04-28T01:36:10.577Z",
  "isSnapshot": false
}
```

## Applied Price Summary

```json
{
  "ticker": "005930",
  "price": 224500,
  "changeAbs": 0,
  "changeRate": 0,
  "volume": 15094053,
  "updatedAt": "2026-04-28T01:36:10.577Z",
  "isSnapshot": false,
  "source": "ws-integrated"
}
```

## SSE Price Update Summary

```json
{
  "ticker": "005930",
  "price": 224500,
  "changeAbs": 0,
  "changeRate": 0,
  "volume": 15094053,
  "updatedAt": "2026-04-28T01:36:10.577Z",
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
- [x] 2개 이상 종목 구독 0회
- [x] approval_key/appKey/appSecret/access token 원문 저장 0회

Raw live frames and approval keys are intentionally not included in this report.
