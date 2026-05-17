# Araon Final Product Execution Goal

Date: 2026-05-14

This document is the authoritative execution brief for continuing Araon from the
current Toss-primary/KIS-speed-layer implementation toward the intended final
product. Future goal runs should read this file first, then execute in small,
verified milestones.

This is not a live-trading approval. It does not authorize placing, cancelling,
or amending real orders. It also does not authorize Codex to mutate the user's
real Toss watchlist during automated verification without a fresh explicit user
GO. The product should support Toss watchlist sync, but live account mutation
must be implemented and tested with mocks first, then exercised live only after
the user explicitly approves that step.

## 0. Current Product Understanding

Araon is no longer a KIS-first local watchlist app. Araon is becoming a
Toss-primary personal investment terminal:

- Toss login/session is the main account-aware connection.
- Toss public/authenticated web APIs are the default source for search, quote,
  chart, TOP100, account, portfolio, watchlist, orders, transactions, cash, and
  Toss-side news/signal surfaces.
- Toss realtime is not WebSocket. Current evidence and `tossinvest-cli`
  reference show Toss realtime as SSE thin notification plus REST refresh.
- KIS is not the account, order, ranking, chart-history, watchlist, or sector
  truth source.
- KIS remains only as optional low-latency Korean-stock realtime tracking for
  eligible six-digit KR tickers, capped at 40 subscriptions per profile.
- User-facing UI should say `실시간 추적`, not `KIS WS`.
- Agent functionality is an observation and safety foundation: events,
  reasoning inputs, simulated/paper previews, gated order intent, confirm/audit.
  Live auto-execution stays locked until a separate explicit policy approval.

## 1. Current Codebase Facts

These facts were verified from the current codebase before this document was
created.

### 1.1 Server And Routes

- Main server composition lives in `src/server/app.ts`.
- Toss account/read routes are already registered:
  - `src/server/routes/toss-auth.ts`
  - `src/server/routes/toss-account.ts`
  - `src/server/routes/toss-account-summary.ts`
  - `src/server/routes/toss-orders.ts`
  - `src/server/routes/toss-portfolio.ts`
  - `src/server/routes/toss-transactions.ts`
  - `src/server/routes/toss-watchlist.ts`
  - `src/server/routes/toss-realtime.ts`
- Agent/safety routes are already registered:
  - `src/server/routes/agent-events.ts`
  - `src/server/routes/agent-event-monitor.ts`
  - `src/server/routes/agent-event-alert-deliveries.ts`
  - `src/server/routes/agent-order-intents.ts`
- KIS realtime slot routes are already registered:
  - `src/server/routes/kis-ws-slots.ts`
- Local favorites route still exists:
  - `src/server/routes/favorites.ts`
- Legacy stock add/search route still exists:
  - `src/server/routes/stocks.ts`
  - `POST /stocks/from-master`
  - `POST /stocks/from-toss-search`
  - older `POST /stocks` and `/favorites` schemas still require six-digit KR
    tickers.

### 1.2 Toss Watchlist Current State

Current Toss watchlist support is read-only:

- `GET /toss/watchlist` exists.
- `src/server/toss/toss-watchlist-client.ts` implements `listWatchlist()`.
- It loads the Toss session, loads the primary account key, calls
  `POST /api/v2/dashboard/asset/sections/all` with `types: ['WATCHLIST']`, then
  returns sanitized groups/items.
- It intentionally does not expose raw account keys, watchlist upstream refs,
  session cookies, or raw provider bodies.
- There is no `POST /toss/watchlist` / `DELETE /toss/watchlist/:productCode`
  mutation route yet.

### 1.8 Watchlist Mutation Candidate Evidence - 2026-05-14 KST

After the first version of this brief, a public Toss web bundle static
inspection found candidate watchlist mutation calls. This is useful evidence for
mocked implementation, but it is not a live mutation approval.

Candidate endpoint shape from the public web bundle:

- list groups: `GET /api/v1/new-watchlists/groups/simple`
- create group: `POST /api/v1/new-watchlists/groups`
- add item: `POST /api/v1/new-watchlists/items`
- remove item: `POST /api/v1/new-watchlists/items/remove`
- add body shape: `watchlistIds` plus `items`
- remove body shape: `watchlistId` plus `items`
- item shape: `code` plus `itemType`

Implementation rule:

- It is acceptable to implement these candidates behind an explicit
  disabled-by-default gate with mocked/fixture tests.
- Normal Araon startup must not perform live Toss watchlist add/remove.
- A live smoke may only happen after fresh user GO, and the smoke evidence must
  not expose raw Toss session, account, or watchlist identifiers.

### 1.3 Local Favorites Current State

Local favorite support still exists:

- `favorites` table exists.
- `FavoriteRepository` stores `ticker`, `tier`, and `added_at`.
- `GET /favorites`, `POST /favorites`, and `DELETE /favorites/:ticker` exist.
- `POST /favorites` validates `ticker` as exactly six digits.
- If KIS runtime is not started, local favorite add stores `tier: 'polling'`.
- If KIS runtime is started, the old tier manager applies realtime diffs.
- Client store `src/client/stores/watchlist-store.ts` still describes
  `favorites` as a local Set mirrored by `/favorites`.
- `src/client/App.tsx` still toggles favorites optimistically through
  `addFavorite()` / `removeFavorite()`.

This means current UI can star/unstar local six-digit tickers, but it does not
yet make Toss watchlist the authoritative favorite source.

### 1.4 Product Identity Current State

Product identity has started moving in the right direction:

- `src/shared/product-identity.ts` defines `AraonProductIdentity`.
- It separates:
  - Toss `productCode`
  - optional six-digit `krTicker`
  - `tossEligible`
  - `kisEligible`
  - `chartEligible`
  - `quoteEligible`
- `normalizeTossProductCode('005930')` becomes `A005930`.
- `krTickerFromTossProductCode('A005930')` returns `005930`.
- Toss-only product codes such as `0011T0` produce `krTicker = null` and
  `kisEligible = false`.
- Client search merges local and Toss results in
  `src/client/lib/stock-search.ts`.
- `src/client/components/GlobalSearch.tsx` shows Toss-only products as
  `Toss 전용` / `지원 대기`.

Remaining problem:

- The add/register path still collapses many actions back to six-digit ticker
  routes.
