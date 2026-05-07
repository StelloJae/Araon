# NXT5a — mock favorites tier bridge

**실행 일시 (KST)**: 2026-04-27
**환경**: mock/unit only
**결과**: ok

## Goal

NXT4b에서 검증한 live tick apply 경로를 바로 40종목에 연결하지 않고,
favorites 상위 소수 종목만 WebSocket 후보로 고르는 tier 정책을 먼저
mock 기반으로 고정했다.

## Policy

- NXT5a realtime rollout cap: oldest 3 favorites
- KIS hard ceiling guard: `WS_MAX_SUBSCRIPTIONS`
- realtime candidate source: favorites only
- non-favorites: REST polling lane
- overflow favorites: accepted, but `tier='polling'`
- default `websocketEnabled`: unchanged false
- default `applyTicksToPriceStore`: unchanged false
- live KIS approval/WebSocket/subscribe calls: 0

## Behavior

- `computeTiers()` defaults to the NXT5a 3-favorite cap.
- Requested caps above `WS_MAX_SUBSCRIPTIONS` are clamped to the KIS ceiling.
- Adding a 4th favorite no longer fails; it stays on the polling lane and emits
  no subscribe diff.
- Removing a realtime favorite promotes the next polling favorite and emits a
  minimal subscribe/unsubscribe diff.
- `/favorites` returns the runtime tier-manager view and syncs repository tiers,
  so stale `realtime` rows from earlier experiments are normalized on read.

## Integration Guard

- [x] live KIS approval key 발급 0회
- [x] WebSocket connect 0회
- [x] H0UNCNT0 subscribe 0회
- [x] 40종목 구독 0회
- [x] `websocketEnabled=false` default 유지
- [x] `applyTicksToPriceStore=false` default 유지
- [x] REST polling scheduler는 tier와 무관하게 계속 전체 tracked stock을 polling

## Tests

- `src/server/realtime/__tests__/tier-manager.test.ts`
  - top 3 favorites만 realtime
  - non-favorites는 capacity가 남아도 polling
  - cap 요청이 40을 초과해도 `WS_MAX_SUBSCRIPTIONS` 초과 없음
  - 4번째 favorite은 polling으로 수락
  - realtime favorite 삭제 시 다음 polling favorite 승격
- `src/server/routes/__tests__/favorites.test.ts`
  - overflow favorite POST는 201 + `tier='polling'`
  - realtime favorite DELETE는 다음 polling favorite을 realtime으로 승격
  - GET은 stale repository tier 대신 runtime tier-manager 기준 응답

## Verification

- `npm run typecheck`: clean
- `npm test`: 44 files / 381 tests pass
- live KIS approval/WebSocket/subscribe calls: 0
- secret/token leak grep: 0

No raw KIS credential, token, approval key, or live frame is included in this
document.
