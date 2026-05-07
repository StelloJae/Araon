# NXT3 — H0UNCNT0 live WebSocket smoke

**실행 일시 (UTC)**: 2026-04-27T08:14:04.226Z
**완료 일시 (UTC)**: 2026-04-27T08:14:07.270Z
**소요 시간**: 3044ms
**환경**: live
**결과**: ok

## Target

- TR_ID: `H0UNCNT0`
- ticker: `005930` (삼성전자)
- subscribe count: 1

## Safe Summary

- approval key call count: 1
- websocket connected: true
- subscribe sent: true
- subscribe ack: success
- live tick frame count: 2
- parsed tick count: 2
- collection reason: first_tick_grace_elapsed
- fixture path: src/server/kis/__fixtures__/ws-tick-h0uncnt0-005930-live.redacted.json

## Parsed Tick Summary

```json
{
  "trId": "H0UNCNT0",
  "source": "integrated",
  "ticker": "005930",
  "price": 223500,
  "changeAbs": 4000,
  "changeRate": 1.82,
  "volume": 39260243,
  "tradeTime": "171405",
  "isSnapshot": false
}
```

## Integration Guard

- [x] priceStore.setPrice 호출 0회
- [x] SSE price-update 발행 0회
- [x] UI 변경 0회
- [x] websocketEnabled 기본값 변경 0회
- [x] reconnect loop 0회
- [x] approval_key/appKey/appSecret/access token 원문 저장 0회

## Notes

- Raw live frame은 이 문서에 포함하지 않는다.
- 성공 시 raw tick frame은 secret-pattern guard 통과 후 redacted fixture 파일에만 저장한다.