- Search selection can still hit `400 Bad Request` when a product is not a
  six-digit KR ticker or when the wrong add path receives a Toss-only code.

### 1.5 KIS Current Role

KIS has been reframed but not fully deleted:

- Heavy KIS REST paths are disabled or legacy-gated by default:
  - quote fallback
  - polling fallback
  - chart fallback
  - master auto refresh
  - watchlist import as manual migration helper
- KIS WS slot state/allocator/rebalancer exists:
  - `src/server/realtime/kis-ws-slot-allocator.ts`
  - `src/server/realtime/kis-ws-slot-candidates.ts`
  - `src/server/realtime/kis-ws-slot-session-rebalancer.ts`
  - `src/server/realtime/kis-ws-slot-state.ts`
- KIS slots are candidate-driven from holdings/current view/agent events/
  favorites/order intent/TOP100 rotation.
- UI copy is being rewritten from `KIS WS` to `실시간 추적`.

Remaining problem:

- Some old concepts still leak into architecture and copy:
  - `polling`
  - `tracked`
  - `내 목록`
  - `registered`
  - KIS watchlist import as if it were a normal user flow
- These concepts should stay internal/legacy only.

### 1.6 Frontend Current State

The home layout direction is locked in `docs/design.md`:

- Main workspace excluding right account rail splits 50:50 horizontally.
- Left half:
  - top 50%: TOP100 / movers
  - bottom 50%: split 50:50 into Toss-synced watchlist/favorites and recent
    surge
- Right half:
  - top 50%: selected ticker / chart panel
  - bottom 50%: agent candidates, evidence, safety summary
- Right Toss account rail is narrow, white/Araon-styled, and collapsible.
- Full Chart expands from the selected ticker panel.
- Agent Detail expands from the agent panel.
- Bottom market/status marquee remains visible.
- Final visual language must follow the existing Araon design system, not
  OpenDesign prototype chrome.

Remaining UI concerns from recent QA:

- Some chart behavior still needs stronger real-time candle progression.
- Mini/full chart should skip long non-trading gaps visually.
- Full chart should feel closer to an advanced chart, not a debug surface.
- Agent panel is functional but still not intuitive enough.
- Account rail typography/spacing must stay Toss-like but with Araon tokens.
- Dark mode bottom bar and minor alignment should remain QA gates.

### 1.7 Live Verification Snapshot - 2026-05-14 KST

After this document was first created, the running local app was checked against
the live dev server and Safari UI. This snapshot should guide future goal runs:
do not rebuild already-working surfaces unless the code has drifted.

Running processes observed:

- Server dev process was listening on `127.0.0.1:3000`.
- Vite client was listening on `127.0.0.1:5173`.
- Safari was open on `http://127.0.0.1:5173/` and showed the current Araon
  dashboard.

API surfaces confirmed working:

- `GET /toss/auth/status`
  - returned `success: true`.
  - Toss session state was persistent.
- `GET /toss/account/summary`
  - returned `success: true`.
  - Account/cash/investment summary fields were available.
  - Do not write actual account amounts into docs or logs.
- `GET /toss/portfolio/positions`
  - returned `success: true`.
  - Portfolio positions were available.
  - The observed snapshot had both US and KR positions.
- `GET /market/top-movers?limit=5`
  - returned `success: true`.
  - Source was Toss overview ranking.
  - 상승/하락 both had provider rows.
  - `cacheTtlMs` and `refreshIntervalMs` were both `500`.
  - `coverage.includesLocalFallback` was `false`.
- `GET /market/toss/realtime-ranking?limit=5&market=kr`
  - returned `success: true`.
  - Source was Toss public realtime ranking.
- `GET /market/toss/search?q=채비&limit=5`
  - returned `success: true`.
  - `채비` came back as Toss-only product code `A0011T0`.
  - `kisEligible` was `false`.
- `GET /runtime/realtime/kis-ws-slots`
  - returned `success: true`.
  - KIS slot provider was active.
  - Per-profile cap was `40`.
  - Active slot count was non-zero.
- `GET /agent/events?limit=5`
  - returned `success: true`.
  - Market movement events were present.
- `GET /agent/event-alert-deliveries?limit=3`
  - returned `success: true`.
  - Browser SSE delivery records were present.
- `GET /agent/order-intents/live-policy`
  - returned `success: true`.
  - Live execution was disabled.
  - Policy approval was false.
  - Kill switch was engaged.

UI surfaces confirmed visible in Safari:

- TOP100 panel rendered 상승 TOP100 and 하락 TOP100 side by side.
- Favorites panel rendered local favorite rows with sparklines.
- Selected ticker/chart panel rendered TradingView lightweight chart.
- Agent panel rendered event observation and simulated preview/safety state.
- Toss account rail rendered the authenticated account/portfolio read surface.
- Bottom market/status bar rendered and updated.
- Right icon rail rendered home/chart/agent/settings controls.

Important gaps still visible in the running UI:

- `GET /watchlist` returned `404`; normalized Araon watchlist route does not
  exist yet.
- `GET /toss/watchlist` exists, but the observed response had zero groups.
  Toss watchlist read support exists; Toss watchlist has not yet become the
  primary UI favorite source.
- `GET /favorites` still returned local favorites. The observed snapshot had
  local favorites, and the Favorites panel was still backed by local favorite
  state.
- Search dropdown still used old source copy in some paths:
  - local/tracked rows can still be described as `내 목록` in code.
  - Toss-only rows show `Toss 전용` / `지원 대기`, which is correct.
- Search UI still showed a stale `추가 실패: 400 Bad Request` after searching
  Toss-only products. This is a product-aware add-flow bug, not a Toss search
  failure.
- Agent panel labels convert event source to `실시간 추적`, but event reason text
  can still expose backend wording such as `KIS WS 보조 가격 업데이트`.
- Favorites header still showed a technical realtime slot pill such as
  `KIS nn/40`. Normal UI should use `실시간 추적` wording or hide this detail.
- Some settings/test copy still mentions `tracked`, `favorite · agent event ·
  tracked`, or diagnostics-only KIS details. These should move to diagnostics
  or be renamed before completion.

Current conclusion:

- Toss account, portfolio, TOP100, public search, quote/ranking surfaces, KIS
  realtime slot preview, agent event queue, and live-execution lock are already
  materially implemented and running.
