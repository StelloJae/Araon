# NXT6d - cap10 runtime apply smoke

**실행 일시 (UTC)**: 2026-04-28T02:33:01.339Z
**완료 일시 (UTC)**: 2026-04-28T02:33:03.527Z
**소요 시간**: 2188ms
**환경**: live
**결과**: ok

## Preflight

- git HEAD at probe: `acc7801`
- NXT6c report present: true
- NXT6c runtime apply evidence: true
- runbook present: true
- default websocketEnabled: false
- default applyTicksToPriceStore: false
- legacy settings apply default: false
- persisted settings existed: true
- persisted settings unchanged: true
- REST polling touched by probe: false
- SSE client count before: 0
- preflight favorites count: 5
- preflight favorite tickers: 005930, 000660, 042700, 277810, 017510
- tracked stocks count: 105

## Target

- TR_ID: `H0UNCNT0`
- overlay favorites count: 10
- temporary favorite overlay used: true
- temporary favorite tickers: 000080, 000100, 000120, 000210, 000270
- temporary overlay reason: favorites_below_cap10
- realtime candidates: 005930, 000660, 042700, 277810, 017510, 000080, 000100, 000120, 000210, 000270
- subscribed tickers: 005930, 000660, 042700, 277810, 017510, 000080, 000100, 000120, 000210, 000270
- max subscribe tickers: 10

## Safe Summary

- approval key call count: 1
- websocket connection attempts: 1
- websocket connected: true
- subscribe attempted count: 10
- subscribe sent count: 10
- subscribe ACK status: success
- ACKed tickers: 000080, 000100, 000120, 000210, 000270, 000660, 005930, 017510, 042700, 277810
- ACK status by ticker: {"277810":"success","005930":"success","000660":"success","042700":"success","017510":"success","000080":"success","000100":"success","000120":"success","000210":"success","000270":"success"}
- live frame count: 7
- parsed tick count: 7
- live frame count by ticker: {"277810":0,"005930":4,"000660":2,"042700":1,"017510":0,"000080":0,"000100":0,"000120":0,"000210":0,"000270":0}
- no_tick_by_ticker: 277810, 017510, 000080, 000100, 000120, 000210, 000270
- priceStore.setPrice count: 6
- priceStore.setPrice count by ticker: {"277810":0,"005930":3,"000660":2,"042700":1,"017510":0,"000080":0,"000100":0,"000120":0,"000210":0,"000270":0}
- SSE price-update count: 6
- SSE price-update count by ticker: {"277810":0,"005930":3,"000660":2,"042700":1,"017510":0,"000080":0,"000100":0,"000120":0,"000210":0,"000270":0}
- collection reason: target_sse_count_reached
- source metadata ok: true
- updatedAt freshness ok: true
- stale policy passed: true

## Bridge Stats

```json
{
  "parsedTickCount": 7,
  "appliedTickCount": 6,
  "ignoredStaleTickCount": 1,
  "parseErrorCount": 0,
  "applyErrorCount": 0,
  "lastTickAt": "2026-04-28T02:33:02.374Z"
}
```

## Parsed Tick Summary

```json
{
  "trId": "H0UNCNT0",
  "source": "integrated",
  "ticker": "005930",
  "price": 222750,
  "changeAbs": -1750,
  "changeRate": -0.78,
  "volume": 19009308,
  "tradeTime": "113302",
  "updatedAt": "2026-04-28T02:33:02.374Z",
  "isSnapshot": false
}
```

## Applied Price Summary

```json
{
  "ticker": "005930",
  "price": 222750,
  "changeAbs": -1750,
  "changeRate": -0.78,
  "volume": 19009308,
  "updatedAt": "2026-04-28T02:33:02.374Z",
  "isSnapshot": false,
  "source": "ws-integrated"
}
```

## SSE Price Update Summary

```json
{
  "ticker": "005930",
  "price": 222750,
  "changeAbs": -1750,
  "changeRate": -0.78,
  "volume": 19009308,
  "updatedAt": "2026-04-28T02:33:02.374Z",
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
- restored favorites count: 5
- restored favorites tickers: 005930, 000660, 042700, 277810, 017510
- favoritesRestored: true

## Integration Guard

- [x] real PriceStore used
- [x] real SseManager used
- [x] running dev/prod server touched 0회
- [x] UI 변경 0회
- [x] persisted settings 영구 변경 0회
- [x] credentials.enc 수정 0회
- [x] reconnect loop 0회
- [x] 11개 이상 종목 구독 0회
- [x] non-favorite 직접 구독 0회
- [x] master-only 종목 편입 0회
- [x] 임시 favorite 영구 잔존 0회
- [x] approval_key/appKey/appSecret/access token 원문 저장 0회

Raw live frames and approval keys are intentionally not included in this report.
