# NXT2b — KIS approval key live probe

**실행 일시 (UTC)**: 2026-04-27T05:32:42.472Z
**소요 시간**: 126ms
**환경**: live
**결과**: ok

## Issuer state (post-issue)
```json
{
  "status": "ready",
  "issuedAt": "2026-04-27T05:32:42.597Z"
}
```

## Response shape (sanitized)

- 응답 top-level keys: `approval_key`
- `approval_key`: 길이 36, sha256 prefix a32cdbedf1fc9555 (raw value 미저장)
- 추가 필드: 없음

## 정책 준수 체크리스트

- [x] approval_key 원문은 디스크에 0회 저장 (length + sha256 prefix만 기록)
- [x] WS 연결 / subscribe / priceStore.setPrice 0회
- [x] credentials.enc 수정 0회
- [x] 호출 1회 (issuer.issue() 1회 — kis-rest-client 내장 retry는 408/429/5xx에 한함)
- [x] REST polling 영향 없음 (probe는 standalone, server 미실행)

## TTL / expiresAt 추론

응답 body에 expires/ttl 단서 필드 없음. approval key의 명시적 만료 시각은 응답에서 확인 불가 — 현재 구현은 unknown TTL / session-scoped로 취급 (새 WS 세션 시작 시 재발급).