- The remaining highest-leverage gap is not basic feature creation. It is
  source-of-truth cleanup:
  - normalized `/watchlist`;
  - Toss watchlist as `즐겨찾기` primary truth;
  - local `/favorites` as fallback/cache only;
  - product-aware star/add flow;
  - removal of legacy user-facing copy.

## 2. Final Product Target

Araon should become:

> A local, single-user, Toss-primary Korean/US personal investment terminal
> with optional KIS realtime tracking, news/disclosure/signal detection, and a
> safe agent event/order-intent foundation.

### 2.1 User-Facing Product Model

Users should understand the app as:

- `Toss 계정`: login/session/account/portfolio/orders/transactions/watchlist
- `즐겨찾기`: Toss watchlist-backed user watchlist
- `TOP100`: Toss provider ranking, never fake-filled from local rows
- `최근 급상승`: market movement detector
- `실시간 추적`: optional fast tracking for up to 40 eligible KR tickers
- `Agent`: watches events and prepares candidates/previews only
- `Live trading`: locked unless separately approved

Users should not need to understand:

- KIS WS
- KIS polling
- tracked stock list
- tier manager
- master import
- raw provider refs
- raw session/account/order ids

### 2.2 Source Of Truth Table

| Surface | Final primary source | Secondary/internal source | User-facing wording |
|---|---|---|---|
| Login/session | Toss | none | Toss 계정 / 세션 |
| Account/cash | Toss authenticated read | none | 계좌 / 현금 |
| Portfolio | Toss authenticated read | none | 내 투자 / 보유 |
| Watchlist/favorites | Toss watchlist | local cache fallback when offline/no-login | 즐겨찾기 |
| Search | Toss search + local cache | KRX local cache for eligible KR | 검색 |
| Product identity | Toss productCode + normalized identity | six-digit KRX ticker for KIS eligibility | product hidden unless useful |
| Quote | Toss quote refresh | KIS tick overlay for eligible KR | Toss 가격 / 가격 |
| Sparkline | Toss-derived local history | KIS tick overlay | sparkline only |
| Mini chart | Toss candle/history | KIS current-candle overlay | 차트 |
| Full chart | Toss candle/history + advanced chart integration | KIS current-candle overlay | 전체 차트 |
| TOP100 | Toss ranking/top movers | none | TOP100 상승/하락 |
| Sector/theme | Toss/local normalized classification | KIS legacy metadata only as hidden fallback | 섹터/테마 |
| News | Toss/Naver normalized providers | local cache | 뉴스 |
| Disclosure | OpenDART normalized provider | local cache | 공시 |
| Signals | Toss signal / internal signal events | local cache | 시그널 |
| Market movement | TOP100/Toss quote/KIS tick/realtime momentum normalized | local event queue | 급상승 / 시장 움직임 |
| Agent input | normalized event queue | audit log | 에이전트 관찰 |
| Order preview | local simulation/paper preview | Toss order read-only context | 주문 preview |
| Live execution | disabled | future approval policy only | 실행 잠금 |
| KIS | optional realtime tracking only | legacy fallback hidden | 실시간 추적 |

## 3. Hard Safety Boundaries

### 3.1 Never Leak Raw Sensitive Data

Never print or expose raw:

- Toss cookies/session/storage values
- Toss account keys
- Toss order refs
- Toss watchlist upstream refs when they can identify account internals
- KIS appKey/appSecret/access token/approval key/account number
- raw KIS WS frames
- Telegram/Naver/OpenDART secrets
- raw upstream JSON payloads from account/order/session routes

This applies to:

- UI
- logs
- docs
- stdout
- test snapshots
- git diff
- acceptance reports

### 3.2 No Synthetic Finance Data

Do not invent prices, holdings, candles, orders, account values, or news.

Allowed:

- empty state
- `수집 중`
- `대기`
- `미제공`
- `지원 대기`
- `Toss 전용`
- local UI skeleton without numeric finance values

Not allowed:

- fake account balance
- fake candle history
- fake TOP100 rows labeled as provider data
- watchlist rows pretending to be market-wide rankings

### 3.3 External Mutation Boundary

The final product should support Toss watchlist sync, but implementation must
respect this sequence:

1. Reverse-engineer and document Toss watchlist add/remove endpoints without
   printing raw sensitive payloads.
2. Implement route/client behind a mutation gate.
3. Add tests with fixture fetchers.
4. Add UI that clearly distinguishes:
   - synced
   - sync pending
   - sync unavailable
   - local fallback
5. Only run a live Toss watchlist add/remove after the user gives a fresh
   explicit GO for that live mutation test.

Real order placement/cancel/amend/account mutation remains prohibited until a
separate trading approval policy exists.

## 4. Strategic Decisions To Lock

### 4.1 `즐겨찾기` Means Toss Watchlist

Final behavior:

- If logged into Toss, Toss watchlist is the authoritative watchlist.
- If a product is in Toss watchlist, it appears in Araon 즐겨찾기.
- If user stars a supported product in Araon, Araon should add it to Toss
  watchlist.
- If user unstars it in Araon, Araon should remove it from Toss watchlist.
- If Toss watchlist changes outside Araon, Araon should reflect it on refresh
  or session account rail refresh.
- Watchlist membership feeds `실시간 추적` slot candidacy.

Fallback behavior:

- If not logged in, local favorites can work as local-only fallback.
- UI must label local-only state honestly.
- Once Toss login becomes ready, local-only favorites should be reconciled into
  Toss watchlist only with explicit user action or a clear pending-sync flow.

### 4.2 `내 목록` Is Not A User Product Concept

The old local tracked list exists because the first product was a local KIS
watchlist dashboard. In the final product:

- Do not show `내 목록` as a primary user concept.
- Do not use `등록됨` for searched rows.
- Do not treat `tracked stocks` as the user-visible watchlist.
- Keep local tracked/cache tables only as implementation detail for:
  - selected ticker cache
  - local candle/price history
  - no-login fallback
  - migration compatibility

Replacement copy:

- `즐겨찾기`
- `Toss 동기화`
- `로컬 보관`
- `지원 대기`
- `Toss 전용`
- `실시간 추적`

### 4.3 `실시간 추적` Is Optional, Not The Watchlist

KIS realtime should not define watchlist membership.

Correct mental model:

- Watchlist/favorite = what user wants to follow.
- 실시간 추적 = which eligible KR products currently get low-latency KIS tick
  acceleration.

