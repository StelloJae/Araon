# NXT7i - operator UI polish and status messaging

**작성 일시 (KST)**: 2026-04-28  
**환경**: non-live implementation and test pass  
**결과**: PASS - UI copy/status helpers polished without KIS live calls

## Goal

NXT7f, NXT7g, and NXT7h proved the UI live hard-limit path for cap 1, cap 3,
and cap 5. NXT7i does not widen the live rollout. It makes the operator UI
clearer so a non-developer can understand what is enabled, why a session ended,
and which caps are already verified.

## Scope

This stage intentionally made no live KIS calls:

- no approval key issue
- no WebSocket connection
- no `H0UNCNT0` subscription
- no live frame collection
- no cap 10 / 20 / 40 live smoke
- no persisted setting enable

## UI Changes

SettingsModal "통합 실시간 시세" copy now says:

- 실험 기능
- 이 세션에서만 켜집니다
- REST 폴링은 계속 유지됩니다
- 가격 반영은 시간 또는 tick 제한에 도달하면 자동으로 정리됩니다
- 검증 완료: 1 / 3 / 5종목
- 10종목은 다음 검증 예정
- 20 / 40종목은 아직 미검증
- 통합 실시간 시세는 `H0UNCNT0` 기반

The cap selector remains limited to the allowed caps only:

| cap | UI label |
|---:|---|
| 1 | 최대 1종목 · 검증됨 |
| 3 | 최대 3종목 · 검증됨 |
| 5 | 최대 5종목 · 검증됨 |
| 10 | 최대 10종목 · 다음 검증 예정 |

Cap 20 and cap 40 are still not selectable in the UI and remain rejected by the
backend route.

## Status Labels

The frontend now shares helper functions for:

- current session state: 꺼짐 / 연결 중 / 수신 중 / 제한 도달 / 오류
- end reason labels:
  - `applied_tick_limit_reached` -> 적용 tick 제한 도달
  - `parsed_tick_limit_reached` -> 수신 tick 제한 도달
  - `time_limit_reached` -> 시간 제한 도달
  - `no_live_tick_observed` -> live tick 미관찰
  - `safe_error` -> 안전 오류
  - `operator_disabled` -> 사용자가 세션 해제
- safe fetch failure copy:
  - 실시간 상태를 불러오지 못했습니다. REST 폴링은 계속 유지됩니다.

SettingsModal also makes source and selected cap easier to read:

- 소스: 통합
- 현재 cap: selected/session cap
- 적용 tick progress: `sessionAppliedTickCount / maxAppliedTicks`
- 수신 tick progress: `sessionParsedTickCount / maxParsedTicks`

SSEIndicator reuses the same end-reason and state helpers and shows the safe
status fetch failure copy without creating another EventSource.

SSE visibility note: `PriceStore.setPrice` remains the runtime apply evidence.
The browser-visible SSE frame count can be lower because `SseManager` may
throttle/coalesce same-ticker `price-update` events.

## Tests

NXT7i added focused frontend helper coverage:

- all operator end-reason labels map to Korean user-facing copy
- cap 1/3/5 labels show verified
- cap 10 label shows next verification planned
- session state summarizes active, connecting, ended-limit, off, and error states
- safe status fetch failure message says REST polling continues and contains no
  credential-like terms

Existing coverage still guards:

- cap 20/40 are not exposed in `SESSION_REALTIME_CAP_OPTIONS`
- route-level cap 20/40 rejection
- Settings operator controls do not call `settingsStore.save`
- status panel polling starts only while open
- status panel polling does not create EventSource

## Security

No raw approval key, app key, app secret, access token, or account identifier is
introduced in UI copy, tests, or docs. The UI still only names credential field
categories to tell the user they are not displayed.

## Next

NXT8a should be the next live step: cap 10 UI-controlled hard-limit smoke. Cap
20 and cap 40 remain later stages and are not approved by NXT7i.
