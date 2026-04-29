# NXT4b — isolated H0UNCNT0 live apply smoke

**실행 일시 (UTC)**: 2026-04-27T08:41:54.876Z
**완료 일시 (UTC)**: 2026-04-27T08:41:56.080Z
**소요 시간**: 1204ms
**환경**: live
**결과**: ok

## Target

- TR_ID: `H0UNCNT0`
- ticker: `005930` (삼성전자)
- subscribe count: 1

## Safe Summary

- approval key call count: 1
- websocket connection attempts: 1
- websocket connected: true
- subscribe sent: true
- subscribe ack: success
- observed live frame count: 4 (fast burst; apply path capped at 3)
- parsed tick count: 4
- priceStore.setPrice count: 3
- SSE price-update count: 3
- collection reason: apply_limit_reached
- stale policy checked: true
- stale policy passed: true

Note: the fourth observed tick shared the current applied timestamp window and
was ignored by the stale/equal `updatedAt` policy. Probe-local state mutation
remained capped at 3 `price-update` events.

## Parsed Tick Summary

```json
{
  "trId": "H0UNCNT0",
  "source": "integrated",
  "ticker": "005930",
  "price": 223500,
  "changeAbs": 4000,
  "changeRate": 1.82,
  "volume": 39518848,
  "tradeTime": "174155",
  "updatedAt": "2026-04-27T08:41:56.079Z",
  "isSnapshot": false
}
```

## Applied Price Summary

```json
{
  "ticker": "005930",
  "price": 223500,
  "changeAbs": 4000,
  "changeRate": 1.82,
  "volume": 39518848,
  "updatedAt": "2026-04-27T08:41:56.079Z",
  "isSnapshot": false,
  "source": "ws-integrated"
}
```

## Isolation Guard

- [x] probe-local PriceStore only
- [x] probe-local SSE spy only
- [x] running dev/prod server priceStore touched 0회
- [x] real SSE clients touched 0회
- [x] UI 변경 0회
- [x] persisted settings 변경 0회
- [x] websocketEnabled 기본값 변경 0회
- [x] reconnect loop 0회
- [x] approval_key/appKey/appSecret/access token 원문 저장 0회

Raw live frames and approval keys are intentionally not included in this report.