So:

- A watchlist item may or may not be in the 40 realtime tracking slots.
- A recent news/agent/TOP100 ticker may temporarily get a realtime slot even if
  it is not in watchlist.
- UI should show compact tracking status, not giant row pills.
- User-facing copy says `실시간 추적`, while diagnostics may mention KIS if
  necessary.

### 4.4 Toss-Only Products Stay Honest

Some Toss products are not six-digit KRX tickers. Example: `0011T0`.

Rules:

- They may appear in search.
- They may be displayed as Toss-only.
- They must not be sent to KIS.
- They must not be sent to `/stocks/from-master` or `/favorites` six-digit
  routes.
- If quote/chart/watchlist mutation is not supported, row action must show
  `지원 대기`, not `+ 추가`.
- Search click should not produce a confusing `400 Bad Request`.

## 5. Required Architecture Changes

### 5.1 Watchlist Sync Layer

Create a normalized watchlist layer that sits above raw Toss watchlist and local
favorites.

Proposed server module:

- `src/server/watchlist/araon-watchlist-service.ts`
- `src/server/routes/watchlist.ts` or extend with safe new routes
- tests under `src/server/watchlist/__tests__/` and
  `src/server/routes/__tests__/watchlist-sync.test.ts`

Proposed contract:

```ts
interface AraonWatchlistItem {
  productCode: string;
  krTicker: string | null;
  symbol: string;
  name: string;
  market: 'KOSPI' | 'KOSDAQ' | 'US' | 'TOSS_ONLY' | 'UNKNOWN';
  currency: 'KRW' | 'USD' | 'UNKNOWN';
  source: 'toss' | 'local' | 'merged';
  syncState:
    | 'toss_synced'
    | 'local_only'
    | 'sync_pending'
    | 'sync_unavailable'
    | 'sync_failed';
  kisEligible: boolean;
  realtimeTrackingState:
    | 'tracked'
    | 'waiting'
    | 'not_eligible'
    | 'disabled'
    | 'unknown';
  addedAt: string | null;
  groupName: string | null;
}
```

Proposed read route:

- `GET /watchlist`

Behavior:

- If Toss session ready:
  - return Toss watchlist as primary.
  - merge local-only favorites with `syncState='local_only'` or
    `sync_pending` depending on planned migration state.
- If Toss session missing:
  - return local favorites with `syncState='local_only'`.
- If Toss read fails:
  - return local fallback when available, plus safe warning state.
  - do not expose raw Toss error body.

Proposed mutation routes:

- `POST /watchlist/items`
- `DELETE /watchlist/items/:productCode`

Mutation behavior:

- If Toss session ready and Toss watchlist mutation support is implemented:
  - mutate Toss watchlist.
  - update local cache/favorites after success.
  - return `syncState='toss_synced'`.
- If Toss session not ready:
  - optionally store local-only favorite.
  - return `syncState='local_only'`.
- If product unsupported:
  - return `syncState='sync_unavailable'`.
- If mutation endpoint is not yet verified:
  - route should be disabled or return `WATCHLIST_MUTATION_NOT_ENABLED`.

Do not silently pretend Toss sync happened.

### 5.2 Toss Watchlist Mutation Client

Extend `src/server/toss/toss-watchlist-client.ts` only after endpoint evidence
is available.

New interface should separate read and mutation:

```ts
interface TossWatchlistClient {
  listWatchlist(): Promise<TossWatchlistPayload>;
}

interface TossWatchlistMutationClient extends TossWatchlistClient {
  addItem(input: TossWatchlistMutationInput): Promise<TossWatchlistMutationResult>;
  removeItem(input: TossWatchlistMutationInput): Promise<TossWatchlistMutationResult>;
}
```

Do not add speculative endpoint paths. If endpoint is unknown:

- write a research note,
- add disabled adapter shape,
- expose `sync_unavailable`,
- stop before live mutation.

### 5.3 Product Identity Everywhere

Any route or component that handles a product must know:

- Toss `productCode`
- six-digit `krTicker` when available
- `kisEligible`
- `tossEligible`
- display `symbol`
- display `market`

Priority files:

- `src/shared/product-identity.ts`
- `src/client/lib/stock-search.ts`
- `src/client/components/GlobalSearch.tsx`
- `src/server/toss/toss-public-client.ts`
- `src/server/routes/stocks.ts`
- `src/server/routes/favorites.ts`
- new watchlist sync layer
- KIS WS candidate builders

Goal:

- no Toss-only product ever reaches KIS or six-digit-only routes.
- no user click produces raw 400 for expected unsupported product.
- unsupported products get clear UI state.

### 5.4 Client Watchlist Store

Replace the user-facing local favorite model with normalized watchlist state.

Proposed store:

- keep `useWatchlistStore`, but revise comments and data model.
- Add server-backed normalized watchlist load.
- Distinguish:
  - `toss_synced`
  - `local_only`
  - `sync_pending`
  - `sync_unavailable`
  - `sync_failed`

Avoid immediate broad rewrite if too risky. First step may introduce an adapter:

- `src/client/lib/watchlist-sync.ts`
- `src/client/lib/__tests__/watchlist-sync.test.ts`

### 5.5 Search Add Flow

Fix search so row click action is product-aware.

Rules:

- Already in normalized watchlist: open selected ticker/chart.
- Six-digit KR supported product: can add/watch/sync.
- Toss-only product with no chart support: show `지원 대기`.
- Toss-only product with quote/chart support but no KIS: open Toss-only view
  only when product view is implemented.
- No expected product path should show raw `추가 실패: 400 Bad Request`.

Priority files:

- `src/client/components/GlobalSearch.tsx`
- `src/client/lib/stock-search.ts`
- `src/client/lib/api-client.ts`
- server route tests around search/add

### 5.6 Chart And Realtime Quality

Chart must feel live without inventing data.

Requirements:

- Mini chart uses current trading day by default.
- Full chart supports interval/range buttons, not only dropdown.
- KST handling is explicit.
- Price updates should update current candle when valid data arrives.
- Empty periods such as long overnight gaps should be visually skipped, not
  filled with flat synthetic candles.
- KIS tick can update latest visible price/current candle only for eligible KR
  subscribed products.
- Toss remains baseline for quote/chart truth.

Priority files:

