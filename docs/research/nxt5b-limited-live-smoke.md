# NXT5b — limited favorites live smoke

**실행 일시 (UTC)**: 2026-04-27T10:03:08.511Z
**완료 일시 (UTC)**: 2026-04-27T10:03:09.560Z
**소요 시간**: 1049ms
**환경**: live
**결과**: ok

## Audit

- git HEAD at probe: `a1630b9`
- NXT4b commit present: true
- NXT4b report present: true
- NXT4b isolated apply evidence: true
- NXT5a commit present: true
- NXT5a report present: true
- NXT5a tier evidence: true

## Target

- TR_ID: `H0UNCNT0`
- favorites count: 5
- realtime candidates: 005930, 000660, 042700
- subscribed tickers: 005930, 000660, 042700
- probe-only fallback: false

## Safe Summary

- approval key call count: 1
- websocket connection attempts: 1
- websocket connected: true
- subscribe attempted count: 3
- subscribe sent count: 3
- subscribe ACK status: success
- ACKed tickers: 000660, 005930, 042700
- live frame count: 4
- parsed tick count: 4
- live frame count by ticker: {"005930":3,"000660":0,"042700":1}
- priceStore.setPrice count: 3
- SSE price-update count: 3
- collection reason: target_apply_count_reached
- source metadata ok: true
- stale policy checked: true
- stale policy passed: true

## Parsed Tick Summary

```json
{
  "trId": "H0UNCNT0",
  "source": "integrated",
  "ticker": "042700",
  "price": 373500,
  "changeAbs": 78000,
  "changeRate": 26.4,
  "volume": 11303988,
  "tradeTime": "190309",
  "updatedAt": "2026-04-27T10:03:09.359Z",
  "isSnapshot": false
}
```

## Applied Price Summary

```json
{
  "ticker": "042700",
  "price": 373500,
  "changeAbs": 78000,
  "changeRate": 26.4,
  "volume": 11303988,
  "updatedAt": "2026-04-27T10:03:09.359Z",
  "isSnapshot": false,
  "source": "ws-integrated"
}
```

## Integration Guard

- [x] probe-local PriceStore only
- [x] probe-local SSE spy only
- [x] running dev/prod server priceStore touched 0회
- [x] real SSE clients touched 0회
- [x] UI 변경 0회
- [x] persisted settings 변경 0회
- [x] websocketEnabled 기본값 변경 0회
- [x] reconnect loop 0회
- [x] 4개 이상 종목 구독 0회
- [x] approval_key/appKey/appSecret/access token 원문 저장 0회

## Verification

- `npx tsx scripts/probe-kis-ws-favorites-smoke.mts`: ok
- ad-hoc script typecheck: clean
- `npm run typecheck`: clean
- `npm test`: 44 files / 384 tests pass
- `npm run build`: clean
- raw secret/token leak grep: 0
- REST polling 영향: polling scheduler tests pass

Raw live frames and approval keys are intentionally not included in this report.
