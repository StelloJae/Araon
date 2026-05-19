# Watchlist API 스펙(정리)

## 1) `/watchlist` — Araon 통합 watchlist

### `GET /watchlist`

- 목적: local favorites + Toss watchlist 동기화 결과를 통합한 뷰.
- 반환: `AraonWatchlistPayload`.
- 동기화 상태
  - `syncState: 'toss_synced'` / `'sync_pending'` / `'local_only'` 등
  - `source`는 `toss`, `local`, `merged` 값 중 하나.

### `POST /watchlist/items`

- **요청 본문은 `productCode`가 필수**입니다.
  - `productCode`만 있으면 유효합니다: `{"productCode":"A005930"}`
  - `productCode`와 함께 다른 필드를 보낼 수 있으나, 서버에서 실질적으로 사용하는 값은 `productCode`입니다.
  - ❌ `{"ticker":"005930"}` → `WATCHLIST_PRODUCT_INVALID`
  - ❌ `{"krTicker":"005930"}` → `WATCHLIST_PRODUCT_INVALID`
- 성공 응답 (`200` / 지원되지 않은 동기화는 `202`):
  - `provider: 'araon-watchlist'`
  - `action: 'added' | 'unchanged' | 'unsupported'`
  - `syncState: 'toss_synced' | 'sync_pending' | 'local_only' | 'sync_failed' ...`
  - `reason: 'toss_mutation_succeeded' | 'toss_mutation_disabled' | 'unsupported_product' ...`
  - `item`: 추가/반영된 `AraonWatchlistItem` 또는 `null`.

### `DELETE /watchlist/items/:productCode`

- Path param인 `:productCode`가 필수.
- 예: `/watchlist/items/A005930`
- 성공 응답은 `POST`와 동일한 형태:
  - `provider`, `action`, `syncState`, `reason`, `item`(삭제 대상일 경우 `null`).

## 2) `/toss/watchlist` — Toss 원본 뷰 (read-only)

- `GET /toss/watchlist`는 Toss 세션 기반으로, Toss watchlist 원문 그룹/항목을 반환합니다.
- 구현상으로는 먼저 `api/v2/dashboard/asset/sections/all`를 읽고, 응답에 watchlist section이 비어 있으면 `/api/v1/new-watchlists`를 fallback 사용합니다.
- 반환: `TossWatchlistPayload`
  - `groups`: Toss watchlist 그룹
  - `items`: 전체 평탄화 항목
- 실패 시 `TOSS_SESSION_REQUIRED` 또는 일반 Toss read 에러 코드.

## 3) 실무 확인 체크리스트

1. `POST /watchlist/items`는 반드시 `productCode`로 호출한다.
2. `watchlist` add/remove는 `productCode`를 Toss 쪽으로 전달하고, UI/로컬 반영은 `/watchlist`에서 확인한다.
3. 원본 Toss read-only 검증은 `/toss/watchlist`로 추가 확인한다.