- `src/client/components/StockCandleChart.tsx`
- `src/client/components/TradingViewAdvancedChart.tsx`
- `src/server/routes/stocks.ts`
- `src/server/toss/toss-minute-chart.ts`
- `src/server/toss/toss-daily-chart.ts`
- price/candle aggregation under `src/server/price/`

### 5.7 TOP100 Real-Time Quality

TOP100 should feel close to Toss:

- 상승 and 하락 visible together.
- ranking rows refresh frequently.
- rank reorder should happen at the configured cadence.
- UI should not freeze and jump in large bursts if a smoother cadence is
  possible.
- Current configured service target in `src/server/app.ts` is
  `TOSS_TOP_MOVERS_REFRESH_MS = 500`.

Constraints:

- Do not exceed provider-safe cadence blindly.
- Do not create fake intermediate rows.
- If provider data is stale/partial, show that honestly.
- If 0.3-0.5s is too aggressive, implement coalesced UI updates and explain
  provider/runtime limits.

Priority files:

- `src/server/market/market-top-movers-service.ts`
- `src/server/routes/market.ts`
- `src/client/components/TopMoversBoard.tsx`
- `src/client/lib/api-client.ts`
- `src/client/stores/watchlist-store.ts` only for view state, not source truth

### 5.8 Agent Panel And Safety UI

Agent UI should answer three user questions immediately:

1. What is the agent watching?
2. Why is a ticker a candidate?
3. Can it trade live? Answer should be clearly `no` unless approved.

Required states:

- observing
- candidate
- preview ready
- approval required
- live locked
- skipped
- error/unavailable

Color semantics:

- green/active: actually running and safe
- yellow: preview/pending/locked/approval required
- red: error/kill/unavailable/danger

Priority files:

- `src/client/components/AgentEventsRail.tsx`
- `src/client/components/OrderIntentSafetyRail.tsx`
- `src/client/components/OrderSafetyModal.tsx`
- `src/server/agent/`
- `src/server/routes/agent-*`

### 5.9 Agent Auto-Trading Foundation

This project is preparing the foundation for a future Araon trading agent, but
it is not yet authorizing or implementing live autonomous execution.

The distinction must stay explicit:

- `agent foundation`: allowed in this goal.
- `live autonomous trading`: not allowed in this goal unless a fresh,
  separate user approval expands the scope.

#### 5.9.1 What The Agent Should Eventually Trade From

Araon agent decisions should be based on normalized evidence, not raw provider
payloads or UI-only state.

Required future decision inputs:

- Toss quote/price refresh.
- Toss candle/chart history.
- Toss TOP100 상승/하락 and rank movement.
- Toss watchlist/favorites.
- Toss account/portfolio/holdings/cash read data.
- Toss-side news/signal surfaces when available.
- Naver or other news providers when normalized.
- OpenDART disclosure events.
- Recent surge / market movement detector.
- KIS `실시간 추적` tick overlay for eligible KR tickers only.
- User policy:
  - allowed markets
  - blocked tickers
  - per-order budget
  - daily budget
  - loss limit
  - trading hours
  - cooldown
  - order type
  - live execution lock/kill switch

The agent should never decide from:

- unsanitized Toss/KIS raw payloads,
- synthetic financial values,
- stale rows pretending to be fresh,
- unsupported Toss-only products that cannot be priced or ordered safely,
- UI labels alone.

#### 5.9.2 Agent Event Contract

The agent-facing event stream should normalize market, news, disclosure, and
signal inputs into a stable contract.

Required event families:

- `news_detected`
- `disclosure_detected`
- `toss_signal_detected`
- `market_movement_detected`
- `watchlist_changed`
- `position_changed`
- `order_intent_created`
- `order_intent_skipped`
- `approval_requested`
- `approval_granted`
- `approval_denied`
- `execution_locked`

Every event should include, when applicable:

- stable event id
- event type
- product identity:
  - Toss `productCode`
  - `krTicker` when available
  - market
  - display name
- source provider
- source timestamp if known
- Araon `firstSeenAt`
- freshness
- confidence
- relevance
- reason
- raw payload redaction status
- related watchlist/holding/order-intent ids
- skip reason when the agent does not act

The event contract should be safe for UI, audit, and future agent consumption.
It must not expose raw session/account/order/provider identifiers.

#### 5.9.3 Order Intent Contract

The future trading path should flow through order intents, not direct orders.

Required order-intent lifecycle:

1. `candidate_observed`
2. `evidence_collected`
3. `strategy_evaluated`
4. `risk_checked`
5. `preview_created`
6. `approval_required`
7. `approved` or `rejected`
8. `execution_locked` by default
9. future live execution only after explicit policy approval
10. result/audit recorded

Required order-intent fields:

- intent id
- product identity
- side:
  - buy
  - sell
- order type:
  - market
  - limit
  - future supported types only when verified
- intended quantity or budget
- estimated price basis
- evidence ids
- strategy name/version
- confidence
- risk checks
- policy checks
- approval state
- execution state
- createdAt / expiresAt
- cancellation reason or skip reason
- audit hash or stable audit reference

Order intent creation may be automatic. Live execution must remain locked.

#### 5.9.4 Safety And Permission Model

The minimum safety model before any live trading can be considered:

- live auto-buy default off.
- live auto-sell default off.
- fresh approval required for every live execution until a separate policy says
  otherwise.
- kill switch visible and effective.
- per-order max budget.
- per-day max budget.
- per-ticker max exposure.
- market-hours guard.
- cooldown after each intent.
- blocked ticker list.
- supported product eligibility check.
- cash/holding availability check.
- duplicate intent dedupe.
- stale evidence rejection.
- risk check failure reasons visible in UI.
- audit log for every candidate, skip, intent, approval, and result.

If any required safety input is missing, the system should show `승인 필요`,
`실행 잠금`, or `지원 대기`, not silently proceed.

#### 5.9.5 What Is Missing Today

The following pieces are not complete enough to claim automatic trading
readiness:

- a real decision engine,
- strategy policy configuration UI,
- risk policy editor,
- paper trading ledger,
- simulation result view,
- Toss order mutation integration,
- live approval flow final executor,
- order execution result reconciliation,
- agent performance/audit detail screen,
- user-friendly explanation of why an intent was created or skipped,
- full provider freshness guarantees,
- stable all-source event dedupe,
- enough tests around safety gates and mutation boundaries.

This goal may implement foundation pieces for these gaps. It must not claim
Araon is autonomous-trading-ready until these gaps are closed and separately
approved.

#### 5.9.6 User-Facing Agent UI Requirements

The home agent panel should stay simple:

- current mode:
  - 관찰 중
  - 후보 있음
  - preview 준비
  - 승인 필요
  - 실행 잠금
  - 오류
- top reasons:
  - 급상승
  - 뉴스
  - 공시
  - 시그널
  - 보유/관심
- next safe action:
  - 보기
  - preview
  - 승인 요청
  - 잠금 유지

Agent Detail can be richer:

- event timeline
- candidate list
- evidence per candidate
- skipped reasons
- order-intent previews
- approval/audit trail
- safety policy summary
- live execution lock state

Do not make the home panel look like live trading is active when only
observation or preview is active.

## 6. Implementation Phases

### Phase 0 - Re-Audit And Protect Current Worktree

Purpose: avoid breaking a large dirty worktree.

Steps:

1. Run `git status --short`.
2. Read this document.
3. Read:
   - `docs/design.md`
   - `docs/frontend-redesign-brief.md`
   - `docs/frontend-v7-followup-quality-plan.md`
   - `docs/research/toss-primary-kis-ws-only-transition-plan.md`
   - `docs/research/toss-primary-kis-ws-only-completion-audit.md`
   - `docs/research/toss-primary-agent-platform-migration.md`
4. Do not revert existing changes.
5. Re-check the live snapshot in section 1.7 if dev servers are running:
   - `GET /toss/auth/status`
   - `GET /toss/account/summary`
   - `GET /toss/portfolio/positions`
   - `GET /market/top-movers?limit=5`
   - `GET /market/toss/search?q=채비&limit=5`
   - `GET /runtime/realtime/kis-ws-slots`
   - `GET /agent/events?limit=5`
   - `GET /agent/order-intents/live-policy`
   - Safari or Computer Use visual check of `http://127.0.0.1:5173/`
6. Identify current user-facing legacy labels with:
   - `rg -n "내 목록|등록됨|폴링|polling|KIS WS|KIS 보조|KIS 실시간|tracked|fallback" src/client src/server docs`
7. Identify six-digit-only routes:
   - `rg -n "regex\\(/\\^\\\\d\\{6\\}\\$|ticker must be exactly 6 digits|z\\.string\\(\\)\\.regex" src`

Exit criteria:

- Current source truth map is refreshed.
- Working Toss/account/TOP100/agent/KIS-slot surfaces are preserved, not
  accidentally rebuilt or regressed.
- No unrelated files touched.

### Phase 1 - Normalize Watchlist Read Model

Purpose: make `즐겨찾기` mean Toss watchlist first.

Tasks:

1. Add server-side normalized watchlist read service.
2. Add `GET /watchlist` returning normalized Araon watchlist items.
3. Merge Toss watchlist read data with local favorites.
4. Add tests:
   - Toss session ready -> Toss items are `toss_synced`.
   - Toss session missing -> local favorites are `local_only`.
   - Toss read fails -> no raw error leak; safe fallback.
   - Toss-only item gets `kisEligible=false`.
5. Add client API function `getAraonWatchlist()`.
6. Update UI to load normalized watchlist for FavoritesBlock.

Files likely touched:

- create `src/server/watchlist/araon-watchlist-service.ts`
- create `src/server/watchlist/__tests__/araon-watchlist-service.test.ts`
- create or extend `src/server/routes/watchlist.ts`
- create `src/server/routes/__tests__/watchlist.test.ts`
- modify `src/server/app.ts`
- modify `src/client/lib/api-client.ts`
- modify `src/client/App.tsx`
- modify `src/client/components/FavoritesBlock.tsx`
- modify `src/client/stores/watchlist-store.ts`

Exit criteria:

- UI favorites can be backed by Toss watchlist read.
- Existing local favorites still work when Toss is absent.
- No live mutation required.

### Phase 2 - Remove `내 목록` From User-Facing Search

Purpose: stop exposing old tracked-list mental model.

Tasks:

1. Change search label `내 목록` to a final product label:
   - if Toss-synced: `즐겨찾기`
   - if local fallback: `로컬 보관`
   - if merely cached/tracked but not favorite: `최근 본 종목` or no badge
2. Remove `등록됨` copy from normal rows.
3. Ensure search click for cached/tracked product opens selected ticker.
4. Ensure unsupported Toss-only products show `Toss 전용` / `지원 대기`.
5. Add tests for KRX, Toss-only, local-only, and Toss-synced search results.

Files likely touched:

- `src/client/components/GlobalSearch.tsx`
- `src/client/lib/stock-search.ts`
- `src/client/lib/__tests__/stock-search.test.ts`
- `src/client/components/__tests__/global-search...` if/when exists

Exit criteria:

- Normal user no longer sees `내 목록` or `등록됨` as primary product states.
- Expected unsupported product click does not produce confusing 400.

### Phase 3 - Product-Aware Add/Star Flow

Purpose: make star actions product-aware and sync-safe.

Tasks:

1. Add a product-aware client action for star/unstar.
2. Route action through normalized watchlist service.
3. For unsupported mutation, return safe `sync_unavailable`.
4. For no-login, store local fallback only and label it.
5. For logged-in + mutation not yet live-enabled, return `sync_pending` or
   `WATCHLIST_MUTATION_NOT_ENABLED` depending on product decision.
6. Keep KIS WS candidate update based on normalized watchlist membership.

Tests:

- Add KRX favorite with no Toss session -> local-only.
- Add KRX favorite with Toss session but mutation disabled -> sync pending or
  unavailable; no raw Toss request.
- Remove favorite behaves symmetrically.
- Toss-only product does not hit six-digit route.
- KIS slot candidate receives only `kisEligible=true` KR tickers.

Files likely touched:

- `src/client/App.tsx`
- `src/client/lib/api-client.ts`
- `src/server/routes/watchlist.ts`
- `src/server/watchlist/araon-watchlist-service.ts`
- `src/server/realtime/kis-ws-slot-candidates.ts`
- relevant tests

Exit criteria:

- Star/unstar no longer equals local `/favorites` only.
- User-visible state is honest.
- No live Toss mutation yet unless explicitly approved.

### Phase 4 - Toss Watchlist Mutation Research And Gated Implementation

Purpose: implement the final desired two-way sync safely.

Tasks:

1. Inspect `tossinvest-cli` and local browser DevTools evidence for watchlist
   add/remove endpoints.
2. Write a sanitized research note:
   - endpoint path
   - method
   - required non-sensitive request shape
   - required account/session headers in abstract form
   - response semantic states
   - raw payload not included
3. Add fixture-based tests for add/remove.
4. Implement Toss watchlist mutation client behind explicit gate.
5. Add server routes.
6. Add UI states:
   - `동기화됨`
   - `동기화 중`
   - `동기화 실패`
   - `로컬 보관`
   - `지원 대기`
7. Do not run a live add/remove unless user gives explicit GO.

Files likely touched:

- `src/server/toss/toss-watchlist-client.ts`
- `src/server/toss/__tests__/toss-watchlist-client.test.ts`
- `src/server/routes/watchlist.ts`
- `src/server/routes/__tests__/watchlist.test.ts`
- `src/client/components/FavoritesBlock.tsx`
- `src/client/components/GlobalSearch.tsx`
- `src/client/App.tsx`

Exit criteria:

- Mocked add/remove tests pass.
- Live mutation remains gated.
- If user gives GO, one small add/remove smoke can be performed and audited
  without raw values.

### Phase 5 - KIS Legacy Surface Cleanup

Purpose: remove or hide remaining old KIS/polling mental model.

Tasks:

1. Search and classify all remaining `polling`, `fallback`, `tracked`, `KIS`
   copy.
2. Keep internal code terms where needed.
3. Rewrite normal UI to:
   - `실시간 추적`
   - `Toss 가격`
   - `비실시간`
   - `대기`
   - `지원 대기`
4. Move diagnostics-only KIS details into settings/dev surfaces.
5. Update docs to match.

Exit criteria:

- Normal user surfaces do not show `KIS WS`, `KIS 보조`, `폴링40`, `등록됨`,
  `내 목록`.
- Diagnostics may still mention KIS if accurate and non-sensitive.

### Phase 6 - Chart And TOP100 Real-Time Quality

Purpose: make market surfaces feel live and stable.

Tasks:

1. Add/adjust tests for KST chart time handling.
2. Ensure mini chart uses current day by default.
3. Ensure full chart no-scroll layout and interval/range buttons.
4. Make current candle progress from quote/tick data.
5. Hide overnight/non-trading gaps without synthetic candles.
6. Confirm TOP100 0.5s cadence and rank reorder.
7. Verify no UI performance runaway.

Exit criteria:

- Chart updates without manual page refresh.
- Candle progresses when valid data arrives.
- TOP100 does not appear frozen.
- UI remains responsive.

### Phase 7 - Agent Panel Productization

Purpose: make agent status understandable while preparing the safe foundation
for future autonomous trading.

Tasks:

1. Simplify home agent panel copy.
2. Make Agent Detail expansion feel like workspace expansion.
3. Show event source/reason/freshness/confidence without backend jargon.
4. Keep live execution lock visually strong.
5. Keep order intent preview/audit reachable but not scary by default.
6. Normalize agent events around the contract in section 5.9.2.
7. Ensure order-intent preview follows the lifecycle in section 5.9.3.
8. Show skip/risk/approval reasons in human language.
9. Make missing auto-trading pieces visible as locked or not-ready, not hidden
   as if complete.
10. Add tests for event normalization, order-intent state transitions, and
    live-execution lock behavior where the current codebase supports it.

Exit criteria:

- User can tell:
  - what is being watched
  - why a candidate exists
  - whether live trading is locked
- Event and order-intent contracts are documented in code or tests.
- Missing decision-engine/live-execution pieces are explicitly represented as
  not-ready or locked.
- No autonomous-execution promise appears.

### Phase 8 - Final Docs, QA, And Cleanup

Purpose: close the product lane honestly.

Tasks:

1. Update README/INSTALL/runbooks if behavior changes.
2. Update `docs/design.md` if copy/status model changes.
3. Add completion audit under `docs/research/`.
4. Run full verification.
5. Do real browser visual QA.
6. Do secret grep.
7. Only then mark goal complete.

Exit criteria:

- User can run Araon as Toss-first terminal.
- KIS optional realtime tracking remains bounded.
- Watchlist model is coherent.
- No old KIS/polling mental model remains in normal UI.

## 7. Verification Standard

### 7.1 Required Commands For Every Major Slice

Run at minimum:

```bash
npm test -- <focused test files>
npm run typecheck
npm run build
git diff --check
```

For final completion:

```bash
npm test
npm run typecheck
npm run build
git diff --check
npm run soak:no-live -- --duration-ms=1500 --interval-ms=500
```

For package/release-related changes:

```bash
npm pack --dry-run --json
```

### 7.2 Secret Grep

Run a tracked-file grep after sensitive work. Exclude intentional test sentinel
strings, but do not exclude active source/docs casually.

Search classes:

- `SESSION`
- `UTK`
- `LTK`
- `FTK`
- `browserSessionId`
- `deviceId`
- `accountKey`
- `accountNo`
- `approval_key`
- `appSecret`
- raw cookie-style key/value patterns

Expected:

- active code/docs contain no real secrets.
- tests may contain fake sentinel strings only.

### 7.3 Browser Visual QA

Use actual browser/computer inspection, not code-only review.

Required surfaces:

- home at 1920x1080 or near
- home at 1600x1000
- home at 1440x900
- responsive around 900px
- search dropdown
- TOP100 상승/하락
- favorites/watchlist
- recent surge
- selected ticker mini chart
- Full Chart expansion
- Agent Detail expansion
- right Toss account rail expanded/collapsed
- settings connection tab
- dark mode bottom status bar

Check:

- no overlap
- no horizontal page scroll in home
- bottom bar vertically centered
- account rail collapse leaves no strange rounded edge/empty gap
- no old copy: `내 목록`, `등록됨`, `폴링40`, `KIS WS`
- no raw Toss/KIS/session/account/order identifiers
- chart and agent expansion feel like expansion, not abrupt unrelated page

## 8. Completion Criteria

This final product lane is complete only when all are true:

1. Toss login/session is the primary account-aware connection.
2. Toss watchlist and Araon 즐겨찾기 are unified in the product model.
3. Araon star/unstar flow is product-aware and sync-safe.
4. Local favorites are fallback/cache, not the normal user-facing truth.
5. Search handles KRX and Toss-only products without confusing 400 errors.
6. Toss-only unsupported products show `Toss 전용` / `지원 대기`.
7. KIS is visible only as optional `실시간 추적`.
8. KIS never receives non-eligible product codes.
9. KIS REST polling/chart/ranking/master/import is not default product path.
10. TOP100 comes from Toss/provider ranking, not local filler.
11. Mini/full chart update without manual refresh when valid data arrives.
12. Non-trading chart gaps are hidden without synthetic data.
13. Agent panel clearly shows observation/candidate/preview/locked states.
14. Agent event contract exists for news/disclosure/signal/market movement/
    watchlist/position/order-intent/approval/lock events.
15. Order-intent lifecycle supports preview/risk/approval/audit states without
    live execution.
16. Missing auto-trading pieces are documented and shown as locked/not-ready
    rather than implied complete.
17. Live trading remains locked unless a separate approved policy exists.
18. No raw sensitive values appear in UI/log/docs/stdout/git diff.
19. Full tests/typecheck/build/diff/no-live soak pass.
20. Real browser visual QA passes.
21. Completion audit is written.

## 9. Explicit Non-Goals

Do not do these inside this goal unless the user separately expands scope:

- live order execution
- live auto-buy
- order cancel/amend
- account setting mutation
- broad full-market polling
- fake financial data
- replacing the Araon design system with OpenDesign/Claude prototype chrome
- removing all KIS code mechanically before proving WS-only role is stable
- rewriting the whole app from scratch
- using KIS as account/order/watchlist/ranking truth

## 10. Recommended First Milestone

Start with the smallest high-leverage milestone:

> Normalize watchlist read model and remove `내 목록` from user-facing search.

Why first:

- It resolves the user's current conceptual confusion.
- It clarifies `즐겨찾기` vs local tracked cache.
- It matches the live verification snapshot: account, portfolio, TOP100,
  chart, KIS slot preview, and agent lock are already materially working, while
  `/watchlist` is still missing.
- It prepares Toss watchlist mutation without requiring live mutation yet.
- It prevents KIS realtime tracking from being confused with watchlist truth.
- It directly addresses the recent search/add 400 issue.

First milestone acceptance:

- `GET /watchlist` exists and returns normalized watchlist items.
- With Toss session ready, Toss watchlist rows are primary.
- With no Toss session, local favorites still appear as local fallback.
- Search no longer says `내 목록`.
- Search click on unsupported Toss-only product does not call six-digit add
  route.
- UI labels are honest and non-technical.

## 11. Goal Prompt For Codex App

Use this prompt to start the persistent goal after reviewing this document:

```text
[$goal] Araon final product lane을 끝까지 진행한다: Toss watchlist 중심 즐겨찾기, product-aware search/add, KIS는 optional 실시간 추적만, chart/TOP100/agent UX 품질까지 정리한다.

기준 repo는 /Users/stello/korean-stock-follower 이다.
반드시 /Users/stello/korean-stock-follower/docs/research/araon-final-product-execution-goal.md 를 먼저 읽고, 이 문서를 authoritative execution brief로 따른다.

핵심 목표:
1. Toss watchlist를 Araon 즐겨찾기의 primary truth로 만든다.
2. Araon star/unstar는 Toss watchlist sync 의도를 가진 product-aware action으로 바꾼다.
3. Toss watchlist mutation은 mock/test로 먼저 구현하고, 실제 Toss 계정 mutation은 내가 fresh GO를 주기 전까지 실행하지 않는다.
4. Toss session이 없거나 mutation이 불가능할 때는 local-only/sync-pending/sync-unavailable 상태를 정직하게 보여준다.
5. 내 목록/등록됨/폴링40/KIS WS 같은 일반 사용자에게 헷갈리는 legacy copy를 normal UI에서 제거한다.
6. product identity를 Toss productCode와 six-digit KRX krTicker로 끝까지 분리한다.
7. Toss-only product는 KIS나 six-digit-only route로 보내지 않는다. 지원 전에는 Toss 전용/지원 대기로 표시한다.
8. KIS는 optional low-latency 실시간 추적 rail로만 남기고, 계좌/주문/watchlist/ranking/chart-history truth source가 되지 않게 한다.
9. mini/full chart, TOP100, agent panel의 남은 품질 이슈를 문서 기준으로 정리한다.
10. agent event/order-intent/preview/risk/approval/audit 기반을 만든다.
11. 자동거래에 필요한 decision engine, strategy policy, risk policy, paper trading, Toss order execution, reconciliation 등 아직 부족한 조각은 locked/not-ready로 명시한다.
12. 기존 Araon 디자인 시스템과 docs/design.md를 유지한다.

안전 경계:
- 실제 주문, 주문 취소, 주문 정정, 계좌 변경 mutation 금지.
- 실제 Toss watchlist add/remove live smoke도 내가 fresh GO를 주기 전까지 금지.
- Toss/KIS/session/account/order/watchlist raw 값은 UI/log/docs/stdout/git diff에 노출 금지.
- 합성 금융 데이터 금지.
- 기존 사용자 변경과 dirty worktree 보존.

진행 순서:
1. git status와 현재 dirty worktree를 확인하고 기존 변경을 보존한다.
2. docs/research/araon-final-product-execution-goal.md 전체를 읽는다.
3. Phase 0 audit을 수행하고, 필요한 경우 발견 내용을 문서에 보강한다.
4. Phase 1부터 작은 milestone 단위로 구현한다.
5. 각 milestone마다 focused tests/typecheck/build/diff-check를 수행한다.
6. UI 변경은 실제 브라우저/Computer Use로 visual QA한다.
7. live mutation/trading boundary에 닿으면 멈추고 내 승인을 요청한다.

검증:
- focused tests
- npm test
- npm run typecheck
- npm run build
- git diff --check
- npm run soak:no-live -- --duration-ms=1500 --interval-ms=500
- tracked-file secret grep
- 실제 브라우저 visual QA

완료 조건:
문서의 Completion Criteria 21개를 모두 만족하고, completion audit을 작성하고, 실제 브라우저 QA와 전체 검증이 통과했을 때만 goal 완료 처리한다.

[$caveman] hangul-full을 항상 사용할 것
```
